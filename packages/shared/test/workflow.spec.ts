import { describe, expect, it } from 'vitest';
import {
  ALLOWED_WORK_TRANSITIONS,
  allowedNextWorkStatuses,
  canTransitionWorkStatus,
  isOpenWorkStatus,
  isTerminalWorkStatus,
  OPEN_WORK_STATUSES,
  WorkStatus,
} from '../src';

const ALL = Object.values(WorkStatus);

describe('ตารางการเดินสถานะ (ใช้ร่วมกันทั้ง api และ web)', () => {
  it('เดินเส้นทางหลักได้ครบ: New → Assigned → In Progress → Waiting Vendor → Waiting CA → Testing → Completed', () => {
    const path = [
      WorkStatus.NEW,
      WorkStatus.ASSIGNED,
      WorkStatus.IN_PROGRESS,
      WorkStatus.WAITING_VENDOR,
      WorkStatus.WAITING_CA,
      WorkStatus.TESTING,
      WorkStatus.COMPLETED,
    ];
    for (let index = 0; index < path.length - 1; index++) {
      expect(canTransitionWorkStatus(path[index], path[index + 1])).toBe(true);
    }
  });

  it('ข้ามขั้นไม่ได้ (New → Completed)', () => {
    expect(canTransitionWorkStatus(WorkStatus.NEW, WorkStatus.COMPLETED)).toBe(false);
  });

  it('ยกเลิกได้ทุกขั้นที่ยังไม่ปิด', () => {
    for (const status of OPEN_WORK_STATUSES) {
      expect(canTransitionWorkStatus(status, WorkStatus.CANCELLED)).toBe(true);
    }
  });

  it.each(TERMINALS())('%s เป็นปลายทาง ไม่มีสถานะถัดไป', (terminal) => {
    expect(isTerminalWorkStatus(terminal)).toBe(true);
    expect(allowedNextWorkStatuses(terminal)).toEqual([]);
  });

  it('สถานะที่ไม่ใช่ปลายทาง = สถานะที่ยังเปิดอยู่ (สองชุดต้องตรงกันข้ามกันพอดี)', () => {
    const open = ALL.filter((status) => !isTerminalWorkStatus(status));
    expect(open).toEqual(OPEN_WORK_STATUSES);
    expect(open.every(isOpenWorkStatus)).toBe(true);
  });

  it('จำนวนคู่ที่อนุญาตทั้งหมด = 17 (ล็อกตารางไว้ ถ้าแก้กฎต้องแก้เทสต์ด้วย)', () => {
    const total = ALL.reduce((sum, status) => sum + ALLOWED_WORK_TRANSITIONS[status].length, 0);
    expect(total).toBe(17);
  });

  it('allowedNextWorkStatuses คืนสำเนา — แก้ผลลัพธ์แล้วตารางกลางไม่เปลี่ยน', () => {
    const next = allowedNextWorkStatuses(WorkStatus.NEW);
    next.push(WorkStatus.COMPLETED);
    expect(ALLOWED_WORK_TRANSITIONS[WorkStatus.NEW]).toEqual([
      WorkStatus.ASSIGNED,
      WorkStatus.CANCELLED,
    ]);
  });

  it('ทุกสถานะที่ยังเปิดอยู่ต้องมีทางไปต่ออย่างน้อย 1 ทาง (ไม่มีงานที่ติดตาย)', () => {
    for (const status of OPEN_WORK_STATUSES) {
      expect(allowedNextWorkStatuses(status).length).toBeGreaterThan(0);
    }
  });
});

function TERMINALS(): WorkStatus[] {
  return [WorkStatus.COMPLETED, WorkStatus.CANCELLED];
}
