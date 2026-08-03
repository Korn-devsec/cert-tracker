import { UserRole } from '@prisma/client';
import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'อีเมลไม่ถูกต้อง' })
  email!: string;

  @IsString()
  @MinLength(1, { message: 'ต้องกรอกชื่อผู้ใช้' })
  name!: string;

  @IsString()
  @MinLength(8, { message: 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร' })
  password!: string;

  @IsEnum(UserRole, { message: 'role ต้องเป็น ADMIN, OPERATOR หรือ VIEWER' })
  role!: UserRole;
}
