/**
 * ตรวจว่าไฟล์ที่อัปโหลดเป็น .xlsx จริงจากไบต์แรกของไฟล์ (Phase 8 — validate file type)
 *
 * `.xlsx` คือ ZIP (OOXML) จึงต้องเริ่มด้วยลายเซ็นของ ZIP · การเชื่อแต่ชื่อไฟล์กับ mime type
 * ที่ client ส่งมาไม่พอ เพราะทั้งสองอย่างปลอมได้ง่าย
 *
 * ไม่ตรวจลึกกว่านี้ (เช่นเปิด zip ดู `xl/workbook.xml`) เพราะ ExcelJS จะ throw
 * ให้เองอยู่แล้วถ้าโครงสร้างข้างในไม่ใช่ workbook — ที่นี่แค่กันไฟล์ที่ไม่ใช่ zip ตั้งแต่ต้นทาง
 */

/** `PK\x03\x04` = ZIP ปกติ · อีกสองแบบเป็น zip ที่ว่างหรือถูกแบ่งส่วน (spanned) */
const ZIP_SIGNATURES: ReadonlyArray<readonly number[]> = [
  [0x50, 0x4b, 0x03, 0x04],
  [0x50, 0x4b, 0x05, 0x06],
  [0x50, 0x4b, 0x07, 0x08],
];

export function looksLikeXlsx(buffer: Buffer): boolean {
  if (buffer.length < 4) {
    return false;
  }
  return ZIP_SIGNATURES.some((signature) =>
    signature.every((byte, index) => buffer[index] === byte),
  );
}
