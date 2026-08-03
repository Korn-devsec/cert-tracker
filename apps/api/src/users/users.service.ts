/**
 * จัดการผู้ใช้สำหรับหน้า Settings/Users (Phase 7) และ dropdown ผู้รับผิดชอบในหน้า Tasks
 *
 * การ**สร้าง**ผู้ใช้ยังอยู่ที่ `POST /auth/register` (ทำไว้แล้วใน Phase 2 พร้อม HistoryLog)
 * ที่นี่รับผิดชอบเฉพาะ "ดูรายชื่อ" และ "แก้ไข" เพื่อไม่ให้มีโค้ดสร้างผู้ใช้สองที่
 *
 * ไม่คืน `passwordHash` ออกจาก service เด็ดขาด
 */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { HistoryAction, Prisma, User, UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.types';
import { hashPassword } from '../common/password';
import { HistoryService } from '../history/history.service';
import { PrismaService } from '../prisma/prisma.service';
import { ListUsersDto } from './dto/list-users.dto';
import { UpdateUserDto } from './dto/update-user.dto';

/** ฟิลด์ที่ส่งออก API — ไม่มี passwordHash */
const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export type UserView = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly history: HistoryService,
  ) {}

  async findAll(query: ListUsersDto): Promise<UserView[]> {
    const where: Prisma.UserWhereInput = {};
    if (query.includeInactive !== 'true') {
      where.isActive = true;
    }
    if (query.role !== undefined) {
      where.role = query.role;
    }
    if (query.search !== undefined && query.search.length > 0) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.user.findMany({
      where,
      select: USER_SELECT,
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });
  }

  async update(id: string, dto: UpdateUserDto, actor: AuthenticatedUser): Promise<UserView> {
    const before = await this.prisma.user.findUnique({ where: { id } });
    if (before === null) {
      throw new NotFoundException(`ไม่พบผู้ใช้ id ${id}`);
    }

    // กันผู้ดูแลล็อกตัวเองออกจากระบบ (ปิดบัญชีตัวเอง หรือลดสิทธิ์ตัวเอง)
    if (before.id === actor.id) {
      if (dto.isActive === false) {
        throw new ForbiddenException('ปิดใช้งานบัญชีของตัวเองไม่ได้');
      }
      if (dto.role !== undefined && dto.role !== before.role) {
        throw new ForbiddenException('เปลี่ยน role ของตัวเองไม่ได้ — ให้ผู้ดูแลคนอื่นเปลี่ยนให้');
      }
    }

    // ต้องมีผู้ดูแลที่ใช้งานได้เหลืออยู่ในระบบเสมอ
    if (before.role === UserRole.ADMIN && willLoseAdmin(dto)) {
      const activeAdmins = await this.prisma.user.count({
        where: { role: UserRole.ADMIN, isActive: true, id: { not: id } },
      });
      if (activeAdmins === 0) {
        throw new BadRequestException(
          'ระบบต้องมีผู้ดูแล (ADMIN) ที่ใช้งานได้อย่างน้อยหนึ่งบัญชี — สร้างผู้ดูแลคนใหม่ก่อน',
        );
      }
    }

    const data: Prisma.UserUpdateInput = {};
    if (dto.name !== undefined) {
      data.name = dto.name.trim();
    }
    if (dto.role !== undefined) {
      data.role = dto.role;
    }
    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
    }
    if (dto.password !== undefined) {
      data.passwordHash = await hashPassword(dto.password);
    }
    if (Object.keys(data).length === 0) {
      return toView(before);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({ where: { id }, data, select: USER_SELECT });

      await this.history.writeWithin(tx, {
        action: HistoryAction.USER_UPDATED,
        actor: actor.email,
        actorId: actor.id,
        detail: `แก้ไขบัญชี ${updated.email}: ${describeChanges(before, dto)}`,
        metadata: {
          userId: updated.id,
          changes: {
            ...(dto.name === undefined ? {} : { name: { from: before.name, to: updated.name } }),
            ...(dto.role === undefined ? {} : { role: { from: before.role, to: updated.role } }),
            ...(dto.isActive === undefined
              ? {}
              : { isActive: { from: before.isActive, to: updated.isActive } }),
            ...(dto.password === undefined ? {} : { password: 'reset' }),
          },
        },
      });

      return updated;
    });
  }
}

/** การแก้ไขนี้ทำให้บัญชีนี้ไม่เป็นผู้ดูแลที่ใช้งานได้อีกหรือไม่ */
function willLoseAdmin(dto: UpdateUserDto): boolean {
  return dto.isActive === false || (dto.role !== undefined && dto.role !== UserRole.ADMIN);
}

function describeChanges(before: User, dto: UpdateUserDto): string {
  const parts: string[] = [];
  if (dto.name !== undefined && dto.name.trim() !== before.name) {
    parts.push(`ชื่อ ${before.name} → ${dto.name.trim()}`);
  }
  if (dto.role !== undefined && dto.role !== before.role) {
    parts.push(`role ${before.role} → ${dto.role}`);
  }
  if (dto.isActive !== undefined && dto.isActive !== before.isActive) {
    parts.push(dto.isActive ? 'เปิดใช้งานบัญชี' : 'ปิดใช้งานบัญชี');
  }
  if (dto.password !== undefined) {
    parts.push('ตั้งรหัสผ่านใหม่');
  }
  return parts.length > 0 ? parts.join(', ') : 'ไม่มีการเปลี่ยนแปลง';
}

/** เขียนฟิลด์ที่ส่งออกทีละตัว เพื่อให้แน่ใจว่า passwordHash ไม่หลุดออกไปแม้ schema เพิ่มคอลัมน์ใหม่ */
function toView(user: User): UserView {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
