import { UserRole } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'ชื่อต้องมีอย่างน้อย 2 ตัวอักษร' })
  name?: string;

  @IsOptional()
  @IsEnum(UserRole, { message: 'role ต้องเป็น ADMIN | OPERATOR | VIEWER' })
  role?: UserRole;

  /** false = ปิดใช้งานบัญชี (token ที่ออกไปแล้วใช้ต่อไม่ได้ทันที เพราะ guard ตรวจ DB ทุก request) */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** ตั้งรหัสผ่านใหม่ให้ผู้ใช้ (ผู้ดูแลรีเซ็ตให้) */
  @IsOptional()
  @IsString()
  @MinLength(12, { message: 'รหัสผ่านต้องมีอย่างน้อย 12 ตัวอักษร' })
  password?: string;
}
