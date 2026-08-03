/**
 * วันที่แบบไทย (พ.ศ.) — ใช้ทั้งในข้อความแจ้งเตือน (Phase 5) และบนหน้าจอ/รายงาน (Phase 6+)
 *
 * อ่านค่าจากส่วน **UTC** ของ Date เสมอ ให้ตรงกับวิธีนับวันของ `calculateDaysUntilExpiry`
 * ไม่งั้นข้อความจะเขียนวันหนึ่ง แต่ตัวเลข "เหลือกี่วัน" นับอีกวัน เมื่อรันบนเครื่องต่าง timezone
 */

/** พ.ศ. = ค.ศ. + 543 */
export const BUDDHIST_YEAR_OFFSET = 543;

export const THAI_MONTHS = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
] as const;

export const THAI_MONTHS_SHORT = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
] as const;

export function toBuddhistYear(gregorianYear: number): number {
  return gregorianYear + BUDDHIST_YEAR_OFFSET;
}

/** เช่น `18 กันยายน 2569` */
export function formatThaiDate(date: Date): string {
  return `${date.getUTCDate()} ${THAI_MONTHS[date.getUTCMonth()]} ${toBuddhistYear(date.getUTCFullYear())}`;
}

/** เช่น `18 ก.ย. 2569` — ใช้ในตารางที่พื้นที่จำกัด */
export function formatThaiDateShort(date: Date): string {
  return `${date.getUTCDate()} ${THAI_MONTHS_SHORT[date.getUTCMonth()]} ${toBuddhistYear(date.getUTCFullYear())}`;
}

/** เช่น `กันยายน 2569` — หัวข้อรายงานรายเดือนและตัวกรองเดือนบน Dashboard */
export function formatThaiMonthYear(date: Date): string {
  return `${THAI_MONTHS[date.getUTCMonth()]} ${toBuddhistYear(date.getUTCFullYear())}`;
}

/**
 * แปลงเดือนรูปแบบ `YYYY-MM` (ค.ศ. ที่ API ใช้) เป็นชื่อเดือนไทยพร้อม พ.ศ.
 * คืน `null` ถ้ารูปแบบไม่ถูกต้อง เพื่อให้ผู้เรียกเลือกได้ว่าจะแสดงอะไรแทน
 */
export function formatThaiMonthFromKey(monthKey: string): string | null {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(monthKey);
  if (match === null) {
    return null;
  }
  const [, year, month] = match;
  return `${THAI_MONTHS[Number(month) - 1]} ${toBuddhistYear(Number(year))}`;
}
