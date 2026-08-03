import { describe, expect, it } from 'vitest';
import {
  formatThaiDate,
  formatThaiDateShort,
  formatThaiMonthFromKey,
  formatThaiMonthYear,
  toBuddhistYear,
} from '../src';

describe('toBuddhistYear', () => {
  it('ค.ศ. + 543', () => {
    expect(toBuddhistYear(2026)).toBe(2569);
  });
});

describe('formatThaiDate', () => {
  it('วันหมดอายุจากไฟล์จริง → 18 กันยายน 2569', () => {
    expect(formatThaiDate(new Date('2026-09-18T12:25:54.000Z'))).toBe('18 กันยายน 2569');
  });

  it('แบบย่อสำหรับตาราง', () => {
    expect(formatThaiDateShort(new Date('2026-09-18T12:25:54.000Z'))).toBe('18 ก.ย. 2569');
  });

  it('อ่านจากส่วน UTC — ปลายวันไม่เลื่อนไปวันถัดไป', () => {
    expect(formatThaiDate(new Date('2026-12-31T23:59:59.000Z'))).toBe('31 ธันวาคม 2569');
  });

  it('ต้นเดือนมกราคม → ปี พ.ศ. ถูก', () => {
    expect(formatThaiDate(new Date('2027-01-01T00:00:00.000Z'))).toBe('1 มกราคม 2570');
  });
});

describe('formatThaiMonthYear', () => {
  it('หัวข้อรายงานรายเดือน (ตรงกับตัวอย่างใน CLAUDE.md)', () => {
    expect(formatThaiMonthYear(new Date('2026-07-15T00:00:00.000Z'))).toBe('กรกฎาคม 2569');
  });
});

describe('formatThaiMonthFromKey', () => {
  it('แปลงคีย์เดือนที่ API ใช้ (YYYY-MM) เป็นชื่อไทย', () => {
    expect(formatThaiMonthFromKey('2026-07')).toBe('กรกฎาคม 2569');
    expect(formatThaiMonthFromKey('2026-12')).toBe('ธันวาคม 2569');
  });

  it.each(['2026-13', '2026-00', '2026-7', 'กรกฎาคม', ''])(
    'รูปแบบไม่ถูกต้อง (%s) → null',
    (key) => {
      expect(formatThaiMonthFromKey(key)).toBeNull();
    },
  );
});
