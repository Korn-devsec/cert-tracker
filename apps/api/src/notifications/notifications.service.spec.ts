import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HistoryAction, NotificationChannel, NotificationTier, WorkStatus } from '@prisma/client';
import { startOfUtcDay } from '@cert-tracker/shared';
import { HistoryService } from '../history/history.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  NOTIFICATION_CHANNELS,
  type NotificationChannelAdapter,
  type NotificationMessage,
  type SendResult,
} from './channels/notification-channel';
import { NotificationsService } from './notifications.service';

const MS_PER_DAY = 86_400_000;
const NOW = new Date('2026-08-03T09:00:00.000Z');
const TODAY = startOfUtcDay(NOW);

interface CertificateStub {
  id: string;
  companyId: string;
  commonName: string;
  endpoint: string;
  owner: string | null;
  issuer: string | null;
  expiresAt: Date;
  company: { id: string; name: string; code: string; contactEmail: string | null };
  renewalTasks: Array<{ id: string; status: WorkStatus }>;
}

function certificate(
  id: string,
  daysUntilExpiry: number,
  overrides: Partial<CertificateStub> = {},
): CertificateStub {
  return {
    id,
    companyId: 'company-1',
    commonName: `${id}.smebank.local`,
    endpoint: '10.0.0.1:443',
    owner: 'IT Sec',
    issuer: 'Test CA',
    expiresAt: new Date(NOW.getTime() + daysUntilExpiry * MS_PER_DAY),
    company: {
      id: 'company-1',
      name: 'SME Bank',
      code: 'SMEBANK',
      contactEmail: 'it-security@smebank.example.co.th',
    },
    renewalTasks: [],
    ...overrides,
  };
}

/** adapter ปลอมที่บันทึกการเรียกไว้ตรวจ — ไม่แตะ SMTP/LINE จริง */
class FakeChannel implements NotificationChannelAdapter {
  readonly sent: Array<{ message: NotificationMessage; recipient: string }> = [];

  constructor(
    readonly channel: NotificationChannel,
    private readonly options: { recipient?: string | null; failWith?: string } = {},
  ) {}

  resolveRecipient(): string | null {
    return this.options.recipient === undefined ? 'somebody@example.com' : this.options.recipient;
  }

  async send(message: NotificationMessage, recipient: string): Promise<SendResult> {
    if (this.options.failWith !== undefined) {
      throw new Error(this.options.failWith);
    }
    this.sent.push({ message, recipient });
    return { mode: 'live', recipient };
  }
}

interface PrismaMock {
  certificate: { findMany: jest.Mock };
  notificationLog: { findMany: jest.Mock; upsert: jest.Mock };
  company: { findUnique: jest.Mock };
}

interface UpsertArg {
  where: {
    certificateId_tier_channel_sentOn: {
      certificateId: string;
      tier: NotificationTier;
      channel: NotificationChannel;
      sentOn: Date;
    };
  };
  create: { isSuccess: boolean; error: string | null; recipient: string };
  update: { isSuccess: boolean; error: string | null };
}

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: PrismaMock;
  let email: FakeChannel;
  let line: FakeChannel;
  let write: jest.Mock;

  const build = async (channels: NotificationChannelAdapter[]): Promise<void> => {
    write = jest.fn();
    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: HistoryService, useValue: { write } },
        { provide: NOTIFICATION_CHANNELS, useValue: channels },
      ],
    }).compile();
    service = moduleRef.get(NotificationsService);
  };

  const upsertCalls = (): UpsertArg[] =>
    prisma.notificationLog.upsert.mock.calls.map((call) => call[0] as UpsertArg);

  beforeEach(async () => {
    process.env.NOTIFICATION_DRY_RUN = 'false';
    prisma = {
      certificate: { findMany: jest.fn().mockResolvedValue([]) },
      notificationLog: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn() },
      company: { findUnique: jest.fn().mockResolvedValue({ id: 'company-1' }) },
    };
    email = new FakeChannel(NotificationChannel.EMAIL);
    line = new FakeChannel(NotificationChannel.LINE);
    await build([email, line]);
  });

  describe('เลือกขั้นและช่องทางตามจำนวนวันคงเหลือ', () => {
    it('เหลือ 80 วัน → ขั้น 90 วัน ส่งอีเมลเท่านั้น', async () => {
      prisma.certificate.findMany.mockResolvedValue([certificate('cert-90', 80)]);

      const result = await service.run({ trigger: 'manual', now: NOW });

      expect(email.sent).toHaveLength(1);
      expect(line.sent).toHaveLength(0);
      expect(result.byTier[NotificationTier.DAY_90]).toBe(1);
      expect(result.byChannel).toEqual({ EMAIL: 1, LINE: 0 });
      expect(result.sent).toBe(1);
    });

    it.each([
      [45, NotificationTier.DAY_60],
      [20, NotificationTier.DAY_30],
      [3, NotificationTier.DAY_7],
      [-2, NotificationTier.DAY_7],
    ])('เหลือ %i วัน → ขั้น %s ส่งทั้ง Email และ LINE', async (days, tier) => {
      prisma.certificate.findMany.mockResolvedValue([certificate('cert-x', days)]);

      const result = await service.run({ trigger: 'manual', now: NOW });

      expect(email.sent).toHaveLength(1);
      expect(line.sent).toHaveLength(1);
      expect(result.byTier[tier]).toBe(1);
      expect(result.sent).toBe(2);
    });

    it('สแกนเฉพาะ cert ที่เหลือไม่เกิน 90 วัน ของบริษัทที่ยังใช้งาน', async () => {
      await service.run({ trigger: 'cron', now: NOW });

      const where = prisma.certificate.findMany.mock.calls[0][0] as {
        where: { isActive: boolean; company: { isActive: boolean }; expiresAt: { lt: Date } };
      };
      expect(where.where.isActive).toBe(true);
      expect(where.where.company).toEqual({ isActive: true });
      // ขอบขวา = เที่ยงคืนของวันที่ 91 นับจากวันนี้
      expect(where.where.expiresAt.lt.toISOString()).toBe('2026-11-02T00:00:00.000Z');
    });
  });

  describe('ข้าม cert ที่ไม่ต้องแจ้ง', () => {
    it('งานต่ออายุเสร็จแล้ว (task ล่าสุด = COMPLETED) → ไม่แจ้ง', async () => {
      prisma.certificate.findMany.mockResolvedValue([
        certificate('cert-done', 20, {
          renewalTasks: [{ id: 'task-1', status: WorkStatus.COMPLETED }],
        }),
      ]);

      const result = await service.run({ trigger: 'manual', now: NOW });

      expect(email.sent).toHaveLength(0);
      expect(result.skippedCompleted).toBe(1);
      expect(result.notified).toBe(0);
      expect(prisma.notificationLog.upsert).not.toHaveBeenCalled();
    });

    it('งานที่ยังไม่เสร็จ (เช่น กำลังดำเนินการ) → ยังแจ้งต่อ', async () => {
      prisma.certificate.findMany.mockResolvedValue([
        certificate('cert-wip', 20, {
          renewalTasks: [{ id: 'task-1', status: WorkStatus.IN_PROGRESS }],
        }),
      ]);

      const result = await service.run({ trigger: 'manual', now: NOW });

      expect(result.skippedCompleted).toBe(0);
      expect(result.notified).toBe(1);
      expect(email.sent[0].message.text).toContain('อยู่ระหว่างดำเนินการ');
    });

    it('ไม่มีปลายทาง → ข้ามช่องทางนั้นและ**ไม่บันทึก log** (รอบถัดไปจะลองใหม่)', async () => {
      await build([new FakeChannel(NotificationChannel.EMAIL, { recipient: null })]);
      prisma.certificate.findMany.mockResolvedValue([certificate('cert-no-mail', 80)]);

      const result = await service.run({ trigger: 'manual', now: NOW });

      expect(result.skippedNoRecipient).toBe(1);
      expect(result.notified).toBe(0);
      expect(prisma.notificationLog.upsert).not.toHaveBeenCalled();
    });
  });

  describe('กันส่งซ้ำ (idempotent)', () => {
    it('ขั้น 90 วันที่เคยส่งแล้ว (คนละวัน) → ไม่ส่งอีก', async () => {
      prisma.certificate.findMany.mockResolvedValue([certificate('cert-90', 80)]);
      prisma.notificationLog.findMany.mockResolvedValue([
        {
          certificateId: 'cert-90',
          tier: NotificationTier.DAY_90,
          channel: NotificationChannel.EMAIL,
          sentOn: new Date(TODAY.getTime() - 5 * MS_PER_DAY),
        },
      ]);

      const result = await service.run({ trigger: 'cron', now: NOW });

      expect(email.sent).toHaveLength(0);
      expect(result.skippedAlreadySent).toBe(1);
      expect(result.certificates).toHaveLength(0);
    });

    it('ขั้น ≤7 วัน: ส่งแล้ววันนี้ → ไม่ส่งซ้ำ', async () => {
      prisma.certificate.findMany.mockResolvedValue([certificate('cert-7', 3)]);
      prisma.notificationLog.findMany.mockResolvedValue([
        {
          certificateId: 'cert-7',
          tier: NotificationTier.DAY_7,
          channel: NotificationChannel.EMAIL,
          sentOn: TODAY,
        },
        {
          certificateId: 'cert-7',
          tier: NotificationTier.DAY_7,
          channel: NotificationChannel.LINE,
          sentOn: TODAY,
        },
      ]);

      const result = await service.run({ trigger: 'cron', now: NOW });

      expect(result.sent).toBe(0);
      expect(result.skippedAlreadySent).toBe(2);
    });

    it('ขั้น ≤7 วัน: ส่งเมื่อวาน → วันนี้ส่งได้อีก (แจ้งทุกวัน)', async () => {
      prisma.certificate.findMany.mockResolvedValue([certificate('cert-7', 3)]);
      prisma.notificationLog.findMany.mockResolvedValue([
        {
          certificateId: 'cert-7',
          tier: NotificationTier.DAY_7,
          channel: NotificationChannel.EMAIL,
          sentOn: new Date(TODAY.getTime() - MS_PER_DAY),
        },
      ]);

      const result = await service.run({ trigger: 'cron', now: NOW });

      expect(email.sent).toHaveLength(1);
      expect(result.sent).toBe(2); // email รอบใหม่ + line ที่ยังไม่เคยส่ง
    });

    it('เคยส่งขั้น 90 แล้ว แต่ตอนนี้เข้าขั้น 30 → ต้องแจ้งขั้นใหม่ (ขั้นบันไดต้องเดินต่อ)', async () => {
      prisma.certificate.findMany.mockResolvedValue([certificate('cert-esc', 20)]);
      prisma.notificationLog.findMany.mockResolvedValue([
        {
          certificateId: 'cert-esc',
          tier: NotificationTier.DAY_90,
          channel: NotificationChannel.EMAIL,
          sentOn: new Date(TODAY.getTime() - 60 * MS_PER_DAY),
        },
      ]);

      const result = await service.run({ trigger: 'cron', now: NOW });

      expect(result.byTier[NotificationTier.DAY_30]).toBe(1);
      expect(result.sent).toBe(2);
    });

    it('แถวที่ส่งไม่สำเร็จไม่ถือว่าเคยส่ง — โหลดเฉพาะ isSuccess = true', async () => {
      prisma.certificate.findMany.mockResolvedValue([certificate('cert-90', 80)]);

      await service.run({ trigger: 'cron', now: NOW });

      const arg = prisma.notificationLog.findMany.mock.calls[0][0] as {
        where: { isSuccess: boolean };
      };
      expect(arg.where.isSuccess).toBe(true);
    });
  });

  describe('บันทึกผลและประวัติ', () => {
    it('บันทึก NotificationLog ด้วยคีย์กันซ้ำ (cert+tier+channel+วันที่) และวันที่ตัดเวลาออก', async () => {
      prisma.certificate.findMany.mockResolvedValue([certificate('cert-90', 80)]);

      await service.run({ trigger: 'cron', now: NOW });

      const [call] = upsertCalls();
      expect(call.where.certificateId_tier_channel_sentOn).toEqual({
        certificateId: 'cert-90',
        tier: NotificationTier.DAY_90,
        channel: NotificationChannel.EMAIL,
        sentOn: TODAY,
      });
      expect(call.create.isSuccess).toBe(true);
      expect(call.create.error).toBeNull();
    });

    it('ลง HistoryLog หนึ่งบรรทัดต่อ cert (ไม่ใช่ต่อช่องทาง) พร้อม actor', async () => {
      prisma.certificate.findMany.mockResolvedValue([certificate('cert-30', 20)]);

      await service.run({ trigger: 'manual', now: NOW, actor: 'admin@example.com' });

      expect(write).toHaveBeenCalledTimes(1);
      const history = write.mock.calls[0][0] as {
        action: HistoryAction;
        actor: string;
        certificateId: string;
        metadata: { tier: NotificationTier; channels: NotificationChannel[] };
      };
      expect(history.action).toBe(HistoryAction.NOTIFICATION_SENT);
      expect(history.actor).toBe('admin@example.com');
      expect(history.metadata.channels).toEqual([
        NotificationChannel.EMAIL,
        NotificationChannel.LINE,
      ]);
    });

    it('cron ใช้ actor = system', async () => {
      prisma.certificate.findMany.mockResolvedValue([certificate('cert-30', 20)]);

      await service.run({ trigger: 'cron', now: NOW });

      const history = write.mock.calls[0][0] as { actor: string };
      expect(history.actor).toBe('system');
    });
  });

  describe('ช่องทางล้มเหลว', () => {
    it('ช่องหนึ่งพัง → บันทึกความล้มเหลว แต่ช่องที่เหลือยังส่ง', async () => {
      const brokenLine = new FakeChannel(NotificationChannel.LINE, {
        failWith: 'LINE ตอบกลับ 401',
      });
      await build([email, brokenLine]);
      prisma.certificate.findMany.mockResolvedValue([certificate('cert-30', 20)]);

      const result = await service.run({ trigger: 'cron', now: NOW });

      expect(email.sent).toHaveLength(1);
      expect(result.sent).toBe(1);
      expect(result.failed).toBe(1);

      const failure = upsertCalls().find(
        (call) => call.where.certificateId_tier_channel_sentOn.channel === NotificationChannel.LINE,
      );
      expect(failure?.create.isSuccess).toBe(false);
      expect(failure?.create.error).toContain('401');

      const outcomes = result.certificates[0].channels;
      expect(outcomes.find((item) => item.channel === NotificationChannel.LINE)?.status).toBe(
        'failed',
      );
    });

    it('ล้มเหลวแล้วยังนับว่า cert นั้น "แจ้งเตือนแล้ว" ในรายงาน แต่ไม่ลงประวัติว่าส่งสำเร็จ', async () => {
      await build([new FakeChannel(NotificationChannel.EMAIL, { failWith: 'SMTP ล่ม' })]);
      prisma.certificate.findMany.mockResolvedValue([certificate('cert-90', 80)]);

      const result = await service.run({ trigger: 'cron', now: NOW });

      expect(result.notified).toBe(1);
      expect(result.failed).toBe(1);
      expect(write).not.toHaveBeenCalled();
    });
  });

  describe('preview', () => {
    it('ไม่ส่ง ไม่บันทึก log และไม่ลงประวัติ — แต่บอกว่าจะแจ้งใครบ้าง', async () => {
      prisma.certificate.findMany.mockResolvedValue([certificate('cert-30', 20)]);

      const result = await service.run({ trigger: 'manual', now: NOW, preview: true });

      expect(email.sent).toHaveLength(0);
      expect(line.sent).toHaveLength(0);
      expect(prisma.notificationLog.upsert).not.toHaveBeenCalled();
      expect(write).not.toHaveBeenCalled();
      expect(result.preview).toBe(true);
      expect(result.notified).toBe(1);
      expect(result.sent).toBe(2);
      expect(result.certificates[0].tier).toBe(NotificationTier.DAY_30);
    });
  });

  describe('ขอบเขตการรัน', () => {
    it('ระบุ companyId ที่ไม่มีจริง → 404', async () => {
      prisma.company.findUnique.mockResolvedValue(null);

      await expect(
        service.run({ trigger: 'manual', companyId: 'ไม่มี', now: NOW }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.certificate.findMany).not.toHaveBeenCalled();
    });

    it('ระบุ companyId → กรองเฉพาะบริษัทนั้น', async () => {
      await service.run({ trigger: 'manual', companyId: 'company-1', now: NOW });

      const arg = prisma.certificate.findMany.mock.calls[0][0] as {
        where: { companyId?: string };
      };
      expect(arg.where.companyId).toBe('company-1');
    });

    it('ไม่มี cert ในขอบเขต → คืนผลว่างโดยไม่ query log', async () => {
      const result = await service.run({ trigger: 'cron', now: NOW });

      expect(result.scanned).toBe(0);
      expect(result.notified).toBe(0);
      expect(prisma.notificationLog.findMany).not.toHaveBeenCalled();
    });

    it('รายงานว่าอยู่ในโหมดซ้อมหรือไม่ (NOTIFICATION_DRY_RUN)', async () => {
      process.env.NOTIFICATION_DRY_RUN = 'true';
      const result = await service.run({ trigger: 'cron', now: NOW });
      expect(result.simulate).toBe(true);

      process.env.NOTIFICATION_DRY_RUN = 'false';
      expect((await service.run({ trigger: 'cron', now: NOW })).simulate).toBe(false);
    });
  });
});
