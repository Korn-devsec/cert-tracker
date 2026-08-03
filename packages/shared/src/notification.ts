/**
 * กติกาการแจ้งเตือนแบบขั้นบันได — ที่เดียวของระบบ (กฎเหล็กข้อ 7)
 *
 *   90 วัน → Email | 60 วัน → Email + LINE | 30 วัน → ด่วน (Email + LINE) | ≤7 วัน → แจ้งทุกวัน
 *
 * หมายเหตุ: ตัวเลข 30/60/90 ตรงกับเกณฑ์ความเสี่ยงโดยบังเอิญ แต่เป็น "คนละเรื่อง"
 * (ความเสี่ยง = สีบนหน้าจอ, ขั้นแจ้งเตือน = ใครได้รับข่าวทางไหน) จึงประกาศแยกกันไว้ที่นี่
 * เพื่อให้ปรับกติกาแจ้งเตือนได้โดยไม่กระทบสีของ Dashboard
 */
import { NotificationChannel, NotificationTier } from './enums';

/** ขอบบนของจำนวนวันคงเหลือในแต่ละขั้น */
export const NOTIFICATION_TIER_MAX_DAYS: Record<NotificationTier, number> = {
  [NotificationTier.DAY_7]: 7,
  [NotificationTier.DAY_30]: 30,
  [NotificationTier.DAY_60]: 60,
  [NotificationTier.DAY_90]: 90,
};

/** เกินกี่วันถือว่ายังไม่ต้องแจ้งเตือน — ใช้จำกัดขอบเขตการสแกนของ scheduler ด้วย */
export const NOTIFICATION_HORIZON_DAYS = NOTIFICATION_TIER_MAX_DAYS[NotificationTier.DAY_90];

/** ช่องทางของแต่ละขั้น — ขั้นที่ด่วนขึ้นจะเพิ่มช่องทาง ไม่ใช่เปลี่ยนช่องทาง */
export const NOTIFICATION_TIER_CHANNELS: Record<NotificationTier, NotificationChannel[]> = {
  [NotificationTier.DAY_90]: [NotificationChannel.EMAIL],
  [NotificationTier.DAY_60]: [NotificationChannel.EMAIL, NotificationChannel.LINE],
  [NotificationTier.DAY_30]: [NotificationChannel.EMAIL, NotificationChannel.LINE],
  [NotificationTier.DAY_7]: [NotificationChannel.EMAIL, NotificationChannel.LINE],
};

/**
 * ขั้นที่ต้องแจ้งซ้ำ **ทุกวัน** — ขั้นอื่นแจ้งครั้งเดียวต่อใบรับรองหนึ่งใบ
 * (ตัวกันซ้ำใน NotificationLog อ่านค่านี้เพื่อรู้ว่าจะเทียบ "เคยส่งไหม" หรือ "ส่งวันนี้แล้วไหม")
 */
export function isDailyTier(tier: NotificationTier): boolean {
  return tier === NotificationTier.DAY_7;
}

/** ขั้นที่ถือว่าเร่งด่วน — ใช้ตัดสินหัวข้อ/ความเน้นของข้อความ */
export function isCriticalTier(tier: NotificationTier): boolean {
  return tier === NotificationTier.DAY_30 || tier === NotificationTier.DAY_7;
}

/**
 * เลือกขั้นการแจ้งเตือนจากจำนวนวันคงเหลือ
 *
 * - เหลือ ≤ 7 วัน **รวมถึงหมดอายุแล้ว (ค่าติดลบ)** → ขั้นวิกฤต แจ้งทุกวัน
 *   เพราะใบที่หมดอายุแล้วและยังไม่มีใครต่อคือเรื่องที่ต้องดังที่สุด ไม่ใช่เรื่องที่ควรเงียบไป
 * - เกิน 90 วัน → `null` (ยังไม่ต้องแจ้ง)
 *
 * @throws TypeError ถ้าค่าที่ส่งมาไม่ใช่ตัวเลขที่ใช้งานได้
 */
export function selectNotificationTier(daysUntilExpiry: number): NotificationTier | null {
  if (!Number.isFinite(daysUntilExpiry)) {
    throw new TypeError(`daysUntilExpiry ต้องเป็นตัวเลขที่ใช้งานได้ แต่ได้รับ: ${daysUntilExpiry}`);
  }

  if (daysUntilExpiry <= NOTIFICATION_TIER_MAX_DAYS[NotificationTier.DAY_7]) {
    return NotificationTier.DAY_7;
  }
  if (daysUntilExpiry <= NOTIFICATION_TIER_MAX_DAYS[NotificationTier.DAY_30]) {
    return NotificationTier.DAY_30;
  }
  if (daysUntilExpiry <= NOTIFICATION_TIER_MAX_DAYS[NotificationTier.DAY_60]) {
    return NotificationTier.DAY_60;
  }
  if (daysUntilExpiry <= NOTIFICATION_TIER_MAX_DAYS[NotificationTier.DAY_90]) {
    return NotificationTier.DAY_90;
  }
  return null;
}

/** ช่องทางของขั้นนั้น (คืนสำเนาใหม่เสมอ เพื่อไม่ให้ผู้เรียกแก้ค่าคงที่ของระบบ) */
export function channelsForTier(tier: NotificationTier): NotificationChannel[] {
  return [...NOTIFICATION_TIER_CHANNELS[tier]];
}
