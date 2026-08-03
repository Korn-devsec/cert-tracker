# Certificate Tracker

ระบบบริหารวงจรชีวิต SSL Certificate (multi-company)

## เอกสารประกอบ

| ไฟล์ | เนื้อหา |
|---|---|
| `CLAUDE.md` | กฎของโปรเจกต์ + Business Rules + Design System |
| `docs/REQUIREMENTS.md` | spec ต้นทาง |
| `docs/PLAN.md` | แผนงานแบ่งเฟส + checklist (สถานะปัจจุบันของงาน) |
| `docs/DECISIONS.md` | บันทึกการตัดสินใจสำคัญ |
| `legacy/report-jul69.html` | Dashboard เดิม = ต้นแบบดีไซน์ (อ่านอย่างเดียว) |

## โครงสร้าง

```
apps/api            NestJS + Prisma (backend)
apps/web            Vite + React + TypeScript (frontend)
packages/shared     enums/types ที่ใช้ร่วมกัน (build เป็น CJS + ESM)
docs/samples        ไฟล์ Excel ตัวอย่างสำหรับทดสอบ import
```

## ติดตั้ง (ครั้งแรก)

ต้องมี: **Node.js >= 20.11**, **npm >= 10**, **Docker Desktop**

```bash
# 1) ติดตั้ง dependencies ทั้ง monorepo (npm workspaces)
npm install

# 2) เตรียมไฟล์ .env จากต้นแบบ (3 จุด)
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# 3) start PostgreSQL 16
docker compose up -d db

# 4) build packages/shared + generate Prisma client
npm run build:shared
npm run prisma:generate -w @cert-tracker/api
```

> **หมายเหตุเรื่องพอร์ต DB:** container map ไว้ที่ **host 5433** (ไม่ใช่ 5432)
> เพื่อไม่ให้ชนกับ PostgreSQL ที่อาจติดตั้งบนเครื่องอยู่แล้ว
> ปรับได้ที่ `POSTGRES_PORT` ใน `.env` (ต้องแก้ `DATABASE_URL` ใน `apps/api/.env` ให้ตรงกัน)

## รัน development

เปิด 2 terminal:

```bash
npm run dev:api    # http://localhost:3000
npm run dev:web    # http://localhost:5173
```

ตรวจสุขภาพระบบ:

```bash
curl http://localhost:3000/health
# → {"status":"ok","db":"connected"}
```

## คำสั่งที่ใช้บ่อย

```bash
npm test                  # รัน test ทุก workspace
npm run lint              # ESLint ทุก workspace
npm run build             # build ทุก workspace
npm run format            # Prettier (ไม่แตะไฟล์ .md)
npm run db:up             # start PostgreSQL
npm run db:down           # stop PostgreSQL
npm run db:logs           # ดู log ของ DB

cd apps/api && npx prisma studio        # ดูข้อมูลใน DB
cd apps/api && npx prisma migrate dev   # สร้าง/รัน migration
```
