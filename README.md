# SSL Certificate Lifecycle Management

ระบบบริหารวงจรชีวิต SSL Certificate สำหรับดูแลลูกค้าหลายบริษัท (multi-tenant) —
นำเข้าข้อมูลจาก Excel → เก็บในฐานข้อมูล → ดู Dashboard → ติดตามงานต่ออายุ → แจ้งเตือน → ออกรายงาน

พัฒนาต่อยอดจากรายงาน HTML เดิมที่ hard-code ข้อมูลไว้ใน JavaScript (`legacy/report-jul69.html`)
โดยยึดหน้าตา/โทนสีของไฟล์นั้นไว้ทั้งหมด

---

## ความสามารถ

| ส่วน | รายละเอียด |
|---|---|
| **นำเข้าข้อมูล** | อ่านไฟล์ `.xlsx` จาก **ชื่อหัวคอลัมน์** (ไม่อ้างตำแหน่ง) · ตรวจหา sheet และแถว header ให้เอง · รองรับหัวคอลัมน์หลายชื่อ/พิมพ์ผิด · สถานะภาษาไทย · endpoint หลายค่าในเซลล์เดียวแตกเป็นหลายรายการ · ตรวจก่อนบันทึก (preview) · ขาดคอลัมน์จำเป็น = ไม่บันทึกทั้งไฟล์ |
| **Dashboard** | การ์ดสรุปตามระดับความเสี่ยง + Doughnut/Grouped Bar · กรองตามบริษัท/เดือน (พ.ศ.)/สถานะงาน · ปุ่มพิมพ์รายงาน |
| **Certificate** | รายการ + ค้นหา/กรอง · หน้ารายละเอียดครบ (CN, SAN, Issuer, Serial, Algorithm, Key Size, SHA-256, Endpoint, Owner) · ไทม์ไลน์ประวัติ · ไฟล์แนบ |
| **งานต่ออายุ** | board ตามขั้น workflow · เปลี่ยนสถานะได้เฉพาะเส้นทางที่ถูกต้อง · มอบหมายผู้รับผิดชอบ · ทุกการเปลี่ยนแปลงมีประวัติ |
| **แจ้งเตือน** | สแกนรายวันด้วย cron · ขั้นบันได 90 → 60 → 30 → ≤7 วัน · Email (SMTP) + LINE Messaging API · กันส่งซ้ำ |
| **รายงาน** | สรุปรายเดือนเทียบเดือนก่อนหน้า · ส่งออก Excel ตามตัวกรองที่เลือก |
| **ผู้ใช้** | JWT + สิทธิ์ 3 ระดับ: ผู้ดูแลระบบ / ผู้ปฏิบัติงาน / ผู้ดูข้อมูล |

## Tech stack

React 18 + TypeScript + Vite · Chart.js · NestJS 11 · Prisma 6 · PostgreSQL 16 · ExcelJS · node-cron · Docker Compose

---

## เริ่มใช้งานด้วย Docker (แนะนำ)

ต้องมี **Docker Desktop** (หรือ Docker Engine + Compose v2)

```bash
git clone <repo-url> cert-tracker
cd cert-tracker
cp .env.example .env
```

**แก้ `.env` อย่างน้อย 3 ค่านี้ก่อนรัน:**

```dotenv
POSTGRES_PASSWORD=<รหัสฐานข้อมูลของคุณ>
JWT_SECRET=<ค่าสุ่มยาว ≥32 ตัวอักษร — สร้างด้วย: openssl rand -base64 48>
SEED_ADMIN_PASSWORD=<รหัสผ่านผู้ดูแลคนแรก>
```

> API จะ **ไม่เริ่มทำงาน** ถ้า `JWT_SECRET` ยังเป็นค่าตัวอย่างหรือสั้นกว่า 32 ตัวอักษร
> (ตรวจใน `apps/api/src/common/env-check.ts` — กันการเผลอ deploy ด้วย secret ที่ใครก็เดาได้)

```bash
docker compose up -d --build
```

เปิด **http://localhost:8080** แล้วเข้าสู่ระบบด้วย `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` ที่ตั้งไว้

ตอนสตาร์ท container `api` จะ apply migration และ seed ข้อมูลตั้งต้น (บริษัทตัวอย่าง 2 แห่ง + บัญชีผู้ดูแล) ให้เอง —
รันซ้ำได้ ไม่เขียนรหัสผ่านทับของเดิม

| service | พอร์ตบนเครื่อง | หน้าที่ |
|---|---|---|
| `web` | `8080` (`WEB_PORT`) | nginx เสิร์ฟหน้าเว็บ + proxy `/api` ไปที่ api |
| `api` | `3000` (`API_PORT`) | NestJS (เปิดไว้เพื่อ debug — ผู้ใช้ทั่วไปเข้าผ่าน `web`) |
| `db` | `5433` (`POSTGRES_PORT`) | PostgreSQL 16 |

คำสั่งที่ใช้บ่อย:

```bash
docker compose logs -f api          # ดู log
docker compose ps                   # สถานะ + health
docker compose down                 # หยุด (ข้อมูลใน volume ยังอยู่)
docker compose down -v              # หยุดและลบข้อมูลทั้งหมด
```

---

## การใช้งานเบื้องต้น

1. **บริษัท** → “+ เพิ่มบริษัท” (ทุก certificate ต้องผูกกับบริษัท)
2. **นำเข้าข้อมูล** → เลือกบริษัท + ไฟล์ `.xlsx` → *สำรวจไฟล์* → เลือก sheet → *ตรวจข้อมูล* (ยังไม่บันทึก) → *ยืนยันนำเข้า*
   - ถ้าไฟล์ขาดคอลัมน์จำเป็น ระบบจะบอกว่าขาดคอลัมน์ไหน ชื่อหัวคอลัมน์ที่ยอมรับมีอะไร และเจออะไรในไฟล์
   - คอลัมน์ที่ต้องมี: ชื่อรายการ (`Common Name`/`CN`/…) และวันหมดอายุ (`Expires`) หรือจำนวนวันคงเหลือ (`Days Until`)
3. **Dashboard** → ดูภาพรวม กรองตามบริษัท/เดือน/สถานะงาน · กด “พิมพ์รายงาน” ได้หน้าสะอาดไม่มีเมนู/ตัวกรอง
4. **Certificates** → กดชื่อรายการเพื่อดูรายละเอียด แนบไฟล์ และจัดการงานต่ออายุ
5. **งานต่ออายุ** → มอบหมายผู้รับผิดชอบ แล้วเดินสถานะ:
   `รายการใหม่ → มอบหมายแล้ว → อยู่ระหว่างดำเนินการ → รอผู้ให้บริการ ⇄ รอ CA → อยู่ระหว่างทดสอบ → เรียบร้อยแล้ว`
   (ยกเลิกได้ทุกขั้น · ข้ามขั้นไม่ได้ · ทุกการเปลี่ยนแปลงบันทึกว่าใครทำเมื่อไร)
6. **รายงาน** → เทียบตัวเลขกับเดือนก่อนหน้า และดาวน์โหลด Excel ตามตัวกรองที่เลือก
7. **ตั้งค่า/ผู้ใช้** (ผู้ดูแลระบบ) → สร้างผู้ใช้ กำหนดสิทธิ์ ปิด/เปิดบัญชี รีเซ็ตรหัสผ่าน

**ระดับความเสี่ยง** คำนวณจากวันคงเหลือทุกครั้งที่เปิดหน้า: `≤30 = สูง` · `31–60 = กลาง` · `61–90 = ต่ำ` · `>90 = ปกติ`
ส่วน **สถานะงาน** เป็นเรื่องของคนอัปเดต — ใบที่เหลือ 20 วันแต่ต่ออายุเสร็จแล้วจะแสดง “สูง” คู่กับ “เรียบร้อยแล้ว” ได้ตามปกติ

### เปิดใช้การแจ้งเตือนจริง

ค่าเริ่มต้นเป็น **โหมดซ้อม** (`NOTIFICATION_DRY_RUN=true`) คือเขียนลง log แทนการส่งจริง
เมื่อพร้อมส่งจริงให้ตั้งค่าใน `.env` แล้ว `docker compose up -d api`:

```dotenv
NOTIFICATION_DRY_RUN=false
SMTP_HOST=smtp.example.co.th
SMTP_PORT=587
SMTP_USER=...
SMTP_PASSWORD=...
MAIL_FROM=cert-tracker@example.co.th
LINE_CHANNEL_ACCESS_TOKEN=...
LINE_TO=<userId หรือ groupId ของทีมที่ดูแล>
```

- ผู้รับอีเมลคือ **อีเมลผู้ติดต่อของบริษัท** (ตั้งในหน้าบริษัท) — ตั้ง `MAIL_TO_FALLBACK` เผื่อบริษัทที่ยังไม่ได้กรอก
- ทดสอบได้โดยไม่ต้องรอ cron: **POST** `/api/notifications/test-run` (ผู้ดูแลระบบ) · ส่ง `{"preview": true}` เพื่อดูว่าจะแจ้งใครโดยไม่ส่งจริง

---

## พัฒนาต่อ (dev)

ต้องมี Node.js ≥ 20.11 และ Docker (ใช้เฉพาะ PostgreSQL)

```bash
npm install
cp .env.example .env                       # ค่าของ docker compose (db)
cp apps/api/.env.example apps/api/.env     # ค่าของ api
cp apps/web/.env.example apps/web/.env     # ค่าของ web

npm run db:up                              # เปิด PostgreSQL (พอร์ต 5433)
npm run build:shared                       # build packages/shared ครั้งแรก
cd apps/api && npx prisma migrate dev && npm run prisma:seed && cd ../..

npm run dev:api                            # http://localhost:3000
npm run dev:web                            # http://localhost:5173
```

> พอร์ต DB บนเครื่องคือ **5433** (ไม่ใช่ 5432) เพื่อไม่ให้ชนกับ PostgreSQL ที่อาจติดตั้งอยู่แล้ว —
> ถ้าเปลี่ยน `POSTGRES_PORT` ต้องแก้ `DATABASE_URL` ใน `apps/api/.env` ให้ตรงกัน

### คำสั่งที่ใช้บ่อย

```bash
npm test                                   # unit test ทุก workspace
npm run test:e2e -w @cert-tracker/api      # e2e (ต้องมี PostgreSQL รันอยู่)
npm run lint                               # ESLint ทุก workspace
npm run build                              # build ทุก workspace
npm run format                             # Prettier
npm run db:up / db:down / db:logs          # จัดการ PostgreSQL
cd apps/api && npx prisma studio           # ดู/แก้ข้อมูลในฐานข้อมูล
cd apps/api && npx prisma migrate dev      # สร้าง/รัน migration
```

ตรวจสุขภาพระบบ: `curl http://localhost:3000/health` → `{"status":"ok","db":"connected"}`

### โครงสร้างโปรเจกต์

```
apps/api          NestJS — auth, users, companies, imports, certificates, tasks, dashboard, notifications, reports
apps/web          React + Vite — Dashboard, Companies, Certificates(+Detail), Import, Tasks, Reports, Settings
packages/shared   enum, ป้ายภาษาไทย, การคำนวณความเสี่ยง, ขั้นการแจ้งเตือน, กฎ workflow, วันที่ พ.ศ.
deploy            nginx.conf + entrypoint ของ container api
docs              REQUIREMENTS.md · PLAN.md (แผนงานแบ่งเฟส) · DECISIONS.md (บันทึกการตัดสินใจ) · samples/
legacy            รายงาน HTML เดิม = ต้นแบบดีไซน์ (อ่านอย่างเดียว)
```

| ไฟล์ | เนื้อหา |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | กฎของโปรเจกต์ + Business Rules + Design System |
| [`docs/PLAN.md`](docs/PLAN.md) | แผนงานแบ่งเฟส + checklist และสถานะปัจจุบัน |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | เหตุผลของการตัดสินใจแต่ละข้อ |

---

## ความปลอดภัย

- ทุก endpoint ต้อง login ยกเว้น `POST /auth/login` และ `GET /health` (guard เปิดใช้ทั้งระบบเป็นค่าเริ่มต้น)
- ตรวจสิทธิ์ผู้ใช้จากฐานข้อมูลทุกคำขอ → ปิดบัญชีแล้ว token ที่ออกไปใช้ต่อไม่ได้ทันที
- รหัสผ่านเก็บเป็น scrypt hash · ข้อความตอน login ไม่ผ่านเหมือนกันทุกกรณี (กันการไล่เดาว่าอีเมลไหนมีบัญชี)
- จำกัดจำนวนครั้งที่ลอง login สองชั้น: ต่อ (IP + อีเมล) ที่ api และต่อ IP ที่ nginx
- ไฟล์ที่อัปโหลดตรวจทั้งนามสกุล ขนาด และ **ไบต์แรกของไฟล์** · ไม่รับไฟล์ที่มี private key (`.key/.pfx/.p12/…`)
- security header ครบทั้งฝั่ง API (helmet) และหน้าเว็บ (CSP ใน `deploy/nginx.conf`)

**ก่อนใช้งานจริงควรทำเพิ่ม:** ปิดพอร์ต `API_PORT` ไม่ให้เข้าถึงจากภายนอก · วาง HTTPS (reverse proxy/ingress) หน้า `web` ·
สำรองข้อมูล volume `cert-tracker-pgdata` และ `cert-tracker-uploads`

---

## แก้ปัญหาที่พบบ่อย

| อาการ | สาเหตุ/วิธีแก้ |
|---|---|
| `api` ขึ้นแล้วดับ พร้อมข้อความ “ค่าคอนฟิกสำหรับใช้งานจริงยังไม่ครบ” | ยังไม่ได้ตั้ง `JWT_SECRET` (หรือสั้นเกิน 32 ตัวอักษร) ใน `.env` |
| เปิด `localhost:8080` แล้วหน้าไม่อัปเดตตามโค้ดที่แก้ | ต้อง build image ใหม่ — `docker compose up -d --build web` |
| นำเข้าไฟล์แล้วบอกว่า “ไม่ใช่ .xlsx จริง” | ไฟล์เป็น `.csv`/`.xls` ที่เปลี่ยนนามสกุล — เปิดใน Excel แล้ว *Save As* เป็น `.xlsx` |
| เข้าสู่ระบบไม่ได้ ขึ้น “พยายามเข้าสู่ระบบถี่เกินไป” | กรอกรหัสผิดหลายครั้ง — รอ 1 นาที (ปรับได้ที่ `LOGIN_RATE_LIMIT`) |
| พอร์ต 5433/8080 ชนกับโปรแกรมอื่น | เปลี่ยน `POSTGRES_PORT` / `WEB_PORT` ใน `.env` แล้ว `docker compose up -d` |
| แจ้งเตือนไม่ส่งออกจริง | ยังอยู่โหมดซ้อม — ตั้ง `NOTIFICATION_DRY_RUN=false` และกรอกค่า SMTP/LINE ให้ครบ |
