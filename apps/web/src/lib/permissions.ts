/**
 * สิทธิ์บนหน้าจอ — ต้องตรงกับ `@Roles()` ของ api (ดู DECISIONS.md Phase 2)
 *
 * นี่เป็นเพียงการซ่อน/ปิดปุ่มให้ผู้ใช้ไม่ต้องเจอ 403 เปล่าๆ — **ตัวบังคับจริงอยู่ที่ api เสมอ**
 */
import { UserRole } from '@cert-tracker/shared';
import type { AuthUser } from './types';

function hasRole(user: AuthUser | null, ...roles: UserRole[]): boolean {
  return user !== null && roles.includes(user.role);
}

/** สร้าง/แก้ไข/ปิดใช้งานบริษัท และจัดการผู้ใช้ = ADMIN เท่านั้น */
export function canManageCompanies(user: AuthUser | null): boolean {
  return hasRole(user, UserRole.ADMIN);
}

export function canManageUsers(user: AuthUser | null): boolean {
  return hasRole(user, UserRole.ADMIN);
}

/** นำเข้าไฟล์ / เปลี่ยนสถานะงาน / มอบหมาย / แนบไฟล์ = ADMIN + OPERATOR */
export function canOperate(user: AuthUser | null): boolean {
  return hasRole(user, UserRole.ADMIN, UserRole.OPERATOR);
}

/** ดูรายชื่อผู้ใช้ (ใช้ทำ dropdown ผู้รับผิดชอบ) = ADMIN + OPERATOR */
export function canListUsers(user: AuthUser | null): boolean {
  return hasRole(user, UserRole.ADMIN, UserRole.OPERATOR);
}
