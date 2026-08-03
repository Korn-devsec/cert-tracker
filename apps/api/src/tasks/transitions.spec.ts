import { HistoryAction, WorkStatus } from '@prisma/client';
import {
  ALLOWED_TRANSITIONS,
  canTransition,
  checkTransition,
  historyActionForStatus,
  isTerminal,
  OPEN_TASK_STATUSES,
  transitionTableSize,
} from './transitions';

const ALL_STATUSES = Object.values(WorkStatus);

/** เส้นทางหลักตาม CLAUDE.md: New → Assigned → In Progress → Waiting Vendor ⇄ Waiting CA → Testing → Completed */
const HAPPY_PATH: WorkStatus[] = [
  WorkStatus.NEW,
  WorkStatus.ASSIGNED,
  WorkStatus.IN_PROGRESS,
  WorkStatus.WAITING_VENDOR,
  WorkStatus.WAITING_CA,
  WorkStatus.TESTING,
  WorkStatus.COMPLETED,
];

describe('transitions — เส้นทางที่อนุญาต', () => {
  it('เดินเส้นทางหลักได้ครบทุกช่วง', () => {
    for (let index = 0; index < HAPPY_PATH.length - 1; index++) {
      const from = HAPPY_PATH[index];
      const to = HAPPY_PATH[index + 1];
      expect(canTransition(from, to)).toBe(true);
      expect(checkTransition(from, to)).toEqual({ ok: true });
    }
  });

  it('Waiting Vendor ⇄ Waiting CA ไปกลับได้ (⇄ ในสเปก)', () => {
    expect(canTransition(WorkStatus.WAITING_VENDOR, WorkStatus.WAITING_CA)).toBe(true);
    expect(canTransition(WorkStatus.WAITING_CA, WorkStatus.WAITING_VENDOR)).toBe(true);
  });

  it('ทดสอบไม่ผ่าน → กลับไป In Progress ได้ (ไม่ต้องยกเลิกงาน)', () => {
    expect(canTransition(WorkStatus.TESTING, WorkStatus.IN_PROGRESS)).toBe(true);
  });

  it('cert ที่ออกเอง (ไม่มี vendor/CA) ข้ามไป Testing ได้', () => {
    expect(canTransition(WorkStatus.IN_PROGRESS, WorkStatus.TESTING)).toBe(true);
    expect(canTransition(WorkStatus.WAITING_VENDOR, WorkStatus.TESTING)).toBe(true);
    expect(canTransition(WorkStatus.WAITING_CA, WorkStatus.TESTING)).toBe(true);
  });

  it('ยกเลิกได้ทุกขั้นที่ยังไม่ปิด', () => {
    for (const status of OPEN_TASK_STATUSES) {
      expect(canTransition(status, WorkStatus.CANCELLED)).toBe(true);
    }
  });

  it('จำนวนคู่ที่อนุญาตทั้งหมด = 17 (ล็อกตารางไว้ ถ้าแก้กฎต้องแก้เทสต์ด้วย)', () => {
    const total = ALL_STATUSES.reduce((sum, status) => sum + ALLOWED_TRANSITIONS[status].length, 0);
    expect(total).toBe(17);
  });

  it('ตารางที่แปลงจาก packages/shared ครบทุกสถานะและตรงกับต้นฉบับ', () => {
    // ตารางจริงอยู่ใน shared เพื่อให้ web ใช้ชุดเดียวกัน — ตรงนี้คุมว่าการแปลง enum ไม่ตกหล่น
    expect(Object.keys(ALLOWED_TRANSITIONS).sort()).toEqual([...ALL_STATUSES].sort());
    expect(transitionTableSize()).toBe(17);
  });
});

describe('transitions — ที่ต้องถูกปฏิเสธ', () => {
  // เคสบังคับจาก PLAN.md: New → Completed ข้ามขั้นต้องไม่ผ่าน
  it.each([
    [WorkStatus.NEW, WorkStatus.COMPLETED],
    [WorkStatus.NEW, WorkStatus.IN_PROGRESS],
    [WorkStatus.NEW, WorkStatus.TESTING],
    [WorkStatus.NEW, WorkStatus.WAITING_VENDOR],
    [WorkStatus.ASSIGNED, WorkStatus.COMPLETED],
    [WorkStatus.ASSIGNED, WorkStatus.TESTING],
    [WorkStatus.IN_PROGRESS, WorkStatus.COMPLETED],
    [WorkStatus.WAITING_VENDOR, WorkStatus.COMPLETED],
    [WorkStatus.WAITING_CA, WorkStatus.COMPLETED],
    [WorkStatus.TESTING, WorkStatus.ASSIGNED],
  ])('%s → %s ต้องไม่ผ่าน', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
    const check = checkTransition(from, to);
    expect(check.ok).toBe(false);
  });

  it('เหตุผลที่ปฏิเสธต้องบอกว่าจากสถานะนี้ไปไหนได้บ้าง (เป็นภาษาไทย)', () => {
    const check = checkTransition(WorkStatus.NEW, WorkStatus.COMPLETED);
    expect(check.ok).toBe(false);
    if (check.ok) {
      return;
    }
    expect(check.reason).toContain('รายการใหม่');
    expect(check.reason).toContain('เรียบร้อยแล้ว');
    expect(check.reason).toContain('มอบหมายแล้ว'); // ปลายทางที่ไปได้จริง
  });

  it.each([WorkStatus.COMPLETED, WorkStatus.CANCELLED])(
    '%s เป็นสถานะปลายทาง เปลี่ยนต่อไม่ได้เลย',
    (terminal) => {
      expect(isTerminal(terminal)).toBe(true);
      for (const to of ALL_STATUSES) {
        const check = checkTransition(terminal, to);
        expect(check.ok).toBe(false);
      }
      const check = checkTransition(terminal, WorkStatus.NEW);
      if (!check.ok) {
        expect(check.reason).toContain('ปิดแล้ว');
      }
    },
  );

  it('เปลี่ยนเป็นสถานะเดิม → ไม่ผ่าน พร้อมบอกว่าอยู่สถานะนั้นแล้ว', () => {
    const check = checkTransition(WorkStatus.IN_PROGRESS, WorkStatus.IN_PROGRESS);
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.reason).toContain('อยู่แล้ว');
    }
  });
});

describe('historyActionForStatus — ประวัติต้องอ่านได้ว่าเกิดอะไรขึ้น', () => {
  it.each([
    [WorkStatus.WAITING_VENDOR, HistoryAction.CONTACT_VENDOR],
    [WorkStatus.WAITING_CA, HistoryAction.CSR_GENERATED],
    [WorkStatus.TESTING, HistoryAction.VERIFY],
    [WorkStatus.COMPLETED, HistoryAction.COMPLETE],
    [WorkStatus.CANCELLED, HistoryAction.CANCEL],
    [WorkStatus.ASSIGNED, HistoryAction.STATUS_CHANGE],
    [WorkStatus.IN_PROGRESS, HistoryAction.STATUS_CHANGE],
  ])('%s → %s', (status, action) => {
    expect(historyActionForStatus(status)).toBe(action);
  });
});

describe('OPEN_TASK_STATUSES', () => {
  it('ครอบทุกสถานะที่ไม่ใช่ปลายทาง (import ใช้ค่านี้เช็คงานค้าง)', () => {
    const notTerminal = ALL_STATUSES.filter((status) => !isTerminal(status));
    expect([...OPEN_TASK_STATUSES].sort()).toEqual([...notTerminal].sort());
  });
});
