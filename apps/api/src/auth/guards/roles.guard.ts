import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import type { Request } from 'express';
import { AuthenticatedUser } from '../auth.types';
import { ROLES_KEY } from '../decorators/roles.decorator';

interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}

/**
 * บังคับสิทธิ์ตาม @Roles(...) — ทำงานหลัง JwtAuthGuard
 * endpoint ที่ไม่ประกาศ @Roles() ถือว่าเป็นการอ่าน ผู้ใช้ที่ login แล้วเข้าได้ทุก role
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (requiredRoles === undefined || requiredRoles.length === 0) {
      return true;
    }

    const user = context.switchToHttp().getRequest<RequestWithUser>().user;
    if (user === undefined) {
      // ไม่ควรเกิด เพราะ JwtAuthGuard ทำงานก่อน — กันกรณีลืมลำดับ guard
      throw new ForbiddenException('ไม่พบข้อมูลผู้ใช้ในคำขอ');
    }

    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException(
        `สิทธิ์ไม่เพียงพอ — ต้องเป็น ${requiredRoles.join(' หรือ ')} แต่บัญชีนี้เป็น ${user.role}`,
      );
    }
    return true;
  }
}
