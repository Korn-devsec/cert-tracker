import {
  IsDateString,
  IsDefined,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class AssignTaskDto {
  /** id ผู้รับผิดชอบ — ส่ง `null` เพื่อถอนการมอบหมาย */
  @IsDefined({ message: 'ต้องระบุ assigneeId (ส่ง null เพื่อถอนการมอบหมาย)' })
  @ValidateIf((dto: AssignTaskDto) => dto.assigneeId !== null)
  @IsUUID('4', { message: 'assigneeId ต้องเป็น UUID หรือ null' })
  assigneeId!: string | null;

  @IsOptional()
  @IsDateString({}, { message: 'dueDate ต้องเป็นวันที่รูปแบบ ISO เช่น 2026-09-01' })
  dueDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'note ยาวได้ไม่เกิน 1000 ตัวอักษร' })
  note?: string;
}
