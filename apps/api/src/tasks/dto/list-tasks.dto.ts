import { RiskLevel } from '@cert-tracker/shared';
import { WorkStatus } from '@prisma/client';
import { IsBooleanString, IsEnum, IsIn, IsOptional, IsUUID, Matches } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { MONTH_PATTERN } from '../../common/expiry-filter';

/** `expiresAt` = เรียงตามวันหมดอายุของ certificate (ค่าเริ่มต้น — งานที่ใกล้หมดอายุขึ้นก่อน) */
export const TASK_SORT_FIELDS = ['expiresAt', 'dueDate', 'createdAt', 'updatedAt'] as const;
export type TaskSortField = (typeof TASK_SORT_FIELDS)[number];

export class ListTasksDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID('4', { message: 'companyId ต้องเป็น UUID' })
  companyId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'certificateId ต้องเป็น UUID' })
  certificateId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'assigneeId ต้องเป็น UUID' })
  assigneeId?: string;

  @IsOptional()
  @IsEnum(WorkStatus, { message: 'status ไม่ใช่สถานะงานที่ระบบรู้จัก' })
  status?: WorkStatus;

  /** `true` = เฉพาะงานที่ยังไม่ปิด (ไม่รวม Completed/Cancelled) */
  @IsOptional()
  @IsBooleanString({ message: 'open ต้องเป็น true หรือ false' })
  open?: string;

  /** ความเสี่ยงของ certificate ที่งานนั้นดูแล */
  @IsOptional()
  @IsEnum(RiskLevel, { message: 'risk ต้องเป็น HIGH | MEDIUM | LOW | SAFE' })
  risk?: RiskLevel;

  /** เดือนที่ certificate หมดอายุ รูปแบบ `YYYY-MM` */
  @IsOptional()
  @Matches(MONTH_PATTERN, { message: 'month ต้องอยู่ในรูปแบบ YYYY-MM เช่น 2026-07' })
  month?: string;

  @IsOptional()
  @IsIn(TASK_SORT_FIELDS, { message: `sortBy ต้องเป็นหนึ่งใน ${TASK_SORT_FIELDS.join(', ')}` })
  sortBy?: TaskSortField;

  @IsOptional()
  @IsIn(['asc', 'desc'], { message: 'order ต้องเป็น asc หรือ desc' })
  order?: 'asc' | 'desc';
}
