# PLAN.md — แผนพัฒนาระบบ SSL Certificate Lifecycle Management

> **วิธีใช้ไฟล์นี้:** Claude Code ต้องอ่านไฟล์นี้ก่อนเริ่มงานทุก session
> ทำทีละเฟสตามลำดับ ติ๊ก `[x]` เมื่อเสร็จ และ**หยุดรอผู้ใช้ตรวจ**เมื่อจบแต่ละเฟส
> ห้ามเริ่มเฟสถัดไปจนกว่าผู้ใช้จะพิมพ์ยืนยัน เช่น "ผ่าน เริ่มเฟสถัดไปได้"

**สถานะปัจจุบัน:** Phase 0 ตรวจผ่านและ commit แล้ว · Phase 1 ทำเสร็จแล้ว — **รอผู้ใช้ตรวจรับ** ก่อนเริ่ม Phase 2

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

- [ ] Endpoint `POST /imports` รับไฟล์ .xlsx + `companyId` (บังคับเลือกบริษัทก่อนเสมอ) + เลือก sheet ได้
- [ ] **Sheet detection:** list ทุก sheet ให้ผู้ใช้เลือก และ/หรือ auto-suggest sheet ที่เจอ header ครบ (ข้าม sheet หน้าปกอย่าง "Report")
- [ ] **Header row auto-detection:** สแกนหาแถวที่มี header ที่รู้จักครบตามเกณฑ์ (ห้าม assume ว่าเป็นแถวแรก — ไฟล์จริง header อยู่แถว 3)
- [ ] อ่าน **จากชื่อ header เท่านั้น** ห้ามอ้างตำแหน่งคอลัมน์
- [ ] Header Mapping (case-insensitive, trim, รองรับ typo ที่เจอในไฟล์จริง):
  - `Common Name` / `Certificate Name` / `CN` → `commonName`
  - `Endpoints` / `Endpoint` → `endpoint`
  - `Expires` / `Expiry Date` / `Expiration` → `expiresAt` (parse ISO datetime เช่น `2026-09-18T12:25:54`)
  - `Days Until` / `Days Until Expiry` → `daysUntilExpiry`
  - `Owner` / `Onwer` (typo ที่เจอจริง) → `owner`
  - `Issuer` → `issuer`
  - `Signing Algorithm` / `Signature Algorithm` → `signatureAlgorithm`
  - `Status` → `status`, `Remark` → `remark`, `No` / `No.` → ข้าม (ลำดับ ไม่ต้อง import)
- [ ] **Status Mapping ภาษาไทย** (trim ก่อนเสมอ — ไฟล์จริงมี "ดำเนินการแล้ว " มีช่องว่างท้าย):
  - `อยู่ระหว่างดำเนินการ` / `Pending` → task status เริ่มต้นตาม workflow
  - `ดำเนินการแล้ว` / `เรียบร้อยแล้ว` / `Done` / `Completed` → `Completed`
  - ค่าที่ map ไม่ได้ → รายงานเป็น warning พร้อมเลขแถว
- [ ] **Endpoints หลายค่า:** เซลล์เดียวมีหลาย endpoint คั่นด้วย newline → split เป็นหลายรายการ (หรือเก็บเป็น array) ตัดสินใจแล้วบันทึกลง DECISIONS.md
- [ ] Validation: header จำเป็น (`commonName`, `expiresAt` หรือ `daysUntilExpiry`) หาย → reject ทั้งไฟล์ พร้อม error บอกชื่อคอลัมน์ที่หาย
- [ ] Validation รายแถว: วันที่ parse ไม่ได้ / commonName ว่าง → รายงานเลขแถว+เหตุผล, มีโหมด strict (reject ทั้งไฟล์) เป็น default
- [ ] Normalize: trim ทุก field, แปลงวันที่เป็น UTC, dedupe ภายในไฟล์ (commonName+endpoint ซ้ำ)
- [ ] Upsert: cert เดิม (companyId+commonName+endpoint ตรงกัน) → update, ใหม่ → create
- [ ] บันทึก `ImportBatch` (ไฟล์, ผู้ import, จำนวนแถว, ผลลัพธ์) + HistoryLog ต่อ cert
- [ ] สร้าง `RenewalTask` status `New` อัตโนมัติสำหรับ cert ที่ risk ≠ Safe และยังไม่มี task ค้าง
- [ ] Unit test ครบชุด: header อยู่แถว 3 / header สลับตำแหน่ง / header ชื่อ alias+typo (`Onwer`) / header จำเป็นหาย / status ไทยมี trailing space / endpoints หลายค่าใน cell เดียว / แถวข้อมูลพัง / import ซ้ำต้อง upsert ไม่สร้างซ้ำ
- [ ] เตรียมไฟล์ทดสอบใน `apps/api/test/fixtures/`: คัดลอก `docs/samples/30-July-2026.xlsx` (ไฟล์จริง) + สร้างเพิ่ม: ไฟล์สลับคอลัมน์, ไฟล์คอลัมน์หาย

**เกณฑ์ตรวจรับ:**
- Import `docs/samples/30-July-2026.xlsx` (sheet `Report-SSL-Jul-2026`) สำเร็จ ข้อมูลเข้า DB ครบทุกแถว ผูก company ถูก status ไทยถูก map ถูกต้อง
- ไฟล์สลับคอลัมน์ → import ผ่านเหมือนเดิม
- ไฟล์ที่ลบคอลัมน์ `Days Until`/`Expires` ออก → reject พร้อมข้อความชัดเจน
- Import ไฟล์เดิมซ้ำ → จำนวน cert ใน DB ไม่เพิ่ม

---

## Phase 4 — Certificate API, Risk & Renewal Workflow

- [ ] `GET /certificates` พร้อม filter: company, month, risk, status + pagination + sort
- [ ] `GET /certificates/:id` แสดง detail ครบ: CN, SAN, Issuer, Serial, Signature Algorithm, Key Size, SHA256, Endpoint, Owner + history + attachments
- [ ] `daysUntilExpiry` และ `riskLevel` คำนวณสด ณ เวลา query (ไม่ freeze ค่าเก่าจาก Excel)
- [ ] RenewalTask workflow API: เปลี่ยน status ได้เฉพาะ transition ที่ถูกต้อง
      `New → Assigned → In Progress → Waiting Vendor ⇄ Waiting CA → Testing → Completed`, ยกเลิกได้ทุกขั้น → `Cancelled`
- [ ] Assign ผู้รับผิดชอบ + ทุกการเปลี่ยน status ลง HistoryLog (actor, from→to, note)
- [ ] Attachment upload/download ต่อ certificate
- [ ] `GET /dashboard/summary?companyId=&month=` คืน counts: total, byRisk, byStatus, expiringSoon, expired
- [ ] Unit test: transition ที่ผิด (เช่น New → Completed ข้ามขั้น) ต้องโดน 400

**เกณฑ์ตรวจรับ:**
- Cert เหลือ 20 วัน + task Completed แสดง Risk=High และ Status=Completed พร้อมกันได้ (พิสูจน์ว่าแยกกันจริง)
- ประวัติการเปลี่ยน status ย้อนดูได้ครบว่าใครทำอะไรเมื่อไร

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
| 2026-08-03 | Phase 1 | Prisma schema 9 model + 6 enum, migration `init`, seed (2 บริษัท + admin, idempotent), `calculateRisk`/`calculateDaysUntilExpiry`/`isExpired` ใน packages/shared, password util (scrypt), enum parity test — test ผ่าน 50/50 | รอตรวจ |
