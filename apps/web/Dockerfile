# ===== builder: build SPA ด้วย Vite =====
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/

RUN npm ci --include-workspace-root --workspace @cert-tracker/shared --workspace @cert-tracker/web

COPY packages/shared packages/shared
COPY apps/web apps/web

# เรียก API ผ่าน path เดียวกับหน้าเว็บ (`/api`) แล้วให้ nginx proxy ต่อไปที่ container api
# → หน้าเว็บกับ API เป็น same-origin จึงไม่ต้องตั้ง CORS และไม่ต้องรู้ hostname ของ API ตอน build
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build -w @cert-tracker/web

# ===== runner: nginx เสิร์ฟไฟล์สแตติก + proxy /api =====
FROM nginx:1.27-alpine AS runner

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/proxy-headers.inc /etc/nginx/conf.d/proxy-headers.inc
COPY deploy/security-headers.inc /etc/nginx/conf.d/security-headers.inc
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
