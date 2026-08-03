import { UserRole } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBooleanString, IsEnum, IsOptional, IsString } from 'class-validator';

export class ListUsersDto {
  /** ค่าเริ่มต้น: เฉพาะบัญชีที่ยังใช้งาน (หน้ามอบหมายงานต้องไม่เห็นบัญชีที่ปิดแล้ว) */
  @IsOptional()
  @IsBooleanString({ message: 'includeInactive ต้องเป็น true หรือ false' })
  includeInactive?: string;

  @IsOptional()
  @IsEnum(UserRole, { message: 'role ต้องเป็น ADMIN | OPERATOR | VIEWER' })
  role?: UserRole;

  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  search?: string;
}
