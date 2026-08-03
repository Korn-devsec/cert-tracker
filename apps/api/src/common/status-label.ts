/**
 * ป้ายภาษาไทยของสถานะงาน สำหรับข้อความ error/ประวัติที่คนอ่าน
 *
 * ค่ามาจาก `packages/shared` ที่เดียว (มี `enum-parity.spec.ts` คุมว่าค่า enum สองฝั่งตรงกัน)
 * แต่ต้องคัดลอกเป็น `Record<string, string>` เพราะฝั่ง api ใช้ enum ของ Prisma
 * ซึ่ง TypeScript ไม่ยอมให้ใช้เป็น key ของ Record ที่คีย์เป็น TS enum ของ shared ตรงๆ
 */
import { WORK_STATUS_LABEL_TH } from '@cert-tracker/shared';
import { WorkStatus } from '@prisma/client';

const LABELS: Record<string, string> = { ...WORK_STATUS_LABEL_TH };

export function workStatusLabel(status: WorkStatus): string {
  return LABELS[status] ?? status;
}
