/**
 * แปลงค่าคอลัมน์ Status ในไฟล์ Excel เป็น WorkStatus ของระบบ
 *
 * ไฟล์จริงมี `"ดำเนินการแล้ว "` (มีช่องว่างท้าย) จึงต้อง trim ก่อนเทียบเสมอ
 * ค่าที่เทียบไม่ได้ = คืน null แล้วให้ผู้เรียกรายงานเป็น warning พร้อมเลขแถว (ไม่ทำให้ import ล้ม)
 */
import { WorkStatus } from '@prisma/client';
import { collapseWhitespace } from './text';

/**
 * `อยู่ระหว่างดำเนินการ` map เป็น NEW ไม่ใช่ IN_PROGRESS ตามที่ PLAN.md ระบุว่า
 * "task status เริ่มต้นตาม workflow" — ในรายงานเดิมข้อความนี้หมายถึง "ยังไม่เสร็จ"
 * ไม่ได้ยืนยันว่ามีคนลงมือทำแล้ว ถ้า map เป็น IN_PROGRESS จะเท่ากับกุว่ามีคนรับงานไปแล้ว
 */
const STATUS_ALIASES: Record<string, WorkStatus> = {
  // ยังไม่เสร็จ → เริ่มต้น workflow
  อยู่ระหว่างดำเนินการ: WorkStatus.NEW,
  กำลังดำเนินการ: WorkStatus.NEW,
  รอดำเนินการ: WorkStatus.NEW,
  ยังไม่ดำเนินการ: WorkStatus.NEW,
  pending: WorkStatus.NEW,
  new: WorkStatus.NEW,
  'in progress': WorkStatus.NEW,
  inprogress: WorkStatus.NEW,
  // เสร็จแล้ว
  ดำเนินการแล้ว: WorkStatus.COMPLETED,
  เรียบร้อยแล้ว: WorkStatus.COMPLETED,
  เสร็จสิ้น: WorkStatus.COMPLETED,
  ต่ออายุแล้ว: WorkStatus.COMPLETED,
  done: WorkStatus.COMPLETED,
  completed: WorkStatus.COMPLETED,
  complete: WorkStatus.COMPLETED,
  finished: WorkStatus.COMPLETED,
  // ยกเลิก
  ยกเลิก: WorkStatus.CANCELLED,
  cancelled: WorkStatus.CANCELLED,
  canceled: WorkStatus.CANCELLED,
};

/** trim + ตัวพิมพ์เล็ก + ยุบช่องว่างซ้ำ (รวม non-breaking space ที่ Excel มักแทรกมา) */
export function normalizeStatusValue(raw: string): string {
  return collapseWhitespace(raw).toLowerCase();
}

/** คืน null เมื่อเทียบไม่ได้ (ผู้เรียกต้องรายงานเป็น warning) */
export function mapExcelStatus(raw: string | null | undefined): WorkStatus | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  const normalized = normalizeStatusValue(raw);
  if (normalized.length === 0) {
    return null;
  }
  return STATUS_ALIASES[normalized] ?? null;
}

/** ค่าที่ระบบรู้จัก — ใช้ประกอบข้อความ warning */
export function acceptedStatusValues(): string[] {
  return Object.keys(STATUS_ALIASES);
}
