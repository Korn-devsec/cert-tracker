# DECISIONS — บันทึกการตัดสินใจสำคัญของโปรเจกต์

> ทุกครั้งที่มีการตัดสินใจสำคัญ (เปลี่ยน schema, เพิ่ม library, เปลี่ยนแนวทาง)
> ให้บันทึกลงตารางนี้ พร้อมเหตุผล

| วันที่ | หัวข้อ | ตัดสินใจ | เหตุผล |
|---|---|---|---|
| 2026-08-03 | Monorepo tool | ใช้ **npm workspaces** (`packages/*`, `apps/*`) ไม่เพิ่ม pnpm/Turborepo | Node 20 + npm 11 มีอยู่แล้ว ไม่ต้องเพิ่ม tool ใหม่ และโครงสร้างใน CLAUDE.md เป็น monorepo 3 package ซึ่ง workspaces เอาอยู่ |
| 2026-08-03 | รูปแบบ build ของ `packages/shared` | คอมไพล์ 2 แบบ: `dist/cjs` (สำหรับ api = CommonJS) และ `dist/esm` (สำหรับ web = Vite/ESM) ผ่าน `exports` map | NestJS รันเป็น CommonJS แต่ Vite เป็น ESM ถ้า build แบบเดียวจะมีฝั่งใดฝั่งหนึ่ง resolve ไม่ได้ มี test ทั้งสองฝั่ง (`shared-package.spec.ts`) กันพังตอน refactor |
| 2026-08-03 | Test runner | api ใช้ **Jest** (convention ของ NestJS), `packages/shared` + web ใช้ **Vitest** | Jest คือค่า default ของ NestJS schematics ส่วน Vitest ทำงานร่วมกับ Vite/ESM ได้โดยไม่ต้องตั้ง transform เพิ่ม |
| 2026-08-03 | เวอร์ชัน Vitest | ล็อก `vitest@^3` (ไม่ใช้ ^2) | Vitest 2 peer-depend กับ Vite 5 ทำให้ npm ติดตั้ง Vite ซ้อนอีกชุด แล้ว type ของ plugin ชนกันจน `tsc -b` ฝั่ง web ไม่ผ่าน |
| 2026-08-03 | Host port ของ PostgreSQL | map `5433:5432` (ปรับได้ด้วย `POSTGRES_PORT` ใน `.env` ที่ root) | เครื่อง dev มี PostgreSQL local ครองพอร์ต 5432 อยู่แล้ว ถ้า map 5432 ตรงๆ container จะ start ไม่ขึ้น |
| 2026-08-03 | พฤติกรรมเมื่อต่อ DB ไม่ได้ | `PrismaService.onModuleInit()` log error แต่ไม่ throw, `GET /health` ตอบ HTTP 503 + `{ status: "error", db: "disconnected" }` | ถ้า throw แอปจะตายตอน boot แล้ว health check ก็ตอบอะไรไม่ได้ วินิจฉัยยาก แยก 200/503 ให้ monitoring จับได้ตรงๆ |
| 2026-08-03 | ขอบเขต enum ใน `packages/shared` | นอกจาก 4 ตัวใน checklist (`RiskLevel`, `WorkStatus`, `NotificationTier`, `HistoryAction`) เพิ่ม `NotificationChannel`, `UserRole`, `ImportStatus` และ label ภาษาไทยของแต่ละ enum | 3 ตัวที่เพิ่มมาจาก Data Model/RBAC ใน CLAUDE.md อยู่แล้ว และ Phase 1 (Prisma schema) ต้องใช้ทันที ส่วน label ภาษาไทยเก็บที่เดียวกันเพื่อให้ Dashboard และ Export ใช้ค่าเดียวกัน |
| 2026-08-03 | `docker-compose.yml` ใน Phase 0 | มีแค่ service `db` | Phase 0 ต้องการแค่ DB ให้ dev รันได้ ส่วน image ของ api/web (nginx) เป็นงานของ Phase 8 ตาม PLAN.md |
| 2026-08-03 | tsconfig `moduleResolution` | ใช้ `nodenext` (api และ shared/cjs) แทน `node`/`node10` และย้าย `outDir`/`rootDir` ไปไว้ใน config ที่ emit จริง | `node10` และ `baseUrl` ถูก deprecate ใน TypeScript 7 (IDE ขึ้น error) — `nodenext` ยัง emit CommonJS เหมือนเดิมเพราะ package ไม่ได้ตั้ง `"type": "module"` |
| 2026-08-03 | **[Phase 1]** cert ที่หมดอายุแล้ว (`daysUntilExpiry` ติดลบ) | `RiskLevel` = `HIGH` — **ไม่เพิ่มค่า `EXPIRED`** และแยกด้วยฟังก์ชัน `isExpired(days)` ต่างหาก | การ์ดสรุปในดีไซน์เดิมมี 4 ระดับพอดี ถ้าเพิ่มค่าที่ 5 ต้องรื้อทั้งการ์ด/Doughnut/badge — ส่วน Dashboard ต้องการตัวนับ "Expired" แยกอยู่แล้วจึงใช้ `isExpired()` คำนวณตอน query ได้ (ปิดประเด็นที่ค้างจาก Phase 0) |
| 2026-08-03 | **[Phase 1]** `daysUntilExpiry` / `riskLevel` ใน DB | **ไม่เก็บเป็นคอลัมน์** — คำนวณจาก `expiresAt` ตอน query ด้วย `calculateRisk()` ใน `packages/shared` | ตรงตาม CLAUDE.md (`*` = คำนวณได้) ถ้าเก็บไว้ค่าจะค้างและเพี้ยนทันทีที่ข้ามวัน ทำให้ Dashboard โกหก |
| 2026-08-03 | **[Phase 1]** วิธีนับจำนวนวันคงเหลือ | เทียบเป็น "วันปฏิทิน" บนฐาน UTC (ตัดเวลาในวันออก) ด้วย `calculateDaysUntilExpiry()` | ผลลัพธ์นิ่งตลอดวัน (ไม่แกว่งตามเวลาที่เรียก) และตรงกับความหมายของคอลัมน์ `Days Until` ในไฟล์ Excel จริง |
| 2026-08-03 | **[Phase 1]** `Certificate.endpoint` | เป็น `String @default("")` (ไม่ใช่ nullable) + unique key `(companyId, commonName, endpoint)` | PostgreSQL ถือว่า `NULL` แต่ละตัวไม่ซ้ำกัน ถ้าปล่อยเป็น nullable unique key ที่ Phase 3 ใช้ upsert จะไม่ทำงานเลย → import ซ้ำจะสร้างข้อมูลซ้ำ |
| 2026-08-03 | **[Phase 1]** ชื่อ table | ไม่ใช้ `@@map` — ชื่อ table ตรงกับชื่อ model (`Certificate`, `HistoryLog`) | ค่า default ของ Prisma ลดจุดที่ต้องดูแลให้ตรงกัน 2 ที่ ระบบไม่มีการเขียน raw SQL (นอกจาก `SELECT 1` ใน health check) |
| 2026-08-03 | **[Phase 1]** พฤติกรรมตอนลบข้อมูล | `Cascade` เมื่อลบ Company/Certificate (ลูกทั้งหมดหายตาม), `SetNull` สำหรับ `Certificate.siteId` และ `RenewalTask.assigneeId` | ลบบริษัทต้องไม่เหลือ cert ลอย ส่วนการลบ site หรือปิดบัญชีพนักงานต้องไม่ทำให้ cert/งานหายไปด้วย — ในทางปฏิบัติ Phase 2 ใช้ soft delete (`isActive`) เป็นหลักอยู่แล้ว |
| 2026-08-03 | **[Phase 1]** Hash รหัสผ่าน | ใช้ **scrypt จาก `node:crypto`** (`apps/api/src/common/password.ts`) เก็บเป็น `scrypt$<salt>$<key>` — ไม่เพิ่ม bcrypt/argon2 | ยังไม่ได้ตกลงเรื่อง library เพิ่ม จึงเลือกของที่มีใน Node (scrypt เป็น KDF memory-hard ที่ OWASP ยอมรับ) รูปแบบมี prefix scheme อยู่แล้วจึงเปลี่ยนภายหลังได้โดยไม่ต้อง migrate ข้อมูลทันที — **ขอให้ยืนยันตอน Phase 2 (Auth)** |
| 2026-08-03 | **[Phase 1]** idempotency ของ NotificationLog | เพิ่มคอลัมน์ `sentOn` (`@db.Date`) + unique `(certificateId, tier, channel, sentOn)` | รองรับกติกา 2 แบบในตารางเดียว: tier 90/60/30 เช็คว่าเคยส่ง tier นั้นแล้วหรือยัง ส่วน tier ≤7 วัน ส่งได้วันละ 1 ครั้ง โดยให้ DB เป็นคนกันซ้ำ (กันกรณี cron รันซ้อน) |
| 2026-08-03 | **[Phase 1]** ที่ตั้งค่า seed ของ Prisma | คงไว้ที่ `package.json#prisma.seed` ยังไม่ย้ายไป `prisma.config.ts` | Prisma 6 ขึ้น warning ว่าจะย้ายใน Prisma 7 แต่การย้ายตอนนี้ทำให้ Prisma เลิกโหลด `.env` ให้อัตโนมัติ (ต้องจัดการ dotenv เอง) → เก็บไว้ทำพร้อมกับตอนอัป Prisma 7 |

## หัวข้อที่ยังไม่ตัดสินใจ (ต้องเคลียร์ในเฟสถัดไป)

| หัวข้อ | เฟสที่ต้องตัดสิน | หมายเหตุ |
|---|---|---|
| ยืนยันวิธี hash รหัสผ่าน (scrypt ตามที่ทำไว้ หรือเปลี่ยนเป็น bcrypt/argon2) | Phase 2 | ถ้าเปลี่ยน แก้ที่ `apps/api/src/common/password.ts` ที่เดียว — user ที่ seed ไว้ต้อง reset รหัสหรือเขียน migration รองรับ 2 scheme |
| `endpoint` หลายค่าในเซลล์เดียว → split เป็นหลาย record | Phase 3 | schema Phase 1 วางทางไว้แบบ split แล้ว (endpoint เป็น scalar + อยู่ใน unique key ตาม PLAN.md Phase 3) เหลือแค่ยืนยันตอนเขียน import service |
| อัปเป็น Prisma 7 + ย้าย config ไป `prisma.config.ts` | หลัง Phase 8 | ไม่กระทบการทำงานตอนนี้ เป็นแค่ deprecation warning |
