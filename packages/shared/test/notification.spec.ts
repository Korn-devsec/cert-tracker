import { describe, expect, it } from 'vitest';
import {
  channelsForTier,
  isCriticalTier,
  isDailyTier,
  NOTIFICATION_HORIZON_DAYS,
  NOTIFICATION_TIER_CHANNELS,
  NotificationChannel,
  NotificationTier,
  selectNotificationTier,
} from '../src';

describe('selectNotificationTier — ขั้นบันได 90/60/30/≤7 ตาม CLAUDE.md', () => {
  // ตารางขอบเขตบังคับ: ค่าที่คร่อมเส้นแบ่งทุกเส้น
  it.each([
    [0, NotificationTier.DAY_7],
    [7, NotificationTier.DAY_7],
    [8, NotificationTier.DAY_30],
    [30, NotificationTier.DAY_30],
    [31, NotificationTier.DAY_60],
    [60, NotificationTier.DAY_60],
    [61, NotificationTier.DAY_90],
    [90, NotificationTier.DAY_90],
  ])('เหลือ %i วัน → %s', (days, expected) => {
    expect(selectNotificationTier(days)).toBe(expected);
  });

  it.each([91, 120, 365])('เหลือ %i วัน (เกิน 90) → null ยังไม่ต้องแจ้ง', (days) => {
    expect(selectNotificationTier(days)).toBeNull();
  });

  it.each([-1, -30, -365])('หมดอายุแล้ว (%i) → ขั้นวิกฤต DAY_7 แจ้งต่อทุกวัน', (days) => {
    expect(selectNotificationTier(days)).toBe(NotificationTier.DAY_7);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY])('ค่าที่ใช้งานไม่ได้ (%s) → throw', (value) => {
    expect(() => selectNotificationTier(value)).toThrow(TypeError);
  });

  it('ขอบเขตการสแกนเท่ากับขั้นที่ไกลสุด (90 วัน)', () => {
    expect(NOTIFICATION_HORIZON_DAYS).toBe(90);
    expect(selectNotificationTier(NOTIFICATION_HORIZON_DAYS)).toBe(NotificationTier.DAY_90);
    expect(selectNotificationTier(NOTIFICATION_HORIZON_DAYS + 1)).toBeNull();
  });
});

describe('ช่องทางของแต่ละขั้น', () => {
  it('90 วัน = Email เท่านั้น', () => {
    expect(NOTIFICATION_TIER_CHANNELS[NotificationTier.DAY_90]).toEqual([
      NotificationChannel.EMAIL,
    ]);
  });

  it.each([NotificationTier.DAY_60, NotificationTier.DAY_30, NotificationTier.DAY_7])(
    '%s = Email + LINE',
    (tier) => {
      expect(NOTIFICATION_TIER_CHANNELS[tier]).toEqual([
        NotificationChannel.EMAIL,
        NotificationChannel.LINE,
      ]);
    },
  );

  it('ทุกขั้นต้องมีอย่างน้อย 1 ช่องทาง (ไม่มีขั้นที่แจ้งแล้วไม่ถึงใคร)', () => {
    for (const tier of Object.values(NotificationTier)) {
      expect(channelsForTier(tier).length).toBeGreaterThan(0);
    }
  });

  it('channelsForTier คืนสำเนา — แก้ผลลัพธ์แล้วค่าคงที่ของระบบไม่เปลี่ยน', () => {
    const channels = channelsForTier(NotificationTier.DAY_90);
    channels.push(NotificationChannel.LINE);
    expect(NOTIFICATION_TIER_CHANNELS[NotificationTier.DAY_90]).toEqual([
      NotificationChannel.EMAIL,
    ]);
  });
});

describe('isDailyTier / isCriticalTier', () => {
  it('มีเพียงขั้น ≤7 วันที่แจ้งซ้ำทุกวัน', () => {
    const daily = Object.values(NotificationTier).filter(isDailyTier);
    expect(daily).toEqual([NotificationTier.DAY_7]);
  });

  it('ขั้นด่วน = 30 วัน และ 7 วัน', () => {
    expect(Object.values(NotificationTier).filter(isCriticalTier)).toEqual([
      NotificationTier.DAY_30,
      NotificationTier.DAY_7,
    ]);
  });
});
