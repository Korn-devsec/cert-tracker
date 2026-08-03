import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HistoryAction, UserRole, WorkStatus } from '@prisma/client';
import { RiskLevel } from '@cert-tracker/shared';
import { AuthenticatedUser } from '../auth/auth.types';
import { HistoryService } from '../history/history.service';
import { PrismaService } from '../prisma/prisma.service';
import { TasksService } from './tasks.service';

const operator: AuthenticatedUser = {
  id: 'operator-id',
  email: 'operator@example.com',
  name: 'ผู้ปฏิบัติงาน',
  role: UserRole.OPERATOR,
};

const CERT = {
  id: 'cert-1',
  companyId: 'company-1',
  commonName: 'sme-portal.example.co.th',
};

interface TaskStub {
  id: string;
  certificateId: string;
  status: WorkStatus;
  assigneeId: string | null;
  dueDate: Date | null;
  note: string | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  certificate: { id: string; companyId: string; commonName: string };
}

function taskRow(status: WorkStatus, assigneeId: string | null = null): TaskStub {
  return {
    id: 'task-1',
    certificateId: CERT.id,
    status,
    assigneeId,
    dueDate: null,
    note: null,
    completedAt: null,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    certificate: CERT,
  };
}

interface PrismaMock {
  renewalTask: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  certificate: { findUnique: jest.Mock };
  user: { findUnique: jest.Mock };
  $transaction: jest.Mock;
}

interface HistoryCall {
  action: HistoryAction;
  actor: string;
  detail?: string;
  metadata?: Record<string, unknown>;
}

describe('TasksService', () => {
  let service: TasksService;
  let prisma: PrismaMock;
  let writeWithin: jest.Mock;

  const historyCalls = (): HistoryCall[] =>
    writeWithin.mock.calls.map((call) => call[1] as HistoryCall);

  beforeEach(async () => {
    prisma = {
      renewalTask: {
        findUnique: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockImplementation(({ data }: { data: object }) => ({
          id: 'task-new',
          ...data,
        })),
        update: jest.fn().mockImplementation(({ data }: { data: object }) => ({
          id: 'task-1',
          ...data,
        })),
      },
      certificate: { findUnique: jest.fn().mockResolvedValue(CERT) },
      user: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    };
    // ให้ callback ทำงานบน mock ตัวเดิม เพื่อยืนยันว่า update + history อยู่ใน transaction เดียว
    prisma.$transaction.mockImplementation((callback: (tx: PrismaMock) => unknown) =>
      callback(prisma),
    );
    writeWithin = jest.fn();

    const moduleRef = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: PrismaService, useValue: prisma },
        { provide: HistoryService, useValue: { writeWithin } },
      ],
    }).compile();

    service = moduleRef.get(TasksService);
  });

  describe('changeStatus', () => {
    it('ข้ามขั้น (New → Completed) → 400 และไม่แตะ DB', async () => {
      prisma.renewalTask.findUnique.mockResolvedValue(taskRow(WorkStatus.NEW));

      await expect(
        service.changeStatus('task-1', { status: WorkStatus.COMPLETED }, operator),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.renewalTask.update).not.toHaveBeenCalled();
      expect(writeWithin).not.toHaveBeenCalled();
    });

    it('เปลี่ยนเป็นสถานะเดิม → 400', async () => {
      prisma.renewalTask.findUnique.mockResolvedValue(taskRow(WorkStatus.ASSIGNED));

      await expect(
        service.changeStatus('task-1', { status: WorkStatus.ASSIGNED }, operator),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('ไม่พบงาน → 404', async () => {
      prisma.renewalTask.findUnique.mockResolvedValue(null);

      await expect(
        service.changeStatus('task-1', { status: WorkStatus.ASSIGNED }, operator),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('transition ที่ถูกต้อง → อัปเดต + ลงประวัติ from→to พร้อม actor', async () => {
      prisma.renewalTask.findUnique.mockResolvedValue(taskRow(WorkStatus.ASSIGNED));

      await service.changeStatus(
        'task-1',
        { status: WorkStatus.IN_PROGRESS, note: '  เริ่มทำแล้ว  ' },
        operator,
      );

      expect(prisma.renewalTask.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { status: WorkStatus.IN_PROGRESS, completedAt: null, note: 'เริ่มทำแล้ว' },
      });
      const [history] = historyCalls();
      expect(history.action).toBe(HistoryAction.STATUS_CHANGE);
      expect(history.actor).toBe(operator.email);
      expect(history.metadata).toMatchObject({
        from: WorkStatus.ASSIGNED,
        to: WorkStatus.IN_PROGRESS,
        note: 'เริ่มทำแล้ว',
      });
      expect(history.detail).toContain(CERT.commonName);
    });

    it('ปิดงาน (Testing → Completed) → บันทึก completedAt และลงประวัติเป็น COMPLETE', async () => {
      prisma.renewalTask.findUnique.mockResolvedValue(taskRow(WorkStatus.TESTING));

      await service.changeStatus('task-1', { status: WorkStatus.COMPLETED }, operator);

      const updateArg = prisma.renewalTask.update.mock.calls[0][0] as {
        data: { completedAt: Date | null };
      };
      expect(updateArg.data.completedAt).toBeInstanceOf(Date);
      expect(historyCalls()[0].action).toBe(HistoryAction.COMPLETE);
    });

    it('ยกเลิกจากขั้นไหนก็ได้ → ลงประวัติเป็น CANCEL', async () => {
      prisma.renewalTask.findUnique.mockResolvedValue(taskRow(WorkStatus.WAITING_VENDOR));

      await service.changeStatus('task-1', { status: WorkStatus.CANCELLED }, operator);

      expect(historyCalls()[0].action).toBe(HistoryAction.CANCEL);
    });
  });

  describe('assign', () => {
    const assignee = {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'สมชาย',
      email: 'somchai@example.com',
      role: UserRole.OPERATOR,
      isActive: true,
    };

    it('มอบหมายงานที่ยังเป็น New → เดินหน้าเป็น Assigned และลงประวัติ 2 บรรทัด', async () => {
      prisma.renewalTask.findUnique.mockResolvedValue(taskRow(WorkStatus.NEW));
      prisma.user.findUnique.mockResolvedValue(assignee);

      await service.assign('task-1', { assigneeId: assignee.id }, operator);

      const updateArg = prisma.renewalTask.update.mock.calls[0][0] as {
        data: { status?: WorkStatus; assignee: unknown };
      };
      expect(updateArg.data.status).toBe(WorkStatus.ASSIGNED);
      expect(updateArg.data.assignee).toEqual({ connect: { id: assignee.id } });

      const actions = historyCalls().map((call) => call.action);
      expect(actions).toEqual([HistoryAction.ASSIGN, HistoryAction.STATUS_CHANGE]);
    });

    it('มอบหมายงานที่เดินไปแล้ว → เปลี่ยนแต่ผู้รับผิดชอบ ไม่ย้อนสถานะ', async () => {
      prisma.renewalTask.findUnique.mockResolvedValue(taskRow(WorkStatus.IN_PROGRESS));
      prisma.user.findUnique.mockResolvedValue(assignee);

      await service.assign('task-1', { assigneeId: assignee.id }, operator);

      const updateArg = prisma.renewalTask.update.mock.calls[0][0] as {
        data: { status?: WorkStatus };
      };
      expect(updateArg.data.status).toBeUndefined();
      expect(historyCalls()).toHaveLength(1);
    });

    it('ถอนการมอบหมาย (assigneeId = null) → disconnect และไม่แตะสถานะ', async () => {
      prisma.renewalTask.findUnique.mockResolvedValue(taskRow(WorkStatus.ASSIGNED, assignee.id));

      await service.assign('task-1', { assigneeId: null }, operator);

      const updateArg = prisma.renewalTask.update.mock.calls[0][0] as {
        data: { assignee: unknown; status?: WorkStatus };
      };
      expect(updateArg.data.assignee).toEqual({ disconnect: true });
      expect(updateArg.data.status).toBeUndefined();
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('มอบหมายให้ viewer → 400 (viewer อ่านได้เท่านั้น)', async () => {
      prisma.renewalTask.findUnique.mockResolvedValue(taskRow(WorkStatus.NEW));
      prisma.user.findUnique.mockResolvedValue({ ...assignee, role: UserRole.VIEWER });

      await expect(
        service.assign('task-1', { assigneeId: assignee.id }, operator),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.renewalTask.update).not.toHaveBeenCalled();
    });

    it('มอบหมายให้บัญชีที่ถูกปิดใช้งาน → 400', async () => {
      prisma.renewalTask.findUnique.mockResolvedValue(taskRow(WorkStatus.NEW));
      prisma.user.findUnique.mockResolvedValue({ ...assignee, isActive: false });

      await expect(
        service.assign('task-1', { assigneeId: assignee.id }, operator),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('มอบหมายให้ผู้ใช้ที่ไม่มีจริง → 404', async () => {
      prisma.renewalTask.findUnique.mockResolvedValue(taskRow(WorkStatus.NEW));
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.assign('task-1', { assigneeId: assignee.id }, operator),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('งานที่ปิดแล้ว → มอบหมายต่อไม่ได้ (400)', async () => {
      prisma.renewalTask.findUnique.mockResolvedValue(taskRow(WorkStatus.COMPLETED));

      await expect(
        service.assign('task-1', { assigneeId: assignee.id }, operator),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('create', () => {
    it('cert ไม่มีจริง → 404', async () => {
      prisma.certificate.findUnique.mockResolvedValue(null);

      await expect(service.create({ certificateId: CERT.id }, operator)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('มีงานค้างอยู่แล้ว → 409 (cert หนึ่งใบมีงานค้างครั้งละใบ)', async () => {
      prisma.renewalTask.findFirst.mockResolvedValue(taskRow(WorkStatus.IN_PROGRESS));

      await expect(service.create({ certificateId: CERT.id }, operator)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.renewalTask.create).not.toHaveBeenCalled();
    });

    it('เปิดงานใหม่พร้อมผู้รับผิดชอบ → สถานะ Assigned ตั้งแต่ต้น', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'assignee-1',
        name: 'สมชาย',
        email: 'somchai@example.com',
        role: UserRole.ADMIN,
        isActive: true,
      });

      await service.create({ certificateId: CERT.id, assigneeId: 'assignee-1' }, operator);

      const createArg = prisma.renewalTask.create.mock.calls[0][0] as {
        data: { status: WorkStatus; assigneeId: string | null };
      };
      expect(createArg.data.status).toBe(WorkStatus.ASSIGNED);
      expect(createArg.data.assigneeId).toBe('assignee-1');
      expect(historyCalls()[0].action).toBe(HistoryAction.TASK_CREATED);
    });

    it('เปิดงานเปล่า → สถานะ New', async () => {
      await service.create({ certificateId: CERT.id }, operator);

      const createArg = prisma.renewalTask.create.mock.calls[0][0] as {
        data: { status: WorkStatus };
      };
      expect(createArg.data.status).toBe(WorkStatus.NEW);
    });
  });

  describe('findAll', () => {
    it('ค่าเริ่มต้น: เรียงตามวันหมดอายุของ cert และแบ่งหน้า 25 รายการ', async () => {
      await service.findAll({});

      expect(prisma.renewalTask.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { certificate: { expiresAt: 'asc' } },
          skip: 0,
          take: 25,
        }),
      );
    });

    it('กรอง open=true → เฉพาะสถานะที่ยังไม่ปิด', async () => {
      await service.findAll({ open: 'true' });

      const arg = prisma.renewalTask.findMany.mock.calls[0][0] as {
        where: { status: { in: WorkStatus[] } };
      };
      expect(arg.where.status.in).not.toContain(WorkStatus.COMPLETED);
      expect(arg.where.status.in).toContain(WorkStatus.NEW);
    });

    it('กรอง risk → แปลงเป็นช่วงวันหมดอายุของ certificate (ไม่กรองใน JS)', async () => {
      await service.findAll({ risk: RiskLevel.MEDIUM, companyId: 'company-1' });

      const arg = prisma.renewalTask.findMany.mock.calls[0][0] as {
        where: { certificate: { companyId: string; expiresAt: { gte: Date; lt: Date } } };
      };
      expect(arg.where.certificate.companyId).toBe('company-1');
      const spanDays =
        (arg.where.certificate.expiresAt.lt.getTime() -
          arg.where.certificate.expiresAt.gte.getTime()) /
        86_400_000;
      expect(spanDays).toBe(30); // 31–60 วัน
    });

    it('เติม riskLevel/daysUntilExpiry ให้ certificate ในผลลัพธ์', async () => {
      const expiresAt = new Date(Date.now() + 20 * 86_400_000);
      prisma.renewalTask.count.mockResolvedValue(1);
      prisma.renewalTask.findMany.mockResolvedValue([
        { ...taskRow(WorkStatus.COMPLETED), certificate: { ...CERT, expiresAt } },
      ]);

      const result = await service.findAll({});

      // กฎเหล็กข้อ 5: ความเสี่ยงสูงพร้อมกับงานที่ปิดแล้วเป็นเรื่องปกติ
      expect(result.data[0].certificate.riskLevel).toBe(RiskLevel.HIGH);
      expect(result.data[0].certificate.daysUntilExpiry).toBe(20);
      expect(result.data[0].status).toBe(WorkStatus.COMPLETED);
      expect(result.meta).toMatchObject({ page: 1, pageSize: 25, total: 1, totalPages: 1 });
    });
  });
});
