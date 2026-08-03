import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import { parseImportError } from './import-errors';

describe('parseImportError — ต้องดึงรายละเอียดจาก api มาแสดงให้ครบ', () => {
  it('ไฟล์ขาดคอลัมน์ที่จำเป็น → ได้คอลัมน์ที่หาย ชื่อ header ที่ยอมรับ และ header ที่เจอ', () => {
    const error = new ApiError(400, 'ไฟล์ขาดคอลัมน์ที่จำเป็น จึง import ไม่ได้ทั้งไฟล์', {
      statusCode: 400,
      message: 'ไฟล์ขาดคอลัมน์ที่จำเป็น จึง import ไม่ได้ทั้งไฟล์',
      sheetName: 'NoExpiry',
      headerRow: 1,
      missingColumns: ['expiresAt หรือ daysUntilExpiry'],
      acceptedHeaders: {
        commonName: ['common name', 'cn'],
        expiresAt: ['expires', 'expiry date'],
      },
      headersFound: ['Common Name', 'Owner'],
    });

    const rejection = parseImportError(error);

    expect(rejection.message).toContain('ขาดคอลัมน์ที่จำเป็น');
    expect(rejection.sheetName).toBe('NoExpiry');
    expect(rejection.headerRow).toBe(1);
    expect(rejection.missingColumns).toEqual(['expiresAt หรือ daysUntilExpiry']);
    expect(rejection.acceptedHeaders?.expiresAt).toContain('expires');
    expect(rejection.headersFound).toEqual(['Common Name', 'Owner']);
  });

  it('โหมด strict มีแถวพัง → ได้เลขแถวและเหตุผลรายแถว', () => {
    const error = new ApiError(400, 'พบข้อมูลผิดพลาด 3 แถว', {
      message: 'พบข้อมูลผิดพลาด 3 แถว',
      errors: [
        { excelRow: 5, message: 'commonName ว่าง' },
        { excelRow: 6, column: 'Expires', message: 'รูปแบบวันที่ไม่รองรับ' },
      ],
      warnings: [{ excelRow: 7, message: 'สถานะ "???" ไม่รู้จัก' }],
    });

    const rejection = parseImportError(error);

    expect(rejection.errors).toHaveLength(2);
    expect(rejection.errors?.[1]).toMatchObject({ excelRow: 6, column: 'Expires' });
    expect(rejection.warnings).toHaveLength(1);
  });

  it('ระบุชื่อ sheet ผิด → ได้รายชื่อ sheet ที่มีในไฟล์', () => {
    const rejection = parseImportError(
      new ApiError(400, 'ไม่พบ sheet ชื่อ "x" ในไฟล์', {
        message: 'ไม่พบ sheet ชื่อ "x" ในไฟล์',
        availableSheets: ['Report', 'Report-SSL-Jul-2026'],
      }),
    );

    expect(rejection.availableSheets).toEqual(['Report', 'Report-SSL-Jul-2026']);
  });

  it('error ที่ไม่มีรายละเอียด → เหลือแค่ข้อความ (ไม่พังและไม่เดาข้อมูล)', () => {
    const rejection = parseImportError(new ApiError(500, 'เซิร์ฟเวอร์ผิดพลาด'));

    expect(rejection).toEqual({
      message: 'เซิร์ฟเวอร์ผิดพลาด',
      sheetName: undefined,
      headerRow: undefined,
      missingColumns: undefined,
      acceptedHeaders: undefined,
      headersFound: undefined,
      errors: undefined,
      warnings: undefined,
      availableSheets: undefined,
    });
  });

  it('error ที่ไม่ใช่ ApiError (เช่น network) → ยังได้ข้อความอ่านได้', () => {
    expect(parseImportError(new Error('เชื่อมต่อไม่ได้')).message).toBe('เชื่อมต่อไม่ได้');
    expect(parseImportError('พังแบบไม่ระบุ').message).toBe('พังแบบไม่ระบุ');
  });
});
