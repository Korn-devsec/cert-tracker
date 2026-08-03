import { WorkStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID, Matches } from 'class-validator';
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

  /**
   * สถานะงานต่ออายุ (ดูจาก task ล่าสุดของ cert แต่ละใบ)
   * ระบุแล้ว = นับเฉพาะ cert ที่อยู่ในสถานะนั้น เพื่อให้การ์ด/กราฟบน Dashboard
   * เปลี่ยนตามตัวกรองชุดเดียวกับตาราง (`GET /certificates?status=`)
   */
  @IsOptional()
  @IsEnum(WorkStatus, { message: 'status ไม่ใช่สถานะงานที่ระบบรู้จัก' })
  status?: WorkStatus;
}
