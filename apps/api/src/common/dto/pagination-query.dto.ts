import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { MAX_PAGE_SIZE, type PaginationInput } from '../pagination';

/** DTO กลางที่ query ของรายการยาวทุกตัว extend ต่อ */
export class PaginationQueryDto implements PaginationInput {
  /** เริ่มที่ 1 (ไม่ใช่ 0) เพื่อให้ตรงกับเลขหน้าที่ผู้ใช้เห็น */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page ต้องเป็นจำนวนเต็ม' })
  @Min(1, { message: 'page ต้องเริ่มที่ 1' })
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pageSize ต้องเป็นจำนวนเต็ม' })
  @Min(1)
  @Max(MAX_PAGE_SIZE, { message: `pageSize มากสุด ${MAX_PAGE_SIZE}` })
  pageSize?: number;
}
