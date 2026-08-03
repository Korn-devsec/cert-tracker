import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { WorkStatus } from '@prisma/client';
import { RiskLevel } from '@cert-tracker/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CertificatesService } from './certificates.service';

const MS_PER_DAY = 86_400_000;

interface CertificateStub {
  id: string;
  companyId: string;
  commonName: string;
  endpoint: string;
  expiresAt: Date;
  isActive: boolean;
  company: { id: string; name: string; code: string };
  site: null;
  renewalTasks: Array<{ status: WorkStatus }>;
}

function certRow(
  daysUntilExpiry: number,
  tasks: Array<{ status: WorkStatus }> = [],
): CertificateStub {
  return {
    id: 'cert-1',
    companyId: 'company-1',
    commonName: 'sme-portal.example.co.th',
    endpoint: '10.0.0.1:443',
    expiresAt: new Date(Date.now() + daysUntilExpiry * MS_PER_DAY),
    isActive: true,
    company: { id: 'company-1', name: 'SME Bank', code: 'SMEBANK' },
    site: null,
    renewalTasks: tasks,
  };
}

interface PrismaMock {
  certificate: { count: jest.Mock; findMany: jest.Mock; findUnique: jest.Mock };
  $queryRaw: jest.Mock;
}

/** อ่านอาร์กิวเมนต์ where ของ findMany ครั้งล่าสุดแบบมีชนิด */
interface WhereArg {
  where: {
    isActive?: boolean;
    companyId?: string;
    id?: { in: string[] };
    expiresAt?: { gte?: Date; lt?: Date };
    OR?: Array<Record<string, { contains: string; mode: string }>>;
  };
  orderBy: Record<string, string>;
  skip: number;
  take: number;
}

describe('CertificatesService', () => {
  let service: CertificatesService;
  let prisma: PrismaMock;

  const lastFindManyArg = (): WhereArg => prisma.certificate.findMany.mock.calls[0][0] as WhereArg;

  beforeEach(async () => {
    prisma = {
      certificate: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [CertificatesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(CertificatesService);
  });

  describe('findAll — ค่าเริ่มต้น', () => {
    it('คืนเฉพาะ cert ที่ใช้งาน เรียงตามวันหมดอายุ และแบ่งหน้า 25 รายการ', async () => {
      const result = await service.findAll({});

      const arg = lastFindManyArg();
      expect(arg.where.isActive).toBe(true);
      expect(arg.orderBy).toEqual({ expiresAt: 'asc' });
      expect(arg.skip).toBe(0);
      expect(arg.take).toBe(25);
      expect(result.meta).toMatchObject({ page: 1, pageSize: 25, total: 0, totalPages: 0 });
      expect(result.meta.asOf).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('includeInactive=true → ไม่กรอง isActive', async () => {
      await service.findAll({ includeInactive: 'true' });
      expect(lastFindManyArg().where.isActive).toBeUndefined();
    });

    it('แบ่งหน้าหน้าที่ 3 ขนาด 10 → skip 20', async () => {
      await service.findAll({ page: 3, pageSize: 10 });
      expect(lastFindManyArg()).toMatchObject({ skip: 20, take: 10 });
    });
  });

  describe('findAll — ตัวกรองที่ต้องแปลงเป็นช่วงวัน (กรองใน DB ไม่ใช่ใน JS)', () => {
    it('risk=HIGH → ไม่มีขอบซ้าย (รวม cert ที่หมดอายุแล้ว)', async () => {
      await service.findAll({ risk: RiskLevel.HIGH });

      const expiresAt = lastFindManyArg().where.expiresAt;
      expect(expiresAt?.gte).toBeUndefined();
      expect(expiresAt?.lt).toBeInstanceOf(Date);
    });

    it('risk=LOW → ช่วง 61–90 วัน (กว้าง 30 วัน)', async () => {
      await service.findAll({ risk: RiskLevel.LOW });

      const expiresAt = lastFindManyArg().where.expiresAt;
      const spanDays =
        ((expiresAt?.lt?.getTime() ?? 0) - (expiresAt?.gte?.getTime() ?? 0)) / MS_PER_DAY;
      expect(spanDays).toBe(30);
    });

    it('month=2026-07 → ช่วงทั้งเดือนแบบ UTC', async () => {
      await service.findAll({ month: '2026-07' });

      const expiresAt = lastFindManyArg().where.expiresAt;
      expect(expiresAt?.gte?.toISOString()).toBe('2026-07-01T00:00:00.000Z');
      expect(expiresAt?.lt?.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    });

    it('month + risk → ตัดกันเป็นช่วงเดียว (เอาขอบที่แคบกว่า)', async () => {
      await service.findAll({ month: '2050-01', risk: RiskLevel.HIGH });

      const expiresAt = lastFindManyArg().where.expiresAt;
      // ขอบซ้ายมาจากเดือน ขอบขวามาจาก risk (แคบกว่าเดือนที่อยู่ไกลออกไป)
      expect(expiresAt?.gte?.toISOString()).toBe('2050-01-01T00:00:00.000Z');
      expect(expiresAt?.lt?.getTime()).toBeLessThan(new Date('2050-01-01T00:00:00.000Z').getTime());
    });

    it('expired=true → เฉพาะที่หมดอายุก่อนวันนี้', async () => {
      await service.findAll({ expired: 'true' });

      const expiresAt = lastFindManyArg().where.expiresAt;
      expect(expiresAt?.gte).toBeUndefined();
      expect(expiresAt?.lt?.toISOString()).toMatch(/T00:00:00\.000Z$/);
    });

    it('search → ค้นหลายคอลัมน์แบบไม่สนตัวพิมพ์', async () => {
      await service.findAll({ search: 'portal' });

      const or = lastFindManyArg().where.OR ?? [];
      expect(or).toHaveLength(4);
      expect(or[0]).toEqual({ commonName: { contains: 'portal', mode: 'insensitive' } });
    });

    it('status → ใช้ id ของ cert ที่ "task ล่าสุด" ตรงกับสถานะนั้น', async () => {
      prisma.$queryRaw.mockResolvedValue([
        { certificateId: 'cert-9' },
        { certificateId: 'cert-8' },
      ]);

      await service.findAll({ status: WorkStatus.COMPLETED, companyId: 'company-1' });

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(lastFindManyArg().where.id).toEqual({ in: ['cert-9', 'cert-8'] });
    });
  });

  describe('findAll — ค่าที่คำนวณสด', () => {
    it('เติม daysUntilExpiry/riskLevel/isExpired และ currentTask จาก task ล่าสุด', async () => {
      prisma.certificate.count.mockResolvedValue(1);
      prisma.certificate.findMany.mockResolvedValue([
        certRow(20, [{ status: WorkStatus.COMPLETED }]),
      ]);

      const { data } = await service.findAll({});

      expect(data[0].daysUntilExpiry).toBe(20);
      expect(data[0].riskLevel).toBe(RiskLevel.HIGH);
      expect(data[0].isExpired).toBe(false);
      // กฎเหล็กข้อ 5: risk กับ work status แยกกัน — High + Completed พร้อมกันได้
      expect(data[0].currentTask?.status).toBe(WorkStatus.COMPLETED);
      expect(data[0]).not.toHaveProperty('renewalTasks');
    });

    it('cert ที่หมดอายุแล้ว → isExpired = true และ risk = HIGH', async () => {
      prisma.certificate.count.mockResolvedValue(1);
      prisma.certificate.findMany.mockResolvedValue([certRow(-5)]);

      const { data } = await service.findAll({});

      expect(data[0].daysUntilExpiry).toBe(-5);
      expect(data[0].isExpired).toBe(true);
      expect(data[0].riskLevel).toBe(RiskLevel.HIGH);
      expect(data[0].currentTask).toBeNull();
    });
  });

  describe('findOne', () => {
    it('ไม่พบ → 404', async () => {
      prisma.certificate.findUnique.mockResolvedValue(null);
      await expect(service.findOne('cert-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('คืน detail พร้อม currentTask และค่าที่คำนวณสด', async () => {
      prisma.certificate.findUnique.mockResolvedValue({
        ...certRow(45, [{ status: WorkStatus.IN_PROGRESS }, { status: WorkStatus.COMPLETED }]),
        attachments: [],
        historyLogs: [],
      });

      const detail = await service.findOne('cert-1');

      expect(detail.riskLevel).toBe(RiskLevel.MEDIUM);
      expect(detail.currentTask?.status).toBe(WorkStatus.IN_PROGRESS);
      expect(detail.renewalTasks).toHaveLength(2);
    });
  });

  describe('assertExists', () => {
    it('ไม่พบ → 404', async () => {
      prisma.certificate.findUnique.mockResolvedValue(null);
      await expect(service.assertExists('cert-1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
