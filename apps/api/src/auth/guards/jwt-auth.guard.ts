import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser, JwtPayload } from '../auth.types';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}

/**
 * ตรวจ Bearer token ทุก request (ลงทะเบียนเป็น global guard ใน AppModule)
 * ยกเว้น endpoint ที่ติด @Public()
 *
 * token ปลอม/หมดอายุ/ผิด secret → 401 (JwtService.verifyAsync throw)
 * ทุกครั้งจะ query user จาก DB ซ้ำ เพื่อให้บัญชีที่ถูกปิดใช้งานใช้ token เดิมต่อไม่ได้
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = this.extractToken(request);
    if (token === null) {
      throw new UnauthorizedException('ไม่พบ access token');
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('token ไม่ถูกต้องหรือหมดอายุแล้ว');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });
    if (user === null || !user.isActive) {
      throw new UnauthorizedException('บัญชีผู้ใช้ไม่พร้อมใช้งาน');
    }

    request.user = { id: user.id, email: user.email, name: user.name, role: user.role };
    return true;
  }

  private extractToken(request: Request): string | null {
    const header = request.headers.authorization;
    if (header === undefined) {
      return null;
    }
    const [scheme, token] = header.split(' ');
    return scheme?.toLowerCase() === 'bearer' && token ? token : null;
  }
}
