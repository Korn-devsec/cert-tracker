# CLAUDE.md — SSL Certificate Lifecycle Management System

## ภาพรวมโปรเจกต์

ระบบบริหารวงจรชีวิต SSL Certificate สำหรับดูแลลูกค้าหลายบริษัท (multi-tenant)
พัฒนาต่อยอดจาก Dashboard เดิม (`legacy/report-jul69.html`) ที่ hard-code ข้อมูลใน JavaScript
ให้เป็นระบบเต็มรูปแบบ: Import Excel → Database → Dashboard → Renewal Workflow → Notification → Report

**เป้าหมาย:** ไม่ใช่แค่ดูวันหมดอายุ แต่บริหารตั้งแต่นำเข้าข้อมูล จัดกลุ่มตามลูกค้า
ติดตามการต่ออายุ แจ้งเตือน เก็บประวัติ และออกรายงาน โดยขยายระบบได้โดยไม่ต้องรื้อโครงสร้าง

## Tech Stack (ล็อกไว้แล้ว — ห้ามเปลี่ยนเองโดยไม่ถามก่อน)

| ส่วน | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| UI | Custom theme ตาม Design System ด้านล่าง (ใช้ component library ได้เฉพาะส่วนที่ไม่ขัดกับดีไซน์ เช่น Ant Design สำหรับ Table/Form) |
| Chart | Chart.js + chartjs-plugin-datalabels |
| Backend | Node.js + NestJS |
| Excel | ExcelJS |
| ORM | Prisma |
| Database | PostgreSQL 16 |
| Auth | JWT + RBAC (roles: admin, operator, viewer) |
| Scheduler | node-cron |
| Deploy | Docker Compose (services: api, web, db) |

## โครงสร้างโฟลเดอร์

```
/
├── CLAUDE.md
├── docker-compose.yml
├── docs/
│   ├── REQUIREMENTS.md      # spec ต้นทาง
│   ├── PLAN.md              # แผนงานแบ่งเฟส + checklist (ต้องอัปเดตทุกครั้งที่จบงาน)
│   └── DECISIONS.md         # บันทึกการตัดสินใจสำคัญ
├── legacy/
│   └── report-jul69.html    # Dashboard เดิม = ต้นแบบดีไซน์ (อ่านอย่างเดียว ห้ามแก้)
├── apps/
│   ├── api/                 # NestJS backend
│   └── web/                 # React frontend
└── packages/
    └── shared/              # types/enums ที่ใช้ร่วมกัน (RiskLevel, WorkStatus ฯลฯ)
```

## กฎเหล็กของโปรเจกต์ (Business Rules — ห้ามละเมิด)

1. **Excel เป็นแค่ช่องทาง Import** — ข้อมูลจริงอยู่ใน PostgreSQL เท่านั้น
   Dashboard ห้ามอ่านข้อมูลจากไฟล์หรือ hard-code เด็ดขาด
2. **Import ต้องอ่านจากชื่อ Header เท่านั้น ห้ามอ้างอิงตำแหน่งคอลัมน์** (เช่น ห้ามใช้ Column B)
   ต้องมี Header Mapping เช่น `Common Name` / `Certificate Name` / `CN` → `commonName`
3. **Validate ก่อน Import เสมอ** — ถ้า Header ที่จำเป็นหาย (เช่น `Days Until`)
   ต้อง reject ทั้งไฟล์ พร้อมแจ้งชัดเจนว่าคอลัมน์ไหนหาย ห้าม import บางส่วนแบบเงียบๆ
4. **ทุก Certificate ต้องผูกกับ `company_id`** — ผู้ใช้เลือกบริษัทก่อน Import
   ไม่บังคับให้ Excel มีชื่อบริษัท
5. **Risk กับ Work Status เป็นคนละฟิลด์ คนละเรื่อง ห้ามรวมกัน**
   - Risk คำนวณอัตโนมัติจาก daysUntilExpiry: `<30 = High`, `31–60 = Medium`, `61–90 = Low`, `>90 = Safe`
   - Work Status เป็น workflow ที่คนอัปเดต: `New → Assigned → In Progress → Waiting Vendor → Waiting CA → Testing → Completed / Cancelled`
   - ตัวอย่าง: Cert เหลือ 20 วัน (Risk = High) แต่ Status = Completed ได้ เพราะต่ออายุเสร็จแล้วแต่ใบเก่ายังไม่หมด
6. **ทุก action สำคัญต้องลง History** (import, assign, status change, install, verify, complete)
   พร้อม `actor`, `timestamp`, `detail` — ตรวจสอบย้อนหลังได้เสมอ
7. **Notification แบบขั้นบันได:** 90 วัน (Email) → 60 วัน (Email + LINE) → 30 วัน (Critical) → ≤7 วัน (แจ้งทุกวัน)
   Scheduler ต้อง idempotent — รันซ้ำวันเดียวกันต้องไม่ส่งซ้ำ

## Data Model (โครงหลัก)

```
Company (id, name, code, contactEmail, isActive)
  └── Site (id, companyId, name)                     # optional layer
        └── Certificate (id, companyId, siteId?, commonName, san[], issuer,
              serialNumber, signatureAlgorithm, keySize, sha256Fingerprint,
              endpoint, owner, expiresAt, daysUntilExpiry*, riskLevel*, ...)
              ├── RenewalTask (id, certificateId, status: WorkStatus,
              │     assigneeId?, dueDate?, note)
              ├── HistoryLog (id, certificateId, action, actor, detail, createdAt)
              ├── Attachment (id, certificateId, filename, path, uploadedBy)
              └── NotificationLog (id, certificateId, channel, tier, sentAt)
ImportBatch (id, companyId, filename, importedBy, rowCount, status, errors, createdAt)
User (id, email, name, role, passwordHash)
```
`*` = คำนวณได้ ไม่ให้ user แก้ตรงๆ (daysUntilExpiry คำนวณจาก expiresAt ณ เวลา query)

## Design System (ต้องตรงกับ legacy/report-jul69.html)

Frontend ทุกหน้าต้องใช้โทนนี้ ห้ามใช้ default theme ของ library:

- **ฟอนต์:** `Sarabun` (Google Fonts) น้ำหนัก 300/400/600/700 ทั้งระบบ รวมถึงใน Chart
- **สี:**
  - `--primary: #0f172a` (หัวข้อ/ปุ่มหลัก), `--bg: #f8fafc`, `--card: #ffffff`
  - ตัวอักษรทั่วไป `#334155`, ตัวรอง `#64748b`, เส้นแบ่ง `#e2e8f0`
  - Risk: High `#ef4444` / Medium `#f97316` / Low `#eab308` / Safe `#22c55e`
- **การ์ดสรุป (policy-card):** พื้นขาว, radius 12px, border `#e2e8f0`,
  แถบสีหนา 5px ที่ขอบล่างตามระดับความเสี่ยง, ตัวเลขใหญ่ 2.2rem หนา 700 ชิดขวา
- **การ์ดทั่วไป:** radius 16px, shadow บางๆ `0 4px 6px -1px rgba(0,0,0,0.05)`
- **หัวข้อการ์ด (card-title):** หนา 700, มีแถบสีน้ำเงิน `#3b82f6` 4px ด้านซ้าย
- **ตาราง:** thead พื้น `#f1f5f9`, badge ความเสี่ยงเป็น pill radius 6px พื้นสีตาม risk ตัวอักษรขาว
- **Chart:** Doughnut (cutout 70%) สำหรับสัดส่วนความเสี่ยง + Grouped Bar (Done เขียว / Pending ส้ม,
  borderRadius 4) พร้อม datalabels ตัวหนาสีขาว, legend อยู่ล่าง
- **Print:** ต้องมี `@media print` ซ่อน controls/ปุ่ม และตัด shadow เหมือนไฟล์เดิม
- **ภาษา UI:** ไทยเป็นหลัก (label สถานะ เช่น "เรียบร้อยแล้ว", "อยู่ระหว่างดำเนินการ"),
  ชื่อเดือนแสดงเป็น พ.ศ. เช่น "กรกฎาคม 2569"

หน้าที่ต้องมี: Dashboard (รวม + กรองตามบริษัท/เดือน/สถานะ), Companies, Certificates + Detail
(แสดง CN, SAN, Issuer, Serial, Algorithm, Key Size, SHA256, Endpoint, Owner, History, Attachment),
Import, Renewal Tasks (board/list ตาม workflow), Reports/Export, Settings/Users

## คำสั่งที่ใช้บ่อย

```bash
docker compose up -d db          # start PostgreSQL
cd apps/api && npm run start:dev # backend dev
cd apps/web && npm run dev       # frontend dev
cd apps/api && npx prisma migrate dev
cd apps/api && npx prisma studio
npm test                         # รันใน apps/api หรือ apps/web
```

## Workflow การทำงาน (สำคัญมาก)

1. อ่าน `docs/PLAN.md` ก่อนเริ่มงานทุกครั้ง เพื่อรู้ว่าอยู่เฟสไหน
2. ทำทีละเฟสตามลำดับใน PLAN.md — **ห้ามข้ามเฟส ห้ามเริ่มเฟสถัดไปเอง**
3. เมื่อจบเฟส:
   - รัน test ทั้งหมดให้ผ่าน
   - สรุปสิ่งที่ทำ + วิธีทดสอบด้วยตัวเอง (คำสั่ง/URL/ขั้นตอน) ให้ผู้ใช้
   - อัปเดต checklist ใน `docs/PLAN.md`
   - **หยุดรอผู้ใช้ตรวจและยืนยัน** ก่อนเริ่มเฟสถัดไป
4. `git commit` เฉพาะเมื่อผู้ใช้ตรวจผ่านแล้ว, commit message ภาษาอังกฤษ format:
   `feat(phase-N): <summary>` / `fix: ...` / `test: ...`
5. การตัดสินใจสำคัญ (เช่น เปลี่ยน schema, เพิ่ม library) ต้องถามก่อน แล้วบันทึกลง `docs/DECISIONS.md`
6. Logic สำคัญต้องมี unit test เสมอ: header mapping, import validation,
   risk calculation (ทดสอบขอบเขต 29/30/31, 60/61, 90/91), status transition, notification tier

## ข้อห้าม

- ห้าม hard-code ข้อมูล certificate ในโค้ด (นี่คือปัญหาที่โปรเจกต์นี้เกิดมาเพื่อแก้)
- ห้ามแก้ไฟล์ใน `legacy/`
- ห้ามเก็บ secret ในโค้ด — ใช้ `.env` (มี `.env.example` ให้เสมอ)
- ห้ามลบ/แก้ migration เก่าที่ apply แล้ว — สร้าง migration ใหม่เท่านั้น
- ห้ามใช้ `any` ใน TypeScript ยกเว้นจำเป็นจริงและมี comment อธิบาย
