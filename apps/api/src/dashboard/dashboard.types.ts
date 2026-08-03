import { RiskLevel } from '@cert-tracker/shared';
import { WorkStatus } from '@prisma/client';

/**
 * แยก "เสร็จ / ค้าง" ต่อระดับความเสี่ยง — ตรงกับ Grouped Bar ในดีไซน์เดิม
 * (Done เขียว / Pending ส้ม) ส่วนงานที่ถูกยกเลิกไม่นับเป็นทั้งสองฝั่ง แต่รายงานแยกไว้ให้ครบ
 */
export interface RiskStatusBreakdown {
  done: number;
  pending: number;
  cancelled: number;
}

export interface DashboardSummary {
  /** เวลาที่ใช้เป็นฐานคำนวณความเสี่ยงของตัวเลขทั้งชุด */
  asOf: string;
  companyId: string | null;
  month: string | null;
  total: number;
  byRisk: Record<RiskLevel, number>;
  /** นับตาม "task ล่าสุด" ของ cert แต่ละใบ (cert 1 ใบนับครั้งเดียว) */
  byStatus: Record<WorkStatus, number>;
  byRiskStatus: Record<RiskLevel, RiskStatusBreakdown>;
  /** cert ที่ยังไม่มีงานต่ออายุเลย (รวมอยู่ใน pending) */
  noTask: number;
  /** เหลือ 0–30 วันและยังไม่หมดอายุ */
  expiringSoon: number;
  expired: number;
  completed: number;
  pending: number;
  cancelled: number;
}

export function emptyRiskCounts(): Record<RiskLevel, number> {
  return {
    [RiskLevel.HIGH]: 0,
    [RiskLevel.MEDIUM]: 0,
    [RiskLevel.LOW]: 0,
    [RiskLevel.SAFE]: 0,
  };
}

export function emptyStatusCounts(): Record<WorkStatus, number> {
  return {
    [WorkStatus.NEW]: 0,
    [WorkStatus.ASSIGNED]: 0,
    [WorkStatus.IN_PROGRESS]: 0,
    [WorkStatus.WAITING_VENDOR]: 0,
    [WorkStatus.WAITING_CA]: 0,
    [WorkStatus.TESTING]: 0,
    [WorkStatus.COMPLETED]: 0,
    [WorkStatus.CANCELLED]: 0,
  };
}

export function emptyRiskStatusCounts(): Record<RiskLevel, RiskStatusBreakdown> {
  return {
    [RiskLevel.HIGH]: { done: 0, pending: 0, cancelled: 0 },
    [RiskLevel.MEDIUM]: { done: 0, pending: 0, cancelled: 0 },
    [RiskLevel.LOW]: { done: 0, pending: 0, cancelled: 0 },
    [RiskLevel.SAFE]: { done: 0, pending: 0, cancelled: 0 },
  };
}
