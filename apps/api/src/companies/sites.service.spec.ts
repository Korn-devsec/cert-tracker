import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HistoryAction, Site, UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.types';
import { HistoryService } from '../history/history.service';
import { PrismaService } from '../prisma/prisma.service';
import { SitesService } from './sites.service';

const operator: AuthenticatedUser = {
  id: 'op-id',
  email: 'operator@example.com',
  name: 'Operator',
  role: UserRole.OPERATOR,
};

const COMPANY_ID = '11111111-1111-1111-1111-111111111111';

const baseSite: Site = {
  id: '22222222-2222-2222-2222-222222222222',
  companyId: COMPANY_ID,
  name: 'Head Office',
  createdAt: new Date('2026-08-01T00:00:00.000Z'),
  updatedAt: new Date('2026-08-01T00:00:00.000Z'),
};

interface PrismaMock {
  company: { findUnique: jest.Mock };
  site: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  certificate: { count: jest.Mock };
  $transaction: jest.Mock;
}

describe('SitesService', () => {
  let service: SitesService;
  let prisma: PrismaMock;
  let writeWithin: jest.Mock;

  beforeEach(async () => {
    prisma = {
      company: { findUnique: jest.fn().mockResolvedValue({ id: COMPANY_ID }) },
      site: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([baseSite]),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      certificate: { count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((callback: (tx: PrismaMock) => unknown) =>
      callback(prisma),
    );
    writeWithin = jest.fn();

    const moduleRef = await Test.createTestingModule({
      providers: [
        SitesService,
        { provide: PrismaService, useValue: prisma },
        { provide: HistoryService, useValue: { writeWithin } },
      ],
    }).compile();

    service = moduleRef.get(SitesService);
  });

  it('บริษัทไม่มีจริง → 404 ก่อนทำอะไรต่อ', async () => {
    prisma.company.findUnique.mockResolvedValue(null);
    await expect(service.create(COMPANY_ID, { name: 'DR Site' }, operator)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.site.create).not.toHaveBeenCalled();
  });

  it('สร้าง site → ตัดช่องว่างชื่อ และลง HistoryLog', async () => {
    prisma.site.findUnique.mockResolvedValue(null);
    prisma.site.create.mockResolvedValue(baseSite);

    await service.create(COMPANY_ID, { name: '  Head Office  ' }, operator);

    expect(prisma.site.create).toHaveBeenCalledWith({
      data: { companyId: COMPANY_ID, name: 'Head Office' },
    });
    expect(writeWithin).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ action: HistoryAction.SITE_CREATED, companyId: COMPANY_ID }),
    );
  });

  it('ชื่อ site ซ้ำในบริษัทเดียวกัน → 409', async () => {
    prisma.site.findUnique.mockResolvedValue(baseSite);
    await expect(
      service.create(COMPANY_ID, { name: 'Head Office' }, operator),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('site ที่อยู่บริษัทอื่น → 404 (กันแก้ข้ามบริษัท)', async () => {
    prisma.site.findFirst.mockResolvedValue(null);
    await expect(
      service.update(COMPANY_ID, baseSite.id, { name: 'ใหม่' }, operator),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('remove', () => {
    it('ยังมี certificate ผูกอยู่ → 409 ไม่ลบ', async () => {
      prisma.site.findFirst.mockResolvedValue(baseSite);
      prisma.certificate.count.mockResolvedValue(3);

      await expect(service.remove(COMPANY_ID, baseSite.id, operator)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.site.delete).not.toHaveBeenCalled();
    });

    it('ไม่มี certificate ผูก → ลบได้ และลง HistoryLog', async () => {
      prisma.site.findFirst.mockResolvedValue(baseSite);
      prisma.certificate.count.mockResolvedValue(0);

      await service.remove(COMPANY_ID, baseSite.id, operator);

      expect(prisma.site.delete).toHaveBeenCalledWith({ where: { id: baseSite.id } });
      expect(writeWithin).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({ action: HistoryAction.SITE_DELETED }),
      );
    });
  });
});
