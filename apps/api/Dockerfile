# ===== builder: ติดตั้ง dependency ของ workspace api + shared แล้ว build =====
FROM node:20-alpine AS builder
WORKDIR /app

# คัดลอกเฉพาะไฟล์ manifest ก่อน เพื่อให้ layer ของ npm ci ถูก cache ไว้เมื่อโค้ดเปลี่ยน
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

# ติดตั้งเฉพาะ workspace ที่ api ต้องใช้ (ไม่ลง dependency ของ web)
RUN npm ci --include-workspace-root --workspace @cert-tracker/shared --workspace @cert-tracker/api

COPY packages/shared packages/shared
COPY apps/api apps/api

# shared ต้อง build ก่อน เพราะ api import จาก dist ของมัน
RUN npm run build -w @cert-tracker/shared \
  && npm run prisma:generate -w @cert-tracker/api \
  && npm run build -w @cert-tracker/api

# ===== runner =====
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# tini เป็น PID 1 เพื่อให้สัญญาณ SIGTERM ถึงโปรเซส node (graceful shutdown ของ Nest)
RUN apk add --no-cache tini

# node_modules ยกมาทั้งชุด (รวม prisma CLI) เพราะ entrypoint ต้องรัน `prisma migrate deploy`
# ตอนสตาร์ท — แลกขนาด image กับการที่ migration ถูก apply เองทุกครั้งที่ deploy
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY deploy/api-entrypoint.sh /usr/local/bin/api-entrypoint.sh

RUN chmod +x /usr/local/bin/api-entrypoint.sh \
  && mkdir -p /app/uploads \
  && chown -R node:node /app/uploads

# รันด้วยผู้ใช้ที่ไม่ใช่ root
USER node

ENV PORT=3000 UPLOAD_DIR=/app/uploads
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/api-entrypoint.sh"]
