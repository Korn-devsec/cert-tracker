/**
 * e2e ตามเกณฑ์ตรวจรับ Phase 3 — ใช้ไฟล์ Excel จริง
 *   1. import sheet Report-SSL-Jul-2026 สำเร็จ ข้อมูลเข้า DB ครบ ผูก company ถูก status ไทยถูก map
 *   2. ไฟล์สลับคอลัมน์ → import ผ่านเหมือนเดิม
 *   3. ไฟล์ที่ลบคอลัมน์ Expires/Days Until → reject พร้อมข้อความชัดเจน
 *   4. import ไฟล์เดิมซ้ำ → จำนวน cert ไม่เพิ่ม (upsert)
 *
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

const FIXTURES = join(__dirname, 'fixtures');
const REAL_FILE = join(FIXTURES, '30-July-2026.xlsx');
const JULY_SHEET = 'Report-SSL-Jul-2026';

const RUN_ID = process.env.E2E_RUN_ID ?? String(process.hrtime.bigint());
const ADMIN_EMAIL = `e2e-imp-admin-${RUN_ID}@example.com`;
const VIEWER_EMAIL = `e2e-imp-viewer-${RUN_ID}@example.com`;
const PASSWORD = 'E2e-Passw0rd!';
const CODE_MAIN = `E2EIMP${RUN_ID}`.slice(0, 18);
const CODE_SWAP = `E2ESWP${RUN_ID}`.slice(0, 18);

/** 6 แถวข้อมูลใน sheet Jul แต่แถวหนึ่งมี 2 endpoint → 7 รายการ certificate */
const EXPECTED_CERTS = 7;

describe('Imports (e2e) — ไฟล์ Excel จริง', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let adminToken: string;
  let viewerToken: string;
  let mainCompanyId: string;
  let swapCompanyId: string;

  const importReal = (companyId: string, extra: Record<string, string> = {}): SupertestRequest => {
    const req = request(app.getHttpServer())
      .post('/imports')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('companyId', companyId)
      .field('sheetName', JULY_SHEET);
    for (const [key, value] of Object.entries(extra)) {
      req.field(key, value);
    }
    return req.attach('file', REAL_FILE);
  };

  beforeAll(async () => {
    prisma = new PrismaClient();
    const passwordHash = await hashPassword(PASSWORD);
    await prisma.user.createMany({
      data: [
        { email: ADMIN_EMAIL, name: 'E2E Import Admin', role: UserRole.ADMIN, passwordHash },
        { email: VIEWER_EMAIL, name: 'E2E Import Viewer', role: UserRole.VIEWER, passwordHash },
      ],
    });
    const [main, swap] = await Promise.all([
      prisma.company.create({ data: { name: 'บริษัท import e2e', code: CODE_MAIN } }),
      prisma.company.create({ data: { name: 'บริษัท swapped e2e', code: CODE_SWAP } }),
    ]);
    mainCompanyId = main.id;
    swapCompanyId = swap.id;

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
    viewerToken = await login(VIEWER_EMAIL);
  }, 45_000);

  afterAll(async () => {
    const companyIds = [mainCompanyId, swapCompanyId].filter(Boolean);
    // ลบตามลำดับ dependency: history → task → cert → batch → company → user
    await prisma.historyLog.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.renewalTask.deleteMany({
      where: { certificate: { companyId: { in: companyIds } } },
    });
    await prisma.certificate.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.importBatch.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
    await prisma.user.deleteMany({ where: { email: { in: [ADMIN_EMAIL, VIEWER_EMAIL] } } });
    await prisma.$disconnect();
    await app.close();
  });

  describe('POST /imports/inspect', () => {
    it('คืนรายชื่อ sheet ทั้งหมดพร้อมแถว header ที่ตรวจเจอ', async () => {
      const response = await request(app.getHttpServer())
        .post('/imports/inspect')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', REAL_FILE)
        .expect(201);

      expect(response.body.sheets).toHaveLength(3);
      const july = response.body.sheets.find(
        (sheet: { name: string }) => sheet.name === JULY_SHEET,
      );
      expect(july).toMatchObject({ headerRow: 3, importable: true, dataRowCount: 6 });
      expect(response.body.suggestedSheet).not.toBe('Report');
    });

    it('viewer สำรวจไฟล์ไม่ได้ → 403', async () => {
      await request(app.getHttpServer())
        .post('/imports/inspect')
        .set('Authorization', `Bearer ${viewerToken}`)
        .attach('file', REAL_FILE)
        .expect(403);
    });
  });

  describe('dryRun — preview ก่อนบันทึก', () => {
    it('ไม่เขียนอะไรลง DB แต่คืน preview ครบ', async () => {
      const response = await importReal(mainCompanyId, { dryRun: 'true' }).expect(201);

      expect(response.body).toMatchObject({
        dryRun: true,
        batchId: null,
        rowCount: EXPECTED_CERTS,
        createdCount: EXPECTED_CERTS,
        updatedCount: 0,
      });
      expect(response.body.preview).toHaveLength(EXPECTED_CERTS);
      expect(response.body.preview[0]).toMatchObject({
        excelRow: 4,
        commonName: 'Self Cert',
        endpoint: '192.168.239.101:4443',
        action: 'create',
      });

      await expect(prisma.certificate.count({ where: { companyId: mainCompanyId } })).resolves.toBe(
        0,
      );
      await expect(prisma.importBatch.count({ where: { companyId: mainCompanyId } })).resolves.toBe(
        0,
      );
    });
  });

  describe('เกณฑ์ 1: import ไฟล์จริงสำเร็จ', () => {
    it('บันทึก 7 รายการ (6 แถว + แถวที่มี 2 endpoint) ผูก company ถูก', async () => {
      const response = await importReal(mainCompanyId).expect(201);

      expect(response.body).toMatchObject({
        status: 'SUCCESS',
        sheetName: JULY_SHEET,
        headerRow: 3,
        scannedRows: 6,
        rowCount: EXPECTED_CERTS,
        createdCount: EXPECTED_CERTS,
        updatedCount: 0,
        skippedCount: 0,
      });
      expect(response.body.errors).toEqual([]);
      expect(response.body.batchId).toBeTruthy();

      const certs = await prisma.certificate.findMany({
        where: { companyId: mainCompanyId },
        orderBy: { endpoint: 'asc' },
      });
      expect(certs).toHaveLength(EXPECTED_CERTS);
      expect(certs.every((cert) => cert.companyId === mainCompanyId)).toBe(true);
    });

    it('endpoint หลายค่าในเซลล์เดียวถูกแตกเป็นหลายรายการ', async () => {
      const olvm = await prisma.certificate.findMany({
        where: { companyId: mainCompanyId, commonName: 'sme-olvmcenter2.smebank.local' },
        orderBy: { endpoint: 'asc' },
      });

      expect(olvm.map((cert) => cert.endpoint)).toEqual([
        '192.168.223.205:35357',
        '192.168.223.205:54323',
        '192.168.223.205:9696',
      ]);
    });

    it('วันหมดอายุเก็บเป็น UTC ตรงกับไฟล์ และไม่เก็บ daysUntilExpiry ลง DB', async () => {
      const cert = await prisma.certificate.findFirstOrThrow({
        where: { companyId: mainCompanyId, endpoint: '192.168.239.101:4443' },
      });

      expect(cert.expiresAt.toISOString()).toBe('2026-09-18T12:25:54.000Z');
      expect(cert.owner).toBe('IT Sec');
      expect(cert.signatureAlgorithm).toBe('SHA256withRSA');
      expect(Object.keys(cert)).not.toContain('daysUntilExpiry');
      expect(Object.keys(cert)).not.toContain('riskLevel');
    });

    it('status ไทย "อยู่ระหว่างดำเนินการ" → สร้าง RenewalTask สถานะ NEW', async () => {
      const tasks = await prisma.renewalTask.findMany({
        where: { certificate: { companyId: mainCompanyId } },
      });

      expect(tasks).toHaveLength(EXPECTED_CERTS);
      expect(tasks.every((task) => task.status === WorkStatus.NEW)).toBe(true);
    });

    it('บันทึก ImportBatch และ HistoryLog ต่อ cert พร้อม actor', async () => {
      const batch = await prisma.importBatch.findFirstOrThrow({
        where: { companyId: mainCompanyId },
      });
      expect(batch).toMatchObject({
        filename: '30-July-2026.xlsx',
        sheetName: JULY_SHEET,
        importedBy: ADMIN_EMAIL,
        status: 'SUCCESS',
        createdCount: EXPECTED_CERTS,
      });

      const importLogs = await prisma.historyLog.findMany({
        where: { companyId: mainCompanyId, action: 'IMPORT', certificateId: { not: null } },
      });
      expect(importLogs).toHaveLength(EXPECTED_CERTS);
      expect(importLogs.every((log) => log.actor === ADMIN_EMAIL)).toBe(true);
    });
  });

  describe('เกณฑ์ 4: import ไฟล์เดิมซ้ำ → ไม่สร้างซ้ำ', () => {
    it('ครั้งที่สองเป็น update ทั้งหมด และจำนวน cert ใน DB ไม่เพิ่ม', async () => {
      const before = await prisma.certificate.count({ where: { companyId: mainCompanyId } });

      const response = await importReal(mainCompanyId).expect(201);

      expect(response.body).toMatchObject({
        createdCount: 0,
        updatedCount: EXPECTED_CERTS,
        tasksCreated: 0, // มีงานค้างอยู่แล้ว จึงไม่สร้างซ้ำ
      });
      await expect(prisma.certificate.count({ where: { companyId: mainCompanyId } })).resolves.toBe(
        before,
      );
      await expect(
        prisma.renewalTask.count({ where: { certificate: { companyId: mainCompanyId } } }),
      ).resolves.toBe(EXPECTED_CERTS);
    });
  });

  describe('เกณฑ์ 2: ไฟล์สลับคอลัมน์', () => {
    it('import ผ่านเหมือนเดิม และ typo `Onwer` ยัง map เป็น owner', async () => {
      const response = await request(app.getHttpServer())
        .post('/imports')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('companyId', swapCompanyId)
        .attach('file', join(FIXTURES, 'columns-swapped.xlsx'))
        .expect(201);

      expect(response.body).toMatchObject({ status: 'SUCCESS', createdCount: 4 });

      const certs = await prisma.certificate.findMany({ where: { companyId: swapCompanyId } });
      expect(certs.find((cert) => cert.commonName === 'Self Cert')?.owner).toBe('IT Sec');

      // แถวที่สถานะ "ดำเนินการแล้ว " (ช่องว่างท้าย) → task COMPLETED
      const k3s = await prisma.certificate.findFirstOrThrow({
        where: { companyId: swapCompanyId, commonName: 'k3s' },
        include: { renewalTasks: true },
      });
      expect(k3s.renewalTasks[0].status).toBe(WorkStatus.COMPLETED);
      expect(k3s.renewalTasks[0].completedAt).not.toBeNull();
    });
  });

  describe('เกณฑ์ 3: ไฟล์ขาดคอลัมน์ที่จำเป็น', () => {
    it('reject ทั้งไฟล์ พร้อมบอกคอลัมน์ที่หายและชื่อที่ระบบยอมรับ', async () => {
      const response = await request(app.getHttpServer())
        .post('/imports')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('companyId', mainCompanyId)
        .field('sheetName', 'NoExpiry')
        .attach('file', join(FIXTURES, 'missing-expiry.xlsx'))
        .expect(400);

      expect(response.body.message).toContain('ขาดคอลัมน์ที่จำเป็น');
      expect(response.body.missingColumns).toEqual(['expiresAt หรือ daysUntilExpiry']);
      expect(response.body.acceptedHeaders.expiresAt).toContain('expires');
      expect(response.body.headersFound).toContain('Common Name');
    });

    it('ไม่บันทึกอะไรเลยจากไฟล์ที่ถูก reject', async () => {
      const certs = await prisma.certificate.count({ where: { companyId: mainCompanyId } });
      expect(certs).toBe(EXPECTED_CERTS);
    });
  });

  describe('strict mode', () => {
    it('ค่าเริ่มต้น strict → มีแถวเสีย reject ทั้งไฟล์ พร้อมเลขแถวและเหตุผล', async () => {
      const response = await request(app.getHttpServer())
        .post('/imports')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('companyId', mainCompanyId)
        .field('sheetName', 'Broken')
        .attach('file', join(FIXTURES, 'broken-rows.xlsx'))
        .expect(400);

      expect(response.body.message).toContain('strict');
      expect(response.body.errors).toHaveLength(3);
      expect(response.body.errors.map((error: { excelRow: number }) => error.excelRow)).toEqual([
        5, 6, 7,
      ]);
    });

    it('strict=false → บันทึกแถวที่ใช้ได้ และรายงานแถวเสียใน ImportBatch', async () => {
      const response = await request(app.getHttpServer())
        .post('/imports')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('companyId', mainCompanyId)
        .field('sheetName', 'Broken')
        .field('strict', 'false')
        .attach('file', join(FIXTURES, 'broken-rows.xlsx'))
        .expect(201);

      expect(response.body).toMatchObject({
        status: 'PARTIAL',
        createdCount: 1,
        skippedCount: 3,
      });

      const batch = await prisma.importBatch.findUniqueOrThrow({
        where: { id: response.body.batchId as string },
      });
      expect(batch.status).toBe('PARTIAL');
      expect(batch.errors).not.toBeNull();
    });
  });

  describe('การตรวจสอบก่อน import', () => {
    it('ไม่ส่ง companyId → 400 (กฎเหล็ก: ต้องเลือกบริษัทก่อนเสมอ)', async () => {
      await request(app.getHttpServer())
        .post('/imports')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', REAL_FILE)
        .expect(400);
    });

    it('companyId ที่ไม่มีจริง → 404', async () => {
      await request(app.getHttpServer())
        .post('/imports')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('companyId', '11111111-1111-4111-8111-111111111111')
        .attach('file', REAL_FILE)
        .expect(404);
    });

    it('ไม่แนบไฟล์ → 400', async () => {
      await request(app.getHttpServer())
        .post('/imports')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('companyId', mainCompanyId)
        .expect(400);
    });

    it('ไฟล์ที่ไม่ใช่ .xlsx → 400', async () => {
      await request(app.getHttpServer())
        .post('/imports')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('companyId', mainCompanyId)
        .attach('file', Buffer.from('ไม่ใช่ excel'), 'data.csv')
        .expect(400);
    });

    it('ระบุ sheetName ที่ไม่มีในไฟล์ → 400 พร้อมรายชื่อ sheet ที่มี', async () => {
      const response = await request(app.getHttpServer())
        .post('/imports')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('companyId', mainCompanyId)
        .field('sheetName', 'ไม่มี sheet นี้')
        .attach('file', REAL_FILE)
        .expect(400);

      expect(response.body.availableSheets).toContain(JULY_SHEET);
    });

    it('viewer import ไม่ได้ → 403', async () => {
      await request(app.getHttpServer())
        .post('/imports')
        .set('Authorization', `Bearer ${viewerToken}`)
        .field('companyId', mainCompanyId)
        .attach('file', REAL_FILE)
        .expect(403);
    });
  });

  describe('GET /imports', () => {
    it('viewer ดูประวัติการ import ได้', async () => {
      const response = await request(app.getHttpServer())
        .get(`/imports?companyId=${mainCompanyId}`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);

      expect(response.body.length).toBeGreaterThanOrEqual(2);
      expect(response.body[0]).toHaveProperty('filename');
    });
  });
});
