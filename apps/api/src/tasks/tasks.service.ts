/**
 * Renewal Workflow API
 *
 * กฎที่ต้องไม่พลาด:
 *  - เปลี่ยนสถานะได้เฉพาะ transition ที่ถูกต้อง (ดู transitions.ts) — ข้ามขั้นต้องได้ 400
 *  - ทุกการมอบหมาย/เปลี่ยนสถานะลง HistoryLog พร้อม actor และ from→to ใน metadata (กฎเหล็กข้อ 6)
 *    และเขียนใน transaction เดียวกับการอัปเดต ไม่ให้เกิด "เปลี่ยนสำเร็จแต่ประวัติหาย"
 *  - สถานะงานไม่เกี่ยวกับความเสี่ยง: cert เหลือ 20 วัน (High) แต่งาน Completed ได้ (กฎเหล็กข้อ 5)
 */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { HistoryAction, Prisma, RenewalTask, UserRole, WorkStatus } from '@prisma/client';
import { riskExpiryWindow, type ExpiryWindow } from '@cert-tracker/shared';
import { AuthenticatedUser } from '../auth/auth.types';
import { intersectExpiryWindows, monthExpiryWindow } from '../common/expiry-filter';
import { buildMeta, paginationArgs, type Paginated } from '../common/pagination';
import { withRiskFields } from '../common/risk-fields';
import { workStatusLabel } from '../common/status-label';
import { HistoryService } from '../history/history.service';
import { PrismaService } from '../prisma/prisma.service';
import { AssignTaskDto } from './dto/assign-task.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { ListTasksDto } from './dto/list-tasks.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import {
  TASK_DETAIL_INCLUDE,
  TASK_LIST_INCLUDE,
  type TaskDetail,
  type TaskListItem,
} from './tasks.types';
import {
  checkTransition,
  historyActionForStatus,
  isTerminal,
  OPEN_TASK_STATUSES,
} from './transitions';

/** role ที่รับงานต่ออายุได้ — viewer อ่านได้อย่างเดียวจึงมอบหมายให้ไม่ได้ */
const ASSIGNABLE_ROLES: UserRole[] = [UserRole.ADMIN, UserRole.OPERATOR];

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly history: HistoryService,
  ) {}

  async findAll(query: ListTasksDto): Promise<Paginated<TaskListItem>> {
    const now = new Date();
    const { page, pageSize, skip, take } = paginationArgs(query);
    const where = this.buildWhere(query, now);
    const sortBy = query.sortBy ?? 'expiresAt';
    const order = query.order ?? 'asc';
    const orderBy: Prisma.RenewalTaskOrderByWithRelationInput =
      sortBy === 'expiresAt' ? { certificate: { expiresAt: order } } : { [sortBy]: order };

    const [total, rows] = await Promise.all([
      this.prisma.renewalTask.count({ where }),
      this.prisma.renewalTask.findMany({
        where,
        include: TASK_LIST_INCLUDE,
        orderBy,
        skip,
        take,
      }),
    ]);

    const data = rows.map((task) => ({
      ...task,
      certificate: withRiskFields(task.certificate, now),
    }));

    return { data, meta: buildMeta({ page, pageSize }, total, now) };
  }

  async findOne(id: string): Promise<TaskDetail> {
    const now = new Date();
    const task = await this.prisma.renewalTask.findUnique({
      where: { id },
      include: TASK_DETAIL_INCLUDE,
    });
    if (task === null) {
      throw new NotFoundException(`ไม่พบงานต่ออายุ id ${id}`);
    }
    return { ...task, certificate: withRiskFields(task.certificate, now) };
  }

  /** เปิดงานต่ออายุใบใหม่ — cert หนึ่งใบมีงานค้างได้ครั้งละ 1 ใบ */
  async create(dto: CreateTaskDto, actor: AuthenticatedUser): Promise<RenewalTask> {
    const certificate = await this.prisma.certificate.findUnique({
      where: { id: dto.certificateId },
      select: { id: true, companyId: true, commonName: true, endpoint: true },
    });
    if (certificate === null) {
      throw new NotFoundException(`ไม่พบ certificate id ${dto.certificateId}`);
    }

    const openTask = await this.prisma.renewalTask.findFirst({
      where: { certificateId: certificate.id, status: { in: OPEN_TASK_STATUSES } },
    });
    if (openTask !== null) {
      throw new ConflictException(
        `certificate นี้มีงานค้างอยู่แล้ว (สถานะ "${workStatusLabel(openTask.status)}") — ` +
          'ปิดงานเดิมก่อนจึงเปิดใบใหม่ได้',
      );
    }

    const assignee =
      dto.assigneeId === undefined ? null : await this.assertAssignable(dto.assigneeId);
    // มีผู้รับผิดชอบตั้งแต่เปิดงาน = เข้าสถานะ Assigned ทันที (สถานะต้องตรงกับความจริง)
    const status = assignee === null ? WorkStatus.NEW : WorkStatus.ASSIGNED;

    return this.prisma.$transaction(async (tx) => {
      const task = await tx.renewalTask.create({
        data: {
          certificateId: certificate.id,
          status,
          assigneeId: assignee?.id ?? null,
          dueDate: dto.dueDate === undefined ? null : new Date(dto.dueDate),
          note: dto.note?.trim() ?? null,
        },
      });

      await this.history.writeWithin(tx, {
        action: HistoryAction.TASK_CREATED,
        actor: actor.email,
        actorId: actor.id,
        certificateId: certificate.id,
        companyId: certificate.companyId,
        renewalTaskId: task.id,
        detail:
          `เปิดงานต่ออายุของ ${certificate.commonName} สถานะ "${workStatusLabel(status)}"` +
          (assignee === null ? '' : ` มอบหมายให้ ${assignee.name}`),
        metadata: { source: 'manual', assigneeId: assignee?.id ?? null },
      });

      return task;
    });
  }

  async changeStatus(
    id: string,
    dto: UpdateTaskStatusDto,
    actor: AuthenticatedUser,
  ): Promise<RenewalTask> {
    const task = await this.findForUpdate(id);

    const check = checkTransition(task.status, dto.status);
    if (!check.ok) {
      throw new BadRequestException(check.reason);
    }

    const note = dto.note?.trim();
    const data: Prisma.RenewalTaskUpdateInput = {
      status: dto.status,
      // เวลาที่ปิดงานจริง — ใช้ทำรายงานย้อนหลังใน Phase 8
      completedAt: dto.status === WorkStatus.COMPLETED ? new Date() : null,
      ...(note === undefined || note.length === 0 ? {} : { note }),
    };

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.renewalTask.update({ where: { id }, data });

      await this.history.writeWithin(tx, {
        action: historyActionForStatus(dto.status),
        actor: actor.email,
        actorId: actor.id,
        certificateId: task.certificateId,
        companyId: task.certificate.companyId,
        renewalTaskId: task.id,
        detail:
          `เปลี่ยนสถานะงานของ ${task.certificate.commonName} จาก ` +
          `"${workStatusLabel(task.status)}" เป็น "${workStatusLabel(dto.status)}"` +
          (note === undefined || note.length === 0 ? '' : ` — ${note}`),
        metadata: { from: task.status, to: dto.status, note: note ?? null },
      });

      return updated;
    });
  }

  /** มอบหมาย / เปลี่ยนผู้รับผิดชอบ / ถอนการมอบหมาย (`assigneeId: null`) */
  async assign(id: string, dto: AssignTaskDto, actor: AuthenticatedUser): Promise<RenewalTask> {
    const task = await this.findForUpdate(id);
    if (isTerminal(task.status)) {
      throw new BadRequestException(
        `งานนี้ปิดแล้ว (สถานะ "${workStatusLabel(task.status)}") มอบหมายต่อไม่ได้`,
      );
    }

    const assignee = dto.assigneeId === null ? null : await this.assertAssignable(dto.assigneeId);
    const note = dto.note?.trim();
    // มอบหมายงานที่ยังเป็น "รายการใหม่" = เดินหน้าไป Assigned ตาม workflow
    const nextStatus =
      assignee !== null && task.status === WorkStatus.NEW ? WorkStatus.ASSIGNED : task.status;

    const data: Prisma.RenewalTaskUpdateInput = {
      assignee: assignee === null ? { disconnect: true } : { connect: { id: assignee.id } },
      ...(nextStatus === task.status ? {} : { status: nextStatus }),
      ...(dto.dueDate === undefined ? {} : { dueDate: new Date(dto.dueDate) }),
      ...(note === undefined || note.length === 0 ? {} : { note }),
    };

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.renewalTask.update({ where: { id }, data });

      await this.history.writeWithin(tx, {
        action: HistoryAction.ASSIGN,
        actor: actor.email,
        actorId: actor.id,
        certificateId: task.certificateId,
        companyId: task.certificate.companyId,
        renewalTaskId: task.id,
        detail:
          assignee === null
            ? `ถอนการมอบหมายงานของ ${task.certificate.commonName}`
            : `มอบหมายงานของ ${task.certificate.commonName} ให้ ${assignee.name} (${assignee.email})`,
        metadata: {
          from: task.assigneeId,
          to: assignee?.id ?? null,
          dueDate: dto.dueDate ?? null,
        },
      });

      // การเดินหน้าสถานะอัตโนมัติต้องมีบรรทัดของตัวเองในประวัติ ไม่ซ่อนอยู่ในรายการมอบหมาย
      if (nextStatus !== task.status) {
        await this.history.writeWithin(tx, {
          action: HistoryAction.STATUS_CHANGE,
          actor: actor.email,
          actorId: actor.id,
          certificateId: task.certificateId,
          companyId: task.certificate.companyId,
          renewalTaskId: task.id,
          detail:
            `เปลี่ยนสถานะจาก "${workStatusLabel(task.status)}" เป็น ` +
            `"${workStatusLabel(nextStatus)}" อัตโนมัติเพราะมีผู้รับผิดชอบแล้ว`,
          metadata: { from: task.status, to: nextStatus, reason: 'assign' },
        });
      }

      return updated;
    });
  }

  // ===== ภายใน =====

  private buildWhere(query: ListTasksDto, now: Date): Prisma.RenewalTaskWhereInput {
    const where: Prisma.RenewalTaskWhereInput = {};

    if (query.certificateId !== undefined) {
      where.certificateId = query.certificateId;
    }
    if (query.assigneeId !== undefined) {
      where.assigneeId = query.assigneeId;
    }
    if (query.status !== undefined) {
      where.status = query.status;
    } else if (query.open === 'true') {
      where.status = { in: OPEN_TASK_STATUSES };
    } else if (query.open === 'false') {
      where.status = { notIn: OPEN_TASK_STATUSES };
    }

    const windows: ExpiryWindow[] = [];
    if (query.month !== undefined) {
      windows.push(monthExpiryWindow(query.month));
    }
    if (query.risk !== undefined) {
      windows.push(riskExpiryWindow(query.risk, now));
    }
    const expiresAt = intersectExpiryWindows(windows);

    if (query.companyId !== undefined || expiresAt !== undefined) {
      where.certificate = {
        ...(query.companyId === undefined ? {} : { companyId: query.companyId }),
        ...(expiresAt === undefined ? {} : { expiresAt }),
      };
    }

    return where;
  }

  private async findForUpdate(id: string): Promise<
    RenewalTask & {
      certificate: { id: string; companyId: string; commonName: string };
    }
  > {
    const task = await this.prisma.renewalTask.findUnique({
      where: { id },
      include: { certificate: { select: { id: true, companyId: true, commonName: true } } },
    });
    if (task === null) {
      throw new NotFoundException(`ไม่พบงานต่ออายุ id ${id}`);
    }
    return task;
  }

  private async assertAssignable(
    assigneeId: string,
  ): Promise<{ id: string; name: string; email: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: assigneeId },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });
    if (user === null) {
      throw new NotFoundException(`ไม่พบผู้ใช้ id ${assigneeId}`);
    }
    if (!user.isActive) {
      throw new BadRequestException(`บัญชี ${user.email} ถูกปิดใช้งาน มอบหมายงานให้ไม่ได้`);
    }
    if (!ASSIGNABLE_ROLES.includes(user.role)) {
      throw new BadRequestException(
        `บัญชี ${user.email} เป็น ${user.role} ซึ่งอ่านข้อมูลได้เท่านั้น — ` +
          `มอบหมายงานได้เฉพาะ ${ASSIGNABLE_ROLES.join(' หรือ ')}`,
      );
    }
    return { id: user.id, name: user.name, email: user.email };
  }
}
