import { WorkStatus } from '@prisma/client';
import { RiskLevel } from '@cert-tracker/shared';

/** ตัวเลขสรุปของเดือนหนึ่ง (ใช้ทั้งเดือนปัจจุบันและเดือนก่อนหน้า) */
export interface MonthlyBucket {
  /** คีย์เดือนแบบ `YYYY-MM` */
  month: string;
  /** ชื่อเดือนไทยพร้อม พ.ศ. เช่น "กรกฎาคม 2569" */
  monthLabel: string;
  total: number;
  byRisk: Record<RiskLevel, number>;
  byStatus: Record<WorkStatus, number>;
  /** cert ที่ยังไม่มีงานต่ออายุ */
  noTask: number;
  completed: number;
  pending: number;
  cancelled: number;
  expired: number;
}

/** ส่วนต่างระหว่างเดือนนี้กับเดือนก่อน (บวก = เพิ่มขึ้น) */
export interface MonthlyDelta {
  total: number;
  byRisk: Record<RiskLevel, number>;
  completed: number;
  pending: number;
}

export interface MonthlyReport {
  asOf: string;
  companyId: string | null;
  companyName: string | null;
  current: MonthlyBucket;
  previous: MonthlyBucket;
  delta: MonthlyDelta;
}
