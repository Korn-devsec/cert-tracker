import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth.types';
import { RolesGuard } from './roles.guard';

function buildContext(user: AuthenticatedUser | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

function buildGuard(requiredRoles: UserRole[] | undefined): RolesGuard {
  const reflector = { getAllAndOverride: () => requiredRoles } as unknown as Reflector;
  return new RolesGuard(reflector);
}

const viewer: AuthenticatedUser = {
  id: 'v1',
  email: 'viewer@example.com',
  name: 'Viewer',
  role: UserRole.VIEWER,
};

describe('RolesGuard', () => {
  it('endpoint ที่ไม่ประกาศ @Roles() → ทุก role ที่ login แล้วผ่าน (การอ่านข้อมูล)', () => {
    expect(buildGuard(undefined).canActivate(buildContext(viewer))).toBe(true);
    expect(buildGuard([]).canActivate(buildContext(viewer))).toBe(true);
  });

  it('viewer เรียก endpoint ที่ต้องเป็น ADMIN → 403', () => {
    const guard = buildGuard([UserRole.ADMIN]);
    expect(() => guard.canActivate(buildContext(viewer))).toThrow(ForbiddenException);
  });

  it('role ตรงกับที่ต้องการ → ผ่าน', () => {
    const guard = buildGuard([UserRole.ADMIN, UserRole.OPERATOR]);
    const operator: AuthenticatedUser = { ...viewer, role: UserRole.OPERATOR };
    expect(guard.canActivate(buildContext(operator))).toBe(true);
  });

  it('ไม่มี user ใน request → 403 (กันกรณีลืมลำดับ guard)', () => {
    const guard = buildGuard([UserRole.ADMIN]);
    expect(() => guard.canActivate(buildContext(undefined))).toThrow(ForbiddenException);
  });
});
