/**
 * e2e ของงาน Phase 8
 *   - ความปลอดภัยพื้นฐาน: rate limit login, security header (helmet), ตรวจชนิด/ขนาดไฟล์อัปโหลด
 *   - รายงาน: Export Excel ตามตัวกรอง + สรุปรายเดือนเทียบเดือนก่อนหน้า
 *
 * spec นี้ตั้ง `LOGIN_RATE_LIMIT` ต่ำเป็นพิเศษเพื่อทดสอบตัวจำกัดจริง
 * (spec อื่นใช้ค่าเริ่มต้น และนับแยกตาม IP+อีเมล จึงไม่กระทบกัน)
 */
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { PrismaClient, UserRole } from '@prisma/client';
import { join } from 'node:path';
import request, { type Test as SupertestRequest } from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { hashPassword } from '../src/common/password';
import { loadWorkbookFromBuffer } from '../src/imports/excel/load-workbook';

const REAL_FILE = join(__dirname, 'fixtures', '30-July-2026.xlsx');
const JULY_SHEET = 'Report-SSL-Jul-2026';

const RUN_ID = process.env.E2E_RUN_ID ?? String(process.hrtime.bigint());
const ADMIN_EMAIL = `e2e-sec-admin-${RUN_ID}@example.com`;
const THROTTLE_EMAIL = `e2e-sec-throttle-${RUN_ID}@example.com`;
const PASSWORD = 'E2e-Passw0rd!';
const CODE = `E2ESEC${RUN_ID}`.slice(0, 18);

/** ตั้งไว้ต่ำเพื่อทดสอบ — ค่าจริงในการใช้งานคือ 5 ครั้ง/นาที */
const LOGIN_LIMIT = 3;

describe('Security & Reports (e2e) — Phase 8', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let adminToken: string;
  let companyId: string;

  const get = (path: string, token = adminToken): SupertestRequest =>
    request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    process.env.LOGIN_RATE_LIMIT = String(LOGIN_LIMIT);
    process.env.LOGIN_RATE_WINDOW_SECONDS = '60';
    process.env.NOTIFICATION_DRY_RUN = 'true';

    prisma = new PrismaClient();
    const passwordHash = await hashPassword(PASSWORD);
    await prisma.user.createMany({
      data: [
        { email: ADMIN_EMAIL, name: 'E2E Sec Admin', role: UserRole.ADMIN, passwordHash },
        { email: THROTTLE_EMAIL, name: 'E2E Sec Throttle', role: UserRole.VIEWER, passwordHash },
      ],
    });
    const company = await prisma.company.create({
      data: { name: 'บริษัท security e2e', code: CODE, contactEmail: 'it@e2e-sec.example.co.th' },
    });
    companyId = company.id;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    // ใช้การตั้งค่าชุดเดียวกับ main.ts (helmet, CORS, ValidationPipe) เพื่อให้เทสต์ตรงกับของจริง
    configureApp(app);
    await app.init();

    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: ADMIN_EMAIL, password: PASSWORD })
      .expect(200);
    adminToken = response.body.accessToken as string;

    // เตรียมข้อมูลจริงไว้ทดสอบ Export
    await request(app.getHttpServer())
      .post('/imports')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('companyId', companyId)
      .field('sheetName', JULY_SHEET)
      .attach('file', REAL_FILE)
      .expect(201);
  }, 60_000);

  afterAll(async () => {
    delete process.env.LOGIN_RATE_LIMIT;
    delete process.env.LOGIN_RATE_WINDOW_SECONDS;

    await prisma.notificationLog.deleteMany({ where: { certificate: { companyId } } });
    await prisma.historyLog.deleteMany({ where: { companyId } });
    await prisma.renewalTask.deleteMany({ where: { certificate: { companyId } } });
    await prisma.certificate.deleteMany({ where: { companyId } });
    await prisma.importBatch.deleteMany({ where: { companyId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await prisma.user.deleteMany({ where: { email: { in: [ADMIN_EMAIL, THROTTLE_EMAIL] } } });
    await prisma.$disconnect();
    await app.close();
  });

  describe('rate limit หน้า login', () => {
    it(`เดารหัสผ่านเกิน ${LOGIN_LIMIT} ครั้ง → 429 พร้อมบอกให้รออีกกี่วินาที`, async () => {
      for (let attempt = 0; attempt < LOGIN_LIMIT; attempt++) {
        await request(app.getHttpServer())
          .post('/auth/login')
          .send({ email: THROTTLE_EMAIL, password: 'ผิดแน่นอน' })
          .expect(401);
      }

      const blocked = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: THROTTLE_EMAIL, password: 'ผิดแน่นอน' })
        .expect(429);

      expect(blocked.body.message).toContain('ถี่เกินไป');
      expect(blocked.body.retryAfterSeconds).toBeGreaterThan(0);
    });

    it('ถูกจำกัดแล้วก็ยังเข้าไม่ได้แม้จะกรอกรหัสถูก (ต้องรอให้พ้นหน้าต่างเวลา)', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: THROTTLE_EMAIL, password: PASSWORD })
        .expect(429);
    });

    it('บัญชีอื่นจากเครื่องเดียวกันยัง login ได้ (นับแยกตาม IP + อีเมล)', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: ADMIN_EMAIL, password: PASSWORD })
        .expect(200);
    });
  });

  describe('security header (helmet)', () => {
    it('ตอบกลับพร้อม header ที่ helmet ตั้งให้', async () => {
      const response = await request(app.getHttpServer()).get('/health').expect(200);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']?.toLowerCase()).toBe('sameorigin');
      expect(response.headers['strict-transport-security']).toBeDefined();
      // helmet ปิดการบอกว่าเป็น Express
      expect(response.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('ตรวจไฟล์ที่อัปโหลด', () => {
    it('ไฟล์ที่ตั้งชื่อ .xlsx แต่เนื้อในไม่ใช่ Excel → 400 (ตรวจจากไบต์แรกของไฟล์)', async () => {
      const response = await request(app.getHttpServer())
        .post('/imports/inspect')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', Buffer.from('Common Name,Days Until\nx,10'), {
          filename: 'ปลอม.xlsx',
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        })
        .expect(400);

      expect(response.body.message).toContain('ไม่ใช่ .xlsx จริง');
    });

    it('ไฟล์แนบที่มี private key → 400 (ยังทำงานเหมือนเดิม)', async () => {
      const certificate = await prisma.certificate.findFirstOrThrow({ where: { companyId } });
      await request(app.getHttpServer())
        .post(`/certificates/${certificate.id}/attachments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', Buffer.from('key'), 'server.key')
        .expect(400);
    });
  });

  describe('GET /reports/monthly', () => {
    it('คืนตัวเลขของเดือนที่เลือกและเดือนก่อนหน้า พร้อมส่วนต่าง', async () => {
      const response = await get(`/reports/monthly?companyId=${companyId}&month=2026-09`).expect(
        200,
      );

      expect(response.body.companyName).toContain(CODE.toUpperCase());
      expect(response.body.current).toMatchObject({ month: '2026-09', monthLabel: 'กันยายน 2569' });
      expect(response.body.previous).toMatchObject({ month: '2026-08' });
      // ไฟล์จริงมี cert หมดอายุ ก.ย. 2026 อยู่ 6 ใบ และ ส.ค. 1 ใบ
      expect(response.body.current.total).toBe(6);
      expect(response.body.previous.total).toBe(1);
      expect(response.body.delta.total).toBe(5);
    });

    it('เดือนรูปแบบผิด → 400', async () => {
      await get('/reports/monthly?month=2026-13').expect(400);
    });

    it('บริษัทที่ไม่มีจริง → 404', async () => {
      await get('/reports/monthly?companyId=11111111-1111-4111-8111-111111111111').expect(404);
    });
  });

  describe('GET /reports/certificates.xlsx', () => {
    it('ดาวน์โหลดไฟล์ Excel ที่เปิดได้ และข้อมูลตรงกับตัวกรอง (เกณฑ์ตรวจรับ Phase 8)', async () => {
      const response = await get(`/reports/certificates.xlsx?companyId=${companyId}`)
        .buffer()
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        })
        .expect(200);

      expect(response.headers['content-type']).toContain('spreadsheetml');
      expect(response.headers['content-disposition']).toContain('.xlsx');
      expect(response.headers['x-report-row-count']).toBe('7');
      expect(response.headers['x-report-truncated']).toBe('false');

      const workbook = await loadWorkbookFromBuffer(response.body as Buffer);
      expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
        'สรุป',
        'รายการ Certificate',
      ]);

      const listSheet = workbook.getWorksheet('รายการ Certificate');
      // 1 แถวหัวตาราง + 7 แถวข้อมูล
      expect(listSheet?.rowCount).toBe(8);

      const values = JSON.stringify(listSheet?.getSheetValues());
      expect(values).toContain('smewormdc02.smebank.local');
      expect(values).toContain('SHA256withRSA');
      expect(values).toContain('รายการใหม่'); // สถานะงานเป็นภาษาไทย

      const summaryValues = JSON.stringify(workbook.getWorksheet('สรุป')?.getSheetValues());
      expect(summaryValues).toContain('ความเสี่ยงสูง');
      expect(summaryValues).toContain(CODE.toUpperCase());
    });

    it('กรองด้วย risk → ไฟล์มีเฉพาะรายการที่ตรงเงื่อนไข', async () => {
      const response = await get(
        `/reports/certificates.xlsx?companyId=${companyId}&risk=HIGH`,
      ).expect(200);

      // ไฟล์จริงมีใบเดียวที่เหลือไม่เกิน 30 วัน
      expect(response.headers['x-report-row-count']).toBe('1');
    });

    it('viewer ดาวน์โหลดรายงานได้ (รายงานเป็นการอ่านข้อมูล)', async () => {
      const viewerLogin = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: ADMIN_EMAIL, password: PASSWORD })
        .expect(200);

      await get(
        `/reports/certificates.xlsx?companyId=${companyId}`,
        viewerLogin.body.accessToken as string,
      ).expect(200);
    });

    it('ไม่มี token → 401', async () => {
      await request(app.getHttpServer())
        .get(`/reports/certificates.xlsx?companyId=${companyId}`)
        .expect(401);
    });
  });
});
