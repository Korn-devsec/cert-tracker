import { NotificationChannel, NotificationTier } from '@prisma/client';
import type { SendMode } from './channels/notification-channel';

/** เหตุผลที่ข้ามการส่ง — รายงานกลับไปให้เห็นว่าทำไมเงียบ ไม่ใช่หายไปเฉยๆ */
export type SkipReason =
  'งานต่ออายุเสร็จแล้ว' | 'แจ้งขั้นนี้ไปแล้ว' | 'แจ้งไปแล้ววันนี้' | 'ไม่มีปลายทางของช่องทางนี้';

export interface ChannelOutcome {
  channel: NotificationChannel;
  status: 'sent' | 'skipped' | 'failed';
  /** `console` = โหมดซ้อม ยังไม่ได้ส่งออกจริง */
  mode?: SendMode;
  recipient?: string;
  reason?: string;
}

export interface CertificateNotification {
  certificateId: string;
  commonName: string;
  endpoint: string;
  companyCode: string;
  daysUntilExpiry: number;
  tier: NotificationTier;
  channels: ChannelOutcome[];
}

export interface NotificationRunResult {
  startedAt: string;
  finishedAt: string;
  trigger: 'cron' | 'manual';
  /** `true` = ดูผลล่วงหน้าอย่างเดียว ไม่ส่งและไม่บันทึก NotificationLog */
  preview: boolean;
  /** `true` = ช่องทางทั้งหมดทำงานในโหมดซ้อม (NOTIFICATION_DRY_RUN) */
  simulate: boolean;
  companyId: string | null;
  /** จำนวน cert ที่อยู่ในขอบเขตการแจ้งเตือน (เหลือไม่เกิน 90 วัน) */
  scanned: number;
  /** cert ที่มีการส่ง (หรือพยายามส่ง) อย่างน้อย 1 ช่องทาง */
  notified: number;
  sent: number;
  failed: number;
  skippedCompleted: number;
  skippedAlreadySent: number;
  skippedNoRecipient: number;
  byTier: Record<NotificationTier, number>;
  byChannel: Record<NotificationChannel, number>;
  certificates: CertificateNotification[];
}

export function emptyTierCounts(): Record<NotificationTier, number> {
  return {
    [NotificationTier.DAY_90]: 0,
    [NotificationTier.DAY_60]: 0,
    [NotificationTier.DAY_30]: 0,
    [NotificationTier.DAY_7]: 0,
  };
}

export function emptyChannelCounts(): Record<NotificationChannel, number> {
  return {
    [NotificationChannel.EMAIL]: 0,
    [NotificationChannel.LINE]: 0,
  };
}
