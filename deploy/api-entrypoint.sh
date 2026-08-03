#!/bin/sh
# จุดเริ่มของ container api:
#   1) apply migration ที่ค้าง (migrate deploy — ไม่สร้าง migration ใหม่ ไม่ลบข้อมูล)
#   2) seed ข้อมูลตั้งต้น (idempotent — บริษัทตัวอย่าง + บัญชี admin จาก SEED_ADMIN_*)
#   3) รัน API
#
# ถ้า seed ล้มเหลวจะแจ้งเตือนแต่ไม่หยุด container เพราะระบบยังใช้งานได้
# (เช่นกรณี deploy ครั้งถัดไปที่มีข้อมูลอยู่แล้ว)
set -e

cd /app/apps/api

echo "[entrypoint] apply migrations…"
npx prisma migrate deploy

cd /app

if [ "${RUN_SEED_ON_START:-true}" = "true" ]; then
  # ใช้ seed ที่คอมไพล์แล้ว (ไม่พึ่ง ts-node/ซอร์สใน image) — idempotent รันซ้ำได้
  echo "[entrypoint] seed ข้อมูลตั้งต้น…"
  node apps/api/dist/seed.js || echo "[entrypoint] เตือน: seed ไม่สำเร็จ — ข้ามไปก่อน"
fi

echo "[entrypoint] เริ่ม API…"
exec node apps/api/dist/main.js
