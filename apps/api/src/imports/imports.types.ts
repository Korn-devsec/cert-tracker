import { ImportStatus } from '@prisma/client';
import type { RowIssue } from './excel/row-parser';
import type { SheetInspection } from './excel/sheet-inspector';

export interface ImportResult {
  /** id ของ ImportBatch — null เมื่อเป็น dryRun (ไม่บันทึกอะไร) */
  batchId: string | null;
  dryRun: boolean;
  status: ImportStatus;
  companyId: string;
  filename: string;
  sheetName: string;
  headerRow: number;
  /** จำนวนแถวข้อมูลใน sheet (ไม่นับแถวว่าง) */
  scannedRows: number;
  /** จำนวนรายการ certificate หลังแตก endpoint และตัดซ้ำ */
  rowCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  tasksCreated: number;
  errors: RowIssue[];
  warnings: RowIssue[];
  /** ตัวอย่างข้อมูลที่จะบันทึก — ใช้ให้หน้า Import แสดง preview ก่อน confirm */
  preview: ImportPreviewRow[];
}

export interface ImportPreviewRow {
  excelRow: number;
  commonName: string;
  endpoint: string;
  expiresAt: string;
  daysUntilExpiry: number;
  riskLevel: string;
  owner: string | null;
  issuer: string | null;
  workStatus: string | null;
  /** รายการนี้จะถูกสร้างใหม่หรืออัปเดตของเดิม */
  action: 'create' | 'update';
}

export interface InspectResult {
  filename: string;
  sheets: SheetInspection[];
  suggestedSheet: string | null;
}
