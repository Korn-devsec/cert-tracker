import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { HistoryAction, User, UserRole } from '@prisma/client';
import { hashPassword } from '../common/password';
import { HistoryService } from '../history/history.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { AuthenticatedUser } from './auth.types';

const PASSWORD = 'S3cret-Passw0rd!';

interface PrismaMock {
  user: {
    findUnique: jest.Mock;
    create: jest.Mock;
  };
}

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaMock;
  let historyWrite: jest.Mock;
  let activeUser: User;

  const admin: AuthenticatedUser = {
    id: 'admin-id',
    email: 'admin@example.com',
    name: 'Admin',
    role: UserRole.ADMIN,
  };

  beforeEach(async () => {
    activeUser = {
      id: 'user-id',
      email: 'operator@example.com',
      name: 'Operator',
      role: UserRole.OPERATOR,
      passwordHash: await hashPassword(PASSWORD),
      isActive: true,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    };

    prisma = { user: { findUnique: jest.fn(), create: jest.fn() } };
    historyWrite = jest.fn();

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: { signAsync: jest.fn().mockResolvedValue('signed.jwt') } },
        { provide: ConfigService, useValue: { get: (): string => '1d' } },
        { provide: HistoryService, useValue: { write: historyWrite } },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  describe('login', () => {
    it('รหัสผ่านถูก → ได้ token และข้อมูลผู้ใช้ (ไม่มี passwordHash)', async () => {
      prisma.user.findUnique.mockResolvedValue(activeUser);

      const result = await service.login({ email: activeUser.email, password: PASSWORD });

      expect(result.accessToken).toBe('signed.jwt');
      expect(result.user).toEqual({
        id: activeUser.id,
        email: activeUser.email,
        name: activeUser.name,
        role: UserRole.OPERATOR,
      });
      expect(JSON.stringify(result)).not.toContain('passwordHash');
    });

    it('normalize อีเมล (ตัดช่องว่าง + เป็นตัวพิมพ์เล็ก) ก่อนค้นหา', async () => {
      prisma.user.findUnique.mockResolvedValue(activeUser);

      await service.login({ email: '  OPERATOR@Example.COM ', password: PASSWORD });

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'operator@example.com' },
      });
    });

    it('รหัสผ่านผิด → 401', async () => {
      prisma.user.findUnique.mockResolvedValue(activeUser);
      await expect(
        service.login({ email: activeUser.email, password: 'wrong-password' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('ไม่มีผู้ใช้ → 401 ด้วยข้อความเดียวกับรหัสผ่านผิด (ไม่บอกว่าอีเมลมีในระบบหรือไม่)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const wrongPassword = service
        .login({ email: activeUser.email, password: 'wrong-password' })
        .catch((error: Error) => error.message);
      prisma.user.findUnique.mockResolvedValue(null);
      const noUser = service
        .login({ email: 'ghost@example.com', password: PASSWORD })
        .catch((error: Error) => error.message);

      expect(await noUser).toBe(await wrongPassword);
    });

    it('บัญชีถูกปิดใช้งาน → 401 แม้รหัสผ่านถูก', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...activeUser, isActive: false });
      await expect(
        service.login({ email: activeUser.email, password: PASSWORD }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('register', () => {
    it('สร้างผู้ใช้ใหม่ → hash รหัสผ่าน และลง HistoryLog', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation(
        ({ data }: { data: Omit<User, 'id' | 'isActive' | 'createdAt' | 'updatedAt'> }) =>
          Promise.resolve({ ...activeUser, ...data, id: 'new-user-id' }),
      );

      const result = await service.register(
        {
          email: 'Viewer@Example.com',
          name: '  ผู้ดูข้อมูล  ',
          password: PASSWORD,
          role: UserRole.VIEWER,
        },
        admin,
      );

      const createArg = prisma.user.create.mock.calls[0][0] as {
        data: { email: string; name: string; passwordHash: string };
      };
      expect(createArg.data.email).toBe('viewer@example.com');
      expect(createArg.data.name).toBe('ผู้ดูข้อมูล');
      expect(createArg.data.passwordHash).not.toBe(PASSWORD);
      expect(createArg.data.passwordHash.startsWith('scrypt$')).toBe(true);

      expect(historyWrite).toHaveBeenCalledWith(
        expect.objectContaining({
          action: HistoryAction.USER_CREATED,
          actor: admin.email,
          actorId: admin.id,
        }),
      );
      expect(result.id).toBe('new-user-id');
    });

    it('อีเมลซ้ำ → 409', async () => {
      prisma.user.findUnique.mockResolvedValue(activeUser);
      await expect(
        service.register(
          { email: activeUser.email, name: 'ซ้ำ', password: PASSWORD, role: UserRole.VIEWER },
          admin,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(historyWrite).not.toHaveBeenCalled();
    });
  });
});
