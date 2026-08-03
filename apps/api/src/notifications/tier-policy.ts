/**
 * สะพานเดียวระหว่างกติกาแจ้งเตือนใน `packages/shared` (TS enum) กับ enum ของ Prisma (string union)
 *
 * ตาม DECISIONS.md ฝั่ง api ใช้ enum ของ Prisma ส่วน shared เป็น TS enum ซึ่ง TypeScript
 * ไม่ยอมให้ assign ข้ามกันตรงๆ — จึงรวบการแปลงไว้ที่ไฟล์นี้ที่เดียว (แบบเดียวกับ common/status-label.ts)
 * ไม่ให้มี cast กระจายอยู่ใน service · ค่าของสอง enum ตรงกันเสมอ (คุมด้วย `enum-parity.spec.ts`)
 */
import { NotificationChannel, NotificationTier } from '@prisma/client';
import {
  channelsForTier,
  isCriticalTier,
  isDailyTier,
  NOTIFICATION_HORIZON_DAYS,
  NOTIFICATION_TIER_LABEL_TH,
  NotificationChannel as SharedChannel,
  NotificationTier as SharedTier,
  selectNotificationTier,
} from '@cert-tracker/shared';

export { NOTIFICATION_HORIZON_DAYS };

const TIER_LABELS: Record<string, string> = { ...NOTIFICATION_TIER_LABEL_TH };

/** enum ทั้งสองฝั่งมีค่าสตริงเดียวกัน การแปลงจึงปลอดภัยและมีเทสต์ parity คุมไว้ */
function toSharedTier(tier: NotificationTier): SharedTier {
  return tier as unknown as SharedTier;
}

function toPrismaChannel(channel: SharedChannel): NotificationChannel {
  return channel as unknown as NotificationChannel;
}

/** ขั้นการแจ้งเตือนของจำนวนวันที่เหลือ — `null` = ยังไม่ต้องแจ้ง (เกิน 90 วัน) */
export function tierForDays(daysUntilExpiry: number): NotificationTier | null {
  const tier = selectNotificationTier(daysUntilExpiry);
  return tier === null ? null : (tier as unknown as NotificationTier);
}

export function tierChannels(tier: NotificationTier): NotificationChannel[] {
  return channelsForTier(toSharedTier(tier)).map(toPrismaChannel);
}

/** ขั้นนี้ต้องแจ้งซ้ำทุกวันหรือแจ้งครั้งเดียว */
export function tierIsDaily(tier: NotificationTier): boolean {
  return isDailyTier(toSharedTier(tier));
}

export function tierIsCritical(tier: NotificationTier): boolean {
  return isCriticalTier(toSharedTier(tier));
}

export function tierLabel(tier: NotificationTier): string {
  return TIER_LABELS[tier] ?? tier;
}
