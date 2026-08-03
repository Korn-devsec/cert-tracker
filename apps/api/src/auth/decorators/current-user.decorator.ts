import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { AuthenticatedUser } from '../auth.types';

interface RequestWithUser {
  user?: AuthenticatedUser;
}

/** ดึงผู้ใช้ที่ login อยู่จาก request (JwtAuthGuard แนบไว้ให้) */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser | undefined =>
    context.switchToHttp().getRequest<RequestWithUser>().user,
);
