/**
 * e2e ตามเกณฑ์ตรวจรับ Phase 7 — เดิน flow จริงครบวงจรด้วย API ชุดเดียวกับที่หน้าจอเรียก
 *
 *   สร้างบริษัท → import Excel จริง → เห็นตัวเลขบน dashboard → เปิด cert detail
 *   → มอบหมายงาน → เปลี่ยนสถานะจนเสร็จ → ประวัติครบทุกขั้น
 *
 * รวมการตรวจ `/users` ที่เพิ่มใน Phase 7 (หน้า Settings/Users + dropdown ผู้รับผิดชอบ)
 * ต้องมี PostgreSQL รันอยู่ (`docker compose up -d db`)
 */
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { PrismaClient, UserRole, WorkStatus } from '@prisma/client';
import { join } from 'node:path';
import request, { type Test as SupertestRequest } from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { hashPassword } from '../src/common/password';

const REAL_FILE = join(__dirname, 'fixtures', '30-July-2026.xlsx');
const JULY_SHEET = 'Report-SSL-Jul-2026';
const EXPECTED_CERTS = 7;

const RUN_ID = process.env.E2E_RUN_ID ?? String(process.hrtime.bigint());
const ADMIN_EMAIL = `e2e-flow-admin-${RUN_ID}@example.com`;
const OPERATOR_EMAIL = `e2e-flow-operator-${RUN_ID}@example.com`;
const VIEWER_EMAIL = `e2e-flow-viewer-${RUN_ID}@example.com`;
const NEW_USER_EMAIL = `e2e-flow-new-${RUN_ID}@example.com`;
const PASSWORD = 'E2e-Passw0rd!';
const COMPANY_CODE = `E2EFLOW${RUN_ID}`.slice(0, 18);

describe('Full flow (e2e) — Phase 7', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let adminToken: string;
  let operatorToken: string;
  let viewerToken: string;
  let companyId: string;
  let operatorId: string;
  let certificateId: string;
  let taskId: string;

  const get = (path: string, token: string): SupertestRequest =>
    request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`);

  const post = (path: string, token: string): SupertestRequest =>
    request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${token}`);

  const patch = (path: string, token: string): SupertestRequest =>
    request(app.getHttpServer()).patch(path).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    process.env.NOTIFICATION_DRY_RUN = 'true';
    prisma = new PrismaClient();
    const passwordHash = await hashPassword(PASSWORD);
    await prisma.user.createMany({
      data: [
        { email: ADMIN_EMAIL, name: 'E2E Flow Admin', role: UserRole.ADMIN, passwordHash },
        { email: OPERATOR_EMAIL, name: 'E2E Flow Operator', role: UserRole.OPERATOR, passwordHash },
        { email: VIEWER_EMAIL, name: 'E2E Flow Viewer', role: UserRole.VIEWER, passwordHash },
      ],
    });
    operatorId = (await prisma.user.findUniqueOrThrow({ where: { email: OPERATOR_EMAIL } })).id;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    // ใช้การตั้งค่าชุดเดียวกับ main.ts (helmet, CORS, ValidationPipe) เพื่อให้เทสต์ตรงกับของจริง
    configureApp(app);
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
    if (companyId !== undefined) {
      await prisma.notificationLog.deleteMany({ where: { certificate: { companyId } } });
      await prisma.attachment.deleteMany({ where: { certificate: { companyId } } });
      await prisma.historyLog.deleteMany({ where: { companyId } });
      await prisma.renewalTask.deleteMany({ where: { certificate: { companyId } } });
      await prisma.certificate.deleteMany({ where: { companyId } });
      await prisma.importBatch.deleteMany({ where: { companyId } });
      await prisma.company.deleteMany({ where: { id: companyId } });
    }
    await prisma.historyLog.deleteMany({
      where: { actor: { in: [ADMIN_EMAIL, OPERATOR_EMAIL, VIEWER_EMAIL] } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: [ADMIN_EMAIL, OPERATOR_EMAIL, VIEWER_EMAIL, NEW_USER_EMAIL] } },
    });
    await prisma.$disconnect();
    await app.close();
  });

  describe('ขั้นที่ 1: สร้างบริษัท (หน้า Companies)', () => {
    it('viewer สร้างบริษัทไม่ได้ → 403', async () => {
      await post('/companies', viewerToken)
        .send({ name: 'ห้ามสร้าง', code: `X${COMPANY_CODE}`.slice(0, 18) })
        .expect(403);
    });

    it('admin สร้างบริษัทได้ และรหัสถูกบันทึกเป็นตัวพิมพ์ใหญ่', async () => {
      const response = await post('/companies', adminToken)
        .send({
          name: 'บริษัท ทดสอบ flow',
          code: COMPANY_CODE.toLowerCase(),
          contactEmail: 'it@e2e-flow.example.co.th',
        })
        .expect(201);

      companyId = response.body.id as string;
      expect(response.body.code).toBe(COMPANY_CODE.toUpperCase());
      expect(response.body.isActive).toBe(true);
    });

    it('บริษัทใหม่ปรากฏในรายการที่หน้า Dashboard ใช้ทำ dropdown', async () => {
      const response = await get('/companies', viewerToken).expect(200);
      expect(
        (response.body as Array<{ id: string }>).some((company) => company.id === companyId),
      ).toBe(true);
    });

    it('แก้ชื่อบริษัทได้ (หน้า Companies → แก้ไข)', async () => {
      const response = await patch(`/companies/${companyId}`, adminToken)
        .send({ name: 'บริษัท ทดสอบ flow (แก้ไขแล้ว)' })
        .expect(200);
      expect(response.body.name).toContain('แก้ไขแล้ว');
    });
  });

  describe('ขั้นที่ 2: import Excel จริง (หน้า Import)', () => {
    it('สำรวจไฟล์ก่อน → ได้ทุก sheet ให้ผู้ใช้เลือก พร้อมแถว header ที่ตรวจเจอ', async () => {
      const response = await post('/imports/inspect', operatorToken)
        .attach('file', REAL_FILE)
        .expect(201);

      const sheets = response.body.sheets as Array<{
        name: string;
        headerRow: number | null;
        importable: boolean;
      }>;
      // หน้า Import แสดงทุก sheet ให้เลือกเอง ไม่ผูกกับ sheet ที่ระบบแนะนำ
      expect(sheets.length).toBeGreaterThanOrEqual(3);
      expect(sheets.find((sheet) => sheet.name === JULY_SHEET)).toMatchObject({
        headerRow: 3,
        importable: true,
      });
      // ไฟล์นี้มีหลายเดือน — ที่ระบบแนะนำต้องเป็น sheet ที่ import ได้จริง (ไม่ใช่ตารางที่ merge cell ไว้)
      expect(response.body.suggestedSheet).not.toBe('Report');
      expect(sheets.find((sheet) => sheet.name === response.body.suggestedSheet)?.importable).toBe(
        true,
      );
    });

    it('preview (dryRun) ไม่บันทึกอะไร แต่บอกว่าจะสร้างกี่รายการ', async () => {
      const response = await post('/imports', operatorToken)
        .field('companyId', companyId)
        .field('sheetName', JULY_SHEET)
        .field('dryRun', 'true')
        .attach('file', REAL_FILE)
        .expect(201);

      expect(response.body).toMatchObject({ dryRun: true, batchId: null, createdCount: 7 });
      await expect(prisma.certificate.count({ where: { companyId } })).resolves.toBe(0);
    });

    it('ยืนยันแล้ว import สำเร็จ 7 รายการ พร้อมสร้างงานต่ออายุอัตโนมัติ', async () => {
      const response = await post('/imports', operatorToken)
        .field('companyId', companyId)
        .field('sheetName', JULY_SHEET)
        .attach('file', REAL_FILE)
        .expect(201);

      expect(response.body).toMatchObject({
        status: 'SUCCESS',
        createdCount: EXPECTED_CERTS,
        tasksCreated: EXPECTED_CERTS,
      });
    });
  });

  describe('ขั้นที่ 3: เห็นข้อมูลบน Dashboard', () => {
    it('ตัวเลขสรุปของบริษัทนี้ตรงกับที่ import เข้าไป', async () => {
      const response = await get(`/dashboard/summary?companyId=${companyId}`, viewerToken).expect(
        200,
      );

      expect(response.body.total).toBe(EXPECTED_CERTS);
      expect(response.body.byStatus.NEW).toBe(EXPECTED_CERTS);
      expect(response.body.pending).toBe(EXPECTED_CERTS);
      expect(response.body.completed).toBe(0);
    });

    it('ตารางรายการ cert เรียงตามวันหมดอายุและมี risk คำนวณสด', async () => {
      const response = await get(
        `/certificates?companyId=${companyId}&pageSize=100`,
        viewerToken,
      ).expect(200);

      expect(response.body.meta.total).toBe(EXPECTED_CERTS);
      const first = response.body.data[0] as {
        id: string;
        riskLevel: string;
        daysUntilExpiry: number;
        currentTask: { id: string; status: WorkStatus };
      };
      certificateId = first.id;
      taskId = first.currentTask.id;
      expect(first.currentTask.status).toBe(WorkStatus.NEW);
      expect(typeof first.daysUntilExpiry).toBe('number');
      expect(['HIGH', 'MEDIUM', 'LOW', 'SAFE']).toContain(first.riskLevel);
    });
  });

  describe('ขั้นที่ 4: เปิดหน้า Certificate Detail', () => {
    it('ได้ข้อมูลเทคนิคครบตามที่หน้า detail ต้องแสดง', async () => {
      const response = await get(`/certificates/${certificateId}`, viewerToken).expect(200);

      for (const field of [
        'commonName',
        'san',
        'issuer',
        'serialNumber',
        'signatureAlgorithm',
        'keySize',
        'sha256Fingerprint',
        'endpoint',
        'owner',
        'expiresAt',
        'daysUntilExpiry',
        'riskLevel',
        'isExpired',
      ]) {
        expect(response.body).toHaveProperty(field);
      }
      expect(response.body.company.code).toBe(COMPANY_CODE.toUpperCase());
      expect(response.body.currentTask.status).toBe(WorkStatus.NEW);
      // ประวัติจากการ import ต้องอยู่ในไทม์ไลน์แล้ว
      expect(
        (response.body.historyLogs as Array<{ action: string }>).some(
          (log) => log.action === 'IMPORT',
        ),
      ).toBe(true);
    });

    it('แนบไฟล์ใบรับรองแล้วดาวน์โหลดกลับมาได้ (หน้า detail → Attachment)', async () => {
      const upload = await post(`/certificates/${certificateId}/attachments`, operatorToken)
        .attach('file', Buffer.from('-----BEGIN CERTIFICATE-----'), 'cert-flow.pem')
        .expect(201);

      const download = await get(
        `/certificates/${certificateId}/attachments/${upload.body.id}/download`,
        viewerToken,
      ).expect(200);

      const content = Buffer.isBuffer(download.body)
        ? download.body.toString('utf8')
        : (download.text as string);
      expect(content).toBe('-----BEGIN CERTIFICATE-----');
    });
  });

  describe('ขั้นที่ 5: มอบหมายงานและเดินสถานะจนเสร็จ (หน้า Tasks)', () => {
    it('รายชื่อผู้รับผิดชอบมาจาก GET /users (operator เรียกได้)', async () => {
      const response = await get('/users', operatorToken).expect(200);

      const operator = (response.body as Array<{ id: string; role: UserRole }>).find(
        (user) => user.id === operatorId,
      );
      expect(operator?.role).toBe(UserRole.OPERATOR);
      // ต้องไม่มี hash รหัสผ่านหลุดออกมาที่หน้าจอ
      expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    });

    it('viewer ดูรายชื่อผู้ใช้ไม่ได้ → 403', async () => {
      await get('/users', viewerToken).expect(403);
    });

    it('มอบหมายงานให้ operator → สถานะเดินเป็น Assigned อัตโนมัติ', async () => {
      const response = await patch(`/tasks/${taskId}/assign`, operatorToken)
        .send({ assigneeId: operatorId, note: 'รับงานไปดำเนินการ' })
        .expect(200);

      expect(response.body).toMatchObject({ status: WorkStatus.ASSIGNED, assigneeId: operatorId });
    });

    it('ข้ามขั้นไม่ได้ (Assigned → Completed) → 400', async () => {
      await patch(`/tasks/${taskId}/status`, operatorToken)
        .send({ status: WorkStatus.COMPLETED })
        .expect(400);
    });

    it('เดินตามขั้นจนถึง Completed', async () => {
      for (const status of [
        WorkStatus.IN_PROGRESS,
        WorkStatus.WAITING_CA,
        WorkStatus.TESTING,
        WorkStatus.COMPLETED,
      ]) {
        await patch(`/tasks/${taskId}/status`, operatorToken).send({ status }).expect(200);
      }

      const task = await get(`/tasks/${taskId}`, viewerToken).expect(200);
      expect(task.body.status).toBe(WorkStatus.COMPLETED);
      expect(task.body.completedAt).not.toBeNull();
    });

    it('เกณฑ์ตรวจรับ: ประวัติครบทุกขั้น ใครทำอะไรเมื่อไร', async () => {
      const response = await get(`/certificates/${certificateId}`, viewerToken).expect(200);
      const actions = (response.body.historyLogs as Array<{ action: string; actor: string }>).map(
        (log) => log.action,
      );

      // import → มอบหมาย (+ เดินสถานะอัตโนมัติ) → in progress → รอ CA → ทดสอบ → เสร็จ
      expect(actions).toContain('IMPORT');
      expect(actions).toContain('ASSIGN');
      expect(actions).toContain('STATUS_CHANGE');
      expect(actions).toContain('CSR_GENERATED');
      expect(actions).toContain('VERIFY');
      expect(actions).toContain('COMPLETE');
      expect(actions).toContain('ATTACHMENT_UPLOADED');
    });

    it('cert ที่ปิดงานแล้วสะท้อนใน Dashboard ทันที (Completed 1 รายการ)', async () => {
      const response = await get(`/dashboard/summary?companyId=${companyId}`, viewerToken).expect(
        200,
      );

      expect(response.body.completed).toBe(1);
      expect(response.body.pending).toBe(EXPECTED_CERTS - 1);
      expect(response.body.byStatus.COMPLETED).toBe(1);
    });

    it('กรอง Dashboard ด้วยสถานะ Completed → เหลือใบเดียว (ตัวกรองของหน้า Dashboard)', async () => {
      const response = await get(
        `/dashboard/summary?companyId=${companyId}&status=COMPLETED`,
        viewerToken,
      ).expect(200);
      expect(response.body.total).toBe(1);
    });
  });

  describe('ขั้นที่ 6: หน้า Settings/Users', () => {
    let newUserId: string;

    it('admin สร้างผู้ใช้ใหม่ได้ (POST /auth/register)', async () => {
      const response = await post('/auth/register', adminToken)
        .send({
          email: NEW_USER_EMAIL,
          name: 'ผู้ใช้ใหม่จาก flow',
          password: 'Another-Passw0rd!',
          role: UserRole.VIEWER,
        })
        .expect(201);

      newUserId = response.body.id as string;
      expect(response.body).not.toHaveProperty('passwordHash');
    });

    it('operator แก้ผู้ใช้ไม่ได้ → 403', async () => {
      await patch(`/users/${newUserId}`, operatorToken).send({ role: UserRole.ADMIN }).expect(403);
    });

    it('admin เปลี่ยน role และปิดใช้งานบัญชีได้ พร้อมลงประวัติ', async () => {
      const response = await patch(`/users/${newUserId}`, adminToken)
        .send({ role: UserRole.OPERATOR, isActive: false })
        .expect(200);

      expect(response.body).toMatchObject({ role: UserRole.OPERATOR, isActive: false });

      const logs = await prisma.historyLog.findMany({
        where: { action: 'USER_UPDATED', actor: ADMIN_EMAIL },
      });
      expect(logs.length).toBeGreaterThanOrEqual(1);
    });

    it('บัญชีที่ถูกปิดใช้งาน login ไม่ได้ทันที', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: NEW_USER_EMAIL, password: 'Another-Passw0rd!' })
        .expect(401);
    });

    it('admin ปิดบัญชีตัวเองไม่ได้ → 403', async () => {
      const me = await get('/auth/me', adminToken).expect(200);
      await patch(`/users/${me.body.id}`, adminToken).send({ isActive: false }).expect(403);
    });

    it('บัญชีที่ถูกปิดแล้วไม่อยู่ในรายการผู้รับผิดชอบ (ค่าเริ่มต้นของ GET /users)', async () => {
      const response = await get('/users', adminToken).expect(200);
      expect((response.body as Array<{ id: string }>).some((user) => user.id === newUserId)).toBe(
        false,
      );

      const all = await get('/users?includeInactive=true', adminToken).expect(200);
      expect((all.body as Array<{ id: string }>).some((user) => user.id === newUserId)).toBe(true);
    });
  });
});
