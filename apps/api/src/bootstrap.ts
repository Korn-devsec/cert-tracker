/**
 * การตั้งค่าแอปที่ต้องเหมือนกันทุกที่ (Phase 8)
 *
 * เดิมการตั้ง helmet/CORS/ValidationPipe อยู่ใน `main.ts` เท่านั้น ทำให้เทสต์ e2e
 * ซึ่งสร้างแอปเองไม่ได้ผ่าน middleware ชุดนี้เลย — พอมีงานด้านความปลอดภัยเข้ามา
 * จึงย้ายมาไว้ที่เดียวให้ทั้ง `main.ts` และเทสต์เรียกใช้ร่วมกัน
 */
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';

/** ขนาด body ของ JSON — คำขอปกติของระบบนี้เล็กมาก (ไฟล์ Excel ไปทาง multipart ไม่ผ่านตัวนี้) */
const JSON_BODY_LIMIT = '256kb';

export function resolveWebOrigins(): string[] {
  return (process.env.WEB_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function configureApp(app: NestExpressApplication): void {
  // helmet ตั้ง security header ให้ครบ — ปิด CSP เพราะ API ไม่ได้ส่ง HTML
  // (หน้าเว็บถูกเสิร์ฟโดย nginx ซึ่งมี CSP ของตัวเองใน deploy/nginx.conf)
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));

  // CORS: อนุญาตเฉพาะ origin ที่ตั้งไว้ (production ที่เสิร์ฟผ่าน nginx เป็น same-origin อยู่แล้ว)
  app.enableCors({
    origin: resolveWebOrigins(),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    exposedHeaders: ['Content-Disposition', 'X-Report-Row-Count', 'X-Report-Truncated'],
    maxAge: 86_400,
  });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  // trust proxy: ให้ req.ip เป็น IP จริงของผู้ใช้เมื่ออยู่หลัง nginx (ตัวจำกัด login ใช้ค่านี้)
  app.set('trust proxy', 1);
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
}
