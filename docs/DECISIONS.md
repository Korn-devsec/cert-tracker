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

## หัวข้อที่ยังไม่ตัดสินใจ (ต้องเคลียร์ในเฟสถัดไป)

| หัวข้อ | เฟสที่ต้องตัดสิน | หมายเหตุ |
|---|---|---|
| `daysUntilExpiry` ติดลบ (cert หมดอายุแล้ว) จะให้ `RiskLevel` เป็น `HIGH` หรือเพิ่มค่า `EXPIRED` | Phase 1 | ปัจจุบัน `RiskLevel` มี 4 ค่าให้ตรงกับการ์ดสรุป 4 ใบในดีไซน์เดิม ส่วน Dashboard มีตัวนับ "Expired" แยกอยู่แล้ว |
| `endpoint` หลายค่าในเซลล์เดียว จะเก็บเป็น array ใน cert เดียว หรือ split เป็นหลาย record | Phase 3 | PLAN.md Phase 3 ระบุให้ตัดสินใจแล้วบันทึกที่นี่ |
