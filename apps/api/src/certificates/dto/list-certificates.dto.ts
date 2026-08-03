import { RiskLevel } from '@cert-tracker/shared';
import { WorkStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBooleanString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { MONTH_PATTERN } from '../../common/expiry-filter';

/** เรียงได้เฉพาะคอลัมน์จริงใน DB — `daysUntilExpiry` เรียงเทียบเท่า `expiresAt` อยู่แล้ว */
export const CERTIFICATE_SORT_FIELDS = [
  'expiresAt',
  'commonName',
  'createdAt',
  'updatedAt',
] as const;
export type CertificateSortField = (typeof CERTIFICATE_SORT_FIELDS)[number];

export class ListCertificatesDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID('4', { message: 'companyId ต้องเป็น UUID' })
  companyId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'siteId ต้องเป็น UUID' })
  siteId?: string;

  /** ระดับความเสี่ยง — ถูกแปลงเป็นช่วงวันหมดอายุก่อน query (ไม่ได้กรองใน JS) */
  @IsOptional()
  @IsEnum(RiskLevel, { message: 'risk ต้องเป็น HIGH | MEDIUM | LOW | SAFE' })
  risk?: RiskLevel;

  /** สถานะงานต่ออายุ = สถานะของ task **ล่าสุด** ของ cert นั้น */
  @IsOptional()
  @IsEnum(WorkStatus, { message: 'status ไม่ใช่สถานะงานที่ระบบรู้จัก' })
  status?: WorkStatus;

  /** เดือนที่หมดอายุ รูปแบบ `YYYY-MM` */
  @IsOptional()
  @Matches(MONTH_PATTERN, { message: 'month ต้องอยู่ในรูปแบบ YYYY-MM เช่น 2026-07' })
  month?: string;

  /** ค้นจาก Common Name / endpoint / owner / issuer */
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  search?: string;

  /** `true` = เฉพาะ cert ที่หมดอายุแล้ว (ตัวเลข Expired บน Dashboard กดดูรายการได้) */
  @IsOptional()
  @IsBooleanString({ message: 'expired ต้องเป็น true หรือ false' })
  expired?: string;

  @IsOptional()
  @IsBooleanString({ message: 'includeInactive ต้องเป็น true หรือ false' })
  includeInactive?: string;

  @IsOptional()
  @IsIn(CERTIFICATE_SORT_FIELDS, {
    message: `sortBy ต้องเป็นหนึ่งใน ${CERTIFICATE_SORT_FIELDS.join(', ')}`,
  })
  sortBy?: CertificateSortField;

  @IsOptional()
  @IsIn(['asc', 'desc'], { message: 'order ต้องเป็น asc หรือ desc' })
  order?: 'asc' | 'desc';
}
