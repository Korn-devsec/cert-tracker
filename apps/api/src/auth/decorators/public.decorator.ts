import { SetMetadata, CustomDecorator } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'auth:isPublic';

/** ยกเว้น endpoint นี้จาก JwtAuthGuard ที่ทำงานแบบ global (เช่น login, health) */
export const Public = (): CustomDecorator<string> => SetMetadata(IS_PUBLIC_KEY, true);
