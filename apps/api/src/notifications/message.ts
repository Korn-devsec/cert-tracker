/**
 * ประกอบข้อความแจ้งเตือน — ฟังก์ชันล้วน เทสต์ได้โดยไม่ต้องมี SMTP/LINE/DB
 *
 * ภาษาไทยเป็นหลักและใช้ปี พ.ศ. ตาม Design System ใน CLAUDE.md
 */
import { NotificationTier, WorkStatus } from '@prisma/client';
import { formatThaiDate, RISK_LEVEL_LABEL_TH, RiskLevel } from '@cert-tracker/shared';
import { workStatusLabel } from '../common/status-label';
import type { NotificationMessage } from './channels/notification-channel';
import { tierIsCritical, tierLabel } from './tier-policy';

export interface NotificationMessageInput {
  commonName: string;
  endpoint: string;
  owner: string | null;
  issuer: string | null;
  companyName: string;
  companyCode: string;
  expiresAt: Date;
  daysUntilExpiry: number;
  riskLevel: RiskLevel;
  tier: NotificationTier;
  /** สถานะงานต่ออายุปัจจุบัน — `null` = ยังไม่มีงาน */
  workStatus: WorkStatus | null;
}

const RISK_LABELS: Record<string, string> = { ...RISK_LEVEL_LABEL_TH };

export function buildNotificationMessage(input: NotificationMessageInput): NotificationMessage {
  const expired = input.daysUntilExpiry < 0;
  const remaining = expired
    ? `หมดอายุแล้ว ${Math.abs(input.daysUntilExpiry)} วัน`
    : `เหลือ ${input.daysUntilExpiry} วัน`;

  const subject = expired
    ? `[SSL หมดอายุแล้ว] ${input.commonName} (${input.companyCode})`
    : `[แจ้งเตือน SSL] ${input.commonName} ${remaining} (${input.companyCode})`;

  const headline = expired
    ? 'ใบรับรอง SSL หมดอายุแล้ว และยังไม่มีการต่ออายุ'
    : `ใบรับรอง SSL ใกล้หมดอายุ (${tierLabel(input.tier)})`;

  const lines = [
    headline,
    '',
    `บริษัท: ${input.companyName} (${input.companyCode})`,
    `Common Name: ${input.commonName}`,
    `Endpoint: ${input.endpoint.length > 0 ? input.endpoint : '-'}`,
    `ผู้ดูแล: ${input.owner ?? '-'}`,
    `ผู้ออกใบรับรอง: ${input.issuer ?? '-'}`,
    `วันหมดอายุ: ${formatThaiDate(input.expiresAt)} (${remaining})`,
    `ระดับความเสี่ยง: ${RISK_LABELS[input.riskLevel] ?? input.riskLevel}`,
    `สถานะงานต่ออายุ: ${
      input.workStatus === null ? 'ยังไม่มีงานต่ออายุ' : workStatusLabel(input.workStatus)
    }`,
    '',
    expired
      ? 'โปรดต่ออายุและติดตั้งใบรับรองใหม่โดยเร็วที่สุด'
      : 'โปรดดำเนินการต่ออายุใบรับรองก่อนวันหมดอายุ',
  ];

  return {
    subject,
    text: lines.join('\n'),
    tier: input.tier,
    isCritical: tierIsCritical(input.tier) || expired,
  };
}
