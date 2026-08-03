/**
 * สัญญาของช่องทางแจ้งเตือน — service ตัดสินใจว่า "ใครควรได้รับข่าวอะไรทางไหน"
 * ส่วน adapter รู้แค่วิธีส่งของช่องทางตัวเอง (เพิ่ม LINE Notify / Teams ภายหลังได้โดยไม่แก้ service)
 */
import { NotificationChannel, NotificationTier } from '@prisma/client';

/** ข้อความที่พร้อมส่ง — ประกอบเสร็จแล้วจาก `message.ts` (ฟังก์ชันล้วน) */
export interface NotificationMessage {
  subject: string;
  /** เนื้อหาแบบข้อความล้วน ใช้ได้ทั้งอีเมลและ LINE */
  text: string;
  tier: NotificationTier;
  isCritical: boolean;
}

/** ข้อมูลที่ adapter ใช้หาปลายทางของ certificate ใบนั้น */
export interface RecipientContext {
  companyCode: string;
  companyName: string;
  companyContactEmail: string | null;
}

/**
 * `live` = ส่งออกจริง · `console` = โหมดพัฒนา/ยังไม่ตั้งค่าช่องทาง จึงเขียนลง log แทน
 * ค่านี้ถูกรายงานกลับไปในผลการรัน เพื่อไม่ให้เข้าใจผิดว่าส่งจริงแล้ว
 */
export type SendMode = 'live' | 'console';

export interface SendResult {
  mode: SendMode;
  recipient: string;
}

export interface NotificationChannelAdapter {
  readonly channel: NotificationChannel;

  /** ปลายทางของ cert ใบนี้ — `null` = ไม่มีปลายทาง ให้ข้ามช่องทางนี้ไป (ไม่ถือว่าล้มเหลว) */
  resolveRecipient(context: RecipientContext): string | null;

  /** ส่งข้อความ — โยน error เมื่อส่งไม่สำเร็จ เพื่อให้ service บันทึกความล้มเหลวลง NotificationLog */
  send(message: NotificationMessage, recipient: string): Promise<SendResult>;
}

/** token ของ DI สำหรับรายการ adapter ทั้งหมด */
export const NOTIFICATION_CHANNELS = 'NOTIFICATION_CHANNELS';

/**
 * โหมดซ้อม: ไม่ส่งออกจริงแต่ยังบันทึก NotificationLog ตามปกติ
 * (ตั้งด้วย `NOTIFICATION_DRY_RUN=true` ใน .env — ค่าเริ่มต้นของเครื่อง dev)
 */
export function isSimulateMode(): boolean {
  return (process.env.NOTIFICATION_DRY_RUN ?? 'true').toLowerCase() === 'true';
}
