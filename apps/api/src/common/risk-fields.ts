/**
 * ค่าที่ "คำนวณ ณ เวลา query" ของ certificate — ไม่มีคอลัมน์เหล่านี้ใน DB (กฎเหล็กข้อ 5)
 * ทุก endpoint ที่คืน certificate ต้องเติมค่าผ่านที่นี่ เพื่อให้ทั้งระบบใช้เกณฑ์ชุดเดียวกัน
 */
import {
  calculateDaysUntilExpiry,
  calculateRisk,
  isExpired,
  RiskLevel,
} from '@cert-tracker/shared';

export interface RiskFields {
  daysUntilExpiry: number;
  riskLevel: RiskLevel;
  isExpired: boolean;
}

export function riskFields(expiresAt: Date, now: Date): RiskFields {
  const daysUntilExpiry = calculateDaysUntilExpiry(expiresAt, now);
  return {
    daysUntilExpiry,
    riskLevel: calculateRisk(daysUntilExpiry),
    isExpired: isExpired(daysUntilExpiry),
  };
}

export function withRiskFields<T extends { expiresAt: Date }>(
  certificate: T,
  now: Date,
): T & RiskFields {
  return { ...certificate, ...riskFields(certificate.expiresAt, now) };
}
