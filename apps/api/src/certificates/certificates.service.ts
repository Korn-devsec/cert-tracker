/**
 * Certificate API (อ่านอย่างเดียวในเฟสนี้ — ข้อมูล cert เข้าระบบผ่าน Import เท่านั้น)
 *
 * หลักที่ต้องไม่พลาด:
 *  - `daysUntilExpiry` / `riskLevel` คำนวณสด ณ เวลา query ไม่ freeze ค่าจาก Excel (กฎเหล็กข้อ 5)
 *  - ตัวกรอง "ความเสี่ยง/เดือน/หมดอายุ" ถูกแปลงเป็นช่วงวันของ `expiresAt` แล้วกรองใน DB
 *    เพื่อให้ total และการแบ่งหน้าถูกต้อง (ถ้ากรองใน JS หลังแบ่งหน้า ตัวเลขจะโกหก)
 *  - "สถานะงาน" ของ cert = task ล่าสุด (ดู common/current-task.ts)
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, WorkStatus } from '@prisma/client';
import {
  expiredExpiryWindow,
  expiryWindowForDayRange,
  riskExpiryWindow,
  type ExpiryWindow,
} from '@cert-tracker/shared';
import { certificateIdsByCurrentStatusSql } from '../common/current-task';
import { intersectExpiryWindows, monthExpiryWindow } from '../common/expiry-filter';
import { buildMeta, paginationArgs, type Paginated } from '../common/pagination';
import { withRiskFields } from '../common/risk-fields';
import { PrismaService } from '../prisma/prisma.service';
import {
  CERTIFICATE_DETAIL_INCLUDE,
  CERTIFICATE_LIST_INCLUDE,
  type CertificateDetail,
  type CertificateListItem,
} from './certificates.types';
import { ListCertificatesDto } from './dto/list-certificates.dto';

/** เพดานจำนวนแถวต่อการ Export หนึ่งครั้ง (กันไฟล์ใหญ่เกินและ query ที่กินเวลานาน) */
export const EXPORT_ROW_LIMIT = 5000;

@Injectable()
export class CertificatesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListCertificatesDto): Promise<Paginated<CertificateListItem>> {
    const now = new Date();
    const { page, pageSize, skip, take } = paginationArgs(query);
    const where = await this.buildWhere(query, now);
    const orderBy: Prisma.CertificateOrderByWithRelationInput = {
      // ค่าเริ่มต้น: ใกล้หมดอายุที่สุดขึ้นก่อน = ความเสี่ยงสูงสุดขึ้นก่อน
      [query.sortBy ?? 'expiresAt']: query.order ?? 'asc',
    };

    const [total, rows] = await Promise.all([
      this.prisma.certificate.count({ where }),
      this.prisma.certificate.findMany({
        where,
        include: CERTIFICATE_LIST_INCLUDE,
        orderBy,
        skip,
        take,
      }),
    ]);

    const data = rows.map(({ renewalTasks, ...certificate }) => ({
      ...withRiskFields(certificate, now),
      currentTask: renewalTasks[0] ?? null,
    }));

    return { data, meta: buildMeta({ page, pageSize }, total, now) };
  }

  async findOne(id: string): Promise<CertificateDetail> {
    const now = new Date();
    const certificate = await this.prisma.certificate.findUnique({
      where: { id },
      include: CERTIFICATE_DETAIL_INCLUDE,
    });
    if (certificate === null) {
      throw new NotFoundException(`ไม่พบ certificate id ${id}`);
    }

    return {
      ...withRiskFields(certificate, now),
      currentTask: certificate.renewalTasks[0] ?? null,
    };
  }

  /**
   * ดึงทุกแถวที่ตรงตัวกรอง (ไม่แบ่งหน้า) สำหรับ Export Excel ใน Phase 8
   *
   * ใช้ตัวกรองชุดเดียวกับหน้าจอ (`buildWhere`) เพื่อให้ไฟล์ที่ได้ตรงกับที่ผู้ใช้เห็นจริง
   * มีเพดานกันดึงทั้งฐานข้อมูลในคำขอเดียว และ**คืนค่ามาว่าถูกตัดหรือไม่** ไม่ตัดแบบเงียบๆ
   */
  async findAllForExport(
    query: ListCertificatesDto,
    limit = EXPORT_ROW_LIMIT,
  ): Promise<{ rows: CertificateListItem[]; asOf: Date; truncated: boolean }> {
    const now = new Date();
    const where = await this.buildWhere(query, now);
    const rows = await this.prisma.certificate.findMany({
      where,
      include: CERTIFICATE_LIST_INCLUDE,
      orderBy: { [query.sortBy ?? 'expiresAt']: query.order ?? 'asc' },
      // ขอเกินมา 1 แถวเพื่อรู้ว่ายังมีต่อหรือไม่
      take: limit + 1,
    });

    const truncated = rows.length > limit;
    return {
      rows: rows.slice(0, limit).map(({ renewalTasks, ...certificate }) => ({
        ...withRiskFields(certificate, now),
        currentTask: renewalTasks[0] ?? null,
      })),
      asOf: now,
      truncated,
    };
  }

  /** ใช้ภายในโมดูลอื่น (attachments/tasks) ที่ต้องยืนยันว่า cert มีจริงก่อนทำงาน */
  async assertExists(id: string): Promise<{ id: string; companyId: string; commonName: string }> {
    const certificate = await this.prisma.certificate.findUnique({
      where: { id },
      select: { id: true, companyId: true, commonName: true },
    });
    if (certificate === null) {
      throw new NotFoundException(`ไม่พบ certificate id ${id}`);
    }
    return certificate;
  }

  // ===== ภายใน =====

  private async buildWhere(
    query: ListCertificatesDto,
    now: Date,
  ): Promise<Prisma.CertificateWhereInput> {
    const where: Prisma.CertificateWhereInput = {};

    if (query.includeInactive !== 'true') {
      where.isActive = true;
    }
    if (query.companyId !== undefined) {
      where.companyId = query.companyId;
    }
    if (query.siteId !== undefined) {
      where.siteId = query.siteId;
    }
    if (query.search !== undefined && query.search.length > 0) {
      const contains = { contains: query.search, mode: Prisma.QueryMode.insensitive };
      where.OR = [
        { commonName: contains },
        { endpoint: contains },
        { owner: contains },
        { issuer: contains },
      ];
    }

    const windows: ExpiryWindow[] = [];
    if (query.month !== undefined) {
      windows.push(monthExpiryWindow(query.month));
    }
    if (query.risk !== undefined) {
      windows.push(riskExpiryWindow(query.risk, now));
    }
    if (query.expired === 'true') {
      windows.push(expiredExpiryWindow(now));
    }
    if (query.expired === 'false') {
      // ยังไม่หมดอายุ = เหลืออย่างน้อย 0 วัน (หมดอายุวันนี้ยังไม่ถือว่าหมด)
      windows.push(expiryWindowForDayRange(0, null, now));
    }
    const expiresAt = intersectExpiryWindows(windows);
    if (expiresAt !== undefined) {
      where.expiresAt = expiresAt;
    }

    if (query.status !== undefined) {
      where.id = { in: await this.certificateIdsByStatus(query.status, query.companyId) };
    }

    return where;
  }

  private async certificateIdsByStatus(status: WorkStatus, companyId?: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<Array<{ certificateId: string }>>(
      certificateIdsByCurrentStatusSql(status, companyId),
    );
    return rows.map((row) => row.certificateId);
  }
}
