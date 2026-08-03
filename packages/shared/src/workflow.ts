/**
 * กฎการเดินสถานะงานต่ออายุ — ย้ายมาไว้ที่นี่ใน Phase 7 เพื่อให้ **api และ web ใช้ตารางเดียวกัน**
 *
 * หน้า Tasks ต้องแสดงเฉพาะปลายทางที่เปลี่ยนได้จริง ถ้าฝั่ง web เขียนกฎซ้ำเอง
 * วันหนึ่งปุ่มบนหน้าจอจะไม่ตรงกับที่ api ยอมรับ แล้วผู้ใช้จะเจอ 400 โดยไม่รู้ว่าทำอะไรผิด
 *
 * เส้นทางหลักตาม CLAUDE.md:
 *   New → Assigned → In Progress → Waiting Vendor ⇄ Waiting CA → Testing → Completed
 *   ยกเลิกได้ทุกขั้น → Cancelled
 * (เหตุผลของเส้นทางที่เพิ่มจากสเปกอยู่ใน DECISIONS.md — Phase 4)
 */
import { WorkStatus } from './enums';

/** งานที่ยังไม่ปิด — ใช้ตัดสินว่า cert ใบนี้มีงานค้างอยู่แล้วหรือยัง */
export const OPEN_WORK_STATUSES: WorkStatus[] = [
  WorkStatus.NEW,
  WorkStatus.ASSIGNED,
  WorkStatus.IN_PROGRESS,
  WorkStatus.WAITING_VENDOR,
  WorkStatus.WAITING_CA,
  WorkStatus.TESTING,
];

/** สถานะปลายทาง เปลี่ยนต่อไม่ได้ — ถ้าต้องทำงานรอบใหม่ให้เปิด task ใบใหม่ */
export const TERMINAL_WORK_STATUSES: WorkStatus[] = [WorkStatus.COMPLETED, WorkStatus.CANCELLED];

export const ALLOWED_WORK_TRANSITIONS: Record<WorkStatus, readonly WorkStatus[]> = {
  [WorkStatus.NEW]: [WorkStatus.ASSIGNED, WorkStatus.CANCELLED],
  [WorkStatus.ASSIGNED]: [WorkStatus.IN_PROGRESS, WorkStatus.CANCELLED],
  [WorkStatus.IN_PROGRESS]: [
    WorkStatus.WAITING_VENDOR,
    WorkStatus.WAITING_CA,
    WorkStatus.TESTING,
    WorkStatus.CANCELLED,
  ],
  [WorkStatus.WAITING_VENDOR]: [WorkStatus.WAITING_CA, WorkStatus.TESTING, WorkStatus.CANCELLED],
  [WorkStatus.WAITING_CA]: [WorkStatus.WAITING_VENDOR, WorkStatus.TESTING, WorkStatus.CANCELLED],
  [WorkStatus.TESTING]: [WorkStatus.IN_PROGRESS, WorkStatus.COMPLETED, WorkStatus.CANCELLED],
  [WorkStatus.COMPLETED]: [],
  [WorkStatus.CANCELLED]: [],
};

export function isTerminalWorkStatus(status: WorkStatus): boolean {
  return TERMINAL_WORK_STATUSES.includes(status);
}

export function isOpenWorkStatus(status: WorkStatus): boolean {
  return OPEN_WORK_STATUSES.includes(status);
}

export function canTransitionWorkStatus(from: WorkStatus, to: WorkStatus): boolean {
  return ALLOWED_WORK_TRANSITIONS[from].includes(to);
}

/** ปลายทางที่เลือกได้จากสถานะนี้ (คืนสำเนาใหม่ ป้องกันการแก้ค่าคงที่ของระบบ) */
export function allowedNextWorkStatuses(from: WorkStatus): WorkStatus[] {
  return [...ALLOWED_WORK_TRANSITIONS[from]];
}
