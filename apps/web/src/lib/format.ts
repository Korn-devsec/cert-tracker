/**
 * ตัวช่วยแปลงค่าให้แสดงบนหน้าจอ — ฟังก์ชันล้วน ทดสอบได้โดยไม่ต้อง render
 *
 * ป้ายภาษาไทยและวันที่ พ.ศ. ใช้จาก `@cert-tracker/shared` ที่เดียวร่วมกับฝั่ง api
 * (ห้ามพิมพ์ป้ายไทยซ้ำที่นี่ ไม่งั้นข้อความบนจอกับในอีเมลจะไม่ตรงกัน)
 */
import {
  formatThaiMonthFromKey,
  RISK_LEVEL_LABEL_TH,
  RiskLevel,
  WORK_STATUS_LABEL_TH,
  WorkStatus,
} from '@cert-tracker/shared';

/** สีของแต่ละระดับความเสี่ยง — ตรงกับ CSS variables และสีใน legacy/report-jul69.html */
export const RISK_COLOR: Record<RiskLevel, string> = {
  [RiskLevel.HIGH]: '#ef4444',
  [RiskLevel.MEDIUM]: '#f97316',
  [RiskLevel.LOW]: '#eab308',
  [RiskLevel.SAFE]: '#22c55e',
};

/** ลำดับการแสดงผลทุกที่: สูง → กลาง → ต่ำ → ปกติ (เหมือนการ์ดและกราฟของไฟล์เดิม) */
export const RISK_ORDER: RiskLevel[] = [
  RiskLevel.HIGH,
  RiskLevel.MEDIUM,
  RiskLevel.LOW,
  RiskLevel.SAFE,
];

/** ป้ายสั้นที่ใช้ในกราฟและ badge (ไฟล์เดิมใช้ สูง/กลาง/ต่ำ/ปกติ) */
export const RISK_SHORT_LABEL: Record<RiskLevel, string> = {
  [RiskLevel.HIGH]: 'สูง',
  [RiskLevel.MEDIUM]: 'กลาง',
  [RiskLevel.LOW]: 'ต่ำ',
  [RiskLevel.SAFE]: 'ปกติ',
};

export function riskLabel(risk: RiskLevel): string {
  return RISK_LEVEL_LABEL_TH[risk];
}

export function workStatusLabel(status: WorkStatus): string {
  return WORK_STATUS_LABEL_TH[status];
}

/** ตัวเลือกสถานะงานสำหรับ dropdown — เรียงตามลำดับ workflow */
export const WORK_STATUS_ORDER: WorkStatus[] = [
  WorkStatus.NEW,
  WorkStatus.ASSIGNED,
  WorkStatus.IN_PROGRESS,
  WorkStatus.WAITING_VENDOR,
  WorkStatus.WAITING_CA,
  WorkStatus.TESTING,
  WorkStatus.COMPLETED,
  WorkStatus.CANCELLED,
];

/** จำนวนวันคงเหลือแบบอ่านง่าย — ค่าติดลบหมายถึงหมดอายุไปแล้ว */
export function formatDaysRemaining(daysUntilExpiry: number): string {
  if (daysUntilExpiry < 0) {
    return `เกิน ${Math.abs(daysUntilExpiry)} วัน`;
  }
  return `${daysUntilExpiry} วัน`;
}

/** class ของคอลัมน์สถานะในตาราง: เสร็จแล้ว = เขียว, ยกเลิก = เทา, อื่นๆ = ส้ม (ตามไฟล์เดิม) */
export function statusToneClass(status: WorkStatus | null): string {
  if (status === WorkStatus.COMPLETED) {
    return 'status-done';
  }
  if (status === WorkStatus.CANCELLED) {
    return 'status-cancelled';
  }
  return 'status-pending';
}

export interface MonthOption {
  /** คีย์ที่ส่งให้ api: `YYYY-MM` (ค.ศ.) */
  value: string;
  /** ป้ายที่ผู้ใช้เห็น: ชื่อเดือนไทย + พ.ศ. */
  label: string;
}

/**
 * ตัวเลือกเดือนของตัวกรอง — คำนวณจากวันที่ปัจจุบัน ไม่ได้ hard-code รายการเดือน
 * (ค่าเริ่มต้น: ย้อนหลัง 3 เดือน ถึงล่วงหน้า 12 เดือน ครอบช่วงที่ cert ส่วนใหญ่หมดอายุ)
 */
export function buildMonthOptions(
  now: Date,
  options: { back?: number; forward?: number } = {},
): MonthOption[] {
  const back = options.back ?? 3;
  const forward = options.forward ?? 12;
  const result: MonthOption[] = [];

  for (let offset = -back; offset <= forward; offset++) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
    const value = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    result.push({ value, label: formatThaiMonthFromKey(value) ?? value });
  }
  return result;
}

/** คีย์เดือนของวันนี้ (`YYYY-MM`) */
export function currentMonthKey(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** คำบรรยายใต้หัวข้อรายงาน เช่น "ข้อมูลรายงานสรุปผลเดือน กรกฎาคม 2569 · SME Bank" */
export function buildReportSubtitle(input: { month: string; companyName: string | null }): string {
  const monthPart =
    input.month === ''
      ? 'ข้อมูลรายงานสรุปผลทุกเดือน'
      : `ข้อมูลรายงานสรุปผลเดือน ${formatThaiMonthFromKey(input.month) ?? input.month}`;
  return input.companyName === null
    ? `${monthPart} · ทุกบริษัท`
    : `${monthPart} · ${input.companyName}`;
}
