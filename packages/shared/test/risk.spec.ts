import { describe, expect, it } from 'vitest';
import {
  RiskLevel,
  calculateDaysUntilExpiry,
  calculateRisk,
  calculateRiskFromExpiry,
  isExpired,
} from '../src';

describe('calculateRisk — ขอบเขตตาม CLAUDE.md (<30 High / 31–60 Medium / 61–90 Low / >90 Safe)', () => {
  // ตารางนี้คือ case บังคับจาก PLAN.md Phase 1
  it.each([
    [29, RiskLevel.HIGH],
    [30, RiskLevel.HIGH],
    [31, RiskLevel.MEDIUM],
    [60, RiskLevel.MEDIUM],
    [61, RiskLevel.LOW],
    [90, RiskLevel.LOW],
    [91, RiskLevel.SAFE],
  ])('%i วัน → %s', (days, expected) => {
    expect(calculateRisk(days)).toBe(expected);
  });

  it('0 วัน (หมดอายุวันนี้) → HIGH', () => {
    expect(calculateRisk(0)).toBe(RiskLevel.HIGH);
  });

  it.each([-1, -30, -365])('ค่าติดลบ (%i = หมดอายุแล้ว) → HIGH', (days) => {
    expect(calculateRisk(days)).toBe(RiskLevel.HIGH);
  });

  it('ค่ามากๆ → SAFE', () => {
    expect(calculateRisk(3650)).toBe(RiskLevel.SAFE);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'ค่าที่ใช้งานไม่ได้ (%s) → throw TypeError',
    (value) => {
      expect(() => calculateRisk(value)).toThrow(TypeError);
    },
  );
});

describe('isExpired', () => {
  it('ติดลบ = หมดอายุแล้ว', () => {
    expect(isExpired(-1)).toBe(true);
  });

  it('0 = หมดอายุวันนี้ ยังไม่ถือว่าหมดอายุ', () => {
    expect(isExpired(0)).toBe(false);
  });

  it('ค่าบวก = ยังไม่หมดอายุ', () => {
    expect(isExpired(1)).toBe(false);
  });
});

describe('calculateDaysUntilExpiry — เทียบเป็นวันปฏิทิน (UTC)', () => {
  const now = new Date('2026-08-03T10:30:00.000Z');

  it('วันหมดอายุ = วันนี้ → 0 (ไม่สนใจเวลาในวัน)', () => {
    expect(calculateDaysUntilExpiry(new Date('2026-08-03T00:00:01.000Z'), now)).toBe(0);
    expect(calculateDaysUntilExpiry(new Date('2026-08-03T23:59:59.000Z'), now)).toBe(0);
  });

  it('พรุ่งนี้ → 1, เมื่อวาน → -1', () => {
    expect(calculateDaysUntilExpiry(new Date('2026-08-04T00:00:00.000Z'), now)).toBe(1);
    expect(calculateDaysUntilExpiry(new Date('2026-08-02T23:00:00.000Z'), now)).toBe(-1);
  });

  it('เวลาต้นทาง/ปลายทางต่างกันแต่เป็นวันเดียวกัน ได้ผลเท่ากัน (เลขไม่แกว่งระหว่างวัน)', () => {
    const early = new Date('2026-08-03T00:00:00.000Z');
    const late = new Date('2026-08-03T23:59:59.000Z');
    const expiresAt = new Date('2026-09-18T12:25:54.000Z'); // รูปแบบเดียวกับไฟล์ Excel จริง
    expect(calculateDaysUntilExpiry(expiresAt, early)).toBe(
      calculateDaysUntilExpiry(expiresAt, late),
    );
  });

  it('ข้ามเดือน/ปี คำนวณถูก', () => {
    expect(calculateDaysUntilExpiry(new Date('2026-09-02T00:00:00.000Z'), now)).toBe(30);
    expect(calculateDaysUntilExpiry(new Date('2027-08-03T00:00:00.000Z'), now)).toBe(365);
  });

  it('ปีอธิกสุรทิน (2028) นับ 29 ก.พ. ด้วย', () => {
    const feb28 = new Date('2028-02-28T00:00:00.000Z');
    expect(calculateDaysUntilExpiry(new Date('2028-03-01T00:00:00.000Z'), feb28)).toBe(2);
  });
});

describe('calculateRiskFromExpiry', () => {
  const now = new Date('2026-08-03T00:00:00.000Z');

  it('เหลือ 20 วัน → HIGH (ใช้พิสูจน์ว่า Risk แยกจาก WorkStatus ใน Phase 4)', () => {
    expect(calculateRiskFromExpiry(new Date('2026-08-23T00:00:00.000Z'), now)).toBe(RiskLevel.HIGH);
  });

  it('เหลือ 100 วัน → SAFE', () => {
    expect(calculateRiskFromExpiry(new Date('2026-11-11T00:00:00.000Z'), now)).toBe(RiskLevel.SAFE);
  });
});
