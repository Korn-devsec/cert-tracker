import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Company, HistoryAction, UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.types';
import { HistoryService } from '../history/history.service';
import { PrismaService } from '../prisma/prisma.service';
import { CompaniesService } from './companies.service';

const admin: AuthenticatedUser = {
  id: 'admin-id',
  email: 'admin@example.com',
  name: 'Admin',
  role: UserRole.ADMIN,
};

const baseCompany: Company = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'SME Bank',
  code: 'SMEBANK',
  contactEmail: 'it@smebank.example.co.th',
  isActive: true,
  createdAt: new Date('2026-08-01T00:00:00.000Z'),
  updatedAt: new Date('2026-08-01T00:00:00.000Z'),
};

interface PrismaMock {
  company: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  $transaction: jest.Mock;
}

describe('CompaniesService', () => {
  let service: CompaniesService;
  let prisma: PrismaMock;
  let writeWithin: jest.Mock;

  beforeEach(async () => {
    prisma = {
      company: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([baseCompany]),
        create: jest.fn(),
        update: jest.fn(),
      },
      // ให้ callback ทำงานกับ mock ตัวเดียวกัน เพื่อตรวจว่า mutation + history อยู่ใน transaction เดียว
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((callback: (tx: PrismaMock) => unknown) =>
      callback(prisma),
    );
    writeWithin = jest.fn();

    const moduleRef = await Test.createTestingModule({
      providers: [
        CompaniesService,
        { provide: PrismaService, useValue: prisma },
        { provide: HistoryService, useValue: { writeWithin } },
      ],
    }).compile();

    service = moduleRef.get(CompaniesService);
  });

  describe('findAll', () => {
    it('ค่าเริ่มต้นคืนเฉพาะบริษัทที่ยังใช้งาน', async () => {
      await service.findAll({});
      expect(prisma.company.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      });
    });

    it('includeInactive=true → ไม่กรอง isActive', async () => {
      await service.findAll({ includeInactive: 'true' });
      expect(prisma.company.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { name: 'asc' },
      });
    });

    it('search → ค้นทั้งชื่อและรหัสแบบไม่สนตัวพิมพ์', async () => {
      await service.findAll({ search: 'sme' });
      const arg = prisma.company.findMany.mock.calls[0][0] as {
        where: { OR: unknown[] };
      };
      expect(arg.where.OR).toEqual([
        { name: { contains: 'sme', mode: 'insensitive' } },
        { code: { contains: 'sme', mode: 'insensitive' } },
      ]);
    });
  });

  describe('create', () => {
    it('บันทึกรหัสเป็นตัวพิมพ์ใหญ่ ตัดช่องว่าง และลง HistoryLog', async () => {
      prisma.company.findUnique.mockResolvedValue(null);
      prisma.company.create.mockResolvedValue(baseCompany);

      await service.create({ name: '  SME Bank  ', code: ' smebank ' }, admin);

      expect(prisma.company.create).toHaveBeenCalledWith({
        data: { name: 'SME Bank', code: 'SMEBANK', contactEmail: null },
      });
      expect(writeWithin).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({
          action: HistoryAction.COMPANY_CREATED,
          actor: admin.email,
          actorId: admin.id,
          companyId: baseCompany.id,
        }),
      );
    });

    it('รหัสบริษัทซ้ำ → 409 และไม่สร้าง', async () => {
      prisma.company.findUnique.mockResolvedValue(baseCompany);

      await expect(service.create({ name: 'ซ้ำ', code: 'SMEBANK' }, admin)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.company.create).not.toHaveBeenCalled();
      expect(writeWithin).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('ไม่พบบริษัท → 404', async () => {
      prisma.company.findUnique.mockResolvedValue(null);
      await expect(service.update(baseCompany.id, { name: 'x' }, admin)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('บันทึกเฉพาะฟิลด์ที่เปลี่ยนลง metadata ของ history', async () => {
      prisma.company.findUnique.mockResolvedValue(baseCompany);
      prisma.company.update.mockResolvedValue({ ...baseCompany, name: 'SME Bank (ใหม่)' });

      await service.update(baseCompany.id, { name: 'SME Bank (ใหม่)' }, admin);

      const historyArg = writeWithin.mock.calls[0][1] as {
        action: HistoryAction;
        metadata: { changes: Record<string, unknown> };
      };
      expect(historyArg.action).toBe(HistoryAction.COMPANY_UPDATED);
      expect(historyArg.metadata.changes).toEqual({
        name: { from: 'SME Bank', to: 'SME Bank (ใหม่)' },
      });
    });

    it('ไม่ส่งฟิลด์อะไรมาเลย → ไม่แตะ DB และไม่ลงประวัติ', async () => {
      prisma.company.findUnique.mockResolvedValue(baseCompany);

      const result = await service.update(baseCompany.id, {}, admin);

      expect(result).toEqual(baseCompany);
      expect(prisma.company.update).not.toHaveBeenCalled();
      expect(writeWithin).not.toHaveBeenCalled();
    });
  });

  describe('deactivate (soft delete)', () => {
    it('ตั้ง isActive=false ไม่ลบข้อมูลจริง และลง HistoryLog พร้อมจำนวน cert ที่ผูกอยู่', async () => {
      prisma.company.findUnique.mockResolvedValue({
        ...baseCompany,
        _count: { certificates: 7 },
      });
      prisma.company.update.mockResolvedValue({ ...baseCompany, isActive: false });

      await service.deactivate(baseCompany.id, admin);

      expect(prisma.company.update).toHaveBeenCalledWith({
        where: { id: baseCompany.id },
        data: { isActive: false },
      });
      const historyArg = writeWithin.mock.calls[0][1] as {
        action: HistoryAction;
        metadata: { certificateCount: number };
      };
      expect(historyArg.action).toBe(HistoryAction.COMPANY_DEACTIVATED);
      expect(historyArg.metadata.certificateCount).toBe(7);
    });

    it('ปิดใช้งานซ้ำ → 409', async () => {
      prisma.company.findUnique.mockResolvedValue({
        ...baseCompany,
        isActive: false,
        _count: { certificates: 0 },
      });

      await expect(service.deactivate(baseCompany.id, admin)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.company.update).not.toHaveBeenCalled();
    });

    it('ไม่พบบริษัท → 404', async () => {
      prisma.company.findUnique.mockResolvedValue(null);
      await expect(service.deactivate(baseCompany.id, admin)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
