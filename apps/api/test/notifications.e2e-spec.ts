/**
 * e2e ตามเกณฑ์ตรวจรับ Phase 5
 *   1. รัน test-run กับข้อมูลจริง → log แสดงการส่งถูกขั้น (tier) ถูกช่องทาง (channel)
 *   2. รันซ้ำทันที → ไม่ส่งซ้ำ
 *   + cert ที่งานเสร็จแล้วต้องไม่ถูกแจ้ง, ขั้น ≤7 วันต้องแจ้งได้อีกในวันถัดไป, RBAC, preview
 *
 * ช่องทางทำงานในโหมดซ้อม (`NOTIFICATION_DRY_RUN=true`) จึงไม่มีอีเมล/LINE ออกไปจริง
 * ต้องมี PostgreSQL รันอยู่ (`docker compose up -d db`)
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  NotificationChannel,
  NotificationTier,
  PrismaClient,
  UserRole,
  WorkStatus,
} from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/common/password';
import { NotificationsService } from '../src/notifications/notifications.service';

const MS_PER_DAY = 86_400_000;
const RUN_ID = process.env.E2E_RUN_ID ?? String(process.hrtime.bigint());
const ADMIN_EMAIL = `e2e-noti-admin-${RUN_ID}@example.com`;
const OPERATOR_EMAIL = `e2e-noti-operator-${RUN_ID}@example.com`;
const PASSWORD = 'E2e-Passw0rd!';
const CODE = `E2ENOTI${RUN_ID}`.slice(0, 18);
const CONTACT_EMAIL = 'it-security@e2e-noti.example.co.th';

function expiresInDays(days: number): Date {
  const target = new Date(Date.now() + days * MS_PER_DAY);
  return new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate(), 12, 0, 0),
  );
}

interface Seed {
  key: string;
  days: number;
  tier: NotificationTier | null;
  completed?: boolean;
}

const SEEDS: Seed[] = [
  { key: 'tier90', days: 80, tier: NotificationTier.DAY_90 },
  { key: 'tier60', days: 45, tier: NotificationTier.DAY_60 },
  { key: 'tier30', days: 20, tier: NotificationTier.DAY_30 },
  { key: 'tier7', days: 3, tier: NotificationTier.DAY_7 },
  { key: 'expired', days: -2, tier: NotificationTier.DAY_7 },
  // เกิน 90 วัน → ยังไม่ต้องแจ้ง จึงไม่ควรถูกสแกนเข้ามาเลย
  { key: 'safe', days: 200, tier: null },
  // เหลือ 20 วันแต่ต่ออายุเสร็จแล้ว → ต้องไม่แจ้ง (กฎ Phase 5)
  { key: 'done', days: 20, tier: null, completed: true },
];

/** ขั้น 90 ส่งอีเมลเดียว ขั้นอื่นส่ง 2 ช่องทาง */
const EXPECTED_SENDS = 1 + 2 + 2 + 2 + 2;
const EXPECTED_NOTIFIED = 5;
const EXPECTED_SCANNED = 6; // ทั้งหมดยกเว้นใบ 200 วัน

describe('Notifications (e2e) — Phase 5', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let service: NotificationsService;
  let adminToken: string;
  let operatorToken: string;
  let companyId: string;
  const certIds = new Map<string, string>();

  const testRun = (body: Record<string, unknown> = {}, token = adminToken): request.Test =>
    request(app.getHttpServer())
      .post('/notifications/test-run')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  beforeAll(async () => {
    // โหมดซ้อม: ช่องทางเขียนลง log แทนการส่งจริง แต่ยังบันทึก NotificationLog ตามปกติ
    process.env.NOTIFICATION_DRY_RUN = 'true';
    delete process.env.LINE_TO;

    prisma = new PrismaClient();
    const passwordHash = await hashPassword(PASSWORD);
    await prisma.user.createMany({
      data: [
        { email: ADMIN_EMAIL, name: 'E2E Noti Admin', role: UserRole.ADMIN, passwordHash },
        {
          email: OPERATOR_EMAIL,
          name: 'E2E Noti Operator',
          role: UserRole.OPERATOR,
          passwordHash,
        },
      ],
    });

    const company = await prisma.company.create({
      data: { name: 'บริษัท noti e2e', code: CODE, contactEmail: CONTACT_EMAIL },
    });
    companyId = company.id;

    for (const seed of SEEDS) {
      const certificate = await prisma.certificate.create({
        data: {
          companyId,
          commonName: `${seed.key}.e2e-noti.local`,
          endpoint: `10.20.0.1:44${SEEDS.indexOf(seed)}`,
          expiresAt: expiresInDays(seed.days),
          issuer: 'E2E Noti CA',
          owner: 'IT Sec',
        },
      });
      certIds.set(seed.key, certificate.id);

      if (seed.completed === true) {
        await prisma.renewalTask.create({
          data: {
            certificateId: certificate.id,
            status: WorkStatus.COMPLETED,
            completedAt: new Date(),
          },
        });
      }
    }

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    service = app.get(NotificationsService);

    const login = async (email: string): Promise<string> => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: PASSWORD })
        .expect(200);
      return response.body.accessToken as string;
    };
    adminToken = await login(ADMIN_EMAIL);
    operatorToken = await login(OPERATOR_EMAIL);
  }, 60_000);

  afterAll(async () => {
    await prisma.notificationLog.deleteMany({ where: { certificate: { companyId } } });
    await prisma.historyLog.deleteMany({ where: { companyId } });
    await prisma.renewalTask.deleteMany({ where: { certificate: { companyId } } });
    await prisma.certificate.deleteMany({ where: { companyId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await prisma.user.deleteMany({ where: { email: { in: [ADMIN_EMAIL, OPERATOR_EMAIL] } } });
    await prisma.$disconnect();
    await app.close();
  });

  describe('สิทธิ์การสั่งรัน', () => {
    it('operator สั่ง test-run ไม่ได้ → 403', async () => {
      await testRun({ companyId }, operatorToken).expect(403);
    });

    it('ไม่มี token → 401', async () => {
      await request(app.getHttpServer()).post('/notifications/test-run').expect(401);
    });

    it('companyId ที่ไม่มีจริง → 404', async () => {
      await testRun({ companyId: '11111111-1111-4111-8111-111111111111' }).expect(404);
    });
  });

  describe('preview — ดูก่อนส่ง', () => {
    it('บอกว่าจะแจ้งใครบ้างโดยไม่บันทึกอะไรลง NotificationLog', async () => {
      const response = await testRun({ companyId, preview: true }).expect(200);

      expect(response.body).toMatchObject({
        preview: true,
        simulate: true,
        scanned: EXPECTED_SCANNED,
        notified: EXPECTED_NOTIFIED,
        sent: EXPECTED_SENDS,
        skippedCompleted: 1,
      });
      await expect(
        prisma.notificationLog.count({ where: { certificate: { companyId } } }),
      ).resolves.toBe(0);
    });
  });

  describe('เกณฑ์ 1: test-run ส่งถูกขั้น ถูกช่องทาง', () => {
    it('สแกนเฉพาะใบที่เหลือไม่เกิน 90 วัน และข้ามใบที่งานเสร็จแล้ว', async () => {
      const response = await testRun({ companyId }).expect(200);

      expect(response.body).toMatchObject({
        trigger: 'manual',
        preview: false,
        scanned: EXPECTED_SCANNED,
        notified: EXPECTED_NOTIFIED,
        sent: EXPECTED_SENDS,
        failed: 0,
        skippedCompleted: 1,
        skippedAlreadySent: 0,
      });
      expect(response.body.byTier).toEqual({ DAY_90: 1, DAY_60: 1, DAY_30: 1, DAY_7: 2 });
      expect(response.body.byChannel).toEqual({ EMAIL: 5, LINE: 4 });
    });

    it('ขั้น 90 วันส่งอีเมลช่องทางเดียว ส่วนขั้นอื่นส่งทั้ง Email และ LINE', async () => {
      const logs = await prisma.notificationLog.findMany({
        where: { certificate: { companyId } },
        include: { certificate: { select: { commonName: true } } },
      });

      expect(logs).toHaveLength(EXPECTED_SENDS);
      expect(logs.every((log) => log.isSuccess)).toBe(true);

      const channelsOf = (key: string): NotificationChannel[] =>
        logs
          .filter((log) => log.certificate.commonName.startsWith(key))
          .map((log) => log.channel)
          .sort();

      expect(channelsOf('tier90')).toEqual([NotificationChannel.EMAIL]);
      expect(channelsOf('tier60')).toEqual([NotificationChannel.EMAIL, NotificationChannel.LINE]);
      expect(channelsOf('tier7')).toEqual([NotificationChannel.EMAIL, NotificationChannel.LINE]);
    });

    it('บันทึกขั้นที่ถูกต้องของแต่ละใบ และใบที่หมดอายุแล้วเข้าขั้นวิกฤต', async () => {
      const tierOf = async (key: string): Promise<NotificationTier[]> => {
        const logs = await prisma.notificationLog.findMany({
          where: { certificateId: certIds.get(key) },
          select: { tier: true },
        });
        return [...new Set(logs.map((log) => log.tier))];
      };

      expect(await tierOf('tier90')).toEqual([NotificationTier.DAY_90]);
      expect(await tierOf('tier60')).toEqual([NotificationTier.DAY_60]);
      expect(await tierOf('tier30')).toEqual([NotificationTier.DAY_30]);
      expect(await tierOf('tier7')).toEqual([NotificationTier.DAY_7]);
      expect(await tierOf('expired')).toEqual([NotificationTier.DAY_7]);
    });

    it('ผู้รับอีเมลคือ contactEmail ของบริษัท และวันที่ส่งเก็บแบบตัดเวลา', async () => {
      const log = await prisma.notificationLog.findFirstOrThrow({
        where: { certificateId: certIds.get('tier90'), channel: NotificationChannel.EMAIL },
      });

      expect(log.recipient).toBe(CONTACT_EMAIL);
      expect(log.sentOn.toISOString()).toMatch(/T00:00:00\.000Z$/);
    });

    it('ใบที่ยังไม่ต้องแจ้ง (200 วัน) และใบที่งานเสร็จแล้ว ไม่มีรายการแจ้งเตือนเลย', async () => {
      await expect(
        prisma.notificationLog.count({ where: { certificateId: certIds.get('safe') } }),
      ).resolves.toBe(0);
      await expect(
        prisma.notificationLog.count({ where: { certificateId: certIds.get('done') } }),
      ).resolves.toBe(0);
    });

    it('ลง HistoryLog หนึ่งบรรทัดต่อใบที่แจ้ง พร้อมชื่อผู้สั่งรัน', async () => {
      const logs = await prisma.historyLog.findMany({
        where: { companyId, action: 'NOTIFICATION_SENT' },
      });

      expect(logs).toHaveLength(EXPECTED_NOTIFIED);
      expect(logs.every((log) => log.actor === ADMIN_EMAIL)).toBe(true);
    });
  });

  describe('เกณฑ์ 2: รันซ้ำทันที → ไม่ส่งซ้ำ', () => {
    it('ทุกช่องทางถูกข้ามเพราะแจ้งไปแล้ว และจำนวนรายการใน DB ไม่เพิ่ม', async () => {
      const before = await prisma.notificationLog.count({ where: { certificate: { companyId } } });

      const response = await testRun({ companyId }).expect(200);

      expect(response.body).toMatchObject({
        sent: 0,
        failed: 0,
        notified: 0,
        skippedAlreadySent: EXPECTED_SENDS,
      });
      await expect(
        prisma.notificationLog.count({ where: { certificate: { companyId } } }),
      ).resolves.toBe(before);
      await expect(
        prisma.historyLog.count({ where: { companyId, action: 'NOTIFICATION_SENT' } }),
      ).resolves.toBe(EXPECTED_NOTIFIED);
    });

    it('วันถัดไป: ขั้น ≤7 วันแจ้งอีกครั้ง ส่วนขั้น 90/60/30 ยังเงียบ', async () => {
      const tomorrow = new Date(Date.now() + MS_PER_DAY);

      const result = await service.run({ trigger: 'cron', companyId, now: tomorrow });

      // 2 ใบในขั้นวิกฤต × 2 ช่องทาง
      expect(result.sent).toBe(4);
      expect(result.byTier).toMatchObject({ DAY_7: 2, DAY_90: 0, DAY_60: 0, DAY_30: 0 });
      expect(result.skippedAlreadySent).toBe(5);
      await expect(
        prisma.notificationLog.count({ where: { certificate: { companyId } } }),
      ).resolves.toBe(EXPECTED_SENDS + 4);
    });
  });

  describe('GET /notifications — ประวัติการแจ้งเตือน', () => {
    it('operator อ่านประวัติได้ พร้อมข้อมูล certificate และแบ่งหน้า', async () => {
      const response = await request(app.getHttpServer())
        .get(`/notifications?companyId=${companyId}&pageSize=5`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      expect(response.body.data).toHaveLength(5);
      expect(response.body.meta.total).toBe(EXPECTED_SENDS + 4);
      expect(response.body.data[0].certificate.company.code).toBe(CODE);
    });

    it('กรองตามขั้นและช่องทางได้', async () => {
      const response = await request(app.getHttpServer())
        .get(`/notifications?companyId=${companyId}&tier=DAY_90&channel=EMAIL`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.meta.total).toBe(1);
      expect(response.body.data[0]).toMatchObject({ tier: 'DAY_90', channel: 'EMAIL' });
    });

    it('ขั้นที่ไม่มีในระบบ → 400', async () => {
      await request(app.getHttpServer())
        .get('/notifications?tier=DAY_45')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });
  });
});
