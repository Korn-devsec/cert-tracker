/**
 * e2e ตามเกณฑ์ตรวจรับ Phase 4
 *   1. Cert เหลือ 20 วัน + task Completed → แสดง Risk=High และ Status=Completed พร้อมกันได้
 *      (พิสูจน์ว่า Risk กับ Work Status แยกกันจริงตามกฎเหล็กข้อ 5)
 *   2. ประวัติการเปลี่ยนสถานะย้อนดูได้ครบว่าใครทำอะไรเมื่อไร
 *   + transition ที่ผิดต้องโดน 400, สิทธิ์ตาม role, ไฟล์แนบ upload/download, dashboard summary
 *
 * ต้องมี PostgreSQL รันอยู่ (`docker compose up -d db`)
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient, UserRole, WorkStatus } from '@prisma/client';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request, { type Test as SupertestRequest } from 'supertest';
import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/common/password';
import { OPEN_TASK_STATUSES } from '../src/tasks/transitions';

const MS_PER_DAY = 86_400_000;
const RUN_ID = process.env.E2E_RUN_ID ?? String(process.hrtime.bigint());
const ADMIN_EMAIL = `e2e-cert-admin-${RUN_ID}@example.com`;
const OPERATOR_EMAIL = `e2e-cert-operator-${RUN_ID}@example.com`;
const VIEWER_EMAIL = `e2e-cert-viewer-${RUN_ID}@example.com`;
const PASSWORD = 'E2e-Passw0rd!';
const CODE = `E2ECRT${RUN_ID}`.slice(0, 18);

/** วันหมดอายุที่ให้ค่า daysUntilExpiry ตามต้องการ (เที่ยงของวันเพื่อไม่ให้แกว่งข้ามวัน) */
function expiresInDays(days: number): Date {
  const target = new Date(Date.now() + days * MS_PER_DAY);
  return new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate(), 12, 0, 0),
  );
}

interface CertificateSeed {
  commonName: string;
  endpoint: string;
  days: number;
}

const SEEDS: CertificateSeed[] = [
  { commonName: 'high-20d.e2e.local', endpoint: '10.10.0.1:443', days: 20 },
  { commonName: 'medium-45d.e2e.local', endpoint: '10.10.0.2:443', days: 45 },
  { commonName: 'low-75d.e2e.local', endpoint: '10.10.0.3:443', days: 75 },
  { commonName: 'safe-200d.e2e.local', endpoint: '10.10.0.4:443', days: 200 },
  { commonName: 'expired-5d.e2e.local', endpoint: '10.10.0.5:443', days: -5 },
];

describe('Certificates / Tasks / Dashboard (e2e) — Phase 4', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let adminToken: string;
  let operatorToken: string;
  let viewerToken: string;
  let companyId: string;
  let operatorId: string;
  let viewerId: string;
  let uploadDir: string;
  const certIds = new Map<string, string>();

  const get = (path: string, token = viewerToken): SupertestRequest =>
    request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`);

  const patch = (path: string, token = operatorToken): SupertestRequest =>
    request(app.getHttpServer()).patch(path).set('Authorization', `Bearer ${token}`);

  /** ใช้เดินสถานะงานให้ถึงขั้นที่ต้องการ (ผ่านทุกขั้นตามกฎ) */
  const moveTo = async (taskId: string, statuses: WorkStatus[]): Promise<void> => {
    for (const status of statuses) {
      await patch(`/tasks/${taskId}/status`).send({ status }).expect(200);
    }
  };

  beforeAll(async () => {
    // ให้ไฟล์แนบของเทสต์ลงโฟลเดอร์ชั่วคราว ไม่ปนกับ uploads ของเครื่อง dev
    uploadDir = await mkdtemp(join(tmpdir(), 'cert-tracker-e2e-'));
    process.env.UPLOAD_DIR = uploadDir;

    prisma = new PrismaClient();
    const passwordHash = await hashPassword(PASSWORD);
    await prisma.user.createMany({
      data: [
        { email: ADMIN_EMAIL, name: 'E2E Cert Admin', role: UserRole.ADMIN, passwordHash },
        {
          email: OPERATOR_EMAIL,
          name: 'E2E Cert Operator',
          role: UserRole.OPERATOR,
          passwordHash,
        },
        { email: VIEWER_EMAIL, name: 'E2E Cert Viewer', role: UserRole.VIEWER, passwordHash },
      ],
    });
    const [operator, viewer] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { email: OPERATOR_EMAIL } }),
      prisma.user.findUniqueOrThrow({ where: { email: VIEWER_EMAIL } }),
    ]);
    operatorId = operator.id;
    viewerId = viewer.id;

    const company = await prisma.company.create({
      data: { name: 'บริษัท cert e2e', code: CODE },
    });
    companyId = company.id;

    for (const seed of SEEDS) {
      const certificate = await prisma.certificate.create({
        data: {
          companyId,
          commonName: seed.commonName,
          endpoint: seed.endpoint,
          expiresAt: expiresInDays(seed.days),
          issuer: 'E2E Test CA',
          owner: 'IT Sec',
          serialNumber: `SERIAL-${seed.days}`,
          signatureAlgorithm: 'SHA256withRSA',
          keySize: 2048,
          sha256Fingerprint: `FP-${seed.days}`,
          san: [`www.${seed.commonName}`],
        },
      });
      certIds.set(seed.commonName, certificate.id);
    }

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    const login = async (email: string): Promise<string> => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: PASSWORD })
        .expect(200);
      return response.body.accessToken as string;
    };
    adminToken = await login(ADMIN_EMAIL);
    operatorToken = await login(OPERATOR_EMAIL);
    viewerToken = await login(VIEWER_EMAIL);
  }, 60_000);

  afterAll(async () => {
    // ลบตามลำดับ dependency และเจาะจงเฉพาะข้อมูลที่ spec นี้สร้าง
    await prisma.historyLog.deleteMany({ where: { companyId } });
    await prisma.attachment.deleteMany({ where: { certificate: { companyId } } });
    await prisma.renewalTask.deleteMany({ where: { certificate: { companyId } } });
    await prisma.certificate.deleteMany({ where: { companyId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await prisma.user.deleteMany({
      where: { email: { in: [ADMIN_EMAIL, OPERATOR_EMAIL, VIEWER_EMAIL] } },
    });
    await prisma.$disconnect();
    await app.close();
    await rm(uploadDir, { recursive: true, force: true });
  });

  describe('GET /certificates — ค่าที่คำนวณสด', () => {
    it('daysUntilExpiry/riskLevel คำนวณ ณ เวลา query ไม่ใช่ค่าที่ freeze ไว้', async () => {
      const response = await get(`/certificates?companyId=${companyId}&pageSize=100`).expect(200);

      const byName = new Map<string, { daysUntilExpiry: number; riskLevel: string }>(
        response.body.data.map(
          (item: { commonName: string; daysUntilExpiry: number; riskLevel: string }) => [
            item.commonName,
            item,
          ],
        ),
      );
      expect(byName.get('high-20d.e2e.local')).toMatchObject({
        daysUntilExpiry: 20,
        riskLevel: 'HIGH',
      });
      expect(byName.get('medium-45d.e2e.local')).toMatchObject({
        daysUntilExpiry: 45,
        riskLevel: 'MEDIUM',
      });
      expect(byName.get('low-75d.e2e.local')).toMatchObject({
        daysUntilExpiry: 75,
        riskLevel: 'LOW',
      });
      expect(byName.get('safe-200d.e2e.local')).toMatchObject({
        daysUntilExpiry: 200,
        riskLevel: 'SAFE',
      });
      expect(byName.get('expired-5d.e2e.local')).toMatchObject({
        daysUntilExpiry: -5,
        riskLevel: 'HIGH',
      });
    });

    it('เรียงจากใกล้หมดอายุที่สุดก่อนตามค่าเริ่มต้น', async () => {
      const response = await get(`/certificates?companyId=${companyId}&pageSize=100`).expect(200);
      const days = response.body.data.map(
        (item: { daysUntilExpiry: number }) => item.daysUntilExpiry,
      );
      expect(days).toEqual([...days].sort((a: number, b: number) => a - b));
    });

    it('กรอง risk=HIGH → ได้ทั้งใบที่เหลือ 20 วันและใบที่หมดอายุแล้ว', async () => {
      const response = await get(`/certificates?companyId=${companyId}&risk=HIGH`).expect(200);

      const names = response.body.data.map((item: { commonName: string }) => item.commonName);
      expect(names.sort()).toEqual(['expired-5d.e2e.local', 'high-20d.e2e.local']);
      expect(response.body.meta.total).toBe(2);
    });

    it('กรอง expired=true → เฉพาะใบที่หมดอายุแล้ว', async () => {
      const response = await get(`/certificates?companyId=${companyId}&expired=true`).expect(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).toMatchObject({
        commonName: 'expired-5d.e2e.local',
        isExpired: true,
      });
    });

    it('กรองเดือนที่หมดอายุ (YYYY-MM) ได้', async () => {
      const target = expiresInDays(45);
      const month = `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, '0')}`;

      const response = await get(`/certificates?companyId=${companyId}&month=${month}`).expect(200);

      const names = response.body.data.map((item: { commonName: string }) => item.commonName);
      expect(names).toContain('medium-45d.e2e.local');
      expect(names).not.toContain('safe-200d.e2e.local');
    });

    it('ค้นหาและแบ่งหน้าคืน meta ที่ตรงกับข้อมูลจริง', async () => {
      const response = await get(
        `/certificates?companyId=${companyId}&search=e2e.local&page=1&pageSize=2`,
      ).expect(200);

      expect(response.body.data).toHaveLength(2);
      expect(response.body.meta).toMatchObject({ page: 1, pageSize: 2, total: 5, totalPages: 3 });
    });

    it('เดือนที่รูปแบบผิด → 400', async () => {
      await get(`/certificates?companyId=${companyId}&month=2026-13`).expect(400);
    });
  });

  describe('GET /certificates/:id — detail', () => {
    it('คืนข้อมูลเทคนิคครบ พร้อม history/attachments/tasks', async () => {
      const id = certIds.get('high-20d.e2e.local');
      const response = await get(`/certificates/${id}`).expect(200);

      expect(response.body).toMatchObject({
        commonName: 'high-20d.e2e.local',
        endpoint: '10.10.0.1:443',
        issuer: 'E2E Test CA',
        serialNumber: 'SERIAL-20',
        signatureAlgorithm: 'SHA256withRSA',
        keySize: 2048,
        sha256Fingerprint: 'FP-20',
        owner: 'IT Sec',
        riskLevel: 'HIGH',
        daysUntilExpiry: 20,
      });
      expect(response.body.san).toEqual(['www.high-20d.e2e.local']);
      expect(response.body.company.code).toBe(CODE);
      expect(Array.isArray(response.body.historyLogs)).toBe(true);
      expect(Array.isArray(response.body.attachments)).toBe(true);
      expect(Array.isArray(response.body.renewalTasks)).toBe(true);
    });

    it('id ที่ไม่มีจริง → 404', async () => {
      await get('/certificates/11111111-1111-4111-8111-111111111111').expect(404);
    });
  });

  describe('POST /tasks — เปิดงานต่ออายุ', () => {
    it('viewer เปิดงานไม่ได้ → 403', async () => {
      await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ certificateId: certIds.get('high-20d.e2e.local') })
        .expect(403);
    });

    it('operator เปิดงานได้ สถานะเริ่มต้น NEW และลง HistoryLog', async () => {
      const certificateId = certIds.get('high-20d.e2e.local');
      const response = await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ certificateId, note: 'เปิดงานจาก e2e' })
        .expect(201);

      expect(response.body).toMatchObject({ status: WorkStatus.NEW, certificateId });

      const logs = await prisma.historyLog.findMany({
        where: { renewalTaskId: response.body.id as string },
      });
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({ action: 'TASK_CREATED', actor: OPERATOR_EMAIL });
    });

    it('เปิดงานซ้ำขณะยังมีงานค้าง → 409', async () => {
      await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ certificateId: certIds.get('high-20d.e2e.local') })
        .expect(409);
    });

    it('certificate ที่ไม่มีจริง → 404', async () => {
      await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ certificateId: '11111111-1111-4111-8111-111111111111' })
        .expect(404);
    });
  });

  describe('PATCH /tasks/:id/assign', () => {
    let taskId: string;

    beforeAll(async () => {
      const task = await prisma.renewalTask.findFirstOrThrow({
        where: { certificateId: certIds.get('high-20d.e2e.local') },
      });
      taskId = task.id;
    });

    it('viewer มอบหมายไม่ได้ → 403', async () => {
      await request(app.getHttpServer())
        .patch(`/tasks/${taskId}/assign`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ assigneeId: operatorId })
        .expect(403);
    });

    it('มอบหมายให้ viewer → 400 (viewer อ่านได้เท่านั้น)', async () => {
      const response = await patch(`/tasks/${taskId}/assign`)
        .send({ assigneeId: viewerId })
        .expect(400);
      expect(response.body.message).toContain('VIEWER');
    });

    it('มอบหมายให้ operator → งานเดินจาก NEW เป็น ASSIGNED อัตโนมัติ', async () => {
      const response = await patch(`/tasks/${taskId}/assign`)
        .send({ assigneeId: operatorId, dueDate: '2026-09-01' })
        .expect(200);

      expect(response.body).toMatchObject({ status: WorkStatus.ASSIGNED, assigneeId: operatorId });

      const actions = await prisma.historyLog.findMany({
        where: { renewalTaskId: taskId },
        orderBy: { createdAt: 'asc' },
        select: { action: true, actor: true },
      });
      expect(actions.map((log) => log.action)).toEqual([
        'TASK_CREATED',
        'ASSIGN',
        'STATUS_CHANGE', // การเดินสถานะอัตโนมัติมีบรรทัดของตัวเอง ไม่ซ่อนอยู่ในรายการมอบหมาย
      ]);
      expect(actions.every((log) => log.actor === OPERATOR_EMAIL)).toBe(true);
    });

    it('ไม่ส่ง assigneeId เลย → 400 (ต้องระบุ null ถ้าจะถอน)', async () => {
      await patch(`/tasks/${taskId}/assign`).send({}).expect(400);
    });
  });

  describe('PATCH /tasks/:id/status — กฎ workflow', () => {
    let taskId: string;

    beforeAll(async () => {
      const task = await prisma.renewalTask.findFirstOrThrow({
        where: { certificateId: certIds.get('high-20d.e2e.local') },
      });
      taskId = task.id;
    });

    it('ข้ามขั้น (Assigned → Completed) → 400 พร้อมบอกปลายทางที่ไปได้', async () => {
      const response = await patch(`/tasks/${taskId}/status`)
        .send({ status: WorkStatus.COMPLETED })
        .expect(400);

      expect(response.body.message).toContain('ไม่ได้');
      expect(response.body.message).toContain('อยู่ระหว่างดำเนินการ');
    });

    it('viewer เปลี่ยนสถานะไม่ได้ → 403', async () => {
      await request(app.getHttpServer())
        .patch(`/tasks/${taskId}/status`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ status: WorkStatus.IN_PROGRESS })
        .expect(403);
    });

    it('สถานะที่ไม่มีในระบบ → 400', async () => {
      await patch(`/tasks/${taskId}/status`).send({ status: 'DONE' }).expect(400);
    });

    it('เดินตามเส้นทางจนปิดงานได้ และบันทึก completedAt', async () => {
      await moveTo(taskId, [
        WorkStatus.IN_PROGRESS,
        WorkStatus.WAITING_VENDOR,
        WorkStatus.WAITING_CA,
        WorkStatus.TESTING,
      ]);

      const response = await patch(`/tasks/${taskId}/status`)
        .send({ status: WorkStatus.COMPLETED, note: 'ติดตั้งและทดสอบเรียบร้อย' })
        .expect(200);

      expect(response.body.status).toBe(WorkStatus.COMPLETED);
      expect(response.body.completedAt).not.toBeNull();
    });

    it('งานที่ปิดแล้วเปลี่ยนสถานะต่อไม่ได้ → 400', async () => {
      const response = await patch(`/tasks/${taskId}/status`)
        .send({ status: WorkStatus.IN_PROGRESS })
        .expect(400);
      expect(response.body.message).toContain('ปิดแล้ว');
    });

    it('เกณฑ์ตรวจรับ 2: ประวัติย้อนดูได้ครบว่าใครทำอะไรเมื่อไร', async () => {
      const response = await get(`/tasks/${taskId}`).expect(200);

      const logs = response.body.historyLogs as Array<{
        action: string;
        actor: string;
        createdAt: string;
        metadata: { from?: string; to?: string } | null;
      }>;
      // เปิดงาน → มอบหมาย → auto status → in progress → vendor → ca → testing → completed
      expect(logs.length).toBeGreaterThanOrEqual(8);
      expect(logs.every((log) => log.actor === OPERATOR_EMAIL)).toBe(true);
      expect(logs.every((log) => typeof log.createdAt === 'string')).toBe(true);

      const statusChanges = logs.filter((log) => log.metadata?.to !== undefined);
      expect(statusChanges.length).toBeGreaterThanOrEqual(5);
      // ประวัติต้องบอกทั้งสถานะต้นทางและปลายทาง
      const completeLog = logs.find((log) => log.action === 'COMPLETE');
      expect(completeLog?.metadata).toMatchObject({
        from: WorkStatus.TESTING,
        to: WorkStatus.COMPLETED,
      });
    });

    it('เกณฑ์ตรวจรับ 1: cert เหลือ 20 วัน + งาน Completed → High กับ Completed พร้อมกัน', async () => {
      const id = certIds.get('high-20d.e2e.local');
      const response = await get(`/certificates/${id}`).expect(200);

      expect(response.body.riskLevel).toBe('HIGH');
      expect(response.body.daysUntilExpiry).toBe(20);
      expect(response.body.currentTask.status).toBe(WorkStatus.COMPLETED);
      expect(response.body.isExpired).toBe(false);
    });

    it('กรอง certificates ด้วย status=COMPLETED → ใช้สถานะของ task ล่าสุด', async () => {
      const response = await get(`/certificates?companyId=${companyId}&status=COMPLETED`).expect(
        200,
      );

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].commonName).toBe('high-20d.e2e.local');
    });

    it('ปิดงานแล้วเปิดรอบใหม่ได้ และสถานะของ cert กลับเป็นงานใบใหม่', async () => {
      const certificateId = certIds.get('high-20d.e2e.local');
      await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ certificateId, note: 'รอบใหม่' })
        .expect(201);

      const response = await get(`/certificates/${certificateId}`).expect(200);
      expect(response.body.currentTask.status).toBe(WorkStatus.NEW);
      expect(response.body.renewalTasks).toHaveLength(2);

      // ยกเลิกงานรอบใหม่เพื่อไม่ให้ค้างไปรบกวนเทสต์ dashboard ด้านล่าง
      await patch(`/tasks/${response.body.currentTask.id}/status`)
        .send({ status: WorkStatus.CANCELLED, note: 'ปิดท้ายเทสต์' })
        .expect(200);
    });
  });

  describe('GET /tasks — รายการงาน', () => {
    it('กรองงานที่ยังค้าง (open=true) และงานของผู้รับผิดชอบคนหนึ่ง', async () => {
      const open = await get(`/tasks?companyId=${companyId}&open=true`).expect(200);
      expect(
        open.body.data.every((task: { status: WorkStatus }) =>
          OPEN_TASK_STATUSES.includes(task.status),
        ),
      ).toBe(true);

      const mine = await get(`/tasks?assigneeId=${operatorId}`).expect(200);
      expect(mine.body.data.length).toBeGreaterThanOrEqual(1);
      expect(mine.body.data[0].certificate.riskLevel).toBeDefined();
    });

    it('กรองตามความเสี่ยงของ cert ที่งานนั้นดูแล', async () => {
      const response = await get(`/tasks?companyId=${companyId}&risk=HIGH`).expect(200);
      expect(
        response.body.data.every(
          (task: { certificate: { riskLevel: string } }) => task.certificate.riskLevel === 'HIGH',
        ),
      ).toBe(true);
    });
  });

  describe('ไฟล์แนบ', () => {
    let attachmentId: string;
    const certificateId = (): string => certIds.get('medium-45d.e2e.local') as string;

    it('viewer แนบไฟล์ไม่ได้ → 403', async () => {
      await request(app.getHttpServer())
        .post(`/certificates/${certificateId()}/attachments`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .attach('file', Buffer.from('cert'), 'cert.pem')
        .expect(403);
    });

    it('ไฟล์ที่มี private key → 400', async () => {
      const response = await request(app.getHttpServer())
        .post(`/certificates/${certificateId()}/attachments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', Buffer.from('key'), 'server.key')
        .expect(400);
      expect(response.body.message).toContain('private key');
    });

    it('แนบไฟล์ .pem ได้ และลง HistoryLog', async () => {
      const response = await request(app.getHttpServer())
        .post(`/certificates/${certificateId()}/attachments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', Buffer.from('-----BEGIN CERTIFICATE-----'), 'ใบรับรอง.pem')
        .expect(201);

      attachmentId = response.body.id as string;
      expect(response.body).toMatchObject({ filename: 'ใบรับรอง.pem', uploadedBy: ADMIN_EMAIL });
      // ชื่อไฟล์บนดิสก์ต้องไม่ใช่ชื่อที่ผู้ใช้ส่งมา
      expect(response.body.path).not.toContain('ใบรับรอง');

      const logs = await prisma.historyLog.findMany({
        where: { certificateId: certificateId(), action: 'ATTACHMENT_UPLOADED' },
      });
      expect(logs).toHaveLength(1);
    });

    it('ดาวน์โหลดกลับมาได้เนื้อหาเดิม พร้อมชื่อไฟล์ภาษาไทย', async () => {
      const response = await get(
        `/certificates/${certificateId()}/attachments/${attachmentId}/download`,
      ).expect(200);

      expect(response.headers['content-disposition']).toContain(encodeURIComponent('ใบรับรอง.pem'));
      const content = Buffer.isBuffer(response.body)
        ? response.body.toString('utf8')
        : (response.text as string);
      expect(content).toBe('-----BEGIN CERTIFICATE-----');
    });

    it('ไฟล์แนบของ cert อื่น → 404 (ไม่หลุดข้ามใบ)', async () => {
      const otherCert = certIds.get('low-75d.e2e.local');
      await get(`/certificates/${otherCert}/attachments/${attachmentId}/download`).expect(404);
    });

    it('รายการไฟล์แนบแสดงในหน้า detail', async () => {
      const response = await get(`/certificates/${certificateId()}`).expect(200);
      expect(response.body.attachments).toHaveLength(1);
    });
  });

  describe('GET /dashboard/summary', () => {
    it('นับตามความเสี่ยง สถานะ และตัวเลขการ์ดให้ตรงกับข้อมูลจริง', async () => {
      const response = await get(`/dashboard/summary?companyId=${companyId}`).expect(200);

      expect(response.body).toMatchObject({
        companyId,
        total: 5,
        byRisk: { HIGH: 2, MEDIUM: 1, LOW: 1, SAFE: 1 },
        expired: 1,
        expiringSoon: 1,
      });
      // งานล่าสุดของ high-20d ถูกยกเลิกไว้ ที่เหลือยังไม่มีงาน
      expect(response.body.byStatus.CANCELLED).toBe(1);
      expect(response.body.noTask).toBe(4);
      expect(response.body.completed + response.body.pending + response.body.cancelled).toBe(5);
      expect(response.body.byRiskStatus.HIGH.cancelled).toBe(1);
    });

    it('กรองตามสถานะงาน → การ์ด/กราฟนับเฉพาะ cert ที่อยู่ในสถานะนั้น', async () => {
      const cancelled = await get(
        `/dashboard/summary?companyId=${companyId}&status=CANCELLED`,
      ).expect(200);

      // มีเพียงใบเดียวที่ task ล่าสุดถูกยกเลิกไว้ (high-20d)
      expect(cancelled.body).toMatchObject({ status: 'CANCELLED', total: 1, cancelled: 1 });
      expect(cancelled.body.byRisk).toEqual({ HIGH: 1, MEDIUM: 0, LOW: 0, SAFE: 0 });
      expect(cancelled.body.noTask).toBe(0);

      // สถานะที่ไม่มีใครอยู่ → ทุกตัวเลขเป็น 0 (ไม่ใช่ค่าของทั้งบริษัท)
      const testing = await get(`/dashboard/summary?companyId=${companyId}&status=TESTING`).expect(
        200,
      );
      expect(testing.body.total).toBe(0);
    });

    it('สถานะที่ไม่มีในระบบ → 400', async () => {
      await get(`/dashboard/summary?companyId=${companyId}&status=DONE`).expect(400);
    });

    it('กรองตามเดือนได้', async () => {
      const target = expiresInDays(200);
      const month = `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, '0')}`;

      const response = await get(`/dashboard/summary?companyId=${companyId}&month=${month}`).expect(
        200,
      );

      expect(response.body.total).toBe(1);
      expect(response.body.byRisk.SAFE).toBe(1);
    });

    it('บริษัทที่ไม่มีจริง → 404', async () => {
      await get('/dashboard/summary?companyId=11111111-1111-4111-8111-111111111111').expect(404);
    });

    it('ต้อง login ก่อน → ไม่มี token = 401', async () => {
      await request(app.getHttpServer()).get('/dashboard/summary').expect(401);
    });
  });
});
