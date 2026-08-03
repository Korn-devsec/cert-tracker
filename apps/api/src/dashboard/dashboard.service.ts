/**
 * ตัวเลขสรุปสำหรับ Dashboard (การ์ดสรุป + Doughnut ความเสี่ยง + Grouped Bar สถานะงาน)
 *
 * ดึงข้อมูลด้วย query เดียว: certificate ที่อยู่ในขอบเขต + สถานะของ **task ล่าสุด** ของแต่ละใบ
 * แล้วนับใน JS ด้วย `calculateRisk()` จาก packages/shared
 *
 * ที่ทำแบบนี้เพราะเกณฑ์ความเสี่ยง 30/60/90 ต้องมีที่มาที่เดียว — ถ้าเขียนเป็น CASE WHEN ใน SQL
 * วันหนึ่งเกณฑ์บน Dashboard จะไม่ตรงกับ badge ในตาราง แล้วไม่มีใครรู้ว่าฝั่งไหนถูก
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, WorkStatus } from '@prisma/client';
import { RiskLevel } from '@cert-tracker/shared';
import { andWhere, CURRENT_TASK_SQL } from '../common/current-task';
import { monthExpiryWindow } from '../common/expiry-filter';
import { riskFields } from '../common/risk-fields';
import { PrismaService } from '../prisma/prisma.service';
import {
  emptyRiskCounts,
  emptyRiskStatusCounts,
  emptyStatusCounts,
  type DashboardSummary,
} from './dashboard.types';
import { DashboardSummaryDto } from './dto/dashboard-summary.dto';

interface SnapshotRow {
  certificateId: string;
  expiresAt: Date;
  /** null = cert ใบนี้ยังไม่มีงานต่ออายุเลย */
  status: WorkStatus | null;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(query: DashboardSummaryDto): Promise<DashboardSummary> {
    const now = new Date();

    if (query.companyId !== undefined) {
      const company = await this.prisma.company.findUnique({
        where: { id: query.companyId },
        select: { id: true },
      });
      if (company === null) {
        throw new NotFoundException(`ไม่พบบริษัท id ${query.companyId}`);
      }
    }

    const rows = await this.snapshot(query);

    const byRisk = emptyRiskCounts();
    const byStatus = emptyStatusCounts();
    const byRiskStatus = emptyRiskStatusCounts();
    let noTask = 0;
    let expiringSoon = 0;
    let expired = 0;
    let completed = 0;
    let pending = 0;
    let cancelled = 0;

    for (const row of rows) {
      const risk = riskFields(row.expiresAt, now);
      byRisk[risk.riskLevel]++;

      if (risk.isExpired) {
        expired++;
      } else if (risk.riskLevel === RiskLevel.HIGH) {
        // HIGH = เหลือไม่เกิน 30 วัน (รวมที่หมดอายุแล้ว) — ตัดที่หมดอายุออกไปแล้วคือ "ใกล้หมดอายุ"
        expiringSoon++;
      }

      if (row.status === null) {
        noTask++;
      } else {
        byStatus[row.status]++;
      }

      if (row.status === WorkStatus.COMPLETED) {
        completed++;
        byRiskStatus[risk.riskLevel].done++;
      } else if (row.status === WorkStatus.CANCELLED) {
        cancelled++;
        byRiskStatus[risk.riskLevel].cancelled++;
      } else {
        // ไม่มีงาน หรือมีงานที่ยังไม่ปิด = ยังค้าง
        pending++;
        byRiskStatus[risk.riskLevel].pending++;
      }
    }

    return {
      asOf: now.toISOString(),
      companyId: query.companyId ?? null,
      month: query.month ?? null,
      total: rows.length,
      byRisk,
      byStatus,
      byRiskStatus,
      noTask,
      expiringSoon,
      expired,
      completed,
      pending,
      cancelled,
    };
  }

  /** cert ที่ยังใช้งาน (isActive) ในขอบเขตที่กรอง + สถานะงานล่าสุดของแต่ละใบ */
  private async snapshot(query: DashboardSummaryDto): Promise<SnapshotRow[]> {
    const conditions: Prisma.Sql[] = [Prisma.sql`c."isActive" = true`];

    if (query.companyId !== undefined) {
      conditions.push(Prisma.sql`c."companyId" = ${query.companyId}`);
    }
    if (query.month !== undefined) {
      const { gte, lt } = monthExpiryWindow(query.month);
      conditions.push(Prisma.sql`c."expiresAt" >= ${gte}`);
      conditions.push(Prisma.sql`c."expiresAt" < ${lt}`);
    }

    return this.prisma.$queryRaw<SnapshotRow[]>(Prisma.sql`
      SELECT c."id"        AS "certificateId",
             c."expiresAt" AS "expiresAt",
             cur."status"  AS "status"
      FROM "Certificate" c
      LEFT JOIN (${CURRENT_TASK_SQL}) cur ON cur."certificateId" = c."id"
      ${andWhere(conditions)}
    `);
  }
}
