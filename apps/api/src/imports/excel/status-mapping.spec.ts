import { WorkStatus } from '@prisma/client';
import { acceptedStatusValues, mapExcelStatus, normalizeStatusValue } from './status-mapping';

describe('mapExcelStatus', () => {
  it('ค่าจริงจากไฟล์: "อยู่ระหว่างดำเนินการ" → NEW (เริ่มต้น workflow)', () => {
    expect(mapExcelStatus('อยู่ระหว่างดำเนินการ')).toBe(WorkStatus.NEW);
  });

  it('ค่าจริงจากไฟล์: "ดำเนินการแล้ว " (มีช่องว่างท้าย) → COMPLETED', () => {
    // ไฟล์จริง sheet Jun เก็บค่านี้ยาว 14 ตัว trim แล้วเหลือ 13
    const raw = 'ดำเนินการแล้ว ';
    expect(raw.length).toBe(14);
    expect(raw.trim().length).toBe(13);
    expect(mapExcelStatus(raw)).toBe(WorkStatus.COMPLETED);
  });

  it.each([
    ['เรียบร้อยแล้ว', WorkStatus.COMPLETED],
    ['  ดำเนินการแล้ว  ', WorkStatus.COMPLETED],
    ['Done', WorkStatus.COMPLETED],
    ['COMPLETED', WorkStatus.COMPLETED],
    ['pending', WorkStatus.NEW],
    ['Pending', WorkStatus.NEW],
    ['In Progress', WorkStatus.NEW],
    ['ยกเลิก', WorkStatus.CANCELLED],
    ['Cancelled', WorkStatus.CANCELLED],
  ])('%j → %s', (input, expected) => {
    expect(mapExcelStatus(input)).toBe(expected);
  });

  it('ช่องว่างซ้ำและ non-breaking space ถูกยุบก่อนเทียบ', () => {
    expect(mapExcelStatus('ดำเนินการแล้ว')).toBe(WorkStatus.COMPLETED);
    expect(mapExcelStatus('in    progress')).toBe(WorkStatus.NEW);
  });

  it.each([null, undefined, '', '   ', 'สถานะแปลกที่ไม่รู้จัก', 'blah'])(
    'ค่าที่ map ไม่ได้ (%j) → null ให้ผู้เรียกรายงานเป็น warning',
    (input) => {
      expect(mapExcelStatus(input)).toBeNull();
    },
  );

  it('acceptedStatusValues ใช้ประกอบข้อความ warning ได้', () => {
    expect(acceptedStatusValues()).toContain('อยู่ระหว่างดำเนินการ');
    expect(acceptedStatusValues()).toContain('ดำเนินการแล้ว');
  });
});

describe('normalizeStatusValue', () => {
  it('trim + lowercase + ยุบช่องว่าง', () => {
    expect(normalizeStatusValue('  DONE  ')).toBe('done');
    expect(normalizeStatusValue('In   Progress')).toBe('in progress');
  });
});
