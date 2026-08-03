/**
 * Header Mapping — กฎเหล็กข้อ 2: อ่านข้อมูลจาก "ชื่อ header" เท่านั้น ห้ามอ้างตำแหน่งคอลัมน์
 *
 * ไฟล์จริงที่ต้องรองรับ (docs/samples/30-July-2026.xlsx):
 *   sheet Jul ใช้ `No`   / `Owner`
 *   sheet Jun ใช้ `No.`  / `Onwer`  ← typo ของจริง
 * การเทียบชื่อจึงต้อง trim + ไม่สนตัวพิมพ์ + ตัดจุด/ทวิภาคท้ายชื่อออก
 */

import { collapseWhitespace } from './text';

/** ฟิลด์ปลายทางใน Certificate ที่ import รู้จัก */
export type CertificateField =
  | 'commonName'
  | 'endpoint'
  | 'expiresAt'
  | 'daysUntilExpiry'
  | 'issuer'
  | 'signatureAlgorithm'
  | 'owner'
  | 'status'
  | 'remark'
  | 'serialNumber'
  | 'keySize'
  | 'sha256Fingerprint'
  | 'san';

/**
 * ชื่อ header ที่ยอมรับ → ฟิลด์ปลายทาง (คีย์ต้องเป็นรูป normalize แล้ว)
 * เพิ่ม alias ใหม่ได้ที่นี่ที่เดียว
 */
const HEADER_ALIASES: Record<string, CertificateField> = {
  // commonName
  'common name': 'commonName',
  'certificate name': 'commonName',
  'cert name': 'commonName',
  cn: 'commonName',
  // endpoint
  endpoints: 'endpoint',
  endpoint: 'endpoint',
  url: 'endpoint',
  host: 'endpoint',
  // expiresAt
  expires: 'expiresAt',
  'expiry date': 'expiresAt',
  'expire date': 'expiresAt',
  expiration: 'expiresAt',
  'expiration date': 'expiresAt',
  'not after': 'expiresAt',
  'valid to': 'expiresAt',
  // daysUntilExpiry
  'days until': 'daysUntilExpiry',
  'days until expiry': 'daysUntilExpiry',
  'days until expiration': 'daysUntilExpiry',
  'days left': 'daysUntilExpiry',
  'days remaining': 'daysUntilExpiry',
  // issuer
  issuer: 'issuer',
  ca: 'issuer',
  // signatureAlgorithm
  'signing algorithm': 'signatureAlgorithm',
  'signature algorithm': 'signatureAlgorithm',
  algorithm: 'signatureAlgorithm',
  // owner
  owner: 'owner',
  onwer: 'owner', // typo ที่พบในไฟล์จริง sheet Jun
  'owner name': 'owner',
  // status / remark
  status: 'status',
  สถานะ: 'status',
  remark: 'remark',
  remarks: 'remark',
  note: 'remark',
  notes: 'remark',
  หมายเหตุ: 'remark',
  // ฟิลด์เทคนิคที่ไฟล์จริงยังไม่มี แต่รองรับไว้ให้ไฟล์อื่น
  'serial number': 'serialNumber',
  serial: 'serialNumber',
  'key size': 'keySize',
  keysize: 'keySize',
  sha256: 'sha256Fingerprint',
  'sha256 fingerprint': 'sha256Fingerprint',
  fingerprint: 'sha256Fingerprint',
  san: 'san',
  sans: 'san',
  'subject alternative name': 'san',
};

/** header ที่รู้จักแต่ไม่ต้อง import (ลำดับที่ในรายงาน) */
const IGNORED_HEADERS = new Set(['no', '#', 'index', 'ลำดับ', 'ที่']);

/**
 * ฟิลด์ที่ขาดไม่ได้: ต้องมี commonName และต้องรู้วันหมดอายุอย่างน้อยทางใดทางหนึ่ง
 * (ถ้าไม่มี `expires` แต่มี `days until` จะคำนวณ expiresAt จากวันที่ import)
 */
export const REQUIRED_FIELDS = ['commonName'] as const;
export const REQUIRED_EITHER_FIELDS = ['expiresAt', 'daysUntilExpiry'] as const;

/**
 * ทำให้ชื่อ header เทียบกันได้: trim, ตัวพิมพ์เล็ก, ยุบช่องว่างซ้ำ (รวม non-breaking space),
 * ตัดจุด/ทวิภาค/ขีดล่างท้ายชื่อ เช่น `No.` → `no`, `Days  Until ` → `days until`
 */
export function normalizeHeaderName(raw: string): string {
  return collapseWhitespace(raw)
    .toLowerCase()
    .replace(/[.:_]+$/, '')
    .trim();
}

export interface HeaderMappingResult {
  /** ฟิลด์ → เลขคอลัมน์ (1-based ตาม ExcelJS) */
  columns: Partial<Record<CertificateField, number>>;
  /** header ที่ไม่รู้จัก — รายงานเป็น warning ไม่ทำให้ import ล้ม */
  unknownHeaders: Array<{ column: number; name: string }>;
  /** header ที่ map ไปฟิลด์เดียวกันซ้ำ — ใช้คอลัมน์แรก ที่เหลือเป็น warning */
  duplicateFields: Array<{ field: CertificateField; column: number; name: string }>;
  /** ฟิลด์บังคับที่หาย — ถ้าไม่ว่างต้อง reject ทั้งไฟล์ */
  missingRequired: string[];
}

/**
 * แปลงแถว header เป็น mapping ฟิลด์ → คอลัมน์
 * @param headerRow ค่าที่อ่านได้จากแถว header (index 0 = คอลัมน์ 1)
 */
export function mapHeaders(headerRow: ReadonlyArray<string | null>): HeaderMappingResult {
  const columns: Partial<Record<CertificateField, number>> = {};
  const unknownHeaders: HeaderMappingResult['unknownHeaders'] = [];
  const duplicateFields: HeaderMappingResult['duplicateFields'] = [];

  headerRow.forEach((rawValue, index) => {
    const column = index + 1;
    if (rawValue === null) {
      return;
    }
    const name = normalizeHeaderName(rawValue);
    if (name.length === 0 || IGNORED_HEADERS.has(name)) {
      return;
    }

    const field = HEADER_ALIASES[name];
    if (field === undefined) {
      unknownHeaders.push({ column, name: rawValue.trim() });
      return;
    }

    if (columns[field] !== undefined) {
      duplicateFields.push({ field, column, name: rawValue.trim() });
      return;
    }
    columns[field] = column;
  });

  const missingRequired: string[] = [];
  for (const field of REQUIRED_FIELDS) {
    if (columns[field] === undefined) {
      missingRequired.push(field);
    }
  }
  if (REQUIRED_EITHER_FIELDS.every((field) => columns[field] === undefined)) {
    missingRequired.push(REQUIRED_EITHER_FIELDS.join(' หรือ '));
  }

  return { columns, unknownHeaders, duplicateFields, missingRequired };
}

/** จำนวนฟิลด์ที่ map ได้ — ใช้ให้คะแนนว่าแถวไหน/sheet ไหนน่าจะเป็นแถว header */
export function countMappedFields(headerRow: ReadonlyArray<string | null>): number {
  return Object.keys(mapHeaders(headerRow).columns).length;
}

/** ชื่อ header ที่ระบบยอมรับสำหรับฟิลด์หนึ่ง — ใช้ประกอบข้อความ error ให้ผู้ใช้แก้ไฟล์ได้ */
export function acceptedHeadersFor(field: CertificateField): string[] {
  return Object.entries(HEADER_ALIASES)
    .filter(([, mapped]) => mapped === field)
    .map(([alias]) => alias);
}
