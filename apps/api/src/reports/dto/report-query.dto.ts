import { WorkStatus } from '@prisma/client';
import { RiskLevel } from '@cert-tracker/shared';
import { Transform } from 'class-transformer';
import { IsBooleanString, IsEnum, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import { MONTH_PATTERN } from '../../common/expiry-filter';

/** ตัวกรองของรายงานรายเดือน (เทียบกับเดือนก่อนหน้า) */
export class MonthlyReportDto {
  @IsOptional()
  @IsUUID('4', { message: 'companyId ต้องเป็น UUID' })
  companyId?: string;

  /** ไม่ระบุ = เดือนปัจจุบัน */
  @IsOptional()
  @Matches(MONTH_PATTERN, { message: 'month ต้องอยู่ในรูปแบบ YYYY-MM เช่น 2026-07' })
  month?: string;
}

/**
 * ตัวกรองของไฟล์ Export — ชุดเดียวกับหน้า Certificates เพื่อให้ไฟล์ที่ได้
 * ตรงกับสิ่งที่ผู้ใช้เห็นบนจอ (เกณฑ์ตรวจรับ Phase 8)
 */
export class ExportCertificatesDto {
  @IsOptional()
  @IsUUID('4', { message: 'companyId ต้องเป็น UUID' })
  companyId?: string;

  @IsOptional()
  @Matches(MONTH_PATTERN, { message: 'month ต้องอยู่ในรูปแบบ YYYY-MM เช่น 2026-07' })
  month?: string;

  @IsOptional()
  @IsEnum(RiskLevel, { message: 'risk ต้องเป็น HIGH | MEDIUM | LOW | SAFE' })
  risk?: RiskLevel;

  @IsOptional()
  @IsEnum(WorkStatus, { message: 'status ไม่ใช่สถานะงานที่ระบบรู้จัก' })
  status?: WorkStatus;

  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  search?: string;

  @IsOptional()
  @IsBooleanString({ message: 'expired ต้องเป็น true หรือ false' })
  expired?: string;

  @IsOptional()
  @IsBooleanString({ message: 'includeInactive ต้องเป็น true หรือ false' })
  includeInactive?: string;
}
