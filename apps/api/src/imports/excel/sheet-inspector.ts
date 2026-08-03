/**
 * ค้นหา sheet และแถว header เอง — ห้าม assume ว่า header อยู่แถวแรก
 * (ไฟล์จริงมี sheet หน้าปกชื่อ "Report" และ header อยู่แถว 3)
 */
import type { Workbook, Worksheet } from 'exceljs';
import { cleanText, type RawCellValue } from './cell-parsers';
import { countMappedFields, mapHeaders } from './header-mapping';

/** จำนวนแถวแรกสุดที่จะสแกนหา header (ไฟล์จริงอยู่แถว 3 — เผื่อไว้ถึง 20) */
export const MAX_HEADER_SCAN_ROWS = 20;
/** ต้อง map ฟิลด์ได้อย่างน้อยเท่านี้จึงนับว่าเป็นแถว header (กันแถวข้อมูลถูกเข้าใจผิด) */
const MIN_MAPPED_FIELDS = 3;

export interface SheetInspection {
  name: string;
  /** ลำดับ sheet ในไฟล์ (1-based) */
  index: number;
  /** แถวที่เจอ header — null = ไม่เจอ (เช่น sheet หน้าปก) */
  headerRow: number | null;
  /** ชื่อ header ดิบที่อ่านได้จากแถวนั้น */
  headers: string[];
  /** ฟิลด์บังคับที่หาย — ว่าง = sheet นี้ import ได้ */
  missingRequired: string[];
  /** จำนวนฟิลด์ที่ map ได้ — sheet ที่ map ได้มากกว่ามีข้อมูลครบกว่า */
  mappedFieldCount: number;
  /** จำนวนแถวที่มีข้อมูล (ไม่นับ header ขึ้นไป และไม่นับแถวว่าง) */
  dataRowCount: number;
  /** import จาก sheet นี้ได้หรือไม่ */
  importable: boolean;
}

export interface WorkbookInspection {
  sheets: SheetInspection[];
  /** sheet ที่ระบบแนะนำ (คะแนนดีที่สุด) — null = ไม่มี sheet ไหน import ได้ */
  suggestedSheet: string | null;
}

/** อ่านค่าดิบทั้งแถวเป็น array (index 0 = คอลัมน์ 1) */
export function readRowValues(worksheet: Worksheet, rowNumber: number): Array<string | null> {
  const row = worksheet.getRow(rowNumber);
  const columnCount = Math.max(worksheet.columnCount, row.cellCount);
  const values: Array<string | null> = [];
  for (let column = 1; column <= columnCount; column++) {
    values.push(cleanText(row.getCell(column).value as RawCellValue));
  }
  return values;
}

/** แถวนี้ว่างทั้งแถวหรือไม่ (ไฟล์จริงมีแถวว่างคั่นและท้าย sheet) */
export function isRowEmpty(worksheet: Worksheet, rowNumber: number): boolean {
  return readRowValues(worksheet, rowNumber).every((value) => value === null);
}

/**
 * แถวนี้เป็น "header ที่ซ้ำ" หรือไม่
 *
 * sheet `Report` ในไฟล์จริงมี header ถูก merge ในแนวตั้ง ทำให้อ่านค่าเดิมได้ทั้งแถว 7 และแถว 8
 * ถ้าไม่ข้ามแถวที่ซ้ำ จะได้ certificate ปลอมชื่อ "Common Name" เข้าฐานข้อมูล
 * (รายงานที่แบ่งหน้าแล้วพิมพ์ header ซ้ำกลางตารางก็เข้าเคสนี้)
 */
export function isRepeatedHeaderRow(
  rowValues: ReadonlyArray<string | null>,
  headerValues: ReadonlyArray<string | null>,
): boolean {
  const headerSet = new Set(
    headerValues.filter((value): value is string => value !== null).map((value) => value.trim()),
  );
  if (headerSet.size === 0) {
    return false;
  }
  const cells = rowValues.filter((value): value is string => value !== null);
  return cells.length >= 2 && cells.every((value) => headerSet.has(value.trim()));
}

/**
 * หาแถว header: เลือกแถวที่ map ฟิลด์ได้มากที่สุดใน MAX_HEADER_SCAN_ROWS แถวแรก
 * ถ้ามีหลายแถวคะแนนเท่ากัน เลือกแถวบนสุด
 */
export function findHeaderRow(worksheet: Worksheet): number | null {
  const limit = Math.min(worksheet.rowCount, MAX_HEADER_SCAN_ROWS);
  let best: { row: number; score: number } | null = null;

  for (let rowNumber = 1; rowNumber <= limit; rowNumber++) {
    const score = countMappedFields(readRowValues(worksheet, rowNumber));
    if (score >= MIN_MAPPED_FIELDS && (best === null || score > best.score)) {
      best = { row: rowNumber, score };
    }
  }
  return best?.row ?? null;
}

function countDataRows(worksheet: Worksheet, headerRow: number): number {
  const headerValues = readRowValues(worksheet, headerRow);
  let count = 0;
  for (let rowNumber = headerRow + 1; rowNumber <= worksheet.rowCount; rowNumber++) {
    if (isRowEmpty(worksheet, rowNumber)) {
      continue;
    }
    if (isRepeatedHeaderRow(readRowValues(worksheet, rowNumber), headerValues)) {
      continue;
    }
    count++;
  }
  return count;
}

export function inspectSheet(worksheet: Worksheet, index: number): SheetInspection {
  const headerRow = findHeaderRow(worksheet);
  if (headerRow === null) {
    return {
      name: worksheet.name,
      index,
      headerRow: null,
      headers: [],
      missingRequired: ['ไม่พบแถว header ที่รู้จักใน sheet นี้'],
      mappedFieldCount: 0,
      dataRowCount: 0,
      importable: false,
    };
  }

  const headers = readRowValues(worksheet, headerRow);
  const mapping = mapHeaders(headers);

  return {
    name: worksheet.name,
    index,
    headerRow,
    headers: headers.filter((value): value is string => value !== null),
    missingRequired: mapping.missingRequired,
    mappedFieldCount: Object.keys(mapping.columns).length,
    dataRowCount: countDataRows(worksheet, headerRow),
    importable: mapping.missingRequired.length === 0,
  };
}

/**
 * สำรวจทุก sheet ในไฟล์ พร้อมแนะนำ sheet ที่น่าจะเป็นข้อมูล
 *
 * เกณฑ์แนะนำ (เรียงตามลำดับ): map ฟิลด์ได้มากที่สุด → มีแถวข้อมูลมากที่สุด → อยู่ต้นไฟล์ก่อน
 * "map ได้มากที่สุด" มาก่อนเพราะไฟล์จริงมี sheet สรุป (`Report`) ที่มีคอลัมน์ครบพอ import ได้
 * แต่ขาด Owner/Status ซึ่งเป็นข้อมูลที่ต้องใช้ — sheet รายเดือนจึงควรถูกเลือกก่อน
 *
 * การเดาไม่มีทางถูกทุกไฟล์ จึงคืน `sheets` ทั้งหมดมาให้ผู้ใช้เลือกเองได้เสมอ
 */
export function inspectWorkbook(workbook: Workbook): WorkbookInspection {
  const sheets: SheetInspection[] = [];
  let position = 0;
  workbook.eachSheet((worksheet) => {
    position++;
    sheets.push(inspectSheet(worksheet, position));
  });

  const suggested = sheets
    .filter((sheet) => sheet.importable && sheet.dataRowCount > 0)
    .sort(
      (a, b) =>
        b.mappedFieldCount - a.mappedFieldCount ||
        b.dataRowCount - a.dataRowCount ||
        a.index - b.index,
    )[0];

  return { sheets, suggestedSheet: suggested?.name ?? null };
}
