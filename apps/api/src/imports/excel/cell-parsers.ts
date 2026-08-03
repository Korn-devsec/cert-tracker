/**
 * แปลงค่าดิบจากเซลล์ Excel เป็นค่าที่ใช้งานได้ พร้อมบอกเหตุผลเมื่อแปลงไม่ได้
 * (ไม่ throw — ผู้เรียกเก็บ error ไว้รายงานเป็นรายแถว)
 */

import { collapseWhitespace } from './text';

/** ค่าที่ ExcelJS คืนมาได้ในเซลล์หนึ่ง (เท่าที่ import ต้องรองรับ) */
export type RawCellValue =
  | string
  | number
  | boolean
  | Date
  | null
  | undefined
  | { richText: Array<{ text: string }> }
  | { text: string }
  | { formula?: string; result?: string | number | Date | null }
  | { error: string };

/** ดึงข้อความจากเซลล์ (รองรับ richText / hyperlink / formula ที่ ExcelJS คืนเป็น object) */
export function cellToString(value: RawCellValue): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if ('richText' in value) {
    return value.richText.map((part) => part.text).join('');
  }
  if ('error' in value) {
    return null;
  }
  if ('result' in value) {
    const result = value.result;
    if (result === null || result === undefined) {
      return null;
    }
    return result instanceof Date ? result.toISOString() : String(result);
  }
  if ('text' in value) {
    return value.text;
  }
  return null;
}

/** trim + ยุบช่องว่างซ้ำ; คืน null ถ้าเหลือค่าว่าง */
export function cleanText(value: RawCellValue): string | null {
  const text = cellToString(value);
  if (text === null) {
    return null;
  }
  const cleaned = collapseWhitespace(text);
  return cleaned.length === 0 ? null : cleaned;
}

/** วันที่ 1900-01-01 ในระบบ serial ของ Excel (ใช้แปลง serial → Date) */
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 86_400_000;
/** ช่วง serial ที่สมเหตุสมผล: ~1950 ถึง ~2150 (กันเลขทั่วไปถูกตีความเป็นวันที่) */
const MIN_EXCEL_SERIAL = 18_264;
const MAX_EXCEL_SERIAL = 91_313;

const ISO_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;
/** รูปแบบที่ไม่กำกวม เช่น 18-Sep-2026 / 18 Sep 2026 */
const DAY_MONTHNAME_YEAR = /^(\d{1,2})[- ]([A-Za-z]{3,})[- ](\d{4})$/;

const MONTH_NAMES: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

export interface ParseResult<T> {
  value: T | null;
  /** เหตุผลที่แปลงไม่ได้ (ภาษาไทย เพื่อแสดงให้ผู้ใช้แก้ไฟล์) */
  error?: string;
}

/**
 * แปลงเซลล์เป็นวันที่ (UTC)
 *
 * รองรับ:
 *  - Date object (เซลล์ที่ Excel จัดรูปแบบเป็นวันที่ — ExcelJS คืนเป็น Date)
 *  - ISO 8601 เช่น `2026-09-18T12:25:54` (ไฟล์จริงเป็นแบบนี้ และเป็น string ไม่ใช่ Date cell)
 *    **ไม่มี timezone = ตีความเป็น UTC** เพราะ notAfter ใน X.509 เป็น UTC เสมอ
 *  - ISO ที่มี Z หรือ offset → เคารพ offset นั้น
 *  - `18-Sep-2026` / `18 Sep 2026`
 *  - Excel serial number
 *
 * **ไม่รองรับ** `18/09/2026` เพราะกำกวมกับ `09/18/2026` — เดาผิดแล้วได้วันหมดอายุผิด
 * ซึ่งอันตรายกว่าการแจ้ง error ให้คนแก้ไฟล์
 */
export function parseExcelDate(value: RawCellValue): ParseResult<Date> {
  if (value === null || value === undefined) {
    return { value: null };
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? { value: null, error: 'วันที่ในเซลล์ไม่ถูกต้อง' }
      : { value };
  }

  if (typeof value === 'number') {
    if (value < MIN_EXCEL_SERIAL || value > MAX_EXCEL_SERIAL) {
      return {
        value: null,
        error: `ค่า "${value}" ไม่อยู่ในช่วงที่เป็นวันที่ของ Excel ได้`,
      };
    }
    return { value: new Date(EXCEL_EPOCH_UTC + Math.round(value * MS_PER_DAY)) };
  }

  const text = cleanText(value);
  if (text === null) {
    return { value: null };
  }

  const isoMatch = ISO_DATE_TIME.exec(text);
  if (isoMatch !== null) {
    const [, year, month, day, hour, minute, second, offset] = isoMatch;
    if (offset === undefined) {
      // ไม่มี timezone → ตีความเป็น UTC (ห้ามใช้ new Date(text) เพราะจะกลายเป็นเวลาเครื่อง)
      const parsed = Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour ?? '0'),
        Number(minute ?? '0'),
        Number(second ?? '0'),
      );
      return validateParsed(parsed, text, {
        year: Number(year),
        month: Number(month),
        day: Number(day),
      });
    }
    const parsed = Date.parse(text);
    return Number.isNaN(parsed)
      ? { value: null, error: `แปลงวันที่ "${text}" ไม่ได้` }
      : { value: new Date(parsed) };
  }

  const nameMatch = DAY_MONTHNAME_YEAR.exec(text);
  if (nameMatch !== null) {
    const [, day, monthName, year] = nameMatch;
    const month = MONTH_NAMES[monthName.toLowerCase()];
    if (month === undefined) {
      return { value: null, error: `ไม่รู้จักชื่อเดือน "${monthName}" ในค่า "${text}"` };
    }
    return validateParsed(Date.UTC(Number(year), month, Number(day)), text, {
      year: Number(year),
      month: month + 1,
      day: Number(day),
    });
  }

  return {
    value: null,
    error:
      `แปลงวันที่ "${text}" ไม่ได้ — รองรับรูปแบบ 2026-09-18, 2026-09-18T12:25:54 หรือ 18-Sep-2026 ` +
      '(รูปแบบ 18/09/2026 ไม่รองรับเพราะกำกวมกับเดือน/วันสลับกัน)',
  };
}

/** กันวันที่เกินจริง เช่น 2026-02-31 ที่ Date.UTC จะเลื่อนไปเดือนถัดไปเงียบๆ */
function validateParsed(
  timestamp: number,
  text: string,
  expected: { year: number; month: number; day: number },
): ParseResult<Date> {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return { value: null, error: `แปลงวันที่ "${text}" ไม่ได้` };
  }
  if (
    date.getUTCFullYear() !== expected.year ||
    date.getUTCMonth() + 1 !== expected.month ||
    date.getUTCDate() !== expected.day
  ) {
    return { value: null, error: `ไม่มีวันที่ "${text}" อยู่จริงในปฏิทิน` };
  }
  return { value: date };
}

/** แปลงเป็นจำนวนเต็ม (ใช้กับ Days Until Expiry และ Key Size) */
export function parseInteger(value: RawCellValue): ParseResult<number> {
  if (value === null || value === undefined) {
    return { value: null };
  }
  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? { value: Math.round(value) }
      : { value: null, error: `ค่า "${String(value)}" ไม่ใช่จำนวนที่ใช้ได้` };
  }
  const text = cleanText(value);
  if (text === null) {
    return { value: null };
  }
  // รองรับตัวคั่นหลักพัน เช่น "2,048"
  const normalized = text.replace(/,/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
    return { value: null, error: `ค่า "${text}" ไม่ใช่ตัวเลข` };
  }
  return { value: Math.round(Number(normalized)) };
}

/**
 * แยก endpoint หลายค่าในเซลล์เดียว
 * ไฟล์จริงคั่นด้วย newline — รองรับ comma / semicolon / ช่องว่างหลายตัวด้วย
 * คืน [] เมื่อเซลล์ว่าง (cert ที่ไม่ระบุ endpoint ยัง import ได้ โดยใช้ endpoint = "")
 */
export function splitEndpoints(value: RawCellValue): string[] {
  const text = cellToString(value);
  if (text === null) {
    return [];
  }
  const parts = text
    .split(/[\r\n;,]+|\s{2,}/)
    .map((part) => collapseWhitespace(part))
    .filter((part) => part.length > 0);

  // ตัดค่าซ้ำในเซลล์เดียวกันออก แต่คงลำดับเดิม
  return [...new Set(parts)];
}

/** แยก SAN (คอลัมน์นี้ไฟล์จริงยังไม่มี แต่ Data Model รองรับ `san[]`) */
export function splitSan(value: RawCellValue): string[] {
  return splitEndpoints(value);
}
