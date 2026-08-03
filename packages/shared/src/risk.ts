/**
 * การคำนวณความเสี่ยงของ Certificate — ที่เดียวในระบบ (api และ web ใช้ฟังก์ชันชุดนี้ร่วมกัน)
 *
 * กฎเหล็กข้อ 5: Risk คำนวณอัตโนมัติจาก daysUntilExpiry เท่านั้น ห้ามให้ผู้ใช้แก้
 * และห้ามปนกับ WorkStatus (สถานะงานที่คนอัปเดต)
 */
import { RiskLevel } from './enums';

/** เกณฑ์แบ่งระดับความเสี่ยงตาม CLAUDE.md: <30 High / 31–60 Medium / 61–90 Low / >90 Safe */
export const RISK_DAY_THRESHOLDS = {
  /** <= 30 วัน = HIGH (รวมกรณีหมดอายุแล้ว = ค่าติดลบ) */
  HIGH_MAX_DAYS: 30,
  /** 31–60 วัน = MEDIUM */
  MEDIUM_MAX_DAYS: 60,
  /** 61–90 วัน = LOW ส่วนมากกว่านั้น = SAFE */
  LOW_MAX_DAYS: 90,
} as const;

const MS_PER_DAY = 86_400_000;

/**
 * แปลงจำนวนวันคงเหลือเป็นระดับความเสี่ยง
 *
 * cert ที่หมดอายุแล้ว (ค่าติดลบ) ถือเป็น HIGH — ไม่มีระดับ EXPIRED แยก
 * เพราะการ์ดสรุปในดีไซน์มี 4 ระดับ และ Dashboard นับ "Expired" เป็นตัวเลขแยกอยู่แล้ว
 * (ดู DECISIONS.md) ใช้ `isExpired()` เมื่อต้องแยกกรณีหมดอายุ
 *
 * @throws TypeError ถ้าค่าที่ส่งมาไม่ใช่ตัวเลขที่ใช้งานได้ (NaN / Infinity)
 */
export function calculateRisk(daysUntilExpiry: number): RiskLevel {
  if (!Number.isFinite(daysUntilExpiry)) {
    throw new TypeError(`daysUntilExpiry ต้องเป็นตัวเลขที่ใช้งานได้ แต่ได้รับ: ${daysUntilExpiry}`);
  }

  if (daysUntilExpiry <= RISK_DAY_THRESHOLDS.HIGH_MAX_DAYS) {
    return RiskLevel.HIGH;
  }
  if (daysUntilExpiry <= RISK_DAY_THRESHOLDS.MEDIUM_MAX_DAYS) {
    return RiskLevel.MEDIUM;
  }
  if (daysUntilExpiry <= RISK_DAY_THRESHOLDS.LOW_MAX_DAYS) {
    return RiskLevel.LOW;
  }
  return RiskLevel.SAFE;
}

/**
 * นับจำนวนวันคงเหลือ โดยเทียบเป็น "วันปฏิทิน" บนฐาน UTC
 * (ตัดเวลาในวันออก) เพื่อให้ผลลัพธ์นิ่งตลอดวันและตรงกับคอลัมน์ `Days Until` ในไฟล์ Excel
 *
 * ค่าติดลบ = หมดอายุไปแล้วกี่วัน
 */
export function calculateDaysUntilExpiry(expiresAt: Date, now: Date = new Date()): number {
  const expiryDay = Date.UTC(
    expiresAt.getUTCFullYear(),
    expiresAt.getUTCMonth(),
    expiresAt.getUTCDate(),
  );
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((expiryDay - today) / MS_PER_DAY);
}

/** หมดอายุแล้วหรือยัง — วันหมดอายุตรงกับวันนี้ (0) ยังไม่ถือว่าหมดอายุ */
export function isExpired(daysUntilExpiry: number): boolean {
  return daysUntilExpiry < 0;
}

/** คำนวณ risk จากวันหมดอายุโดยตรง (รวม 2 ขั้นตอนไว้ให้เรียกใช้สะดวก) */
export function calculateRiskFromExpiry(expiresAt: Date, now?: Date): RiskLevel {
  return calculateRisk(calculateDaysUntilExpiry(expiresAt, now));
}
