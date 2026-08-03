/**
 * Enums กลางของระบบ — ใช้ร่วมกันทั้ง api และ web
 * (Prisma schema ใน Phase 1 จะประกาศ enum ชื่อ/ค่าเดียวกันเพื่อให้ตรงกัน)
 */

/**
 * ระดับความเสี่ยงของ Certificate — คำนวณอัตโนมัติจาก daysUntilExpiry เท่านั้น
 * ห้ามให้ผู้ใช้แก้ตรงๆ และห้ามรวมกับ WorkStatus (กฎเหล็กข้อ 5)
 *
 * เกณฑ์: <30 = HIGH | 31-60 = MEDIUM | 61-90 = LOW | >90 = SAFE
 * ฟังก์ชัน calculateRisk() จะถูกเพิ่มใน Phase 1 พร้อม unit test ครอบขอบเขต
 */
export enum RiskLevel {
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
  SAFE = 'SAFE',
}

/**
 * สถานะงานต่ออายุ (workflow ที่คนอัปเดต) — คนละเรื่องกับ RiskLevel
 * New → Assigned → In Progress → Waiting Vendor ⇄ Waiting CA → Testing → Completed
 * ยกเลิกได้ทุกขั้น → Cancelled
 */
export enum WorkStatus {
  NEW = 'NEW',
  ASSIGNED = 'ASSIGNED',
  IN_PROGRESS = 'IN_PROGRESS',
  WAITING_VENDOR = 'WAITING_VENDOR',
  WAITING_CA = 'WAITING_CA',
  TESTING = 'TESTING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

/**
 * ขั้นของการแจ้งเตือนแบบขั้นบันได
 * 90 วัน = Email | 60 วัน = Email + LINE | 30 วัน = Critical | <=7 วัน = แจ้งทุกวัน
 */
export enum NotificationTier {
  DAY_90 = 'DAY_90',
  DAY_60 = 'DAY_60',
  DAY_30 = 'DAY_30',
  DAY_7 = 'DAY_7',
}

/** ช่องทางแจ้งเตือน */
export enum NotificationChannel {
  EMAIL = 'EMAIL',
  LINE = 'LINE',
}

/**
 * ชนิดของ action ที่ต้องบันทึกลง HistoryLog (กฎเหล็กข้อ 6)
 * ทุกรายการต้องมี actor, timestamp, detail
 */
export enum HistoryAction {
  // import
  IMPORT = 'IMPORT',
  // master data
  COMPANY_CREATED = 'COMPANY_CREATED',
  COMPANY_UPDATED = 'COMPANY_UPDATED',
  COMPANY_DEACTIVATED = 'COMPANY_DEACTIVATED',
  SITE_CREATED = 'SITE_CREATED',
  SITE_UPDATED = 'SITE_UPDATED',
  SITE_DELETED = 'SITE_DELETED',
  // ผู้ใช้ — เก็บไว้ตรวจย้อนหลังว่าใครเปิด/แก้บัญชีให้ใคร
  USER_CREATED = 'USER_CREATED',
  USER_UPDATED = 'USER_UPDATED',
  // certificate
  CERTIFICATE_CREATED = 'CERTIFICATE_CREATED',
  CERTIFICATE_UPDATED = 'CERTIFICATE_UPDATED',
  // renewal workflow
  TASK_CREATED = 'TASK_CREATED',
  ASSIGN = 'ASSIGN',
  STATUS_CHANGE = 'STATUS_CHANGE',
  CONTACT_VENDOR = 'CONTACT_VENDOR',
  CSR_GENERATED = 'CSR_GENERATED',
  CERTIFICATE_ISSUED = 'CERTIFICATE_ISSUED',
  INSTALL = 'INSTALL',
  VERIFY = 'VERIFY',
  COMPLETE = 'COMPLETE',
  CANCEL = 'CANCEL',
  // อื่นๆ
  ATTACHMENT_UPLOADED = 'ATTACHMENT_UPLOADED',
  NOTIFICATION_SENT = 'NOTIFICATION_SENT',
}

/** สิทธิ์ผู้ใช้ (RBAC) */
export enum UserRole {
  ADMIN = 'ADMIN',
  OPERATOR = 'OPERATOR',
  VIEWER = 'VIEWER',
}

/** สถานะของ ImportBatch */
export enum ImportStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  PARTIAL = 'PARTIAL',
  FAILED = 'FAILED',
}
