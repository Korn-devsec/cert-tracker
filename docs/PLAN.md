# PLAN.md — แผนพัฒนาระบบ SSL Certificate Lifecycle Management

> **วิธีใช้ไฟล์นี้:** Claude Code ต้องอ่านไฟล์นี้ก่อนเริ่มงานทุก session
> ทำทีละเฟสตามลำดับ ติ๊ก `[x]` เมื่อเสร็จ และ**หยุดรอผู้ใช้ตรวจ**เมื่อจบแต่ละเฟส
> ห้ามเริ่มเฟสถัดไปจนกว่าผู้ใช้จะพิมพ์ยืนยัน เช่น "ผ่าน เริ่มเฟสถัดไปได้"

**สถานะปัจจุบัน:** Phase 0–3 ตรวจผ่านแล้ว · Phase 4 ทำเสร็จแล้ว — **รอผู้ใช้ตรวจรับ** ก่อนเริ่ม Phase 5

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

- [ ] node-cron รันทุกวัน (เช่น 08:00) สแกน cert ทั้งหมดที่ active
- [ ] กติกา tier: 90 วัน → Email | 60 วัน → Email + LINE | 30 วัน → Critical (Email+LINE ระดับด่วน) | ≤7 วัน → แจ้งทุกวัน
- [ ] Idempotent: เช็ค `NotificationLog` ก่อนส่ง — tier เดิมของ cert เดิมส่งแล้ว ห้ามส่งซ้ำ (ยกเว้น tier ≤7 วันที่ส่งวันละครั้ง)
- [ ] Channel เป็น interface/adapter: `EmailChannel` (nodemailer + SMTP จาก .env), `LineChannel` (LINE Messaging API) — dev mode ใช้ console/mock ได้
- [ ] Cert ที่ RenewalTask = Completed แล้ว → ไม่ต้องแจ้งเตือนต่อ
- [ ] Endpoint `POST /notifications/test-run` (admin) สำหรับ trigger ทดสอบโดยไม่ต้องรอ cron
- [ ] Unit test: เลือก tier ถูกต้องตามจำนวนวัน, กันส่งซ้ำ, ข้าม cert ที่ Completed

**เกณฑ์ตรวจรับ:**
- รัน test-run กับ seed data แล้ว log แสดงการส่งถูก tier ถูก channel
- รันซ้ำทันที → ไม่ส่งซ้ำ

---

## Phase 6 — Frontend: Dashboard & Design System

> อ้างอิงดีไซน์จาก `legacy/report-jul69.html` อย่างเคร่งครัด — ดู Design System ใน CLAUDE.md

- [ ] ตั้งค่า theme กลาง: ฟอนต์ Sarabun, CSS variables สีทั้งหมด, การ์ด/badge/ตาราง เป็น shared components
- [ ] Layout: sidebar เมนู (Dashboard, Companies, Certificates, Import, Tasks, Reports, Settings) + header
- [ ] หน้า Login
- [ ] หน้า Dashboard:
  - การ์ดสรุป 4 ใบ (High/Medium/Low/Safe) หน้าตาเหมือน policy-card เดิม + การ์ดเพิ่ม: Total, Expiring Soon, Completed, Pending, Expired
  - Doughnut chart สัดส่วนความเสี่ยง + Grouped bar สถานะงานรายกลุ่มความเสี่ยง (สไตล์เดิมเป๊ะ)
  - ตัวกรอง: บริษัท (dropdown), เดือน (แสดง พ.ศ.), สถานะงาน — เลือกบริษัทแล้วทั้งหน้าเปลี่ยนเป็นของบริษัทนั้นทันที
  - ตารางรายการ cert: ลำดับ, Common Name, วันคงเหลือ (สีตาม risk), badge ความเสี่ยง, สถานะภาษาไทย
  - ปุ่มพิมพ์รายงาน + `@media print` เหมือนไฟล์เดิม
- [ ] ทุกข้อมูลดึงจาก API เท่านั้น (React Query) — ห้ามมีข้อมูลฝังในโค้ดแม้แต่ตัวเดียว

**เกณฑ์ตรวจรับ:**
- เปิดหน้า Dashboard เทียบกับ `legacy/report-jul69.html` แล้วโทน/องค์ประกอบหลักเหมือนกัน
- เปลี่ยน dropdown บริษัท → ตัวเลข การ์ด กราฟ ตาราง เปลี่ยนตามทันที
- กดพิมพ์ → ได้รายงานสะอาดไม่มีปุ่ม/ตัวกรอง

---

## Phase 7 — Frontend: Companies, Import, Certificate Detail, Tasks

- [ ] หน้า Companies: list + สร้าง/แก้ไข/ปิดใช้งาน
- [ ] หน้า Import: เลือกบริษัท (บังคับ) → upload .xlsx → แสดง preview ผล mapping →
      ถ้า validate ไม่ผ่าน แสดง error ชัดเจน (คอลัมน์ไหนหาย/แถวไหนพัง) → confirm → สรุปผล import
- [ ] หน้า Certificates: list + filter/search
- [ ] หน้า Certificate Detail: ข้อมูลเทคนิคครบ (CN, SAN, Issuer, Serial, Algorithm, Key Size, SHA256, Endpoint, Owner), timeline History, Attachment upload, RenewalTask ปัจจุบัน
- [ ] หน้า Tasks: มุมมองตาม workflow status (board หรือ list แบ่งกลุ่ม), เปลี่ยน status + assign ได้ตามสิทธิ์
- [ ] หน้า Settings/Users (admin): จัดการผู้ใช้และ role

**เกณฑ์ตรวจรับ:**
- ทำ flow จริงครบวงจร: สร้างบริษัท → import Excel จริง → เห็นใน dashboard →
  เปิด cert detail → assign task → เปลี่ยน status จน Completed → เห็น history ครบทุกขั้น

---

## Phase 8 — Reports, Export & Hardening

- [ ] Export รายงานเป็น Excel (ExcelJS): รายเดือน/รายบริษัท ตาม filter ปัจจุบัน
- [ ] รายงานย้อนหลัง: สรุปผลรายเดือน (จำนวนตาม risk/status) เทียบเดือนก่อนหน้า
- [ ] Docker Compose production: build api + web (nginx) + db, ทดสอบ `docker compose up` จบในคำสั่งเดียว
- [ ] README.md: วิธีติดตั้ง, ตั้งค่า .env, การใช้งานเบื้องต้น
- [ ] ตรวจความปลอดภัยพื้นฐาน: rate limit login, validate file type/size ตอน upload, helmet, CORS
- [ ] รัน test ทั้งหมด + ทดสอบ e2e flow สุดท้ายอีกรอบ

**เกณฑ์ตรวจรับ:**
- เครื่องใหม่ clone repo → ตั้ง .env → `docker compose up` → ใช้งานได้จริงตาม README
- Export Excel เปิดได้ ข้อมูลตรงกับหน้าจอ

---

## บันทึกความคืบหน้า

| วันที่ | เฟส | สรุป | ผู้ตรวจยืนยัน |
|---|---|---|---|
| 2026-08-03 | Phase 0 | วาง monorepo (npm workspaces) + docker-compose (PostgreSQL 16) + NestJS 11/Prisma 6 + Vite 6/React 18 + packages/shared (enums+label ไทย) + ESLint/Prettier + git init — `GET /health` ตอบ `{status:"ok",db:"connected"}`, test ผ่าน 9/9 | ✅ ผ่าน (commit `4e6bef2`) |
| 2026-08-03 | Phase 1 | Prisma schema 9 model + 6 enum, migration `init`, seed (2 บริษัท + admin, idempotent), `calculateRisk`/`calculateDaysUntilExpiry`/`isExpired` ใน packages/shared, password util (scrypt), enum parity test — test ผ่าน 50/50 | ✅ ผ่าน (commit `ca5dd4d`) |
| 2026-08-03 | Phase 2 | JWT auth + RBAC (global guard, ปิดทุก endpoint เป็นค่าเริ่มต้น), Company CRUD + soft delete, Site CRUD, HistoryService เขียนประวัติใน transaction เดียวกับ mutation — test ผ่าน 97/97 (unit 78 + e2e 19) | ✅ ผ่าน (commit `3f154f0`) |
| 2026-08-03 | Phase 3 | Excel Import Service: sheet/header auto-detect, header mapping (+typo `Onwer`), status ไทย (+trailing space), split endpoint หลายค่า, strict validation, upsert, ImportBatch + HistoryLog + RenewalTask อัตโนมัติ, `dryRun` preview — test ผ่าน 212/212 (unit 172 + e2e 40) | ✅ ผ่าน (commit `3866d77`) |
| 2026-08-03 | Phase 4 | Certificate API (filter risk/month/status/search + pagination, risk คำนวณสด), Renewal workflow (transition guard + assign + ประวัติทุกขั้น), Attachment upload/download, `GET /dashboard/summary` (byRisk/byStatus/byRiskStatus) — test ผ่าน 388/388 (api unit 269 + api e2e 78 + shared 40 + web 1) | รอตรวจ |
