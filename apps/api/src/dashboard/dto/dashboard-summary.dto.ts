import { IsOptional, IsUUID, Matches } from 'class-validator';
import { MONTH_PATTERN } from '../../common/expiry-filter';

export class DashboardSummaryDto {
  /** ไม่ระบุ = รวมทุกบริษัท (มุมมองภาพรวมของผู้ดูแล) */
  @IsOptional()
  @IsUUID('4', { message: 'companyId ต้องเป็น UUID' })
  companyId?: string;

  /** เดือนที่หมดอายุ รูปแบบ `YYYY-MM` (ค.ศ.) — frontend แปลงเป็น พ.ศ. ตอนแสดง */
  @IsOptional()
  @Matches(MONTH_PATTERN, { message: 'month ต้องอยู่ในรูปแบบ YYYY-MM เช่น 2026-07' })
  month?: string;
}
