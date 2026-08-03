/**
 * รายงานและการ Export (Phase 8)
 *
 *  - `monthly()` — สรุปเดือนที่เลือกเทียบกับเดือนก่อนหน้า (จำนวนตาม risk/status)
 *  - `exportCertificates()` — ไฟล์ Excel ตามตัวกรองเดียวกับหน้าจอ
 *
 * ทั้งสองใช้ตัวคำนวณความเสี่ยงและตัวกรองชุดเดียวกับ Dashboard/Certificates
 * (ห้ามคำนวณเกณฑ์ใหม่ที่นี่ ไม่งั้นไฟล์รายงานจะไม่ตรงกับหน้าจอ)
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { WorkStatus } from '@prisma/client';
import {
  formatThaiDate,
  formatThaiMonthFromKey,
  RISK_LEVEL_LABEL_TH,
  RiskLevel,
  WORK_STATUS_LABEL_TH,
} from '@cert-tracker/shared';
import { Workbook, type Row } from 'exceljs';
import { CertificatesService } from '../certificates/certificates.service';
import { ListCertificatesDto } from '../certificates/dto/list-certificates.dto';
import { DashboardService } from '../dashboard/dashboard.service';
import { workStatusLabel } from '../common/status-label';
import { PrismaService } from '../prisma/prisma.service';
import { ExportCertificatesDto, MonthlyReportDto } from './dto/report-query.dto';
import type { MonthlyBucket, MonthlyDelta, MonthlyReport } from './reports.types';

const RISK_LABELS: Record<string, string> = { ...RISK_LEVEL_LABEL_TH };
const STATUS_LABELS: Record<string, string> = { ...WORK_STATUS_LABEL_TH };

/** ลำดับคอลัมน์ในไฟล์ Excel — ครบตามข้อมูลเทคนิคที่หน้า detail แสดง */
const EXPORT_COLUMNS: Array<{ header: string; width: number }> = [
  { header: 'ลำดับ', width: 8 },
  { header: 'บริษัท', width: 14 },
  { header: 'Common Name', width: 38 },
  { header: 'SAN', width: 30 },
  { header: 'Endpoint', width: 24 },
  { header: 'Issuer', width: 34 },
  { header: 'Serial Number', width: 22 },
  { header: 'Signature Algorithm', width: 20 },
  { header: 'Key Size', width: 10 },
  { header: 'SHA-256 Fingerprint', width: 34 },
  { header: 'ผู้ดูแล', width: 16 },
  { header: 'วันหมดอายุ', width: 18 },
  { header: 'วันคงเหลือ', width: 12 },
  { header: 'ระดับความเสี่ยง', width: 16 },
  { header: 'สถานะงาน', width: 18 },
  { header: 'ผู้รับผิดชอบ', width: 18 },
];

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly certificates: CertificatesService,
    private readonly dashboard: DashboardService,
  ) {}

  /** สรุปรายเดือนเทียบเดือนก่อนหน้า */
  async monthly(query: MonthlyReportDto): Promise<MonthlyReport> {
    const now = new Date();
    const companyName = await this.resolveCompanyName(query.companyId);

    const month = query.month ?? monthKey(now);
    const previousMonth = shiftMonth(month, -1);

    const [current, previous] = await Promise.all([
      this.bucketFor(month, query.companyId),
      this.bucketFor(previousMonth, query.companyId),
    ]);

    return {
      asOf: now.toISOString(),
      companyId: query.companyId ?? null,
      companyName,
      current,
      previous,
      delta: buildDelta(current, previous),
    };
  }

  /**
   * สร้างไฟล์ Excel 2 sheet: "สรุป" (ตัวเลขตาม risk/status) และ "รายการ Certificate"
   * คืนเป็น Buffer เพื่อให้ controller ส่งออกพร้อมชื่อไฟล์
   */
  async exportCertificates(
    query: ExportCertificatesDto,
  ): Promise<{ buffer: Buffer; filename: string; rowCount: number; truncated: boolean }> {
    const companyName = await this.resolveCompanyName(query.companyId);
    const listQuery: ListCertificatesDto = { ...query };
    const { rows, asOf, truncated } = await this.certificates.findAllForExport(listQuery);
    const summary = await this.dashboard.summary({
      companyId: query.companyId,
      month: query.month,
      status: query.status,
    });

    const workbook = new Workbook();
    workbook.creator = 'SSL Certificate Lifecycle Management';
    workbook.created = asOf;

    // ---- sheet สรุป ----
    const summarySheet = workbook.addWorksheet('สรุป');
    summarySheet.columns = [
      { header: 'หัวข้อ', key: 'label', width: 28 },
      { header: 'จำนวน', key: 'value', width: 12 },
    ];
    styleHeader(summarySheet.getRow(1));

    const scope = [
      ['บริษัท', companyName ?? 'ทุกบริษัท'],
      [
        'เดือนที่กรอง',
        query.month === undefined
          ? 'ทุกเดือน'
          : (formatThaiMonthFromKey(query.month) ?? query.month),
      ],
      ['สถานะงานที่กรอง', query.status === undefined ? 'ทั้งหมด' : workStatusLabel(query.status)],
      ['ข้อมูล ณ วันที่', formatThaiDate(asOf)],
    ];
    for (const [label, value] of scope) {
      summarySheet.addRow({ label, value });
    }
    summarySheet.addRow({});
    summarySheet.addRow({ label: 'รายการทั้งหมด', value: summary.total });
    for (const risk of Object.values(RiskLevel)) {
      summarySheet.addRow({ label: RISK_LABELS[risk] ?? risk, value: summary.byRisk[risk] ?? 0 });
    }
    summarySheet.addRow({ label: 'ใกล้หมดอายุ (≤30 วัน)', value: summary.expiringSoon });
    summarySheet.addRow({ label: 'หมดอายุแล้ว', value: summary.expired });
    summarySheet.addRow({});
    for (const status of Object.values(WorkStatus)) {
      summarySheet.addRow({
        label: STATUS_LABELS[status] ?? status,
        value: summary.byStatus[status] ?? 0,
      });
    }
    summarySheet.addRow({ label: 'ยังไม่มีงานต่ออายุ', value: summary.noTask });

    // ---- sheet รายการ ----
    const listSheet = workbook.addWorksheet('รายการ Certificate');
    listSheet.columns = EXPORT_COLUMNS.map((column) => ({
      header: column.header,
      width: column.width,
    }));
    styleHeader(listSheet.getRow(1));

    rows.forEach((certificate, index) => {
      listSheet.addRow([
        index + 1,
        certificate.company.code,
        certificate.commonName,
        certificate.san.join(', '),
        certificate.endpoint,
        certificate.issuer ?? '',
        certificate.serialNumber ?? '',
        certificate.signatureAlgorithm ?? '',
        certificate.keySize ?? '',
        certificate.sha256Fingerprint ?? '',
        certificate.owner ?? '',
        formatThaiDate(certificate.expiresAt),
        certificate.daysUntilExpiry,
        RISK_LABELS[certificate.riskLevel] ?? certificate.riskLevel,
        certificate.currentTask === null
          ? 'ยังไม่มีงาน'
          : workStatusLabel(certificate.currentTask.status),
        certificate.currentTask?.assignee?.name ?? '',
      ]);
    });

    if (truncated) {
      // ไม่ตัดข้อมูลแบบเงียบๆ — เขียนกำกับไว้ในไฟล์ให้ผู้อ่านรู้
      listSheet.addRow([]);
      listSheet.addRow([
        '',
        '',
        `แสดงเพียง ${rows.length} รายการแรก — กรองให้แคบลงเพื่อดูรายการที่เหลือ`,
      ]);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return {
      buffer: Buffer.from(buffer),
      filename: buildFilename(companyName, query.month, asOf),
      rowCount: rows.length,
      truncated,
    };
  }

  // ===== ภายใน =====

  private async resolveCompanyName(companyId?: string): Promise<string | null> {
    if (companyId === undefined) {
      return null;
    }
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, code: true },
    });
    if (company === null) {
      throw new NotFoundException(`ไม่พบบริษัท id ${companyId}`);
    }
    return `${company.name} (${company.code})`;
  }

  /** ตัวเลขของเดือนหนึ่ง — ใช้ DashboardService เพื่อให้เกณฑ์ตรงกับหน้า Dashboard เป๊ะ */
  private async bucketFor(month: string, companyId?: string): Promise<MonthlyBucket> {
    const summary = await this.dashboard.summary({ month, companyId });
    return {
      month,
      monthLabel: formatThaiMonthFromKey(month) ?? month,
      total: summary.total,
      byRisk: summary.byRisk,
      byStatus: summary.byStatus,
      noTask: summary.noTask,
      completed: summary.completed,
      pending: summary.pending,
      cancelled: summary.cancelled,
      expired: summary.expired,
    };
  }
}

/** หัวตารางในไฟล์: ตัวหนา ฟอนต์ Sarabun พื้นเทาอ่อน (โทนเดียวกับ thead บนหน้าจอ) */
function styleHeader(row: Row): void {
  row.font = { bold: true, name: 'Sarabun' };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
}

/** คีย์เดือน `YYYY-MM` ของวันที่ (ฐาน UTC เหมือนที่อื่นในระบบ) */
export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** เลื่อนเดือนไปข้างหน้า/ย้อนหลัง (ข้ามปีได้ถูกต้อง) */
export function shiftMonth(month: string, offset: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return monthKey(shifted);
}

export function buildDelta(current: MonthlyBucket, previous: MonthlyBucket): MonthlyDelta {
  const byRisk = {} as MonthlyDelta['byRisk'];
  for (const risk of Object.values(RiskLevel)) {
    byRisk[risk] = (current.byRisk[risk] ?? 0) - (previous.byRisk[risk] ?? 0);
  }
  return {
    total: current.total - previous.total,
    byRisk,
    completed: current.completed - previous.completed,
    pending: current.pending - previous.pending,
  };
}

/** ชื่อไฟล์ที่บอกขอบเขตของรายงาน (ASCII เพื่อให้ปลอดภัยกับทุกระบบไฟล์) */
export function buildFilename(
  companyName: string | null,
  month: string | undefined,
  asOf: Date,
): string {
  const parts = ['ssl-certificates'];
  if (companyName !== null) {
    const code = /\(([^)]+)\)$/.exec(companyName)?.[1] ?? companyName;
    parts.push(code.replace(/[^A-Za-z0-9_-]/g, ''));
  }
  parts.push(month ?? monthKey(asOf));
  return `${parts.filter((part) => part.length > 0).join('-')}.xlsx`;
}
