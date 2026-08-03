import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { looksLikeXlsx } from './xlsx-signature';

describe('looksLikeXlsx — ตรวจจากไบต์แรกของไฟล์ ไม่เชื่อชื่อไฟล์/mime type', () => {
  it('ไฟล์ .xlsx จริงจากลูกค้า → ผ่าน', () => {
    const real = readFileSync(join(__dirname, '../../../test/fixtures/30-July-2026.xlsx'));
    expect(looksLikeXlsx(real)).toBe(true);
  });

  it.each([
    ['ข้อความธรรมดา (เช่น .csv ที่เปลี่ยนนามสกุล)', Buffer.from('Common Name,Days Until\nx,10')],
    ['HTML', Buffer.from('<html><body>ไม่ใช่ Excel</body></html>')],
    ['ไฟล์ .xls รุ่นเก่า (OLE2)', Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])],
    ['PDF', Buffer.from('%PDF-1.7')],
    ['ไฟล์ว่าง', Buffer.alloc(0)],
    ['สั้นกว่าลายเซ็น', Buffer.from([0x50, 0x4b])],
  ])('%s → ไม่ผ่าน', (_label, buffer) => {
    expect(looksLikeXlsx(buffer)).toBe(false);
  });

  it('รับ zip ทั้งสามรูปแบบของลายเซ็น (ปกติ / ว่าง / แบ่งส่วน)', () => {
    expect(looksLikeXlsx(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14]))).toBe(true);
    expect(looksLikeXlsx(Buffer.from([0x50, 0x4b, 0x05, 0x06, 0x00]))).toBe(true);
    expect(looksLikeXlsx(Buffer.from([0x50, 0x4b, 0x07, 0x08, 0x00]))).toBe(true);
  });
});
