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

/** เที่ยงคืนของวันนั้นบนฐาน UTC — จุดอ้างอิงเดียวกับ calculateDaysUntilExpiry */
export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * MS_PER_DAY);
}

/**
 * ช่วงของ `expiresAt` แบบครึ่งเปิด `[gte, lt)` — `null` = ไม่จำกัดด้านนั้น
 * ใช้แปลงเงื่อนไข "จำนวนวันคงเหลือ" ให้เป็นเงื่อนไขวันที่ที่ query ใน DB ได้ตรงๆ
 */
export interface ExpiryWindow {
  gte: Date | null;
  lt: Date | null;
}

/**
 * แปลงช่วง "จำนวนวันคงเหลือ" เป็นช่วงวันหมดอายุ
 *
 * เพราะ `daysUntilExpiry` เป็นฟังก์ชันที่ลดลงตาม `expiresAt` แบบต่อเนื่อง
 * เงื่อนไขจำนวนวันจึงเทียบเท่าเงื่อนไขวันที่ได้เสมอ — ทำให้กรองและแบ่งหน้า (pagination)
 * ในฐานข้อมูลได้ถูกต้อง ไม่ต้องดึงทุกแถวมากรองในหน่วยความจำ
 *
 * @param minDays จำนวนวันคงเหลือน้อยสุดที่ต้องการ (null = ไม่จำกัด เช่นรวม cert ที่หมดอายุแล้ว)
 * @param maxDays จำนวนวันคงเหลือมากสุดที่ต้องการ (null = ไม่จำกัด)
 */
export function expiryWindowForDayRange(
  minDays: number | null,
  maxDays: number | null,
  now: Date = new Date(),
): ExpiryWindow {
  const base = startOfUtcDay(now);
  return {
    gte: minDays === null ? null : addUtcDays(base, minDays),
    // +1 วันเพราะขอบขวาเป็นแบบเปิด: "เหลือไม่เกิน 30 วัน" = ก่อนเที่ยงคืนของวันที่ 31
    lt: maxDays === null ? null : addUtcDays(base, maxDays + 1),
  };
}

/** ช่วงวันหมดอายุของแต่ละระดับความเสี่ยง — คู่ตรงข้ามของ calculateRisk() */
export function riskExpiryWindow(risk: RiskLevel, now: Date = new Date()): ExpiryWindow {
  const { HIGH_MAX_DAYS, MEDIUM_MAX_DAYS, LOW_MAX_DAYS } = RISK_DAY_THRESHOLDS;
  switch (risk) {
    // HIGH รวม cert ที่หมดอายุแล้ว (วันคงเหลือติดลบ) จึงไม่มีขอบซ้าย
    case RiskLevel.HIGH:
      return expiryWindowForDayRange(null, HIGH_MAX_DAYS, now);
    case RiskLevel.MEDIUM:
      return expiryWindowForDayRange(HIGH_MAX_DAYS + 1, MEDIUM_MAX_DAYS, now);
    case RiskLevel.LOW:
      return expiryWindowForDayRange(MEDIUM_MAX_DAYS + 1, LOW_MAX_DAYS, now);
    case RiskLevel.SAFE:
      return expiryWindowForDayRange(LOW_MAX_DAYS + 1, null, now);
  }
}

/** ช่วงของ cert ที่หมดอายุแล้ว (วันคงเหลือ < 0) */
export function expiredExpiryWindow(now: Date = new Date()): ExpiryWindow {
  return { gte: null, lt: startOfUtcDay(now) };
}

/** ช่วงของ cert ที่ใกล้หมดอายุแต่ยังไม่หมด (0–30 วัน) — ตัวเลข "Expiring Soon" บน Dashboard */
export function expiringSoonExpiryWindow(now: Date = new Date()): ExpiryWindow {
  return expiryWindowForDayRange(0, RISK_DAY_THRESHOLDS.HIGH_MAX_DAYS, now);
}
