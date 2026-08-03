/**
 * เทสต์กับไฟล์ Excel จริง (apps/api/test/fixtures/) — ครอบเคสที่ PLAN.md Phase 3 ระบุ:
 * header อยู่แถว 3 / sheet หน้าปก / สลับคอลัมน์ / typo / status ไทยมีช่องว่างท้าย /
 * endpoints หลายค่าในเซลล์เดียว / แถวข้อมูลพัง / คอลัมน์จำเป็นหาย
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WorkStatus } from '@prisma/client';
import { Workbook, type Worksheet } from 'exceljs';
import { mapHeaders } from './header-mapping';
import { loadWorkbookFromBuffer } from './load-workbook';
import { dedupeRows, parseSheet } from './row-parser';
import { findHeaderRow, inspectWorkbook, isRowEmpty, readRowValues } from './sheet-inspector';

const FIXTURES = join(__dirname, '..', '..', '..', 'test', 'fixtures');
const REFERENCE_DATE = new Date('2026-07-30T00:00:00.000Z');

async function loadWorkbook(filename: string): Promise<Workbook> {
  return loadWorkbookFromBuffer(readFileSync(join(FIXTURES, filename)));
}

/** parse sheet โดยหา header row + mapping เองทั้งหมด (เหมือนที่ service ทำ) */
function parseWholeSheet(worksheet: Worksheet): ReturnType<typeof parseSheet> & {
  headerRow: number;
} {
  const headerRow = findHeaderRow(worksheet);
  if (headerRow === null) {
    throw new Error(`ไม่พบ header ใน sheet ${worksheet.name}`);
  }
  const { columns } = mapHeaders(readRowValues(worksheet, headerRow));
  return {
    headerRow,
    ...parseSheet(worksheet, { headerRow, columns, referenceDate: REFERENCE_DATE }),
  };
}

describe('ไฟล์จริง 30-July-2026.xlsx', () => {
  let workbook: Workbook;

  beforeAll(async () => {
    workbook = await loadWorkbook('30-July-2026.xlsx');
  });

  describe('sheet detection', () => {
    it('เจอ 3 sheet ตามลำดับในไฟล์', () => {
      const result = inspectWorkbook(workbook);

      expect(result.sheets.map((sheet) => sheet.name)).toEqual([
        'Report',
        'Report-SSL-Jul-2026',
        'Report-SSL-Jun-2026(ติดตาม',
      ]);
    });

    /**
     * sheet "Report" ไม่ใช่หน้าปกเปล่าๆ อย่างที่คิดตอนแรก — เป็นตารางข้อมูลที่ merge cell ไว้
     * (header ซ้ำหลายคอลัมน์ และซ้ำทั้งแถว 7 กับ 8) แต่ขาดคอลัมน์ Owner/Status
     * ระบบจึงถือว่า import ได้ แต่ไม่ควรถูกแนะนำก่อน sheet รายเดือนที่ข้อมูลครบกว่า
     */
    it('sheet "Report" import ได้แต่ข้อมูลไม่ครบ (ไม่มี Owner/Status)', () => {
      const report = inspectWorkbook(workbook).sheets.find((sheet) => sheet.name === 'Report');

      expect(report).toMatchObject({ importable: true, headerRow: 7 });
      expect(report?.headers).not.toContain('Owner');
      expect(report?.headers).not.toContain('Status');
      expect(report?.mappedFieldCount).toBeLessThan(9);
    });

    it('แนะนำ sheet รายเดือน (map ฟิลด์ได้ครบกว่า) ไม่ใช่ sheet "Report"', () => {
      const result = inspectWorkbook(workbook);

      expect(result.suggestedSheet).not.toBe('Report');
      expect(result.suggestedSheet).toBe('Report-SSL-Jun-2026(ติดตาม');
    });

    it('header ที่ merge แนวตั้งใน sheet "Report" (แถว 8 ซ้ำแถว 7) ไม่ถูกนับเป็นข้อมูล', () => {
      const sheet = workbook.getWorksheet('Report')!;
      const result = parseWholeSheet(sheet);

      // ถ้าไม่ข้ามแถว header ที่ซ้ำ จะได้ cert ปลอมชื่อ "Common Name"
      expect(result.rows.map((row) => row.commonName)).not.toContain('Common Name');
      expect(result.scannedRows).toBe(6);
      expect(result.errors).toEqual([]);
    });

    it('sheet ข้อมูลทั้งสองเดือน import ได้ และรายงานจำนวนแถวถูก', () => {
      const sheets = inspectWorkbook(workbook).sheets;
      const july = sheets.find((sheet) => sheet.name === 'Report-SSL-Jul-2026');
      const june = sheets.find((sheet) => sheet.name === 'Report-SSL-Jun-2026(ติดตาม');

      expect(july).toMatchObject({ importable: true, headerRow: 3, dataRowCount: 6 });
      expect(june).toMatchObject({ importable: true, headerRow: 3, dataRowCount: 8 });
      expect(july?.missingRequired).toEqual([]);
    });
  });

  describe('header row auto-detection', () => {
    it('เจอ header ที่แถว 3 ไม่ใช่แถว 1', () => {
      expect(findHeaderRow(workbook.getWorksheet('Report-SSL-Jul-2026')!)).toBe(3);
      expect(findHeaderRow(workbook.getWorksheet('Report-SSL-Jun-2026(ติดตาม')!)).toBe(3);
    });

    it('แถว 1 เป็นชื่อรายงาน แถว 2 ว่าง', () => {
      const sheet = workbook.getWorksheet('Report-SSL-Jul-2026')!;
      expect(readRowValues(sheet, 1).filter((v) => v !== null)).toEqual(['Report on 30-Jul-2026']);
      expect(isRowEmpty(sheet, 2)).toBe(true);
    });
  });

  describe('sheet Jul — 6 แถวข้อมูล', () => {
    it('แตก endpoint หลายค่าในเซลล์เดียว → ได้ 7 รายการจาก 6 แถว', () => {
      const result = parseWholeSheet(workbook.getWorksheet('Report-SSL-Jul-2026')!);

      expect(result.scannedRows).toBe(6);
      expect(result.rows).toHaveLength(7);
      expect(result.errors).toEqual([]);

      // แถว 6 มี 2 endpoint คั่นด้วย newline → กลายเป็น 2 รายการ commonName เดียวกัน
      const row6 = result.rows.filter((row) => row.excelRow === 6);
      expect(row6).toHaveLength(2);
      expect(row6.map((row) => row.endpoint)).toEqual([
        '192.168.223.205:9696',
        '192.168.223.205:35357',
      ]);
      expect(new Set(row6.map((row) => row.commonName))).toEqual(
        new Set(['sme-olvmcenter2.smebank.local']),
      );
    });

    it('อ่านค่าแถวแรกได้ถูกทุกฟิลด์ และ Expires เป็น UTC', () => {
      const result = parseWholeSheet(workbook.getWorksheet('Report-SSL-Jul-2026')!);
      const first = result.rows[0];

      expect(first).toMatchObject({
        excelRow: 4,
        commonName: 'Self Cert',
        endpoint: '192.168.239.101:4443',
        issuer: '<selfsigned>',
        signatureAlgorithm: 'SHA256withRSA',
        owner: 'IT Sec',
        workStatus: WorkStatus.NEW,
        daysUntilExpiryInFile: 50,
      });
      expect(first.expiresAt.toISOString()).toBe('2026-09-18T12:25:54.000Z');
    });

    it('แถวที่ไม่มี Owner → owner = null ไม่ทำให้แถวเสีย', () => {
      const result = parseWholeSheet(workbook.getWorksheet('Report-SSL-Jul-2026')!);
      const noOwner = result.rows.find((row) => row.excelRow === 6);

      expect(noOwner?.owner).toBeNull();
      expect(result.errors).toEqual([]);
    });

    it('แถวว่างท้าย sheet (10-12) ถูกข้าม ไม่นับเป็นข้อมูล', () => {
      const sheet = workbook.getWorksheet('Report-SSL-Jul-2026')!;
      expect(sheet.rowCount).toBeGreaterThanOrEqual(10);
      expect(isRowEmpty(sheet, 10)).toBe(true);
      expect(parseWholeSheet(sheet).rows.every((row) => row.excelRow <= 9)).toBe(true);
    });
  });

  describe('sheet Jun — typo Onwer + status มีช่องว่างท้าย', () => {
    it('map ค่าจากคอลัมน์ `Onwer` ได้ (typo)', () => {
      const sheet = workbook.getWorksheet('Report-SSL-Jun-2026(ติดตาม')!;
      const { columns } = mapHeaders(readRowValues(sheet, 3));

      expect(columns.owner).toBe(8);
    });

    it('"ดำเนินการแล้ว " (ช่องว่างท้าย) → COMPLETED', () => {
      const result = parseWholeSheet(workbook.getWorksheet('Report-SSL-Jun-2026(ติดตาม')!);
      const completed = result.rows.filter((row) => row.workStatus === WorkStatus.COMPLETED);

      expect(completed.map((row) => row.commonName)).toEqual(['k3s', 'smeedm']);
      expect(result.errors).toEqual([]);
    });

    it('8 แถว → 9 รายการ (แถว 8 มี 2 endpoint)', () => {
      const result = parseWholeSheet(workbook.getWorksheet('Report-SSL-Jun-2026(ติดตาม')!);
      expect(result.scannedRows).toBe(8);
      expect(result.rows).toHaveLength(9);
    });
  });

  describe('dedupe ภายในไฟล์', () => {
    it('sheet Jul ไม่มีคีย์ซ้ำ (commonName เดียวกันแต่ endpoint ต่างกัน = ไม่ซ้ำ)', () => {
      const result = parseWholeSheet(workbook.getWorksheet('Report-SSL-Jul-2026')!);
      const deduped = dedupeRows(result.rows);

      expect(deduped.warnings).toEqual([]);
      expect(deduped.rows).toHaveLength(7);
    });

    it('รวม 2 sheet เข้าด้วยกันจะเจอคีย์ซ้ำ → เก็บรายการแรก และเตือนพร้อมเลขแถว', () => {
      const july = parseWholeSheet(workbook.getWorksheet('Report-SSL-Jul-2026')!).rows;
      const june = parseWholeSheet(workbook.getWorksheet('Report-SSL-Jun-2026(ติดตาม')!).rows;
      const deduped = dedupeRows([...july, ...june]);

      expect(deduped.warnings.length).toBeGreaterThan(0);
      expect(deduped.warnings[0].message).toContain('ซ้ำกับแถว');
      expect(deduped.rows.length).toBeLessThan(july.length + june.length);
    });
  });
});

describe('fixture: columns-swapped.xlsx (สลับคอลัมน์ + alias + typo)', () => {
  it('import ผ่านเหมือนเดิม และได้ค่าถูกต้อง', async () => {
    const workbook = await loadWorkbook('columns-swapped.xlsx');
    const sheet = workbook.getWorksheet('Swapped')!;
    const result = parseWholeSheet(sheet);

    expect(result.headerRow).toBe(3);
    expect(result.errors).toEqual([]);
    // 3 แถว แต่แถวที่ 3 มี 2 endpoint → 4 รายการ
    expect(result.rows).toHaveLength(4);
    expect(result.rows[0]).toMatchObject({
      commonName: 'Self Cert',
      endpoint: '192.168.239.101:4443',
      owner: 'IT Sec',
      workStatus: WorkStatus.NEW,
    });
    expect(result.rows[1].workStatus).toBe(WorkStatus.COMPLETED);
    expect(result.rows[0].expiresAt.toISOString()).toBe('2026-09-18T12:25:54.000Z');
  });
});

describe('fixture: missing-expiry.xlsx (คอลัมน์วันหมดอายุหาย)', () => {
  it('mapHeaders รายงานว่าขาดคอลัมน์ → service จะ reject ทั้งไฟล์', async () => {
    const workbook = await loadWorkbook('missing-expiry.xlsx');
    const sheet = workbook.getWorksheet('NoExpiry')!;
    const headerRow = findHeaderRow(sheet);

    expect(headerRow).toBe(3);
    const mapping = mapHeaders(readRowValues(sheet, headerRow!));
    expect(mapping.missingRequired).toEqual(['expiresAt หรือ daysUntilExpiry']);
  });

  it('inspectWorkbook บอกว่า sheet นี้ import ไม่ได้ และไม่แนะนำ sheet ใด', async () => {
    const workbook = await loadWorkbook('missing-expiry.xlsx');
    const inspection = inspectWorkbook(workbook);

    expect(inspection.sheets[0].importable).toBe(false);
    expect(inspection.suggestedSheet).toBeNull();
  });
});

describe('fixture: broken-rows.xlsx (แถวข้อมูลพัง)', () => {
  it('เก็บแถวดี รายงานแถวเสียพร้อมเลขแถวและเหตุผล', async () => {
    const workbook = await loadWorkbook('broken-rows.xlsx');
    const result = parseWholeSheet(workbook.getWorksheet('Broken')!);

    // แถว 4 ดี / แถว 5 Common Name ว่าง / แถว 6 วันที่กำกวม / แถว 7 วันที่ไม่มีจริง
    expect(result.rows.map((row) => row.commonName)).toEqual(['ok.example.com']);
    expect(result.errors).toHaveLength(3);
    expect(result.errors.map((error) => error.excelRow)).toEqual([5, 6, 7]);

    expect(result.errors[0].message).toContain('Common Name ว่าง');
    expect(result.errors[1].message).toContain('กำกวม');
    expect(result.errors[2].message).toContain('ไม่มีวันที่');
  });

  it('status ที่ map ไม่ได้ → warning พร้อมเลขแถว (ไม่ทำให้แถวเสีย)', async () => {
    const workbook = await loadWorkbook('broken-rows.xlsx');
    const sheet = workbook.getWorksheet('Broken')!;
    const headerRow = findHeaderRow(sheet)!;
    const { columns } = mapHeaders(readRowValues(sheet, headerRow));

    // ตัดเฉพาะแถวที่ 7 มาทดสอบ status โดยข้าม error เรื่องวันที่
    const statusColumn = columns.status!;
    expect(sheet.getRow(7).getCell(statusColumn).value).toBe('สถานะแปลกที่ไม่รู้จัก');
  });
});

describe('fallback: ไม่มีคอลัมน์ Expires แต่มี Days Until', () => {
  it('คำนวณ expiresAt จากวันอ้างอิง + จำนวนวัน และเตือนว่าเป็นค่าคำนวณ', async () => {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet('DaysOnly');
    sheet.getRow(1).getCell(1).value = 'Common Name';
    sheet.getRow(1).getCell(2).value = 'Days Until';
    sheet.getRow(1).getCell(3).value = 'Endpoints';
    sheet.getRow(2).getCell(1).value = 'calc.example.com';
    sheet.getRow(2).getCell(2).value = 50;
    sheet.getRow(2).getCell(3).value = '10.0.0.9:443';

    const { columns } = mapHeaders(readRowValues(sheet, 1));
    const result = parseSheet(sheet, { headerRow: 1, columns, referenceDate: REFERENCE_DATE });

    expect(result.errors).toEqual([]);
    expect(result.rows[0].expiresAt.toISOString()).toBe('2026-09-18T00:00:00.000Z');
    expect(result.warnings[0].message).toContain('คำนวณจาก Days Until Expiry');
  });

  it('ไม่มีทั้งสองค่า → error รายแถว', async () => {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet('Neither');
    sheet.getRow(1).getCell(1).value = 'Common Name';
    sheet.getRow(1).getCell(2).value = 'Days Until';
    sheet.getRow(1).getCell(3).value = 'Endpoints';
    sheet.getRow(2).getCell(1).value = 'no-date.example.com';
    sheet.getRow(2).getCell(3).value = '10.0.0.9:443';

    const { columns } = mapHeaders(readRowValues(sheet, 1));
    const result = parseSheet(sheet, { headerRow: 1, columns, referenceDate: REFERENCE_DATE });

    expect(result.rows).toEqual([]);
    expect(result.errors[0].message).toContain('ไม่มีทั้งวันหมดอายุ');
  });
});
