import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * ไม่ให้แก้ `code` เพราะเป็นรหัสอ้างอิงที่ผู้ใช้เลือกตอน import
 * ถ้าเปลี่ยนภายหลังจะทำให้ประวัติการ import ย้อนหลังอ่านไม่รู้เรื่อง
 */
export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsEmail({}, { message: 'อีเมลผู้ติดต่อไม่ถูกต้อง' })
  contactEmail?: string;

  /** ใช้เปิดใช้งานบริษัทที่เคยปิดไว้ (การปิดใช้ DELETE) */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
