/**
 * แปลง error ของ `POST /imports` ให้หน้า Import แสดงได้ละเอียด
 *
 * api ตอบ 400 มาพร้อมโครงสร้าง (คอลัมน์ที่หาย, ชื่อ header ที่ยอมรับ, แถวที่พัง) ตามกฎเหล็กข้อ 3
 * — ต้องเอาข้อมูลนั้นขึ้นจอ ไม่ใช่แสดงแค่ "คำขอไม่สำเร็จ"
 */
import { ApiError } from './api';
import type { RowIssue } from './types';

export interface ImportRejection {
  message: string;
  sheetName?: string;
  headerRow?: number;
  /** คอลัมน์ที่จำเป็นแต่หาไม่เจอในไฟล์ */
  missingColumns?: string[];
  /** ชื่อ header ที่ระบบยอมรับของแต่ละฟิลด์ (ช่วยให้ผู้ใช้แก้ไฟล์ได้เอง) */
  acceptedHeaders?: Record<string, string[]>;
  /** header ที่เจอจริงในไฟล์ */
  headersFound?: string[];
  errors?: RowIssue[];
  warnings?: RowIssue[];
  /** กรณีระบุชื่อ sheet ผิด */
  availableSheets?: string[];
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value.filter((item): item is string => typeof item === 'string');
  return items.length > 0 ? items : undefined;
}

function asRowIssues(value: unknown): RowIssue[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const issues = value.filter(
    (item): item is RowIssue =>
      typeof item === 'object' &&
      item !== null &&
      'excelRow' in item &&
      typeof (item as { message?: unknown }).message === 'string',
  );
  return issues.length > 0 ? issues : undefined;
}

function asAcceptedHeaders(value: unknown): Record<string, string[]> | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const result: Record<string, string[]> = {};
  for (const [field, headers] of Object.entries(value)) {
    const list = asStringArray(headers);
    if (list !== undefined) {
      result[field] = list;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export function parseImportError(error: unknown): ImportRejection {
  if (!(error instanceof ApiError)) {
    return { message: error instanceof Error ? error.message : String(error) };
  }

  const details = error.details;
  if (typeof details !== 'object' || details === null) {
    return { message: error.message };
  }

  const body = details as Record<string, unknown>;
  return {
    message: error.message,
    sheetName: typeof body.sheetName === 'string' ? body.sheetName : undefined,
    headerRow: typeof body.headerRow === 'number' ? body.headerRow : undefined,
    missingColumns: asStringArray(body.missingColumns),
    acceptedHeaders: asAcceptedHeaders(body.acceptedHeaders),
    headersFound: asStringArray(body.headersFound),
    errors: asRowIssues(body.errors),
    warnings: asRowIssues(body.warnings),
    availableSheets: asStringArray(body.availableSheets),
  };
}
