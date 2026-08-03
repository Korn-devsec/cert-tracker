import { UserRole } from '@prisma/client';

/** payload ที่ใส่ลงใน JWT — ห้ามใส่ข้อมูลอ่อนไหว (token ถอดอ่านได้) */
export interface JwtPayload {
  /** user id */
  sub: string;
  email: string;
  role: UserRole;
}

/** ข้อมูลผู้ใช้ที่ guard แนบไว้กับ request และส่งออก API (ไม่มี passwordHash) */
export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface LoginResult {
  accessToken: string;
  expiresIn: string;
  user: AuthenticatedUser;
}
