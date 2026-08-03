/**
 * ตัวตั้งเวลาสแกนใบรับรองรายวัน (node-cron ตาม Tech Stack ใน CLAUDE.md)
 *
 * ค่าเริ่มต้น 08:00 ตามเวลาไทย ปรับได้ด้วย `NOTIFICATION_CRON` / `NOTIFICATION_TIMEZONE`
 *
 * ตัวกันซ้ำที่แท้จริงคือ unique key ของ `NotificationLog` ไม่ใช่ตารางเวลา —
 * ที่นี่แค่กันงานทับกัน (`noOverlap`) เพื่อไม่ให้เสียแรงสแกนซ้อน
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { schedule, validate, type ScheduledTask } from 'node-cron';
import { NotificationsService } from './notifications.service';

const DEFAULT_CRON = '0 8 * * *';
const DEFAULT_TIMEZONE = 'Asia/Bangkok';

@Injectable()
export class NotificationScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationScheduler.name);
  private task: ScheduledTask | null = null;

  constructor(private readonly notifications: NotificationsService) {}

  onModuleInit(): void {
    if (!isSchedulerEnabled()) {
      this.logger.log(
        'ปิดการตั้งเวลาแจ้งเตือนไว้ (NOTIFICATION_CRON_ENABLED=false หรืออยู่ในเทสต์)',
      );
      return;
    }

    const expression = (process.env.NOTIFICATION_CRON ?? DEFAULT_CRON).trim();
    if (!validate(expression)) {
      // ไม่ throw เพื่อไม่ให้ API ทั้งตัวขึ้นไม่ได้เพราะพิมพ์ cron ผิด — แต่ต้องดังพอให้เห็นใน log
      this.logger.error(
        `รูปแบบ NOTIFICATION_CRON ไม่ถูกต้อง: "${expression}" — ข้ามการตั้งเวลา ` +
          '(ยังสั่งด้วย POST /notifications/test-run ได้)',
      );
      return;
    }

    const timezone = process.env.NOTIFICATION_TIMEZONE ?? DEFAULT_TIMEZONE;
    this.task = schedule(expression, () => void this.runOnce(), {
      name: 'ssl-notification-scan',
      timezone,
      noOverlap: true,
    });
    this.logger.log(`ตั้งเวลาสแกนแจ้งเตือน "${expression}" (${timezone}) เรียบร้อย`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.task?.stop();
    this.task = null;
  }

  private async runOnce(): Promise<void> {
    try {
      await this.notifications.run({ trigger: 'cron' });
    } catch (error) {
      // งาน cron ต้องไม่ทำให้โปรเซสตาย — log แล้วรอรอบถัดไป
      this.logger.error(
        `สแกนแจ้งเตือนตามเวลาไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

function isSchedulerEnabled(): boolean {
  if (process.env.NODE_ENV === 'test') {
    return false; // เทสต์บูต AppModule จริง จึงต้องไม่ให้ cron แอบรันระหว่างเทสต์
  }
  return (process.env.NOTIFICATION_CRON_ENABLED ?? 'true').toLowerCase() !== 'false';
}
