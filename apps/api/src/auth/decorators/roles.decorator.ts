import { SetMetadata, CustomDecorator } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const ROLES_KEY = 'auth:roles';

/**
 * จำกัดสิทธิ์ตาม role — ไม่ใส่ = ผู้ใช้ที่ login แล้วทุก role เข้าได้ (อ่านข้อมูล)
 * viewer จะทำได้แค่อ่าน เพราะทุก endpoint ที่แก้ข้อมูลต้องมี @Roles(...)
 */
export const Roles = (...roles: UserRole[]): CustomDecorator<string> =>
  SetMetadata(ROLES_KEY, roles);
