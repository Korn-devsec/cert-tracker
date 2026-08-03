import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateCompanyDto {
  @IsString()
  @MinLength(1, { message: 'ต้องกรอกชื่อบริษัท' })
  @MaxLength(200)
  name!: string;

  /** รหัสย่อบริษัท ใช้อ้างอิงตอนเลือกบริษัทก่อน import — ห้ามซ้ำ */
  @IsString()
  @MinLength(2, { message: 'รหัสบริษัทต้องยาวอย่างน้อย 2 ตัวอักษร' })
  @MaxLength(20)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'รหัสบริษัทใช้ได้เฉพาะ A-Z, 0-9, ขีดกลาง และขีดล่าง',
  })
  code!: string;

  @IsOptional()
  @IsEmail({}, { message: 'อีเมลผู้ติดต่อไม่ถูกต้อง' })
  contactEmail?: string;
}
