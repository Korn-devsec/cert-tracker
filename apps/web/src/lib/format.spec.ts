import { describe, expect, it } from 'vitest';
import { RiskLevel, WorkStatus } from '@cert-tracker/shared';
import {
  buildMonthOptions,
  buildReportSubtitle,
  currentMonthKey,
  formatDaysRemaining,
  RISK_COLOR,
  RISK_ORDER,
  RISK_SHORT_LABEL,
  statusToneClass,
  WORK_STATUS_ORDER,
} from './format';

describe('buildMonthOptions — สร้างรายการเดือนจากวันที่ปัจจุบัน (ไม่ hard-code)', () => {
  const now = new Date('2026-08-03T00:00:00.000Z');

  it('ค่าเริ่มต้น: ย้อนหลัง 3 เดือน ถึงล่วงหน้า 12 เดือน', () => {
    const options = buildMonthOptions(now);

    expect(options).toHaveLength(16);
    expect(options[0].value).toBe('2026-05');
    expect(options[3].value).toBe('2026-08'); // เดือนปัจจุบัน
    expect(options.at(-1)?.value).toBe('2027-08');
  });

  it('ป้ายเป็นชื่อเดือนไทยพร้อม พ.ศ. ตาม Design System', () => {
    const options = buildMonthOptions(now, { back: 0, forward: 1 });

    expect(options[0]).toEqual({ value: '2026-08', label: 'สิงหาคม 2569' });
    expect(options[1]).toEqual({ value: '2026-09', label: 'กันยายน 2569' });
  });

  it('ข้ามปีได้ถูกต้อง (ธันวาคม → มกราคมปีถัดไป)', () => {
    const options = buildMonthOptions(new Date('2026-12-15T00:00:00.000Z'), {
      back: 0,
      forward: 1,
    });

    expect(options.map((option) => option.value)).toEqual(['2026-12', '2027-01']);
    expect(options[1].label).toBe('มกราคม 2570');
  });

  it('คีย์เดือนของวันนี้อยู่ในรายการเสมอ', () => {
    const key = currentMonthKey(now);
    expect(key).toBe('2026-08');
    expect(buildMonthOptions(now).some((option) => option.value === key)).toBe(true);
  });
});

describe('formatDaysRemaining', () => {
  it('ยังไม่หมดอายุ → "N วัน"', () => {
    expect(formatDaysRemaining(17)).toBe('17 วัน');
    expect(formatDaysRemaining(0)).toBe('0 วัน');
  });

  it('หมดอายุแล้ว → บอกว่าเกินมากี่วัน (ไม่แสดงเลขติดลบดิบๆ)', () => {
    expect(formatDaysRemaining(-5)).toBe('เกิน 5 วัน');
  });
});

describe('statusToneClass — สีคอลัมน์สถานะตามไฟล์เดิม', () => {
  it('เรียบร้อยแล้ว = เขียว', () => {
    expect(statusToneClass(WorkStatus.COMPLETED)).toBe('status-done');
  });

  it('ยกเลิก = เทา (ไม่ใช่ทั้งเสร็จและค้าง)', () => {
    expect(statusToneClass(WorkStatus.CANCELLED)).toBe('status-cancelled');
  });

  it.each([WorkStatus.NEW, WorkStatus.ASSIGNED, WorkStatus.IN_PROGRESS, WorkStatus.TESTING])(
    '%s = ส้ม (ยังค้าง)',
    (status) => {
      expect(statusToneClass(status)).toBe('status-pending');
    },
  );

  it('ยังไม่มีงาน = ส้ม เพราะยังไม่มีใครดำเนินการ', () => {
    expect(statusToneClass(null)).toBe('status-pending');
  });
});

describe('buildReportSubtitle', () => {
  it('เลือกเดือนและบริษัท → บอกทั้งคู่', () => {
    expect(buildReportSubtitle({ month: '2026-07', companyName: 'SME Bank' })).toBe(
      'ข้อมูลรายงานสรุปผลเดือน กรกฎาคม 2569 · SME Bank',
    );
  });

  it('ไม่เลือกอะไร → บอกว่าเป็นภาพรวมทุกเดือนทุกบริษัท', () => {
    expect(buildReportSubtitle({ month: '', companyName: null })).toBe(
      'ข้อมูลรายงานสรุปผลทุกเดือน · ทุกบริษัท',
    );
  });
});

describe('ค่าคงที่ของ Design System', () => {
  it('สีความเสี่ยงตรงกับ legacy/report-jul69.html', () => {
    expect(RISK_COLOR).toEqual({
      HIGH: '#ef4444',
      MEDIUM: '#f97316',
      LOW: '#eab308',
      SAFE: '#22c55e',
    });
  });

  it('ลำดับการแสดงผลคือ สูง → กลาง → ต่ำ → ปกติ', () => {
    expect(RISK_ORDER).toEqual([RiskLevel.HIGH, RiskLevel.MEDIUM, RiskLevel.LOW, RiskLevel.SAFE]);
    expect(RISK_ORDER.map((risk) => RISK_SHORT_LABEL[risk])).toEqual([
      'สูง',
      'กลาง',
      'ต่ำ',
      'ปกติ',
    ]);
  });

  it('ตัวเลือกสถานะงานครบทั้ง 8 สถานะและเรียงตาม workflow', () => {
    expect(WORK_STATUS_ORDER).toHaveLength(Object.keys(WorkStatus).length);
    expect(WORK_STATUS_ORDER[0]).toBe(WorkStatus.NEW);
    expect(WORK_STATUS_ORDER.at(-1)).toBe(WorkStatus.CANCELLED);
  });
});
