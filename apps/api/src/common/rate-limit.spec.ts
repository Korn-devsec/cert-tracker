import { FixedWindowRateLimiter } from './rate-limit';

describe('FixedWindowRateLimiter', () => {
  const WINDOW = 60_000;

  it('ยอมให้ถึงจำนวนที่กำหนด แล้วบล็อกครั้งถัดไป', () => {
    const limiter = new FixedWindowRateLimiter(3, WINDOW);
    const now = 1_000_000;

    expect(limiter.hit('a', now).allowed).toBe(true);
    expect(limiter.hit('a', now + 10).allowed).toBe(true);
    expect(limiter.hit('a', now + 20).allowed).toBe(true);

    const blocked = limiter.hit('a', now + 30);
    expect(blocked.allowed).toBe(false);
    expect(blocked.hits).toBe(4);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it('คีย์ต่างกันนับแยกกัน (การเดารหัสบัญชีหนึ่งไม่กันผู้ใช้คนอื่น)', () => {
    const limiter = new FixedWindowRateLimiter(1, WINDOW);
    const now = 1_000_000;

    expect(limiter.hit('ip|a@example.com', now).allowed).toBe(true);
    expect(limiter.hit('ip|a@example.com', now + 1).allowed).toBe(false);
    // บัญชีอื่นจาก IP เดียวกันยังเข้าได้
    expect(limiter.hit('ip|b@example.com', now + 2).allowed).toBe(true);
  });

  it('พ้นหน้าต่างเวลาแล้วเริ่มนับใหม่', () => {
    const limiter = new FixedWindowRateLimiter(1, WINDOW);
    const now = 1_000_000;

    expect(limiter.hit('a', now).allowed).toBe(true);
    expect(limiter.hit('a', now + WINDOW - 1).allowed).toBe(false);
    expect(limiter.hit('a', now + WINDOW).allowed).toBe(true);
  });

  it('reset ล้างตัวนับ (ใช้เมื่อ login สำเร็จ)', () => {
    const limiter = new FixedWindowRateLimiter(2, WINDOW);
    const now = 1_000_000;

    limiter.hit('a', now);
    limiter.hit('a', now);
    expect(limiter.hit('a', now).allowed).toBe(false);

    limiter.reset('a');
    expect(limiter.hit('a', now).allowed).toBe(true);
  });

  it('เก็บกวาดคีย์ที่หมดอายุ ไม่ปล่อยให้หน่วยความจำโตเรื่อยๆ', () => {
    const limiter = new FixedWindowRateLimiter(5, WINDOW);
    const now = 1_000_000;

    for (let index = 0; index < 50; index++) {
      limiter.hit(`key-${index}`, now);
    }
    expect(limiter.size()).toBe(50);

    // คำขอถัดไปหลังหน้าต่างหมดอายุจะกวาดของเก่าทิ้ง
    limiter.hit('key-new', now + WINDOW + 1);
    expect(limiter.size()).toBe(1);
  });

  it('retryAfterSeconds ปัดขึ้นเป็นอย่างน้อย 1 วินาที (ไม่บอกให้ลองใหม่ทันที)', () => {
    const limiter = new FixedWindowRateLimiter(1, 500);
    const now = 1_000_000;

    limiter.hit('a', now);
    expect(limiter.hit('a', now + 400).retryAfterSeconds).toBe(1);
  });
});
