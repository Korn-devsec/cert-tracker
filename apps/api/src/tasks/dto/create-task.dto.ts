import { IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * เปิดงานต่ออายุด้วยมือ — ปกติ import สร้างให้อัตโนมัติแล้ว
 * แต่ต้องเปิดเองได้สำหรับ cert ที่ import ตอนยังปลอดภัย (risk = Safe) หรือรอบต่ออายุใหม่
 */
export class CreateTaskDto {
  @IsUUID('4', { message: 'certificateId ต้องเป็น UUID' })
  certificateId!: string;

  @IsOptional()
  @IsUUID('4', { message: 'assigneeId ต้องเป็น UUID' })
  assigneeId?: string;

  @IsOptional()
  @IsDateString({}, { message: 'dueDate ต้องเป็นวันที่รูปแบบ ISO เช่น 2026-09-01' })
  dueDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'note ยาวได้ไม่เกิน 1000 ตัวอักษร' })
  note?: string;
}
