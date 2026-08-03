import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HistoryAction, User, UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.types';
import { verifyPassword } from '../common/password';
import { HistoryService } from '../history/history.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

const admin: AuthenticatedUser = {
  id: 'admin-id',
  email: 'admin@example.com',
  name: 'ผู้ดูแลระบบ',
  role: UserRole.ADMIN,
};

function userRow(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'operator@example.com',
    name: 'สมชาย',
    role: UserRole.OPERATOR,
    passwordHash: 'scrypt$aaa$bbb',
    isActive: true,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  };
}

interface PrismaMock {
  user: { findMany: jest.Mock; findUnique: jest.Mock; update: jest.Mock; count: jest.Mock };
  $transaction: jest.Mock;
}

describe('UsersService', () => {
  let service: UsersService;
  let prisma: PrismaMock;
  let writeWithin: jest.Mock;

  beforeEach(async () => {
    prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        update: jest.fn().mockImplementation(({ data }: { data: object }) => ({
          ...userRow(),
          ...data,
        })),
        count: jest.fn().mockResolvedValue(1),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((callback: (tx: PrismaMock) => unknown) =>
      callback(prisma),
    );
    writeWithin = jest.fn();

    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: HistoryService, useValue: { writeWithin } },
      ],
    }).compile();

    service = moduleRef.get(UsersService);
  });

  describe('findAll', () => {
    it('ค่าเริ่มต้นคืนเฉพาะบัญชีที่ใช้งาน และไม่ดึง passwordHash ออกมา', async () => {
      await service.findAll({});

      const arg = prisma.user.findMany.mock.calls[0][0] as {
        where: { isActive?: boolean };
        select: Record<string, boolean>;
      };
      expect(arg.where.isActive).toBe(true);
      expect(arg.select.passwordHash).toBeUndefined();
      expect(arg.select.email).toBe(true);
    });

    it('includeInactive=true → เห็นบัญชีที่ปิดแล้วด้วย', async () => {
      await service.findAll({ includeInactive: 'true' });
      const arg = prisma.user.findMany.mock.calls[0][0] as { where: { isActive?: boolean } };
      expect(arg.where.isActive).toBeUndefined();
    });

    it('กรอง role และค้นหาชื่อ/อีเมลแบบไม่สนตัวพิมพ์', async () => {
      await service.findAll({ role: UserRole.OPERATOR, search: 'som' });

      const arg = prisma.user.findMany.mock.calls[0][0] as {
        where: { role: UserRole; OR: unknown[] };
      };
      expect(arg.where.role).toBe(UserRole.OPERATOR);
      expect(arg.where.OR).toEqual([
        { name: { contains: 'som', mode: 'insensitive' } },
        { email: { contains: 'som', mode: 'insensitive' } },
      ]);
    });
  });

  describe('update', () => {
    it('ไม่พบผู้ใช้ → 404', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.update('user-1', { name: 'x' }, admin)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('แก้ชื่อ/role → อัปเดตและลง HistoryLog พร้อมค่าก่อน-หลัง', async () => {
      prisma.user.findUnique.mockResolvedValue(userRow());

      await service.update('user-1', { name: '  สมหญิง  ', role: UserRole.ADMIN }, admin);

      const updateArg = prisma.user.update.mock.calls[0][0] as {
        data: { name: string; role: UserRole };
      };
      expect(updateArg.data.name).toBe('สมหญิง');
      expect(updateArg.data.role).toBe(UserRole.ADMIN);

      const history = writeWithin.mock.calls[0][1] as {
        action: HistoryAction;
        actor: string;
        metadata: { changes: Record<string, unknown> };
      };
      expect(history.action).toBe(HistoryAction.USER_UPDATED);
      expect(history.actor).toBe(admin.email);
      expect(history.metadata.changes).toMatchObject({
        role: { from: UserRole.OPERATOR, to: UserRole.ADMIN },
      });
    });

    it('ตั้งรหัสผ่านใหม่ → เก็บเป็น hash ไม่ใช่ข้อความจริง และประวัติไม่มีรหัสผ่าน', async () => {
      prisma.user.findUnique.mockResolvedValue(userRow());

      await service.update('user-1', { password: 'NewPassw0rd!2569' }, admin);

      const updateArg = prisma.user.update.mock.calls[0][0] as {
        data: { passwordHash: string };
      };
      expect(updateArg.data.passwordHash).not.toContain('NewPassw0rd');
      await expect(verifyPassword('NewPassw0rd!2569', updateArg.data.passwordHash)).resolves.toBe(
        true,
      );
      expect(JSON.stringify(writeWithin.mock.calls[0][1])).not.toContain('NewPassw0rd');
    });

    it('ไม่ส่งฟิลด์อะไรมาเลย → ไม่แตะ DB และไม่ลงประวัติ', async () => {
      prisma.user.findUnique.mockResolvedValue(userRow());

      const result = await service.update('user-1', {}, admin);

      expect(result).not.toHaveProperty('passwordHash');
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(writeWithin).not.toHaveBeenCalled();
    });

    it('ปิดใช้งานบัญชีตัวเอง → 403 (กันล็อกตัวเองออกจากระบบ)', async () => {
      prisma.user.findUnique.mockResolvedValue(userRow({ id: admin.id, role: UserRole.ADMIN }));

      await expect(service.update(admin.id, { isActive: false }, admin)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('ลดสิทธิ์ตัวเอง → 403', async () => {
      prisma.user.findUnique.mockResolvedValue(userRow({ id: admin.id, role: UserRole.ADMIN }));

      await expect(
        service.update(admin.id, { role: UserRole.VIEWER }, admin),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('ปิดผู้ดูแลคนสุดท้าย → 400 (ระบบต้องมี admin ที่ใช้งานได้เสมอ)', async () => {
      prisma.user.findUnique.mockResolvedValue(
        userRow({ id: 'other-admin', role: UserRole.ADMIN }),
      );
      prisma.user.count.mockResolvedValue(0);

      await expect(
        service.update('other-admin', { isActive: false }, admin),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('ปิดผู้ดูแลได้ถ้ายังมี admin คนอื่นที่ใช้งานอยู่', async () => {
      prisma.user.findUnique.mockResolvedValue(
        userRow({ id: 'other-admin', role: UserRole.ADMIN }),
      );
      prisma.user.count.mockResolvedValue(2);

      await service.update('other-admin', { isActive: false }, admin);

      expect(prisma.user.update).toHaveBeenCalled();
    });

    it('เปลี่ยน role ของ operator ไม่ต้องตรวจจำนวน admin', async () => {
      prisma.user.findUnique.mockResolvedValue(userRow());

      await service.update('user-1', { role: UserRole.VIEWER }, admin);

      expect(prisma.user.count).not.toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalled();
    });
  });
});
