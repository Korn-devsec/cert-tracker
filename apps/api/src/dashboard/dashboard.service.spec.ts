import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { WorkStatus } from '@prisma/client';
import { RiskLevel } from '@cert-tracker/shared';
import { PrismaService } from '../prisma/prisma.service';
import { DashboardService } from './dashboard.service';

const MS_PER_DAY = 86_400_000;

interface SnapshotRowStub {
  certificateId: string;
  expiresAt: Date;
  status: WorkStatus | null;
}

/** สร้างแถวจาก snapshot query: cert 1 ใบ + สถานะของ task ล่าสุด (null = ยังไม่มีงาน) */
function row(id: string, daysUntilExpiry: number, status: WorkStatus | null): SnapshotRowStub {
  return {
    certificateId: id,
    expiresAt: new Date(Date.now() + daysUntilExpiry * MS_PER_DAY),
    status,
  };
}

interface PrismaMock {
  company: { findUnique: jest.Mock };
  $queryRaw: jest.Mock;
}

describe('DashboardService.summary', () => {
  let service: DashboardService;
  let prisma: PrismaMock;

  beforeEach(async () => {
    prisma = {
      company: { findUnique: jest.fn().mockResolvedValue({ id: 'company-1' }) },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [DashboardService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(DashboardService);
  });

  it('ไม่มีข้อมูล → ตัวเลขทั้งหมดเป็น 0 (ไม่ใช่ undefined)', async () => {
    const summary = await service.summary({});

    expect(summary.total).toBe(0);
    expect(summary.byRisk).toEqual({ HIGH: 0, MEDIUM: 0, LOW: 0, SAFE: 0 });
    expect(summary.byStatus[WorkStatus.NEW]).toBe(0);
    expect(summary.byRiskStatus[RiskLevel.HIGH]).toEqual({ done: 0, pending: 0, cancelled: 0 });
  });

  it('นับตามระดับความเสี่ยงด้วยเกณฑ์เดียวกับ calculateRisk', async () => {
    prisma.$queryRaw.mockResolvedValue([
      row('a', -10, WorkStatus.NEW), // หมดอายุแล้ว → HIGH
      row('b', 20, WorkStatus.NEW), // HIGH + ใกล้หมดอายุ
      row('c', 45, WorkStatus.IN_PROGRESS), // MEDIUM
      row('d', 75, null), // LOW ยังไม่มีงาน
      row('e', 200, WorkStatus.COMPLETED), // SAFE
    ]);

    const summary = await service.summary({});

    expect(summary.total).toBe(5);
    expect(summary.byRisk).toEqual({ HIGH: 2, MEDIUM: 1, LOW: 1, SAFE: 1 });
    expect(summary.expired).toBe(1);
    // ใกล้หมดอายุ = 0–30 วัน และยังไม่หมดอายุ (ไม่นับใบที่หมดแล้วซ้ำ)
    expect(summary.expiringSoon).toBe(1);
    expect(summary.noTask).toBe(1);
  });

  it('นับสถานะจาก task ล่าสุด และ cert 1 ใบนับครั้งเดียว', async () => {
    prisma.$queryRaw.mockResolvedValue([
      row('a', 10, WorkStatus.COMPLETED),
      row('b', 10, WorkStatus.CANCELLED),
      row('c', 10, WorkStatus.WAITING_CA),
      row('d', 10, null),
    ]);

    const summary = await service.summary({});

    expect(summary.byStatus[WorkStatus.COMPLETED]).toBe(1);
    expect(summary.byStatus[WorkStatus.CANCELLED]).toBe(1);
    expect(summary.byStatus[WorkStatus.WAITING_CA]).toBe(1);
    expect(summary.completed).toBe(1);
    expect(summary.cancelled).toBe(1);
    // งานที่ยังไม่ปิด + cert ที่ยังไม่มีงาน = ค้าง
    expect(summary.pending).toBe(2);
    expect(summary.noTask).toBe(1);
    // ทุกใบต้องถูกจัดเข้าฝั่งใดฝั่งหนึ่งเสมอ
    expect(summary.completed + summary.pending + summary.cancelled).toBe(summary.total);
  });

  it('byRiskStatus แยก Done/Pending ต่อระดับความเสี่ยง (สำหรับ Grouped Bar)', async () => {
    prisma.$queryRaw.mockResolvedValue([
      row('a', 20, WorkStatus.COMPLETED), // High + เสร็จแล้ว
      row('b', 20, WorkStatus.ASSIGNED), // High + ค้าง
      row('c', 200, WorkStatus.COMPLETED), // Safe + เสร็จแล้ว
      row('d', 200, WorkStatus.CANCELLED), // Safe + ยกเลิก (ไม่นับทั้ง done และ pending)
    ]);

    const summary = await service.summary({});

    expect(summary.byRiskStatus[RiskLevel.HIGH]).toEqual({ done: 1, pending: 1, cancelled: 0 });
    expect(summary.byRiskStatus[RiskLevel.SAFE]).toEqual({ done: 1, pending: 0, cancelled: 1 });
  });

  it('cert เหลือ 20 วันแต่ปิดงานแล้ว → นับเป็น High และ Completed พร้อมกัน (กฎเหล็กข้อ 5)', async () => {
    prisma.$queryRaw.mockResolvedValue([row('a', 20, WorkStatus.COMPLETED)]);

    const summary = await service.summary({});

    expect(summary.byRisk[RiskLevel.HIGH]).toBe(1);
    expect(summary.byStatus[WorkStatus.COMPLETED]).toBe(1);
    expect(summary.expiringSoon).toBe(1);
  });

  it('companyId ที่ไม่มีจริง → 404 (ไม่ใช่ตัวเลข 0 ที่ดูเหมือนไม่มีข้อมูล)', async () => {
    prisma.company.findUnique.mockResolvedValue(null);

    await expect(
      service.summary({ companyId: '11111111-1111-4111-8111-111111111111' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('สะท้อนตัวกรองที่ใช้กลับไปใน response', async () => {
    const summary = await service.summary({ companyId: 'company-1', month: '2026-07' });

    expect(summary.companyId).toBe('company-1');
    expect(summary.month).toBe('2026-07');
    expect(summary.asOf).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
