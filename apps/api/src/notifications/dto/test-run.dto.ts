import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class TestRunDto {
  /** จำกัดเฉพาะบริษัทเดียว — ไม่ระบุ = สแกนทุกบริษัทที่ยังใช้งาน */
  @IsOptional()
  @IsUUID('4', { message: 'companyId ต้องเป็น UUID' })
  companyId?: string;

  /**
   * `true` = ดูผลล่วงหน้าเท่านั้น ไม่ส่งและไม่บันทึก `NotificationLog`
   * (ใช้ตรวจว่าจะแจ้งใครบ้างก่อนสั่งจริง — ไม่กระทบตัวกันซ้ำ)
   */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === true || value === 'true')
  @IsBoolean()
  preview?: boolean;
}
