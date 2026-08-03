import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { WorkStatus } from '@prisma/client';
import { RiskLevel } from '@cert-tracker/shared';
import { CertificatesService } from '../certificates/certificates.service';
import { DashboardService } from '../dashboard/dashboard.service';
// ใช้ตัวโหลดที่ cast Buffer ไว้จุดเดียวของโปรเจกต์ (ดู DECISIONS.md — Phase 3)
import { loadWorkbookFromBuffer } from '../imports/excel/load-workbook';
import { PrismaService } from '../prisma/prisma.service';
import { buildDelta, buildFilename, monthKey, ReportsService, shiftMonth } from './reports.service';
import type { MonthlyBucket } from './reports.types';

const MS_PER_DAY = 86_400_000;

function summaryFor(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    asOf: '2026-08-04T00:00:00.000Z',
    companyId: null,
    month: null,
    status: null,
    total: 7,
    byRisk: { HIGH: 1, MEDIUM: 6, LOW: 0, SAFE: 0 },
    byStatus: {
      NEW: 7,
      ASSIGNED: 0,
      IN_PROGRESS: 0,
      WAITING_VENDOR: 0,
      WAITING_CA: 0,
      TESTING: 0,
      COMPLETED: 0,
      CANCELLED: 0,
    },
    byRiskStatus: {
      HIGH: { done: 0, pending: 1, cancelled: 0 },
      MEDIUM: { done: 0, pending: 6, cancelled: 0 },
      LOW: { done: 0, pending: 0, cancelled: 0 },
      SAFE: { done: 0, pending: 0, cancelled: 0 },
    },
    noTask: 0,
    expiringSoon: 1,
    expired: 0,
    completed: 0,
    pending: 7,
    cancelled: 0,
    ...overrides,
  };
}

function certificateRow(index: number): Record<string, unknown> {
  return {
    id: `cert-${index}`,
    companyId: 'company-sme',
    commonName: `host${index}.smebank.local`,
    endpoint: `10.0.0.${index}:443`,
    owner: 'IT Sec',
    issuer: 'CN=Test CA',
    serialNumber: `SERIAL-${index}`,
    signatureAlgorithm: 'SHA256withRSA',
    keySize: 2048,
    sha256Fingerprint: `FP-${index}`,
    san: [`www.host${index}.smebank.local`],
    expiresAt: new Date(Date.now() + 20 * MS_PER_DAY),
    daysUntilExpiry: 20,
    riskLevel: RiskLevel.HIGH,
    isExpired: false,
    company: { id: 'company-sme', name: 'SME Bank', code: 'SMEBANK' },
    site: null,
    currentTask: {
      id: `task-${index}`,
      status: WorkStatus.ASSIGNED,
      assigneeId: 'user-1',
      dueDate: null,
      assignee: { id: 'user-1', name: 'สมชาย', email: 'somchai@example.com' },
    },
  };
}

interface PrismaMock {
  company: { findUnique: jest.Mock };
}

describe('ReportsService', () => {
  let service: ReportsService;
  let prisma: PrismaMock;
  let findAllForExport: jest.Mock;
  let summary: jest.Mock;

  beforeEach(async () => {
    prisma = {
      company: { findUnique: jest.fn().mockResolvedValue({ name: 'SME Bank', code: 'SMEBANK' }) },
    };
    findAllForExport = jest.fn().mockResolvedValue({
      rows: [certificateRow(1), certificateRow(2)],
      asOf: new Date('2026-08-04T03:00:00.000Z'),
      truncated: false,
    });
    summary = jest.fn().mockResolvedValue(summaryFor());

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CertificatesService, useValue: { findAllForExport } },
        { provide: DashboardService, useValue: { summary } },
      ],
    }).compile();

    service = moduleRef.get(ReportsService);
  });

  describe('monthly — เทียบกับเดือนก่อนหน้า', () => {
    it('เรียก summary ของทั้งเดือนที่เลือกและเดือนก่อนหน้า', async () => {
      summary
        .mockResolvedValueOnce(summaryFor({ total: 7, completed: 2, pending: 5 }))
        .mockResolvedValueOnce(summaryFor({ total: 4, completed: 1, pending: 3 }));

      const report = await service.monthly({ month: '2026-08', companyId: 'company-1' });

      expect(summary).toHaveBeenNthCalledWith(1, { month: '2026-08', companyId: 'company-1' });
      expect(summary).toHaveBeenNthCalledWith(2, { month: '2026-07', companyId: 'company-1' });
      expect(report.current.month).toBe('2026-08');
      expect(report.previous.month).toBe('2026-07');
      // ป้ายเดือนเป็นไทย พ.ศ.
      expect(report.current.monthLabel).toBe('สิงหาคม 2569');
      expect(report.previous.monthLabel).toBe('กรกฎาคม 2569');
    });

    it('คำนวณส่วนต่างจากเดือนก่อน (บวก = เพิ่มขึ้น)', async () => {
      summary
        .mockResolvedValueOnce(
          summaryFor({
            total: 7,
            completed: 2,
            pending: 5,
            byRisk: { HIGH: 3, MEDIUM: 4, LOW: 0, SAFE: 0 },
          }),
        )
        .mockResolvedValueOnce(
          summaryFor({
            total: 4,
            completed: 1,
            pending: 3,
            byRisk: { HIGH: 1, MEDIUM: 3, LOW: 0, SAFE: 0 },
          }),
        );

      const report = await service.monthly({ month: '2026-08' });

      expect(report.delta.total).toBe(3);
      expect(report.delta.completed).toBe(1);
      expect(report.delta.pending).toBe(2);
      expect(report.delta.byRisk[RiskLevel.HIGH]).toBe(2);
    });

    it('ข้ามปีได้ (มกราคม → เทียบกับธันวาคมปีก่อน)', async () => {
      await service.monthly({ month: '2027-01' });
      expect(summary).toHaveBeenNthCalledWith(2, { month: '2026-12', companyId: undefined });
    });

    it('บริษัทที่ไม่มีจริง → 404 (ไม่ส่งรายงานว่างที่ดูเหมือนไม่มีข้อมูล)', async () => {
      prisma.company.findUnique.mockResolvedValue(null);
      await expect(service.monthly({ companyId: 'ไม่มี' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('exportCertificates — ไฟล์ Excel', () => {
    it('มี 2 sheet: สรุป และ รายการ Certificate', async () => {
      const { buffer } = await service.exportCertificates({});

      const workbook = await loadWorkbookFromBuffer(buffer);
      expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
        'สรุป',
        'รายการ Certificate',
      ]);
    });

    it('sheet รายการมีหัวคอลัมน์ครบและข้อมูลตรงกับที่ service ส่งมา', async () => {
      const { buffer, rowCount } = await service.exportCertificates({});
      expect(rowCount).toBe(2);

      const workbook = await loadWorkbookFromBuffer(buffer);
      const sheet = workbook.getWorksheet('รายการ Certificate');
      const header = (sheet?.getRow(1).values as unknown[]).slice(1);

      expect(header).toContain('Common Name');
      expect(header).toContain('SHA-256 Fingerprint');
      expect(header).toContain('วันคงเหลือ');
      expect(header).toContain('สถานะงาน');

      const firstRow = (sheet?.getRow(2).values as unknown[]).slice(1);
      expect(firstRow[0]).toBe(1); // ลำดับ
      expect(firstRow[1]).toBe('SMEBANK');
      expect(firstRow[2]).toBe('host1.smebank.local');
      expect(firstRow).toContain('ความเสี่ยงสูง'); // ป้ายไทย ไม่ใช่ค่า enum
      expect(firstRow).toContain('มอบหมายแล้ว');
      expect(firstRow).toContain('สมชาย');
    });

    it('sheet สรุปบอกขอบเขตที่กรองและตัวเลขจาก dashboard ชุดเดียวกับหน้าจอ', async () => {
      const { buffer } = await service.exportCertificates({
        companyId: 'company-sme',
        month: '2026-08',
        status: WorkStatus.NEW,
      });

      // ต้องใช้ตัวกรองเดียวกันไปขอตัวเลขสรุป
      expect(summary).toHaveBeenCalledWith({
        companyId: 'company-sme',
        month: '2026-08',
        status: WorkStatus.NEW,
      });

      const workbook = await loadWorkbookFromBuffer(buffer);
      const text = JSON.stringify(workbook.getWorksheet('สรุป')?.getSheetValues());
      expect(text).toContain('SME Bank (SMEBANK)');
      expect(text).toContain('สิงหาคม 2569');
      expect(text).toContain('รายการใหม่'); // สถานะที่กรอง (ป้ายไทย)
      expect(text).toContain('ความเสี่ยงสูง');
      expect(text).toContain('ใกล้หมดอายุ (≤30 วัน)');
    });

    it('ส่งตัวกรองเดียวกับหน้า Certificates ต่อไปยัง service (ไฟล์จึงตรงกับที่เห็นบนจอ)', async () => {
      await service.exportCertificates({ risk: RiskLevel.HIGH, search: 'sme', expired: 'false' });

      expect(findAllForExport).toHaveBeenCalledWith(
        expect.objectContaining({ risk: RiskLevel.HIGH, search: 'sme', expired: 'false' }),
      );
    });

    it('ข้อมูลถูกตัดเพราะเกินเพดาน → เขียนกำกับไว้ในไฟล์ ไม่ตัดแบบเงียบๆ', async () => {
      findAllForExport.mockResolvedValue({
        rows: [certificateRow(1)],
        asOf: new Date('2026-08-04T03:00:00.000Z'),
        truncated: true,
      });

      const { buffer, truncated } = await service.exportCertificates({});
      expect(truncated).toBe(true);

      const workbook = await loadWorkbookFromBuffer(buffer);
      const text = JSON.stringify(workbook.getWorksheet('รายการ Certificate')?.getSheetValues());
      expect(text).toContain('กรองให้แคบลง');
    });

    it('ชื่อไฟล์บอกบริษัทและเดือน และเป็น ASCII', async () => {
      const { filename } = await service.exportCertificates({
        companyId: 'company-sme',
        month: '2026-08',
      });

      expect(filename).toBe('ssl-certificates-SMEBANK-2026-08.xlsx');
      expect(/^[\x20-\x7e]+$/.test(filename)).toBe(true);
    });
  });
});

describe('ตัวช่วยของรายงาน', () => {
  it('monthKey ใช้ฐาน UTC', () => {
    expect(monthKey(new Date('2026-08-04T23:30:00.000Z'))).toBe('2026-08');
  });

  it('shiftMonth ข้ามปีทั้งสองทาง', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-08', -1)).toBe('2026-07');
  });

  it('buildFilename: ไม่ระบุบริษัท/เดือน → ใช้เดือนของวันที่ออกรายงาน', () => {
    expect(buildFilename(null, undefined, new Date('2026-08-04T00:00:00.000Z'))).toBe(
      'ssl-certificates-2026-08.xlsx',
    );
  });

  it('buildFilename ตัดอักขระที่ไม่ใช่ ASCII ออกจากชื่อบริษัท', () => {
    expect(buildFilename('บริษัททดสอบ (ทดสอบ)', '2026-08', new Date())).toBe(
      'ssl-certificates-2026-08.xlsx',
    );
  });

  it('buildDelta คิดผลต่างของทุกระดับความเสี่ยง', () => {
    const current = {
      byRisk: { HIGH: 5, MEDIUM: 2, LOW: 1, SAFE: 0 },
      total: 8,
      completed: 3,
      pending: 5,
    } as MonthlyBucket;
    const previous = {
      byRisk: { HIGH: 2, MEDIUM: 2, LOW: 0, SAFE: 4 },
      total: 8,
      completed: 1,
      pending: 7,
    } as MonthlyBucket;

    const delta = buildDelta(current, previous);
    expect(delta.byRisk).toEqual({ HIGH: 3, MEDIUM: 0, LOW: 1, SAFE: -4 });
    expect(delta.total).toBe(0);
    expect(delta.completed).toBe(2);
    expect(delta.pending).toBe(-2);
  });
});
