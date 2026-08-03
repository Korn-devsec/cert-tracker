# PLAN.md — แผนพัฒนาระบบ SSL Certificate Lifecycle Management

> **วิธีใช้ไฟล์นี้:** Claude Code ต้องอ่านไฟล์นี้ก่อนเริ่มงานทุก session
> ทำทีละเฟสตามลำดับ ติ๊ก `[x]` เมื่อเสร็จ และ**หยุดรอผู้ใช้ตรวจ**เมื่อจบแต่ละเฟส
> ห้ามเริ่มเฟสถัดไปจนกว่าผู้ใช้จะพิมพ์ยืนยัน เช่น "ผ่าน เริ่มเฟสถัดไปได้"

**สถานะปัจจุบัน:** Phase 0–7 ตรวจผ่านและ push แล้ว · Phase 8 (เฟสสุดท้าย) ทำเสร็จแล้ว — **รอผู้ใช้ตรวจรับ**

---

## Phase 0 — Project Setup & Infrastructure

- [x] สร้าง monorepo structure ตาม CLAUDE.md (`apps/api`, `apps/web`, `packages/shared`, `docs/`, `legacy/`)
      — ใช้ npm workspaces (`packages/*`, `apps/*`)
- [x] คัดลอก `report-jul69.html` ไปไว้ที่ `legacy/` (ต้นแบบดีไซน์) — มีอยู่แล้วในโปรเจกต์ ไม่ได้แก้ไข
- [x] `docker-compose.yml`: PostgreSQL 16 + volume + healthcheck
      — `postgres:16-alpine`, volume `cert-tracker-pgdata`, healthcheck `pg_isready`, map host **5433**→5432
- [x] Init NestJS ใน `apps/api` + ตั้งค่า Prisma เชื่อม PostgreSQL
      — NestJS 11, `PrismaModule`/`PrismaService` (global), `GET /health`, schema ยังไม่มี model (Phase 1)
- [x] Init Vite + React + TypeScript ใน `apps/web` — Vite 6 + React 18 + TS 5.7
- [x] ตั้งค่า `packages/shared`: enums `RiskLevel`, `WorkStatus`, `NotificationTier`, `HistoryAction`
      — เพิ่ม `NotificationChannel`, `UserRole`, `ImportStatus` + label ภาษาไทย, build เป็น CJS+ESM
- [x] `.env.example` ทั้ง api และ web (+ ที่ root สำหรับ docker compose)
- [x] ESLint + Prettier ทั้งสองฝั่ง — ESLint 9 flat config ทั้ง 3 workspace, Prettier config ที่ root
- [x] Git init + `.gitignore` (+ `.gitattributes` บังคับ LF)
- [x] commit แรก — `4e6bef2` + `48c1b7e` (แก้ tsconfig ที่ deprecated ใน TS 7)

**เกณฑ์ตรวจรับ:**
- [x] `docker compose up -d db` แล้ว DB ขึ้น healthy — `docker inspect` คืนค่า `healthy`
- [x] `npm run start:dev` (api) และ `npm run dev` (web) รันได้พร้อมกันไม่ error — api :3000, web :5173
- [x] api มี endpoint `GET /health` ตอบ `{ status: "ok", db: "connected" }` — HTTP 200 ตรงตามรูปแบบ

---

## Phase 1 — Database Schema & Migration

- [x] เขียน Prisma schema ครบ: `Company`, `Site`, `Certificate`, `RenewalTask`, `HistoryLog`, `Attachment`, `NotificationLog`, `ImportBatch`, `User` ตาม Data Model ใน CLAUDE.md
      — enum ใน DB 6 ตัว (`UserRole`, `WorkStatus`, `HistoryAction`, `NotificationTier`, `NotificationChannel`, `ImportStatus`)
      — **ไม่เก็บ** `daysUntilExpiry`/`riskLevel` เป็นคอลัมน์ (คำนวณตอน query ตาม CLAUDE.md)
- [x] ความสัมพันธ์: Company 1-n Site, Company 1-n Certificate, Certificate 1-n RenewalTask/HistoryLog/Attachment/NotificationLog
      — `HistoryLog.certificateId` เป็น optional เพิ่ม `companyId`/`renewalTaskId` เพื่อรองรับ action ระดับระบบใน Phase 2
- [x] Index ที่จำเป็น: `certificate(companyId, expiresAt)`, `historyLog(certificateId, createdAt)`
      — เพิ่ม unique `certificate(companyId, commonName, endpoint)` (คีย์ upsert ของ Phase 3)
      และ unique `notificationLog(certificateId, tier, channel, sentOn)` (กันแจ้งเตือนซ้ำใน Phase 5)
- [x] Migration แรก + seed script: 2 บริษัทตัวอย่าง + admin user
      — migration `20260803092629_init`, seed รันซ้ำได้ (idempotent) และไม่เขียนรหัสผ่านทับ
      — hash รหัสผ่านด้วย scrypt (`src/common/password.ts`) ไม่เพิ่ม dependency ใหม่ (ดู DECISIONS.md — ขอยืนยันตอน Phase 2)
- [x] Unit test: ฟังก์ชัน `calculateRisk(daysUntilExpiry)` ใน `packages/shared`
      ทดสอบขอบเขต: 29→High, 30→High, 31→Medium, 60→Medium, 61→Low, 90→Low, 91→Safe, ค่าติดลบ→High
      — ค่าติดลบให้ `HIGH` และแยกด้วย `isExpired()` (ไม่เพิ่มค่า `EXPIRED` — ดู DECISIONS.md)
      — เพิ่ม test: `calculateDaysUntilExpiry` (วันปฏิทิน UTC), password hash, และ **enum parity** ระหว่าง Prisma กับ `packages/shared`

**เกณฑ์ตรวจรับ:**
- [x] `npx prisma migrate dev` ผ่าน — สร้างครบ 9 ตาราง + seed data (2 companies, 1 admin) เปิด `prisma studio` ดูได้
- [x] test risk calculation ผ่านทุก case — รวมทั้งระบบ 50 tests ผ่านหมด (shared 29 / api 20 / web 1)

---

## Phase 2 — Auth & Company Management

- [x] Auth: register (admin เท่านั้น), login (JWT), guard + RBAC decorator (admin/operator/viewer)
      — `POST /auth/login`, `POST /auth/register` (ADMIN), `GET /auth/me`
      — `JwtAuthGuard` + `RolesGuard` เป็น **global guard**: ทุก endpoint ปิดเป็นค่าเริ่มต้น เปิดด้วย `@Public()` (มีแค่ login กับ health)
      — ใช้ `@nestjs/jwt` ตรงๆ ไม่ใช้ passport (ดู DECISIONS.md)
- [x] Company CRUD API: `GET/POST/PATCH/DELETE /companies` (delete = soft delete `isActive=false`)
      — `GET /companies?includeInactive=&search=`, `GET /companies/:id` (พร้อม sites + จำนวน cert)
      — `code` แก้ไม่ได้หลังสร้าง และบันทึกเป็นตัวพิมพ์ใหญ่เสมอ
- [x] Site CRUD ภายใต้ company (optional layer) — `/companies/:companyId/sites` (ADMIN + OPERATOR)
      — ลบ site ที่ยังมี certificate ผูกอยู่ไม่ได้ → 409 (กัน cert หลุด site แบบเงียบๆ)
- [x] ทุก mutation ลง HistoryLog ระดับระบบ (ใครสร้าง/แก้บริษัทเมื่อไร)
      — ผ่าน `HistoryService` และเขียนอยู่ใน `$transaction` เดียวกับ mutation (ไม่มีกรณี "แก้สำเร็จแต่ประวัติหาย")
      — เพิ่ม action `SITE_DELETED`, `USER_CREATED`, `USER_UPDATED` + migration `20260803095940_...`
- [x] e2e test: login → สร้างบริษัท → viewer สร้างบริษัทไม่ได้ (403) — `test/auth-companies.e2e-spec.ts` 19 เคส

**เกณฑ์ตรวจรับ:**
- [x] ยิงผ่าน curl ได้ครบ, token หมดอายุ/ปลอมต้องโดน 401 — ทดสอบทั้ง curl จริงและใน e2e
      (ไม่ส่ง token / เซ็นด้วย secret อื่น / `expiresIn: -1s` / บัญชีถูกปิดใช้งาน → 401 ทุกกรณี)
- [x] viewer ทำได้แค่อ่าน — GET ผ่าน 200 ส่วน POST/PATCH/DELETE companies และ register โดน 403

> **แก้บั๊กที่เจอระหว่างทำเฟสนี้:** `npm run dev:api` พังด้วย `MODULE_NOT_FOUND`
> เพราะ `incremental: true` ใน tsconfig ชนกับ `deleteOutDir: true` ของ nest-cli —
> `.tsbuildinfo` อยู่นอก `dist` จึงรอดจากการลบ แล้ว tsc ข้าม emit ไฟล์ที่ไม่ได้แก้ ทำให้ `dist` ขาดไฟล์เงียบๆ
> (test ทั้งหมดผ่านเพราะ jest ใช้ ts-jest คอมไพล์เอง ไม่ได้อ่าน `dist`) → ปิด `incremental` ทิ้ง

---

## Phase 3 — Excel Import Service (หัวใจของระบบ)

> **ไฟล์จริงสำหรับทดสอบ:** `docs/samples/30-July-2026.xlsx` — โครงสร้างจริงที่ต้องรองรับ:
> หลาย sheet (มี sheet หน้าปกที่ไม่ใช่ข้อมูล), header อยู่แถว 3 ไม่ใช่แถว 1,
> header มี typo (`Onwer`), status เป็นภาษาไทยและมี trailing space,
> Endpoints หลายค่าในเซลล์เดียวคั่นด้วย newline, Expires เป็น ISO datetime

- [x] Endpoint `POST /imports` รับไฟล์ .xlsx + `companyId` (บังคับเลือกบริษัทก่อนเสมอ) + เลือก sheet ได้
      — เพิ่ม `dryRun=true` สำหรับ preview ก่อน confirm (หน้า Import ใน Phase 7 ต้องใช้)
      — เพิ่ม `POST /imports/inspect`, `GET /imports`, `GET /imports/:id` · สิทธิ์: import = ADMIN/OPERATOR, อ่านประวัติ = ทุก role
- [x] **Sheet detection:** list ทุก sheet ให้ผู้ใช้เลือก และ auto-suggest sheet ที่คอลัมน์ครบที่สุด
      — เกณฑ์แนะนำ: จำนวนฟิลด์ที่ map ได้ → จำนวนแถว → ลำดับในไฟล์
      — **ข้อค้นพบ:** sheet `Report` ไม่ใช่หน้าปกเปล่า แต่เป็นตารางข้อมูลที่ merge cell ไว้ (ขาด Owner/Status)
        จึงไม่ block ตามชื่อ sheet แต่ให้คะแนนตามความครบของคอลัมน์ (ดู DECISIONS.md)
- [x] **Header row auto-detection:** สแกน 20 แถวแรก เลือกแถวที่ map ฟิลด์ได้มากสุด (ต้องได้ ≥ 3 ฟิลด์)
      — ไฟล์จริง header อยู่แถว 3 · sheet `Report` อยู่แถว 7 · ทั้งสองกรณีตรวจเจอถูกต้อง
      — ข้ามแถว header ที่ซ้ำจากการ merge แนวตั้ง (ไม่งั้นได้ cert ปลอมชื่อ "Common Name")
- [x] อ่าน **จากชื่อ header เท่านั้น** ห้ามอ้างตำแหน่งคอลัมน์ — มีเทสต์สลับคอลัมน์พิสูจน์
- [x] Header Mapping (case-insensitive, trim, รองรับ typo ที่เจอในไฟล์จริง) — ครบทุก alias ตามสเปก
      — `No` / `No.` ถูกข้าม · `Onwer` → `owner` · ตัดจุด/ทวิภาคท้ายชื่อ · จัดการ NBSP/zero-width space
      — header ที่ไม่รู้จัก และ header ที่ซ้ำ → warning (ใช้คอลัมน์แรก) ไม่ทำให้ import ล้ม
- [x] **Status Mapping ภาษาไทย** (trim ก่อนเสมอ)
      — `"ดำเนินการแล้ว "` (ช่องว่างท้ายจริงในไฟล์) → `COMPLETED`
      — `อยู่ระหว่างดำเนินการ` / `Pending` → `NEW` (สถานะเริ่มต้นของ workflow — เหตุผลใน DECISIONS.md)
      — ค่าที่ map ไม่ได้ → warning พร้อมเลขแถว
- [x] **Endpoints หลายค่า:** split เป็นหลาย Certificate record (ตัดสินใจแล้ว บันทึกใน DECISIONS.md)
      — ไฟล์จริงแถว 6 มี 2 endpoint คั่นด้วย newline → 6 แถวข้อมูลกลายเป็น 7 รายการ
- [x] Validation: header จำเป็น (`commonName`, `expiresAt` หรือ `daysUntilExpiry`) หาย → reject ทั้งไฟล์
      พร้อม error บอกคอลัมน์ที่หาย + ชื่อ header ที่ระบบยอมรับ + header ที่เจอในไฟล์
- [x] Validation รายแถว: วันที่ parse ไม่ได้ / commonName ว่าง → รายงานเลขแถว+เหตุผล, strict เป็น default
      — ปฏิเสธรูปแบบ `18/09/2026` เพราะกำกวม และจับวันที่ที่ไม่มีจริง (`2026-02-31`)
- [x] Normalize: trim ทุก field, แปลงวันที่เป็น UTC, dedupe ภายในไฟล์ (commonName+endpoint ซ้ำ)
- [x] Upsert: cert เดิม (companyId+commonName+endpoint ตรงกัน) → update, ใหม่ → create
      — update ไม่ล้างค่าที่ไฟล์ไม่มี (กันข้อมูลที่คนกรอกเพิ่มในระบบหาย)
- [x] บันทึก `ImportBatch` (ไฟล์, sheet, ผู้ import, จำนวนแถว, created/updated/skipped, errors, warnings) + HistoryLog ต่อ cert
- [x] สร้าง `RenewalTask` status `New` อัตโนมัติสำหรับ cert ที่ risk ≠ Safe และยังไม่มี task ค้าง
      — ไฟล์บอก `Completed` → สร้าง task COMPLETED · import ไม่แก้สถานะ task ที่มีอยู่แล้ว (ดู DECISIONS.md)
- [x] Unit test ครบชุด: header แถว 3 / สลับตำแหน่ง / alias+typo (`Onwer`) / header จำเป็นหาย /
      status ไทยมี trailing space / endpoints หลายค่า / แถวข้อมูลพัง / import ซ้ำต้อง upsert ไม่สร้างซ้ำ
- [x] เตรียมไฟล์ทดสอบใน `apps/api/test/fixtures/`: ไฟล์จริง + `columns-swapped.xlsx` +
      `missing-expiry.xlsx` + `broken-rows.xlsx` (สร้างใหม่ได้ด้วย `node test/fixtures/build-fixtures.mjs`)

**เกณฑ์ตรวจรับ:**

- [x] Import `docs/samples/30-July-2026.xlsx` (sheet `Report-SSL-Jul-2026`) สำเร็จ — 6 แถว → **7 cert**
      ผูก company ถูก, status ไทย map ถูก (สร้าง RenewalTask `NEW` 7 งาน), `expiresAt` ตรงไฟล์เป็น UTC
- [x] ไฟล์สลับคอลัมน์ → import ผ่านเหมือนเดิม (typo `Onwer` ยัง map เป็น owner)
- [x] ไฟล์ที่ลบคอลัมน์ `Days Until`/`Expires` ออก → reject ทั้งไฟล์ พร้อมข้อความชัดเจน
- [x] Import ไฟล์เดิมซ้ำ → จำนวน cert ใน DB ไม่เพิ่ม (`created: 0, updated: 7`)

> **สิ่งที่เจอจากการอ่านไฟล์จริง (สำคัญต่อเฟสถัดไป):**
> คอลัมน์ `Days Until Expiry` ในไฟล์คำนวณจาก**วันสแกน** ไม่ใช่วันในชื่อรายงาน —
> sheet Jun เขียน "Report on 17-Jun-2026" แต่เลข 80/30 คำนวณจาก 2026-06-30
> (ตรวจย้อนได้จาก `2026-09-18 − 80 วัน`) ยืนยันว่าการไม่เก็บค่านี้ลง DB ใน Phase 1 ถูกต้อง
>
> **บั๊กที่แก้ระหว่างเฟสนี้:**
> 1. `deleteOutDir: true` ของ nest-cli พังอีกแบบบน Windows — `ENOTEMPTY: rmdir dist\\imports\\dto`
>    ทำให้ `npm run dev:api` ไม่ขึ้น → ตั้ง `deleteOutDir: false` + เพิ่มสคริปต์ `npm run clean`
> 2. e2e ของ Phase 2 cleanup ด้วย `code startsWith 'E2E'` ไปลบข้อมูลของ e2e ไฟล์อื่นกลางการทดสอบ
>    (jest รันหลาย spec ขนานกันบน DB เดียว) ทำให้เห็นเป็นบั๊กใน service ทั้งที่เป็นบั๊กในเทสต์
>    → แก้ให้ cleanup เจาะจง id ที่ตัวเองสร้าง + เพิ่ม `--runInBand`
> 3. โค้ด normalize ช่องว่างเขียน `.replace(/ /g, ' ')` ด้วยช่องว่างปกติทั้งสองตัว = **no-op ที่ดูเหมือนทำงาน**
>    → ย้ายไปรวมที่ `excel/text.ts` และเขียนเป็น escape `\uXXXX`

---

## Phase 4 — Certificate API, Risk & Renewal Workflow

- [x] `GET /certificates` พร้อม filter: company, month, risk, status + pagination + sort
      — เพิ่ม `siteId`, `search` (CN/endpoint/owner/issuer), `expired`, `includeInactive`
      — **ตัวกรอง risk/month/expired ถูกแปลงเป็นช่วงวันของ `expiresAt` แล้วกรองใน DB** ไม่ใช่กรองใน JS
        (ถ้ากรองหลังแบ่งหน้า ตัวเลข total กับจำนวนหน้าจะโกหก) · response เป็น `{ data, meta }`
        โดย `meta.asOf` บอกเวลาที่ใช้คำนวณความเสี่ยงของชุดข้อมูลนั้น
- [x] `GET /certificates/:id` แสดง detail ครบ: CN, SAN, Issuer, Serial, Signature Algorithm, Key Size, SHA256, Endpoint, Owner + history + attachments
      — พร้อม `currentTask` (task ล่าสุด) และ `renewalTasks` ทุกรอบ · history ส่ง 200 รายการล่าสุด
- [x] `daysUntilExpiry` และ `riskLevel` คำนวณสด ณ เวลา query (ไม่ freeze ค่าเก่าจาก Excel)
      — ผ่าน `common/risk-fields.ts` ที่เดียว (เพิ่ม `isExpired` ให้ด้วย) ใช้ `calculateRisk` จาก `packages/shared`
- [x] RenewalTask workflow API: เปลี่ยน status ได้เฉพาะ transition ที่ถูกต้อง
      `New → Assigned → In Progress → Waiting Vendor ⇄ Waiting CA → Testing → Completed`, ยกเลิกได้ทุกขั้น → `Cancelled`
      — `PATCH /tasks/:id/status`, `PATCH /tasks/:id/assign`, `POST /tasks`, `GET /tasks`, `GET /tasks/:id`
      — เพิ่ม 2 เส้นทางจากสเปก: ข้ามไป Testing ได้ (cert ที่ออกเองไม่มี vendor/CA) และ Testing → In Progress
        (ทดสอบไม่ผ่านต้องกลับไปแก้) · Completed/Cancelled เป็นปลายทาง เปลี่ยนต่อไม่ได้ → เปิดงานใบใหม่
- [x] Assign ผู้รับผิดชอบ + ทุกการเปลี่ยน status ลง HistoryLog (actor, from→to, note)
      — เขียนใน `$transaction` เดียวกับการอัปเดต · action ตามความหมายจริง
        (`CONTACT_VENDOR` / `CSR_GENERATED` / `VERIFY` / `COMPLETE` / `CANCEL`) ไม่ใช่ `STATUS_CHANGE` ทุกบรรทัด
      — มอบหมายงานที่ยังเป็น New → เดินเป็น Assigned อัตโนมัติ และลงประวัติ **แยกบรรทัด** ไม่ซ่อนในรายการมอบหมาย
      — มอบหมายให้ viewer หรือบัญชีที่ปิดใช้งาน → 400
- [x] Attachment upload/download ต่อ certificate
      — `POST/GET /certificates/:id/attachments`, `GET .../:attachmentId/download`
      — เก็บไฟล์ที่ `UPLOAD_DIR` ชื่อไฟล์บนดิสก์เป็น uuid (ชื่อจาก client ไม่มีผลต่อ path) + กัน path traversal
      — ไม่รับไฟล์ที่มี private key (`.key/.pfx/.p12/.jks/.pk8`) → 400
- [x] `GET /dashboard/summary?companyId=&month=` คืน counts: total, byRisk, byStatus, expiringSoon, expired
      — เพิ่ม `byRiskStatus` (done/pending/cancelled ต่อระดับความเสี่ยง) สำหรับ Grouped Bar ของ Phase 6
        และ `noTask`, `completed`, `pending`, `cancelled`, `asOf`
- [x] Unit test: transition ที่ผิด (เช่น New → Completed ข้ามขั้น) ต้องโดน 400
      — `transitions.spec.ts` คุมตารางทั้ง 8×8 + `tasks.service.spec.ts` ยืนยันว่า 400 แล้วไม่แตะ DB/ประวัติ

**เกณฑ์ตรวจรับ:**
- [x] Cert เหลือ 20 วัน + task Completed แสดง Risk=High และ Status=Completed พร้อมกันได้ (พิสูจน์ว่าแยกกันจริง)
      — e2e เดินงานจริงจนปิด แล้วอ่าน `GET /certificates/:id` ได้ `riskLevel: HIGH` + `currentTask.status: COMPLETED`
- [x] ประวัติการเปลี่ยน status ย้อนดูได้ครบว่าใครทำอะไรเมื่อไร
      — `GET /tasks/:id` คืน 8 บรรทัดครบทั้งเส้นทาง ทุกบรรทัดมี actor/createdAt และ metadata `from`→`to`

> **บั๊กที่เจอจาก e2e ในเฟสนี้ (สองเรื่องที่ unit test จับไม่ได้):**
> 1. `$queryRaw` ที่ cast พารามิเตอร์เป็น `::uuid` พังทั้งหมด (`operator does not exist: text = uuid`)
>    เพราะคอลัมน์ id ที่ Prisma สร้างเป็น `text` ไม่ใช่ `uuid` → ตัด cast ออก
> 2. ชื่อไฟล์แนบภาษาไทยเข้า DB เป็นตัวขยะ — busboy (ที่ multer ใช้) ถอดส่วนหัว `filename` เป็น latin1
>    → เพิ่ม `decodeUploadFilename()` แปลงกลับเป็น UTF-8 ที่ขอบทางเข้า (คงค่าเดิมถ้าไม่เข้าเงื่อนไข)

---

## Phase 5 — Notification Service

- [x] node-cron รันทุกวัน (เช่น 08:00) สแกน cert ทั้งหมดที่ active
      — `NotificationScheduler` (node-cron 4) ตั้งเวลาจาก `NOTIFICATION_CRON` (ค่าเริ่มต้น `0 8 * * *`)
        โซนเวลา `NOTIFICATION_TIMEZONE` (ค่าเริ่มต้น Asia/Bangkok) · `noOverlap` กันงานทับกัน
      — cron ผิดรูปแบบ → log error แล้วข้ามการตั้งเวลา ไม่ทำให้ API ขึ้นไม่ได้ · ปิดได้ด้วย
        `NOTIFICATION_CRON_ENABLED=false` และปิดอัตโนมัติเมื่อ `NODE_ENV=test` (ไม่ให้ cron แอบรันตอนเทสต์)
      — สแกนเฉพาะ cert ที่ `isActive` **และบริษัทยัง `isActive`** ที่เหลือไม่เกิน 90 วัน (รวมที่หมดอายุแล้ว)
- [x] กติกา tier: 90 วัน → Email | 60 วัน → Email + LINE | 30 วัน → Critical (Email+LINE ระดับด่วน) | ≤7 วัน → แจ้งทุกวัน
      — กติกาอยู่ใน `packages/shared/src/notification.ts` ที่เดียว (`selectNotificationTier`,
        `NOTIFICATION_TIER_CHANNELS`) · cert ที่หมดอายุแล้วเข้าขั้น ≤7 วัน = แจ้งต่อทุกวัน
- [x] Idempotent: เช็ค `NotificationLog` ก่อนส่ง — tier เดิมของ cert เดิมส่งแล้ว ห้ามส่งซ้ำ (ยกเว้น tier ≤7 วันที่ส่งวันละครั้ง)
      — โหลดประวัติที่ **ส่งสำเร็จ** ของ cert ทั้งชุดมาครั้งเดียวแล้วตัดสินในหน่วยความจำ
      — แถวที่ล้มเหลว (`isSuccess=false`) **ไม่นับว่าเคยส่ง** → SMTP ล่มวันเดียวไม่ทำให้ใบนั้นเงียบตลอด
      — บันทึกด้วย `upsert` บน unique key `(certificateId, tier, channel, sentOn)` ให้ DB เป็นคนกันซ้ำจริง
- [x] Channel เป็น interface/adapter: `EmailChannel` (nodemailer + SMTP จาก .env), `LineChannel` (LINE Messaging API) — dev mode ใช้ console/mock ได้
      — `NotificationChannelAdapter` (resolveRecipient + send) · เพิ่มช่องทางใหม่แก้ที่ module เดียว
      — ไม่ได้ตั้งค่า SMTP/LINE หรือ `NOTIFICATION_DRY_RUN=true` → เขียนลง log แทน และรายงาน `mode: "console"`
        กลับมาในผลการรัน (ไม่ให้เข้าใจผิดว่าส่งจริงแล้ว)
      — ผู้รับอีเมล = `Company.contactEmail` (สำรองด้วย `MAIL_TO_FALLBACK`) · LINE ใช้ `LINE_TO`
- [x] Cert ที่ RenewalTask = Completed แล้ว → ไม่ต้องแจ้งเตือนต่อ (ดูจาก task **ล่าสุด** ตามนิยาม Phase 4)
- [x] Endpoint `POST /notifications/test-run` (admin) สำหรับ trigger ทดสอบโดยไม่ต้องรอ cron
      — รับ `companyId` (จำกัดขอบเขต) และ `preview` (ดูว่าจะแจ้งใครบ้างโดยไม่ส่งและไม่บันทึก)
      — เพิ่ม `GET /notifications` (ทุก role) ดูประวัติการแจ้งเตือน + filter tier/channel/isSuccess
- [x] Unit test: เลือก tier ถูกต้องตามจำนวนวัน, กันส่งซ้ำ, ข้าม cert ที่ Completed
      — shared: ขอบเขต 7/8, 30/31, 60/61, 90/91, 0, ค่าติดลบ + ช่องทางของทุกขั้น
      — api: ขั้น/ช่องทางที่ส่งจริง, กันซ้ำทั้ง 2 แบบ, ข้าม Completed, ไม่มีปลายทาง, ช่องทางล้มเหลว, preview

**เกณฑ์ตรวจรับ:**
- [x] รัน test-run กับ seed data แล้ว log แสดงการส่งถูก tier ถูก channel
      — ข้อมูลที่ import จริง (SMEBANK 7 ใบ): `sent: 14` = ขั้น 30 วัน 1 ใบ + ขั้น 60 วัน 6 ใบ × 2 ช่องทาง
        (`byTier: {DAY_60: 6, DAY_30: 1}`, `byChannel: {EMAIL: 7, LINE: 7}`) ตรงกับวันหมดอายุในไฟล์
- [x] รันซ้ำทันที → ไม่ส่งซ้ำ — `sent: 0, skippedAlreadySent: 14` และจำนวนแถวใน `NotificationLog` ไม่เพิ่ม
      (e2e ยังทดสอบต่อว่า **วันถัดไป** ขั้น ≤7 วันแจ้งอีกครั้ง ส่วนขั้น 90/60/30 ยังเงียบ)

---

## Phase 6 — Frontend: Dashboard & Design System

> อ้างอิงดีไซน์จาก `legacy/report-jul69.html` อย่างเคร่งครัด — ดู Design System ใน CLAUDE.md

- [x] ตั้งค่า theme กลาง: ฟอนต์ Sarabun, CSS variables สีทั้งหมด, การ์ด/badge/ตาราง เป็น shared components
      — `src/index.css` ถอดค่าจาก `legacy/report-jul69.html` ตรงตัว (สี, radius 12/16px, เงา,
        แถบล่าง 5px, ตัวเลข 2.2rem, thead `#f1f5f9`, badge radius 6px) + ส่วนที่ไฟล์เดิมไม่มี (sidebar/ฟอร์ม)
      — component ที่ใช้ซ้ำ: `Card`/`CardTitle`, `PolicyCard`, `RiskBadge`, `StateBlock`
- [x] Layout: sidebar เมนู (Dashboard, Companies, Certificates, Import, Tasks, Reports, Settings) + header
      — `AppLayout` + `Sidebar` (พื้น `--primary`, เมนูที่เลือกเป็นสีน้ำเงิน `--accent`) พร้อมชื่อผู้ใช้/role
        และปุ่มออกจากระบบ · หน้าที่ยังไม่ทำใช้ `PlaceholderPage` บอกตรงๆ ว่าจะเสร็จเฟสไหน
- [x] หน้า Login — เรียก `POST /auth/login`, เก็บ token, จำหน้าที่ตั้งใจเปิดไว้แล้วพากลับหลัง login
- [x] หน้า Dashboard:
  - [x] การ์ดสรุป 4 ใบ (High/Medium/Low/Safe) หน้าตาเหมือน policy-card เดิม + การ์ดเพิ่ม: Total, Expiring Soon, Completed, Pending, Expired
        — ข้อความบนการ์ดทั้ง 4 ใบคัดลอกจากไฟล์เดิมทุกบรรทัด
  - [x] Doughnut chart สัดส่วนความเสี่ยง + Grouped bar สถานะงานรายกลุ่มความเสี่ยง (สไตล์เดิมเป๊ะ)
        — cutout 70%, borderWidth 0, datalabels ตัวหนาสีขาว 14px ซ่อนเลข 0, legend ล่าง,
          bar: Done เขียว/Pending ส้ม borderRadius 4 ตัวเลขเหนือแท่งสี `#475569`, แกน y stepSize 1, ฟอนต์ Sarabun ทั้งกราฟ
  - [x] ตัวกรอง: บริษัท (dropdown), เดือน (แสดง พ.ศ.), สถานะงาน — เลือกบริษัทแล้วทั้งหน้าเปลี่ยนเป็นของบริษัทนั้นทันที
        — ตัวกรองทั้งสามถูกส่งไปทั้ง `/dashboard/summary` และ `/certificates` ชุดเดียวกัน
        — **เพิ่ม `status` ให้ `/dashboard/summary`** เพื่อให้การ์ด/กราฟเปลี่ยนตามตัวกรองสถานะด้วย (ดู DECISIONS.md)
        — รายการเดือนคำนวณจากวันที่ปัจจุบัน (ย้อน 3 / ล่วงหน้า 12 เดือน) + ตัวเลือก "ทุกเดือน" ไม่ hard-code
  - [x] ตารางรายการ cert: ลำดับ, Common Name, วันคงเหลือ (สีตาม risk), badge ความเสี่ยง, สถานะภาษาไทย
        — ใต้ CN แสดง endpoint + วันหมดอายุเป็น พ.ศ. · มีแบ่งหน้า (25 รายการ/หน้า) ใช้ `meta` จาก api
  - [x] ปุ่มพิมพ์รายงาน + `@media print` เหมือนไฟล์เดิม (ซ่อน sidebar/ตัวกรอง/ปุ่ม, ตัดเงาการ์ด)
- [x] ทุกข้อมูลดึงจาก API เท่านั้น (React Query) — ห้ามมีข้อมูลฝังในโค้ดแม้แต่ตัวเดียว
      — `src/lib/api.ts` เป็นทางเดียวที่คุยกับ backend (แนบ JWT, 401 → ล้าง session)
      — เทสต์ระดับหน้าจอจำลอง `fetch` ทั้งหมด: ถ้ามีข้อมูลฝังในโค้ดจะจับได้ทันที

**เกณฑ์ตรวจรับ:**
- [x] เปิดหน้า Dashboard เทียบกับ `legacy/report-jul69.html` แล้วโทน/องค์ประกอบหลักเหมือนกัน
      — ค่าสี/ระยะทั้งหมดถอดจากไฟล์เดิม และมีเทสต์ยืนยันค่าคงที่ (สี risk, ลำดับ, ค่ากราฟ)
      — **ข้อนี้ต้องตรวจด้วยตาอีกครั้ง**: เปิด `http://localhost:5173` เทียบกับไฟล์ใน `legacy/`
- [x] เปลี่ยน dropdown บริษัท → ตัวเลข การ์ด กราฟ ตาราง เปลี่ยนตามทันที
      — มีเทสต์อัตโนมัติ (`DashboardPage.spec.tsx`) ยืนยันว่าเรียก API ใหม่ด้วย `companyId` นั้น
        ทั้ง summary และ certificates แล้วการ์ด/ตารางเปลี่ยนเป็นข้อมูลบริษัทใหม่
- [x] กดพิมพ์ → ได้รายงานสะอาดไม่มีปุ่ม/ตัวกรอง — `@media print` ซ่อน `.sidebar/.controls/.btn/.pager`

---

## Phase 7 — Frontend: Companies, Import, Certificate Detail, Tasks

- [x] หน้า Companies: list + สร้าง/แก้ไข/ปิดใช้งาน
      — รหัสบริษัทแก้ไม่ได้หลังสร้าง (ช่องถูกล็อกพร้อมคำอธิบาย) · ปิดใช้งาน = soft delete และเปิดกลับได้
      — operator/viewer เห็นรายการแต่ไม่มีปุ่มจัดการ (ตรงกับ `@Roles(ADMIN)` ของ api)
- [x] หน้า Import: เลือกบริษัท (บังคับ) → upload .xlsx → แสดง preview ผล mapping →
      ถ้า validate ไม่ผ่าน แสดง error ชัดเจน (คอลัมน์ไหนหาย/แถวไหนพัง) → confirm → สรุปผล import
      — 3 ขั้น: สำรวจไฟล์ (เห็นทุก sheet + แถว header + sheet ที่ระบบแนะนำ) → ตรวจ (dryRun) → ยืนยัน
      — sheet ที่คอลัมน์ไม่ครบเลือกไม่ได้และบอกว่าขาดอะไร · เลือกโหมด strict/ผ่อนได้
      — error แสดงคอลัมน์ที่หาย + ชื่อ header ที่ระบบยอมรับ + header ที่เจอในไฟล์ + แถวที่พังรายแถว
      — มีตารางประวัติการนำเข้าท้ายหน้า
- [x] หน้า Certificates: list + filter/search
      — ค้นหา (CN/endpoint/owner/issuer) + กรองบริษัท/ความเสี่ยง/สถานะงาน/หมดอายุแล้ว + แบ่งหน้า
- [x] หน้า Certificate Detail: ข้อมูลเทคนิคครบ (CN, SAN, Issuer, Serial, Algorithm, Key Size, SHA256, Endpoint, Owner), timeline History, Attachment upload, RenewalTask ปัจจุบัน
      — timeline แปลง action เป็นคำอธิบายไทย พร้อมผู้ทำและเวลา · ไฟล์แนบดาวน์โหลดได้ (แนบ token ผ่าน blob)
      — cert ที่ยังไม่มีงาน → เปิดงานต่ออายุได้จากหน้านี้ · ถ้ามีงานหลายรอบ แสดงตารางงานทุกรอบ
- [x] หน้า Tasks: มุมมองตาม workflow status (board หรือ list แบ่งกลุ่ม), เปลี่ยน status + assign ได้ตามสิทธิ์
      — board แบ่งคอลัมน์ตามลำดับ workflow · กรองบริษัท/ผู้รับผิดชอบ/ความเสี่ยง/ขอบเขต (ค้าง-ปิดแล้ว)
      — **dropdown สถานะเสนอเฉพาะปลายทางที่กฎอนุญาต** เพราะตารางเส้นทางย้ายไปอยู่ใน `packages/shared`
        ที่ api ใช้ตรวจ (ปุ่มบนจอกับกฎฝั่ง server จึงไม่หลุดจากกัน)
- [x] หน้า Settings/Users (admin): จัดการผู้ใช้และ role
      — **เพิ่ม `GET /users` + `PATCH /users/:id` ใน api** (สร้างผู้ใช้ยังใช้ `POST /auth/register` ของ Phase 2)
      — สร้าง/เปลี่ยน role/ปิด-เปิดบัญชี/รีเซ็ตรหัสผ่าน · api กันปิดหรือลดสิทธิ์ตัวเอง และกันปิด admin คนสุดท้าย
      — `GET /users` ยังใช้ทำ dropdown ผู้รับผิดชอบในหน้า Tasks (ADMIN + OPERATOR อ่านได้)

**เกณฑ์ตรวจรับ:**
- [x] ทำ flow จริงครบวงจร: สร้างบริษัท → import Excel จริง → เห็นใน dashboard →
      เปิด cert detail → assign task → เปลี่ยน status จน Completed → เห็น history ครบทุกขั้น
      — `test/full-flow.e2e-spec.ts` เดินทั้ง 6 ขั้นด้วย API ชุดเดียวกับที่หน้าจอเรียก (25 เคส)
        รวมประวัติที่ต้องมีครบ: IMPORT → ASSIGN → STATUS_CHANGE → CSR_GENERATED → VERIFY → COMPLETE
      — **การกดจริงบนหน้าจอต้องให้ผู้ใช้ตรวจอีกครั้ง** (ผมตรวจได้ถึงระดับ component test + API e2e)

---

## Phase 8 — Reports, Export & Hardening

- [x] Export รายงานเป็น Excel (ExcelJS): รายเดือน/รายบริษัท ตาม filter ปัจจุบัน
      — `GET /reports/certificates.xlsx` ใช้ตัวกรองชุดเดียวกับหน้า Certificates (company/month/risk/status/search/expired)
      — ไฟล์มี 2 sheet: **สรุป** (ขอบเขตที่กรอง + จำนวนตาม risk/status จาก DashboardService ชุดเดียวกับหน้าจอ)
        และ **รายการ Certificate** (ข้อมูลเทคนิคครบ 16 คอลัมน์, วันหมดอายุเป็น พ.ศ., ป้ายสถานะภาษาไทย)
      — มีเพดาน 5,000 แถวต่อไฟล์ · ถ้าถูกตัดจะเขียนกำกับในไฟล์และแจ้งบนหน้าจอ (ไม่ตัดเงียบๆ)
- [x] รายงานย้อนหลัง: สรุปผลรายเดือน (จำนวนตาม risk/status) เทียบเดือนก่อนหน้า
      — `GET /reports/monthly?month=&companyId=` คืนตัวเลขเดือนที่เลือก + เดือนก่อนหน้า + ส่วนต่าง
      — หน้า Reports แสดงตารางเทียบ (เพิ่มขึ้น = ส้ม, ลดลง = เขียว) + ตารางสถานะงานของทั้งสองเดือน
- [x] Docker Compose production: build api + web (nginx) + db, ทดสอบ `docker compose up` จบในคำสั่งเดียว
      — `apps/api/Dockerfile` (multi-stage, รันด้วยผู้ใช้ `node`, tini เป็น PID 1, healthcheck)
        entrypoint apply migration + seed (idempotent) ให้เองตอนสตาร์ท
      — `apps/web/Dockerfile` build ด้วย `VITE_API_BASE_URL=/api` แล้วเสิร์ฟด้วย nginx
        ที่ proxy `/api` ไป container api → หน้าเว็บกับ API เป็น same-origin
      — เพิ่ม volume `uploads` ให้ไฟล์แนบอยู่รอดเมื่อสร้าง container ใหม่ · `.dockerignore` กัน .env หลุดเข้า image
- [x] README.md: วิธีติดตั้ง, ตั้งค่า .env, การใช้งานเบื้องต้น
      — เขียนใหม่ทั้งไฟล์: ความสามารถ, ติดตั้งด้วย Docker, การใช้งาน 7 ขั้น, เปิดแจ้งเตือนจริง,
        การพัฒนาต่อ, ความปลอดภัย, ตารางแก้ปัญหาที่พบบ่อย
- [x] ตรวจความปลอดภัยพื้นฐาน: rate limit login, validate file type/size ตอน upload, helmet, CORS
      — **rate limit 2 ชั้น**: ต่อ (IP + อีเมล) ที่ api (`LOGIN_RATE_LIMIT`, ค่าเริ่มต้น 5 ครั้ง/นาที)
        และต่อ IP ที่ nginx (`limit_req` 10r/m) · login สำเร็จแล้วล้างตัวนับ
      — upload: ตรวจนามสกุล + mime + **ไบต์แรกของไฟล์** (`.xlsx` ต้องเป็น ZIP/OOXML) + ขนาด
      — helmet + CORS allowlist + จำกัด JSON body 256kb + `trust proxy` · CSP ของหน้าเว็บอยู่ใน nginx
      — เพิ่ม `env-check.ts`: ถ้า `JWT_SECRET` ยังเป็นค่าตัวอย่างหรือสั้นกว่า 32 ตัวอักษร **API จะไม่เริ่มทำงาน**
- [x] รัน test ทั้งหมด + ทดสอบ e2e flow สุดท้ายอีกรอบ — ผ่าน 653/653

**เกณฑ์ตรวจรับ:**
- [x] เครื่องใหม่ clone repo → ตั้ง .env → `docker compose up` → ใช้งานได้จริงตาม README
      — ทดสอบด้วย compose project แยก (`ct-fresh`) บน **volume เปล่า**: apply migration 2 ตัว →
        seed สร้างบริษัท 2 แห่ง + บัญชี admin → login ผ่าน nginx → import ไฟล์จริงได้ 7 รายการ (สร้างงาน 7 งาน) →
        dashboard `total=7 HIGH=1 MEDIUM=6` → ดาวน์โหลด Excel 7 แถว · ลบ stack ทดสอบทิ้งแล้ว
- [x] Export Excel เปิดได้ ข้อมูลตรงกับหน้าจอ
      — e2e เปิดไฟล์ที่ดาวน์โหลดด้วย ExcelJS แล้วตรวจว่ามี 2 sheet, จำนวนแถวตรงกับตัวกรอง (7 แถว
        และ 1 แถวเมื่อกรอง `risk=HIGH`) พร้อมค่าที่อ่านได้จริง เช่น `smewormdc02.smebank.local`, `SHA256withRSA`

> **สิ่งที่เจอจากการรัน Docker จริง (แก้แล้วทั้งสอง):**
> 1. `prisma/seed.ts` import จาก `../src/...` ทำให้ seed รันใน image ไม่ได้ (image ไม่มีซอร์ส) →
>    ย้ายโค้ด seed ไป `src/seed.ts` ให้ถูกคอมไพล์ลง `dist` แล้ว entrypoint รัน `node dist/seed.js`
>    (`prisma/seed.ts` เหลือเป็นตัวห่อบางๆ ให้ `prisma db seed` ตอน dev)
> 2. nginx **ไม่สืบทอด** `add_header` จากระดับ server เมื่อ location ประกาศ `add_header` เอง →
>    security header หายไปจากหน้าเว็บทั้งหมด ทั้งที่ตั้งไว้ที่ server · แยกเป็น `security-headers.inc`
>    แล้ว include ในทุก location ที่มี add_header ของตัวเอง
>
> **ปรับโครงสร้างระหว่างเฟสนี้:** ย้าย helmet/CORS/ValidationPipe จาก `main.ts` ไป `bootstrap.ts`
> แล้วให้ e2e ทั้ง 6 ไฟล์เรียกใช้ชุดเดียวกัน — เดิมเทสต์ไม่ได้ผ่าน middleware เหล่านี้เลย
> จึงทดสอบเรื่อง security header ไม่ได้ (และตอนนี้ e2e ครอบ helmet/CORS ของจริงแล้ว)

---

## บันทึกความคืบหน้า

| วันที่ | เฟส | สรุป | ผู้ตรวจยืนยัน |
|---|---|---|---|
| 2026-08-03 | Phase 0 | วาง monorepo (npm workspaces) + docker-compose (PostgreSQL 16) + NestJS 11/Prisma 6 + Vite 6/React 18 + packages/shared (enums+label ไทย) + ESLint/Prettier + git init — `GET /health` ตอบ `{status:"ok",db:"connected"}`, test ผ่าน 9/9 | ✅ ผ่าน (commit `4e6bef2`) |
| 2026-08-03 | Phase 1 | Prisma schema 9 model + 6 enum, migration `init`, seed (2 บริษัท + admin, idempotent), `calculateRisk`/`calculateDaysUntilExpiry`/`isExpired` ใน packages/shared, password util (scrypt), enum parity test — test ผ่าน 50/50 | ✅ ผ่าน (commit `ca5dd4d`) |
| 2026-08-03 | Phase 2 | JWT auth + RBAC (global guard, ปิดทุก endpoint เป็นค่าเริ่มต้น), Company CRUD + soft delete, Site CRUD, HistoryService เขียนประวัติใน transaction เดียวกับ mutation — test ผ่าน 97/97 (unit 78 + e2e 19) | ✅ ผ่าน (commit `3f154f0`) |
| 2026-08-03 | Phase 3 | Excel Import Service: sheet/header auto-detect, header mapping (+typo `Onwer`), status ไทย (+trailing space), split endpoint หลายค่า, strict validation, upsert, ImportBatch + HistoryLog + RenewalTask อัตโนมัติ, `dryRun` preview — test ผ่าน 212/212 (unit 172 + e2e 40) | ✅ ผ่าน (commit `3866d77`) |
| 2026-08-03 | Phase 4 | Certificate API (filter risk/month/status/search + pagination, risk คำนวณสด), Renewal workflow (transition guard + assign + ประวัติทุกขั้น), Attachment upload/download, `GET /dashboard/summary` (byRisk/byStatus/byRiskStatus) — test ผ่าน 388/388 (api unit 269 + api e2e 78 + shared 40 + web 1) | ✅ ผ่าน (commit `65c3749`) |
| 2026-08-03 | Phase 5 | Notification Service: node-cron รายวัน (Asia/Bangkok), ขั้นบันได 90/60/30/≤7 ใน shared, adapter Email (nodemailer) + LINE (Messaging API) พร้อมโหมดซ้อม, idempotent ด้วย NotificationLog (upsert + ไม่นับแถวที่ล้มเหลว), ข้าม cert ที่งานเสร็จแล้ว, `POST /notifications/test-run` + `preview`, `GET /notifications`, ตัวช่วยวันที่ พ.ศ. ใน shared — test ผ่าน 469/469 (api unit 298 + api e2e 93 + shared 77 + web 1) | ✅ ผ่าน (commit `fc2f41c`) |
| 2026-08-03 | Phase 6 | Frontend: design system จาก legacy (Sarabun + CSS variables + policy card/badge/ตาราง), layout sidebar + header, หน้า Login, หน้า Dashboard ครบ (การ์ด 4+5 ใบ, Doughnut + Grouped Bar สไตล์เดิม, ตัวกรองบริษัท/เดือน พ.ศ./สถานะ, ตารางพร้อมแบ่งหน้า, ปุ่มพิมพ์ + `@media print`), ข้อมูลทั้งหมดผ่าน React Query, เพิ่ม `status` ให้ `/dashboard/summary` — test ผ่าน 508/508 (api unit 300 + api e2e 95 + shared 77 + web 36) | ✅ ผ่าน (commit `8c2dd88`) |
| 2026-08-03 | Phase 7 | Frontend ครบทุกหน้า: Companies (CRUD + soft delete), Import 3 ขั้นพร้อมรายละเอียด error, Certificates + filter/search, Certificate Detail (ข้อมูลเทคนิค + timeline + ไฟล์แนบ + จัดการงาน), Tasks board, Settings/Users · api เพิ่ม `GET /users` + `PATCH /users/:id` และย้ายตาราง transition ไป `packages/shared` — test ผ่าน 591/591 (api unit 313 + api e2e 120 + shared 86 + web 72) | ✅ ผ่าน (commit `5cfaed3`) |
| 2026-08-04 | Phase 8 | Reports (Export Excel 2 sheet ตามตัวกรอง + สรุปรายเดือนเทียบเดือนก่อน) · หน้า Reports · Docker Compose production (api multi-stage + nginx เสิร์ฟ SPA/proxy `/api` + volume uploads) · README ใหม่ทั้งไฟล์ · hardening (rate limit login 2 ชั้น, ตรวจไบต์แรกของไฟล์อัปโหลด, helmet/CORS/body limit, env-check ปฏิเสธ secret ค่าตัวอย่าง) · ย้าย middleware ไป `bootstrap.ts` ให้ e2e ใช้ชุดเดียวกับ production — test ผ่าน 653/653 (api unit 355 + api e2e 133 + shared 86 + web 79) | รอตรวจ |
