import { WorkStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateTaskStatusDto {
  @IsEnum(WorkStatus, {
    message: `status ต้องเป็นหนึ่งใน ${Object.values(WorkStatus).join(', ')}`,
  })
  status!: WorkStatus;

  /** เหตุผล/รายละเอียดของการเปลี่ยนสถานะ — เก็บทั้งในงานและในประวัติ */
  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'note ยาวได้ไม่เกิน 1000 ตัวอักษร' })
  note?: string;
}
