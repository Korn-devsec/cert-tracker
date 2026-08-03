import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { HistoryAction, Site } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.types';
import { HistoryService } from '../history/history.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSiteDto, UpdateSiteDto } from './dto/site.dto';

/** Site เป็นชั้น optional ใต้ Company — certificate ผูกกับ site หรือไม่ก็ได้ */
@Injectable()
export class SitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly history: HistoryService,
  ) {}

  async findAll(companyId: string): Promise<Site[]> {
    await this.assertCompanyExists(companyId);
    return this.prisma.site.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { certificates: true } } },
    });
  }

  async create(companyId: string, dto: CreateSiteDto, actor: AuthenticatedUser): Promise<Site> {
    await this.assertCompanyExists(companyId);
    const name = dto.name.trim();

    const existing = await this.prisma.site.findUnique({
      where: { companyId_name: { companyId, name } },
    });
    if (existing !== null) {
      throw new ConflictException(`บริษัทนี้มี site ชื่อ "${name}" อยู่แล้ว`);
    }

    return this.prisma.$transaction(async (tx) => {
      const site = await tx.site.create({ data: { companyId, name } });

      await this.history.writeWithin(tx, {
        action: HistoryAction.SITE_CREATED,
        actor: actor.email,
        actorId: actor.id,
        companyId,
        detail: `สร้าง site "${site.name}"`,
        metadata: { siteId: site.id },
      });

      return site;
    });
  }

  async update(
    companyId: string,
    siteId: string,
    dto: UpdateSiteDto,
    actor: AuthenticatedUser,
  ): Promise<Site> {
    const before = await this.findSiteInCompany(companyId, siteId);
    if (dto.name === undefined) {
      return before;
    }

    const name = dto.name.trim();
    if (name === before.name) {
      return before;
    }

    const duplicate = await this.prisma.site.findUnique({
      where: { companyId_name: { companyId, name } },
    });
    if (duplicate !== null) {
      throw new ConflictException(`บริษัทนี้มี site ชื่อ "${name}" อยู่แล้ว`);
    }

    return this.prisma.$transaction(async (tx) => {
      const site = await tx.site.update({ where: { id: siteId }, data: { name } });

      await this.history.writeWithin(tx, {
        action: HistoryAction.SITE_UPDATED,
        actor: actor.email,
        actorId: actor.id,
        companyId,
        detail: `เปลี่ยนชื่อ site "${before.name}" → "${site.name}"`,
        metadata: { siteId: site.id, changes: { name: { from: before.name, to: site.name } } },
      });

      return site;
    });
  }

  /**
   * ลบ site จริง (ไม่ใช่ soft delete) — Site เป็นแค่ชั้นจัดกลุ่ม ไม่มีประวัติของตัวเอง
   * แต่ถ้ายังมี certificate ผูกอยู่จะไม่ให้ลบ เพื่อไม่ให้ cert หลุด site ไปแบบเงียบๆ
   */
  async remove(companyId: string, siteId: string, actor: AuthenticatedUser): Promise<void> {
    const site = await this.findSiteInCompany(companyId, siteId);
    const certificateCount = await this.prisma.certificate.count({ where: { siteId } });

    if (certificateCount > 0) {
      throw new ConflictException(
        `ลบ site "${site.name}" ไม่ได้ เพราะยังมี certificate ผูกอยู่ ${certificateCount} รายการ ` +
          'ให้ย้าย certificate ไป site อื่นก่อน',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.site.delete({ where: { id: siteId } });

      await this.history.writeWithin(tx, {
        action: HistoryAction.SITE_DELETED,
        actor: actor.email,
        actorId: actor.id,
        companyId,
        detail: `ลบ site "${site.name}"`,
        metadata: { siteId },
      });
    });
  }

  private async assertCompanyExists(companyId: string): Promise<void> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });
    if (company === null) {
      throw new NotFoundException(`ไม่พบบริษัท id ${companyId}`);
    }
  }

  private async findSiteInCompany(companyId: string, siteId: string): Promise<Site> {
    const site = await this.prisma.site.findFirst({ where: { id: siteId, companyId } });
    if (site === null) {
      throw new NotFoundException(`ไม่พบ site id ${siteId} ในบริษัทนี้`);
    }
    return site;
  }
}
