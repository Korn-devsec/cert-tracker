/**
 * การจัดการช่องว่างในข้อความจาก Excel — รวมไว้ที่เดียว
 *
 * ไฟล์ที่คนทำใน Excel มักมีอักขระช่องว่างที่มองไม่เห็น เช่น
 * U+00A0 non-breaking space (พบบ่อยเวลา copy จากเว็บ), U+200B zero-width space, U+FEFF BOM
 * ถ้าไม่จัดการ ชื่อ header จะเทียบไม่ตรงและสถานะจะ map ไม่ได้ ทั้งที่ตาเห็นว่าเหมือนกัน
 *
 * ตั้งใจเขียนเป็น escape (\uXXXX) ไม่วางอักขระจริงลงซอร์ส เพราะอักขระที่มองไม่เห็น
 * ทำให้คนอ่านโค้ดเข้าใจผิดและแก้พลาดได้ (ESLint no-irregular-whitespace ก็ห้ามไว้ด้วย)
 */

/** ช่องว่างที่ต้องแปลงเป็นช่องว่างปกติ: NBSP, figure space, narrow NBSP */
const NBSP_LIKE = /[\u00A0\u2007\u202F]/g;
/**
 * อักขระความกว้างศูนย์ที่ต้องลบทิ้ง: ZWSP, ZWNJ, ZWJ, BOM
 * เขียนเป็น alternation ไม่ใช่ character class เพราะ ZWJ (\u200D) ที่อยู่ใน class
 * ทำให้ ESLint no-misleading-character-class เตือนเรื่องลำดับอักขระที่ join กันได้
 */
const ZERO_WIDTH = /\u200B|\u200C|\u200D|\uFEFF/g;

/** แปลงช่องว่างพิเศษเป็นช่องว่างปกติ และลบอักขระความกว้างศูนย์ */
export function normalizeWhitespace(text: string): string {
  return text.replace(NBSP_LIKE, ' ').replace(ZERO_WIDTH, '');
}

/** normalizeWhitespace + trim + ยุบช่องว่างซ้ำให้เหลือช่องเดียว */
export function collapseWhitespace(text: string): string {
  return normalizeWhitespace(text).trim().replace(/\s+/g, ' ');
}
