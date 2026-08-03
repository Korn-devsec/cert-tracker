import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/** แปลงค่าจาก multipart (ได้เป็น string เสมอ) ให้เป็น boolean */
const toBoolean = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') {
    return value;
  }
  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no'].includes(normalized)) {
    return false;
  }
  return value;
};

export class CreateImportDto {
  /** กฎเหล็กข้อ 4: ต้องเลือกบริษัทก่อน import เสมอ */
  @IsUUID('4', { message: 'companyId ต้องเป็น UUID ของบริษัทที่มีอยู่' })
  companyId!: string;

  /** ไม่ระบุ = ใช้ sheet ที่ระบบ auto-suggest */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  sheetName?: string;

  /**
   * strict (ค่าเริ่มต้น true): มีแถวเสียแม้แถวเดียว → reject ทั้งไฟล์
   * false: บันทึกแถวที่ใช้ได้ และรายงานแถวที่เสียเป็น error ใน ImportBatch
   */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean({ message: 'strict ต้องเป็น true หรือ false' })
  strict?: boolean;

  /** ตรวจและ preview อย่างเดียว ไม่บันทึกลง DB (หน้า Import ใช้ก่อน confirm) */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean({ message: 'dryRun ต้องเป็น true หรือ false' })
  dryRun?: boolean;
}
