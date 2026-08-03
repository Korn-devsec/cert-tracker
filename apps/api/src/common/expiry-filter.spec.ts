import { riskExpiryWindow, RiskLevel } from '@cert-tracker/shared';
import { intersectExpiryWindows, monthExpiryWindow, MONTH_PATTERN } from './expiry-filter';

describe('MONTH_PATTERN', () => {
  it.each(['2026-01', '2026-07', '2569-12'])('รับ %s', (month) => {
    expect(MONTH_PATTERN.test(month)).toBe(true);
  });

  it.each(['2026-13', '2026-00', '2026-7', '07-2026', '2026', 'กรกฎาคม'])('ปฏิเสธ %s', (month) => {
    expect(MONTH_PATTERN.test(month)).toBe(false);
  });
});

describe('monthExpiryWindow', () => {
  it('ครอบทั้งเดือนบนฐาน UTC (ขอบขวาเป็นวันที่ 1 ของเดือนถัดไป)', () => {
    const { gte, lt } = monthExpiryWindow('2026-07');
    expect(gte?.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(lt?.toISOString()).toBe('2026-08-01T00:00:00.000Z');
  });

  it('เดือนธันวาคม → ข้ามปีถูก', () => {
    expect(monthExpiryWindow('2026-12').lt?.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('เดือนกุมภาพันธ์ปีอธิกสุรทิน → ครบ 29 วัน', () => {
    const { gte, lt } = monthExpiryWindow('2028-02');
    const days = ((lt?.getTime() ?? 0) - (gte?.getTime() ?? 0)) / 86_400_000;
    expect(days).toBe(29);
  });
});

describe('intersectExpiryWindows', () => {
  it('ไม่มีเงื่อนไข → undefined (ไม่ต้องใส่ where.expiresAt)', () => {
    expect(intersectExpiryWindows([])).toBeUndefined();
    expect(intersectExpiryWindows([{ gte: null, lt: null }])).toBeUndefined();
  });

  it('เอาขอบซ้ายที่มากสุดและขอบขวาที่น้อยสุด', () => {
    const result = intersectExpiryWindows([
      { gte: new Date('2026-01-01T00:00:00.000Z'), lt: new Date('2026-12-31T00:00:00.000Z') },
      { gte: new Date('2026-07-01T00:00:00.000Z'), lt: new Date('2026-08-01T00:00:00.000Z') },
    ]);

    expect(result?.gte?.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(result?.lt?.toISOString()).toBe('2026-08-01T00:00:00.000Z');
  });

  it('เงื่อนไขขัดกันเอง → ได้ช่วงว่าง (query คืน 0 แถว ไม่ใช่ error)', () => {
    const now = new Date('2026-08-03T00:00:00.000Z');
    const result = intersectExpiryWindows([
      monthExpiryWindow('2026-08'),
      riskExpiryWindow(RiskLevel.SAFE, now), // เกิน 90 วัน = พ้นเดือน ส.ค. ไปแล้ว
    ]);

    expect(result?.gte?.getTime()).toBeGreaterThanOrEqual(result?.lt?.getTime() ?? 0);
  });

  it('ช่วงที่ไม่มีขอบซ้าย (risk = HIGH) เก็บแต่ขอบขวา', () => {
    const result = intersectExpiryWindows([
      riskExpiryWindow(RiskLevel.HIGH, new Date('2026-08-03T00:00:00.000Z')),
    ]);

    expect(result?.gte).toBeUndefined();
    expect(result?.lt?.toISOString()).toBe('2026-09-03T00:00:00.000Z');
  });
});
