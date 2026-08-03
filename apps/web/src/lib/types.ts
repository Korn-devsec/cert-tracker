/**
 * รูปร่างข้อมูลที่ api ส่งมา (คัดมาเฉพาะฟิลด์ที่หน้าจอใช้)
 *
 * กฎเหล็กข้อ 1: ข้อมูลทั้งหมดมาจาก API เท่านั้น — ไฟล์นี้มีแต่ "ชนิดข้อมูล" ไม่มีค่าจริงของ certificate
 * enum ใช้จาก `@cert-tracker/shared` ไม่ประกาศซ้ำ เพื่อให้ค่าตรงกับฝั่ง api เสมอ
 */
import type { RiskLevel, UserRole, WorkStatus } from '@cert-tracker/shared';

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  /** เวลาที่ api ใช้เป็นฐานคำนวณความเสี่ยงของชุดข้อมูลนี้ */
  asOf: string;
}

export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface LoginResponse {
  accessToken: string;
  expiresIn: string;
  user: AuthUser;
}

export interface Company {
  id: string;
  name: string;
  code: string;
  contactEmail: string | null;
  isActive: boolean;
}

export interface TaskSummary {
  id: string;
  status: WorkStatus;
  assigneeId: string | null;
  dueDate: string | null;
  assignee?: { id: string; name: string; email: string } | null;
}

export interface CertificateListItem {
  id: string;
  companyId: string;
  commonName: string;
  endpoint: string;
  owner: string | null;
  issuer: string | null;
  expiresAt: string;
  /** คำนวณสดจาก api ตอน query — ไม่ใช่ค่าที่เก็บไว้ */
  daysUntilExpiry: number;
  riskLevel: RiskLevel;
  isExpired: boolean;
  company: { id: string; name: string; code: string };
  site: { id: string; name: string } | null;
  currentTask: TaskSummary | null;
}

export interface CompanyDetail extends Company {
  sites: Array<{ id: string; name: string }>;
  _count: { certificates: number; sites: number };
}

export interface UserAccount {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
}

export interface HistoryLogEntry {
  id: string;
  action: string;
  actor: string;
  detail: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface Attachment {
  id: string;
  certificateId: string;
  filename: string;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedBy: string;
  createdAt: string;
}

export interface RenewalTask {
  id: string;
  certificateId: string;
  status: WorkStatus;
  assigneeId: string | null;
  dueDate: string | null;
  note: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskDetailView extends RenewalTask {
  assignee: { id: string; name: string; email: string; role: UserRole } | null;
}

/** 1 แถวในหน้า Tasks — มีข้อมูล cert พร้อมความเสี่ยงที่คำนวณสด */
export interface TaskListItem extends TaskDetailView {
  certificate: {
    id: string;
    commonName: string;
    endpoint: string;
    expiresAt: string;
    owner: string | null;
    daysUntilExpiry: number;
    riskLevel: RiskLevel;
    isExpired: boolean;
    company: { id: string; name: string; code: string };
  };
}

/** หน้า Certificate Detail: ข้อมูลเทคนิคครบ + งานทุกรอบ + ประวัติ + ไฟล์แนบ */
export interface CertificateDetail extends CertificateListItem {
  /** endpoint นี้คืน task แบบเต็ม (มี note/createdAt) ไม่ใช่แบบย่อเหมือนในตาราง */
  currentTask: TaskDetailView | null;
  san: string[];
  serialNumber: string | null;
  signatureAlgorithm: string | null;
  keySize: number | null;
  sha256Fingerprint: string | null;
  remark: string | null;
  issuedAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  renewalTasks: TaskDetailView[];
  attachments: Attachment[];
  historyLogs: HistoryLogEntry[];
}

// ===== นำเข้าข้อมูล =====

export interface SheetInspection {
  name: string;
  headerRow: number | null;
  dataRowCount: number;
  mappedFieldCount: number;
  importable: boolean;
  missingRequired: string[];
}

export interface ImportInspectResult {
  filename: string;
  sheets: SheetInspection[];
  suggestedSheet: string | null;
}

export interface RowIssue {
  excelRow: number;
  column?: string;
  message: string;
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
  action: 'create' | 'update';
}

export interface ImportResult {
  batchId: string | null;
  dryRun: boolean;
  status: string;
  companyId: string;
  filename: string;
  sheetName: string;
  headerRow: number;
  scannedRows: number;
  rowCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  tasksCreated: number;
  errors: RowIssue[];
  warnings: RowIssue[];
  preview: ImportPreviewRow[];
}

export interface ImportBatchSummary {
  id: string;
  filename: string;
  sheetName: string | null;
  importedBy: string;
  rowCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  status: string;
  createdAt: string;
  company: { code: string; name: string };
}

export interface RiskStatusBreakdown {
  done: number;
  pending: number;
  cancelled: number;
}

export interface DashboardSummary {
  asOf: string;
  companyId: string | null;
  month: string | null;
  status: WorkStatus | null;
  total: number;
  byRisk: Record<RiskLevel, number>;
  byStatus: Record<WorkStatus, number>;
  byRiskStatus: Record<RiskLevel, RiskStatusBreakdown>;
  noTask: number;
  expiringSoon: number;
  expired: number;
  completed: number;
  pending: number;
  cancelled: number;
}
