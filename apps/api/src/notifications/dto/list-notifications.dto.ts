import { NotificationChannel, NotificationTier } from '@prisma/client';
import { IsBooleanString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ListNotificationsDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID('4', { message: 'certificateId ต้องเป็น UUID' })
  certificateId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'companyId ต้องเป็น UUID' })
  companyId?: string;

  @IsOptional()
  @IsEnum(NotificationTier, { message: 'tier ต้องเป็น DAY_90 | DAY_60 | DAY_30 | DAY_7' })
  tier?: NotificationTier;

  @IsOptional()
  @IsEnum(NotificationChannel, { message: 'channel ต้องเป็น EMAIL หรือ LINE' })
  channel?: NotificationChannel;

  /** `false` = ดูเฉพาะรายการที่ส่งไม่สำเร็จ (ใช้ตามงานที่ต้องส่งซ้ำ) */
  @IsOptional()
  @IsBooleanString({ message: 'isSuccess ต้องเป็น true หรือ false' })
  isSuccess?: string;
}
