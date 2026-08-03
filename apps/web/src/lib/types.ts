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
