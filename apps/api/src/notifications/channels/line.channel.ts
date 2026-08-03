/**
 * ช่องทาง LINE (Messaging API — push message)
 *
 * ใช้ `fetch` ที่มีอยู่ใน Node 20 ไม่เพิ่ม SDK ของ LINE เพราะระบบนี้เรียกแค่ปลายทางเดียว
 *
 * ปลายทางมาจาก `LINE_TO` ใน .env (userId/groupId ของทีมที่ดูแล) — schema ยังไม่มีคอลัมน์
 * LINE ต่อบริษัท ถ้าภายหลังต้องแยกตามลูกค้าให้เพิ่มคอลัมน์แล้วแก้เฉพาะไฟล์นี้
 *
 * ไม่ได้ตั้ง token/ปลายทาง หรืออยู่ในโหมดซ้อม → เขียนลง log แทน (mode = `console`)
 */
import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel } from '@prisma/client';
import {
  isSimulateMode,
  type NotificationChannelAdapter,
  type NotificationMessage,
  type RecipientContext,
  type SendResult,
} from './notification-channel';

const LINE_PUSH_ENDPOINT = 'https://api.line.me/v2/bot/message/push';
/** ข้อความ LINE ยาวได้ 5000 ตัวอักษร — ตัดไว้ที่ 4900 เผื่อส่วนหัวที่เราเติม */
const LINE_TEXT_LIMIT = 4900;

@Injectable()
export class LineChannel implements NotificationChannelAdapter {
  readonly channel = NotificationChannel.LINE;

  private readonly logger = new Logger(LineChannel.name);

  resolveRecipient(_context: RecipientContext): string | null {
    const target = process.env.LINE_TO?.trim();
    if (target !== undefined && target.length > 0) {
      return target;
    }
    // ในโหมดซ้อมยังต้องมีปลายทางไว้แสดงใน log ว่าจะส่งไปที่ไหน
    return isSimulateMode() ? 'line:ยังไม่ตั้งค่า LINE_TO' : null;
  }

  async send(message: NotificationMessage, recipient: string): Promise<SendResult> {
    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim() ?? '';
    const text = buildLineText(message);

    if (isSimulateMode() || token.length === 0) {
      this.logger.log(`[ซ้อมส่ง LINE] ถึง ${recipient}\n${text}`);
      return { mode: 'console', recipient };
    }

    const response = await fetch(LINE_PUSH_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        to: recipient,
        messages: [{ type: 'text', text }],
      }),
    });

    if (!response.ok) {
      // เก็บ body ไว้ในข้อความ error เพราะ LINE บอกสาเหตุจริงไว้ที่นั่น (เช่น token หมดอายุ)
      const body = await response.text().catch(() => '');
      throw new Error(
        `LINE ตอบกลับ ${response.status} ${response.statusText}: ${body.slice(0, 300)}`,
      );
    }

    this.logger.log(`ส่ง LINE ถึง ${recipient} แล้ว`);
    return { mode: 'live', recipient };
  }
}

function buildLineText(message: NotificationMessage): string {
  const prefix = message.isCritical ? '🔴 ' : '⚠️ ';
  return `${prefix}${message.subject}\n\n${message.text}`.slice(0, LINE_TEXT_LIMIT);
}
