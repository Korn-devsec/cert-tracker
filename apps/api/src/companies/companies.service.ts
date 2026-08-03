import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Company, HistoryAction, Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.types';
import { HistoryService } from '../history/history.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { ListCompaniesDto } from './dto/list-companies.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly history: HistoryService,
  ) {}

  async findAll(query: ListCompaniesDto): Promise<Company[]> {
    const where: Prisma.CompanyWhereInput = {};
    if (query.includeInactive !== 'true') {
      where.isActive = true;
    }
    if (query.search !== undefined && query.search.length > 0) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { code: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.company.findMany({ where, orderBy: { name: 'asc' } });
  }

  async findOne(id: string): Promise<Company> {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: {
        sites: { orderBy: { name: 'asc' } },
        _count: { select: { certificates: true, sites: true } },
      },
    });
    if (company === null) {
      throw new NotFoundException(`ไม่พบบริษัท id ${id}`);
    }
    return company;
  }

  async create(dto: CreateCompanyDto, actor: AuthenticatedUser): Promise<Company> {
    const code = dto.code.trim().toUpperCase();
    const existing = await this.prisma.company.findUnique({ where: { code } });
    if (existing !== null) {
      throw new ConflictException(`มีบริษัทรหัส ${code} อยู่ในระบบแล้ว`);
    }

    // สร้างบริษัทและเขียนประวัติใน transaction เดียว — ห้ามมีบริษัทที่ไม่มีต้นทางว่าใครสร้าง
    return this.prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: dto.name.trim(),
          code,
          contactEmail: dto.contactEmail?.trim() ?? null,
        },
      });

      await this.history.writeWithin(tx, {
        action: HistoryAction.COMPANY_CREATED,
        actor: actor.email,
        actorId: actor.id,
        companyId: company.id,
        detail: `สร้างบริษัท ${company.name} (${company.code})`,
      });

      return company;
    });
  }

  async update(id: string, dto: UpdateCompanyDto, actor: AuthenticatedUser): Promise<Company> {
    const before = await this.prisma.company.findUnique({ where: { id } });
    if (before === null) {
      throw new NotFoundException(`ไม่พบบริษัท id ${id}`);
    }

    const data: Prisma.CompanyUpdateInput = {};
    if (dto.name !== undefined) {
      data.name = dto.name.trim();
    }
    if (dto.contactEmail !== undefined) {
      data.contactEmail = dto.contactEmail.trim();
    }
    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
    }
    if (Object.keys(data).length === 0) {
      return before;
    }

    return this.prisma.$transaction(async (tx) => {
      const company = await tx.company.update({ where: { id }, data });

      await this.history.writeWithin(tx, {
        action: HistoryAction.COMPANY_UPDATED,
        actor: actor.email,
        actorId: actor.id,
        companyId: company.id,
        detail: `แก้ไขข้อมูลบริษัท ${company.name} (${company.code})`,
        metadata: buildChangeMetadata(before, company),
      });

      return company;
    });
  }

  /**
   * ปิดใช้งานบริษัท = soft delete (`isActive = false`) ตาม PLAN.md Phase 2
   * ไม่ลบข้อมูลจริง เพราะ certificate/ประวัติที่ผูกอยู่ต้องตรวจย้อนหลังได้
   */
  async deactivate(id: string, actor: AuthenticatedUser): Promise<Company> {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: { _count: { select: { certificates: true } } },
    });
    if (company === null) {
      throw new NotFoundException(`ไม่พบบริษัท id ${id}`);
    }
    if (!company.isActive) {
      throw new ConflictException(`บริษัท ${company.code} ถูกปิดใช้งานอยู่แล้ว`);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.company.update({ where: { id }, data: { isActive: false } });

      await this.history.writeWithin(tx, {
        action: HistoryAction.COMPANY_DEACTIVATED,
        actor: actor.email,
        actorId: actor.id,
        companyId: updated.id,
        detail:
          `ปิดใช้งานบริษัท ${updated.name} (${updated.code}) — ` +
          `ยังมี certificate ผูกอยู่ ${company._count.certificates} รายการ`,
        metadata: { certificateCount: company._count.certificates },
      });

      return updated;
    });
  }
}

/** เก็บเฉพาะฟิลด์ที่เปลี่ยนจริงลง metadata เพื่อให้ประวัติอ่านง่าย */
function buildChangeMetadata(before: Company, after: Company): Prisma.InputJsonValue {
  const changes: Record<string, { from: string | boolean | null; to: string | boolean | null }> =
    {};
  const fields: Array<keyof Pick<Company, 'name' | 'contactEmail' | 'isActive'>> = [
    'name',
    'contactEmail',
    'isActive',
  ];

  for (const field of fields) {
    if (before[field] !== after[field]) {
      changes[field] = { from: before[field], to: after[field] };
    }
  }
  return { changes };
}
