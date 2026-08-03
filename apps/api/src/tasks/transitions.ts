/**
 * กฎการเปลี่ยนสถานะงานต่ออายุ (workflow ที่คนอัปเดต — คนละเรื่องกับ RiskLevel ตามกฎเหล็กข้อ 5)
 *
 * เส้นทางหลักตาม CLAUDE.md:
 *   New → Assigned → In Progress → Waiting Vendor ⇄ Waiting CA → Testing → Completed
 *   ยกเลิกได้ทุกขั้น → Cancelled
 *
 * เพิ่มจากเส้นทางหลัก 2 ทาง (บันทึกเหตุผลใน DECISIONS.md):
 *   - In Progress / Waiting * → Testing ได้โดยตรง เพราะ cert ที่ออกเอง (self-signed ซึ่งมีจริงในไฟล์)
 *     ไม่มีขั้นตอนติดต่อ vendor หรือรอ CA
 *   - Testing → In Progress ได้ เพราะทดสอบไม่ผ่านต้องกลับไปแก้ ไม่ใช่ยกเลิกงาน
 *
 * ไฟล์นี้เป็นฟังก์ชันล้วน (ไม่มี Nest/Prisma client) เพื่อเทสต์ทุกคู่สถานะได้ตรงๆ
 */
import { HistoryAction, WorkStatus } from '@prisma/client';
import { workStatusLabel } from '../common/status-label';

/** งานที่ยังไม่ปิด — ใช้ตัดสินว่า cert ใบนี้มีงานค้างอยู่แล้วหรือยัง */
export const OPEN_TASK_STATUSES: WorkStatus[] = [
  WorkStatus.NEW,
  WorkStatus.ASSIGNED,
  WorkStatus.IN_PROGRESS,
  WorkStatus.WAITING_VENDOR,
  WorkStatus.WAITING_CA,
  WorkStatus.TESTING,
];

/** สถานะปลายทาง เปลี่ยนต่อไม่ได้ — ถ้าต้องทำงานรอบใหม่ให้เปิด task ใบใหม่ */
export const TERMINAL_TASK_STATUSES: WorkStatus[] = [WorkStatus.COMPLETED, WorkStatus.CANCELLED];

export const ALLOWED_TRANSITIONS: Record<WorkStatus, readonly WorkStatus[]> = {
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

export type TransitionCheck = { ok: true } | { ok: false; reason: string };

export function isTerminal(status: WorkStatus): boolean {
  return TERMINAL_TASK_STATUSES.includes(status);
}

export function canTransition(from: WorkStatus, to: WorkStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** ตรวจการเปลี่ยนสถานะ พร้อมเหตุผลภาษาไทยที่บอกว่าจากสถานะนี้ไปไหนได้บ้าง */
export function checkTransition(from: WorkStatus, to: WorkStatus): TransitionCheck {
  if (from === to) {
    return { ok: false, reason: `งานนี้อยู่ในสถานะ "${workStatusLabel(to)}" อยู่แล้ว` };
  }
  if (canTransition(from, to)) {
    return { ok: true };
  }

  const allowed = ALLOWED_TRANSITIONS[from];
  if (allowed.length === 0) {
    return {
      ok: false,
      reason:
        `งานนี้ปิดแล้ว (สถานะ "${workStatusLabel(from)}") เปลี่ยนสถานะต่อไม่ได้ — ` +
        'ถ้าต้องต่ออายุรอบใหม่ให้เปิดงานใบใหม่',
    };
  }
  return {
    ok: false,
    reason:
      `เปลี่ยนสถานะจาก "${workStatusLabel(from)}" เป็น "${workStatusLabel(to)}" ไม่ได้ — ` +
      `จากสถานะนี้ไปได้เฉพาะ ${allowed.map((status) => `"${workStatusLabel(status)}"`).join(', ')}`,
  };
}

/**
 * action ที่ลง HistoryLog ตามสถานะปลายทาง — ให้ประวัติอ่านได้ว่าเกิดอะไรขึ้นจริง
 * ไม่ใช่ `STATUS_CHANGE` ทุกบรรทัด
 * (`INSTALL` / `CERTIFICATE_ISSUED` เก็บไว้ให้บันทึกเหตุการณ์แบบระบุเองในเฟสถัดไป)
 */
const HISTORY_ACTION_BY_STATUS: Partial<Record<WorkStatus, HistoryAction>> = {
  [WorkStatus.WAITING_VENDOR]: HistoryAction.CONTACT_VENDOR,
  [WorkStatus.WAITING_CA]: HistoryAction.CSR_GENERATED,
  [WorkStatus.TESTING]: HistoryAction.VERIFY,
  [WorkStatus.COMPLETED]: HistoryAction.COMPLETE,
  [WorkStatus.CANCELLED]: HistoryAction.CANCEL,
};

export function historyActionForStatus(to: WorkStatus): HistoryAction {
  return HISTORY_ACTION_BY_STATUS[to] ?? HistoryAction.STATUS_CHANGE;
}
