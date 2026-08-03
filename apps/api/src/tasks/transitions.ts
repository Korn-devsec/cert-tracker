/**
 * กฎการเปลี่ยนสถานะงานต่ออายุ (workflow ที่คนอัปเดต — คนละเรื่องกับ RiskLevel ตามกฎเหล็กข้อ 5)
 *
 * **ตารางเส้นทางอยู่ใน `packages/shared/src/workflow.ts`** เพื่อให้หน้า Tasks (Phase 7)
 * แสดงปลายทางชุดเดียวกับที่ api ยอมรับ · ไฟล์นี้เหลือหน้าที่ 3 อย่าง:
 *   1. แปลง enum ของ shared ↔ Prisma (ตามข้อตกลง Phase 2)
 *   2. ข้อความอธิบายภาษาไทยเมื่อเปลี่ยนสถานะไม่ได้
 *   3. เลือก HistoryAction ให้ตรงความหมายของสถานะปลายทาง
 *
 * เหตุผลของเส้นทางที่เพิ่มจากสเปก (ข้ามไป Testing / ย้อนจาก Testing) อยู่ใน DECISIONS.md — Phase 4
 */
import { HistoryAction, WorkStatus } from '@prisma/client';
import {
  ALLOWED_WORK_TRANSITIONS,
  allowedNextWorkStatuses,
  canTransitionWorkStatus,
  isTerminalWorkStatus,
  OPEN_WORK_STATUSES,
  TERMINAL_WORK_STATUSES,
  WorkStatus as SharedWorkStatus,
} from '@cert-tracker/shared';
import { workStatusLabel } from '../common/status-label';

/** enum สองฝั่งมีค่าสตริงเดียวกัน (คุมด้วย enum-parity.spec.ts) จึงแปลงกลับไปมาได้ */
function toShared(status: WorkStatus): SharedWorkStatus {
  return status as unknown as SharedWorkStatus;
}

function toPrisma(status: SharedWorkStatus): WorkStatus {
  return status as unknown as WorkStatus;
}

/** งานที่ยังไม่ปิด — ใช้ตัดสินว่า cert ใบนี้มีงานค้างอยู่แล้วหรือยัง */
export const OPEN_TASK_STATUSES: WorkStatus[] = OPEN_WORK_STATUSES.map(toPrisma);

/** สถานะปลายทาง เปลี่ยนต่อไม่ได้ — ถ้าต้องทำงานรอบใหม่ให้เปิด task ใบใหม่ */
export const TERMINAL_TASK_STATUSES: WorkStatus[] = TERMINAL_WORK_STATUSES.map(toPrisma);

function nextOf(status: WorkStatus): readonly WorkStatus[] {
  return allowedNextWorkStatuses(toShared(status)).map(toPrisma);
}

/** ตารางเส้นทาง (คีย์เป็น enum ของ Prisma เพื่อให้ service ใช้ได้ตรงๆ) — ค่ามาจาก shared ทั้งหมด */
export const ALLOWED_TRANSITIONS: Record<WorkStatus, readonly WorkStatus[]> = {
  [WorkStatus.NEW]: nextOf(WorkStatus.NEW),
  [WorkStatus.ASSIGNED]: nextOf(WorkStatus.ASSIGNED),
  [WorkStatus.IN_PROGRESS]: nextOf(WorkStatus.IN_PROGRESS),
  [WorkStatus.WAITING_VENDOR]: nextOf(WorkStatus.WAITING_VENDOR),
  [WorkStatus.WAITING_CA]: nextOf(WorkStatus.WAITING_CA),
  [WorkStatus.TESTING]: nextOf(WorkStatus.TESTING),
  [WorkStatus.COMPLETED]: nextOf(WorkStatus.COMPLETED),
  [WorkStatus.CANCELLED]: nextOf(WorkStatus.CANCELLED),
};

export type TransitionCheck = { ok: true } | { ok: false; reason: string };

export function isTerminal(status: WorkStatus): boolean {
  return isTerminalWorkStatus(toShared(status));
}

export function canTransition(from: WorkStatus, to: WorkStatus): boolean {
  return canTransitionWorkStatus(toShared(from), toShared(to));
}

/** ยืนยันว่าตารางที่แปลงมาแล้วยังตรงกับต้นฉบับใน shared (กันความผิดพลาดตอน map) */
export function transitionTableSize(): number {
  return Object.values(SharedWorkStatus).reduce(
    (sum, status) => sum + ALLOWED_WORK_TRANSITIONS[status].length,
    0,
  );
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
