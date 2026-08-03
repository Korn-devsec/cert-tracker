/**
 * ป้ายกำกับภาษาไทยสำหรับแสดงบน UI และในรายงาน Export
 * (UI ภาษาไทยเป็นหลักตาม Design System — เก็บไว้ที่นี่เพื่อให้ api และ web ใช้ชุดเดียวกัน)
 */
import { ImportStatus, NotificationTier, RiskLevel, UserRole, WorkStatus } from './enums';

export const RISK_LEVEL_LABEL_TH: Record<RiskLevel, string> = {
  [RiskLevel.HIGH]: 'ความเสี่ยงสูง',
  [RiskLevel.MEDIUM]: 'ความเสี่ยงกลาง',
  [RiskLevel.LOW]: 'ความเสี่ยงต่ำ',
  [RiskLevel.SAFE]: 'ปลอดภัย',
};

export const WORK_STATUS_LABEL_TH: Record<WorkStatus, string> = {
  [WorkStatus.NEW]: 'รายการใหม่',
  [WorkStatus.ASSIGNED]: 'มอบหมายแล้ว',
  [WorkStatus.IN_PROGRESS]: 'อยู่ระหว่างดำเนินการ',
  [WorkStatus.WAITING_VENDOR]: 'รอผู้ให้บริการ',
  [WorkStatus.WAITING_CA]: 'รอ CA ออกใบรับรอง',
  [WorkStatus.TESTING]: 'อยู่ระหว่างทดสอบ',
  [WorkStatus.COMPLETED]: 'เรียบร้อยแล้ว',
  [WorkStatus.CANCELLED]: 'ยกเลิก',
};

export const NOTIFICATION_TIER_LABEL_TH: Record<NotificationTier, string> = {
  [NotificationTier.DAY_90]: 'แจ้งเตือนล่วงหน้า 90 วัน',
  [NotificationTier.DAY_60]: 'แจ้งเตือนล่วงหน้า 60 วัน',
  [NotificationTier.DAY_30]: 'แจ้งเตือนด่วน 30 วัน',
  [NotificationTier.DAY_7]: 'แจ้งเตือนวิกฤต 7 วัน',
};

export const USER_ROLE_LABEL_TH: Record<UserRole, string> = {
  [UserRole.ADMIN]: 'ผู้ดูแลระบบ',
  [UserRole.OPERATOR]: 'ผู้ปฏิบัติงาน',
  [UserRole.VIEWER]: 'ผู้ดูข้อมูล',
};

export const IMPORT_STATUS_LABEL_TH: Record<ImportStatus, string> = {
  [ImportStatus.PENDING]: 'กำลังประมวลผล',
  [ImportStatus.SUCCESS]: 'สำเร็จ',
  [ImportStatus.PARTIAL]: 'สำเร็จบางส่วน',
  [ImportStatus.FAILED]: 'ไม่สำเร็จ',
};
