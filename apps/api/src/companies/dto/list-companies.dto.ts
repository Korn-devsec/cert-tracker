import { Transform } from 'class-transformer';
import { IsBooleanString, IsOptional, IsString } from 'class-validator';

export class ListCompaniesDto {
  /** ค่าเริ่มต้น: คืนเฉพาะบริษัทที่ยังใช้งาน — ส่ง `includeInactive=true` เพื่อดูที่ปิดไปแล้วด้วย */
  @IsOptional()
  @IsBooleanString({ message: 'includeInactive ต้องเป็น true หรือ false' })
  includeInactive?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  search?: string;
}
