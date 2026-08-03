import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { assertProductionEnv } from './common/env-check';

async function bootstrap(): Promise<void> {
  // ตรวจค่าคอนฟิกสำคัญก่อนต่อ DB — ถ้ายังใช้ JWT secret ค่าตัวอย่างจะไม่ยอมเริ่มระบบ
  assertProductionEnv();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const logger = new Logger('Bootstrap');

  // helmet / CORS / ValidationPipe / trust proxy — ชุดเดียวกับที่เทสต์ e2e ใช้ (ดู bootstrap.ts)
  configureApp(app);
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  logger.log(`API listening on http://localhost:${port} (health: /health)`);
}

void bootstrap();
