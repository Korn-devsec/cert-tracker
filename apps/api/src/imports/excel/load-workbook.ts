import { Workbook } from 'exceljs';

/** ชนิดที่ ExcelJS ประกาศไว้จริงสำหรับ `xlsx.load()` */
type XlsxLoadInput = Parameters<Workbook['xlsx']['load']>[0];

/**
 * โหลดไฟล์ .xlsx จาก Buffer
 *
 * ExcelJS ประกาศพารามิเตอร์เป็น `Buffer` แบบไม่มี generic (ตาม @types/node รุ่นก่อน)
 * ส่วน @types/node 22 เปลี่ยน Buffer เป็น `Buffer<ArrayBufferLike>` ทำให้ชนกัน
 * จึง cast ไว้ "จุดเดียว" ที่นี่ แทนที่จะกระจาย cast ทั่วโค้ด
 */
export async function loadWorkbookFromBuffer(buffer: Buffer): Promise<Workbook> {
  const workbook = new Workbook();
  await workbook.xlsx.load(buffer as unknown as XlsxLoadInput);
  return workbook;
}
