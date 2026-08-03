/**
 * e2e ตามเกณฑ์ตรวจรับ Phase 2:
 *   login → สร้างบริษัท → viewer สร้างบริษัทไม่ได้ (403) → token ปลอม/หมดอายุ (401)
 *
 * ต้องมี PostgreSQL รันอยู่ (`docker compose up -d db`) และ migrate แล้ว
 * ข้อมูลที่สร้างในเทสต์ใช้ prefix `e2e-` และถูกลบทิ้งใน afterAll
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaClient, UserRole } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/common/password';

const RUN_ID = process.env.E2E_RUN_ID ?? String(process.hrtime.bigint());
const ADMIN_EMAIL = `e2e-admin-${RUN_ID}@example.com`;
const VIEWER_EMAIL = `e2e-viewer-${RUN_ID}@example.com`;
const PASSWORD = 'E2e-Passw0rd!';
const COMPANY_CODE = `E2E${RUN_ID}`.slice(0, 20);

describe('Auth + Companies (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let jwtService: JwtService;
  let adminToken: string;
  let viewerToken: string;
  let createdCompanyId: string | undefined;

  beforeAll(async () => {
    prisma = new PrismaClient();
    const passwordHash = await hashPassword(PASSWORD);
    await prisma.user.createMany({
      data: [
        { email: ADMIN_EMAIL, name: 'E2E Admin', role: UserRole.ADMIN, passwordHash },
        { email: VIEWER_EMAIL, name: 'E2E Viewer', role: UserRole.VIEWER, passwordHash },
      ],
    });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    jwtService = app.get(JwtService);
  }, 30_000);

  afterAll(async () => {
    // ลบตามลำดับ: history → company → user (history อ้างถึง company)
    await prisma.historyLog.deleteMany({ where: { actor: { in: [ADMIN_EMAIL, VIEWER_EMAIL] } } });
    await prisma.company.deleteMany({ where: { code: { startsWith: 'E2E' } } });
    await prisma.user.deleteMany({ where: { email: { in: [ADMIN_EMAIL, VIEWER_EMAIL] } } });
    await prisma.$disconnect();
    await app.close();
  });

  describe('login', () => {
    it('รหัสผ่านถูก → 200 พร้อม accessToken', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: ADMIN_EMAIL, password: PASSWORD })
        .expect(200);

      expect(response.body).toMatchObject({
        user: { email: ADMIN_EMAIL, role: UserRole.ADMIN },
      });
      expect(typeof response.body.accessToken).toBe('string');
      expect(response.body.user).not.toHaveProperty('passwordHash');

      adminToken = response.body.accessToken as string;
    });

    it('viewer login ได้เหมือนกัน', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: VIEWER_EMAIL, password: PASSWORD })
        .expect(200);

      viewerToken = response.body.accessToken as string;
    });

    it('รหัสผ่านผิด → 401', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: ADMIN_EMAIL, password: 'wrong-password' })
        .expect(401);
    });
  });

  describe('การป้องกัน endpoint', () => {
    it('ไม่ส่ง token → 401', async () => {
      await request(app.getHttpServer()).get('/companies').expect(401);
    });

    it('token ปลอม (เซ็นด้วย secret อื่น) → 401', async () => {
      const forged = new JwtService({ secret: 'not-the-real-secret' }).sign({
        sub: 'someone',
        email: ADMIN_EMAIL,
        role: UserRole.ADMIN,
      });

      await request(app.getHttpServer())
        .get('/companies')
        .set('Authorization', `Bearer ${forged}`)
        .expect(401);
    });

    it('token หมดอายุ → 401', async () => {
      const admin = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });
      const expired = jwtService.sign(
        { sub: admin.id, email: admin.email, role: admin.role },
        { expiresIn: '-1s' },
      );

      await request(app.getHttpServer())
        .get('/companies')
        .set('Authorization', `Bearer ${expired}`)
        .expect(401);
    });

    it('GET /health เรียกได้โดยไม่ต้อง login', async () => {
      await request(app.getHttpServer()).get('/health').expect(200);
    });
  });

  describe('Companies CRUD ตามสิทธิ์', () => {
    it('admin สร้างบริษัทได้ → 201', async () => {
      const response = await request(app.getHttpServer())
        .post('/companies')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'บริษัททดสอบ e2e', code: COMPANY_CODE.toLowerCase() })
        .expect(201);

      expect(response.body).toMatchObject({
        name: 'บริษัททดสอบ e2e',
        code: COMPANY_CODE.toUpperCase(),
        isActive: true,
      });
      createdCompanyId = response.body.id as string;
    });

    it('การสร้างบริษัทถูกบันทึกลง HistoryLog พร้อม actor', async () => {
      const logs = await prisma.historyLog.findMany({ where: { companyId: createdCompanyId } });
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({ action: 'COMPANY_CREATED', actor: ADMIN_EMAIL });
    });

    it('viewer สร้างบริษัทไม่ได้ → 403', async () => {
      await request(app.getHttpServer())
        .post('/companies')
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ name: 'viewer ห้ามสร้าง', code: `${COMPANY_CODE}X`.slice(0, 20) })
        .expect(403);
    });

    it('viewer อ่านรายการบริษัทได้ → 200', async () => {
      const response = await request(app.getHttpServer())
        .get('/companies')
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('viewer แก้ไขบริษัทไม่ได้ → 403', async () => {
      await request(app.getHttpServer())
        .patch(`/companies/${createdCompanyId}`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ name: 'viewer ห้ามแก้' })
        .expect(403);
    });

    it('viewer ปิดใช้งานบริษัทไม่ได้ → 403', async () => {
      await request(app.getHttpServer())
        .delete(`/companies/${createdCompanyId}`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(403);
    });

    it('viewer สร้างผู้ใช้ไม่ได้ → 403 (register เฉพาะ admin)', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({
          email: `e2e-nope-${RUN_ID}@example.com`,
          name: 'ห้ามสร้าง',
          password: PASSWORD,
          role: UserRole.VIEWER,
        })
        .expect(403);
    });

    it('รหัสบริษัทซ้ำ → 409', async () => {
      await request(app.getHttpServer())
        .post('/companies')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'ซ้ำ', code: COMPANY_CODE })
        .expect(409);
    });

    it('ข้อมูลไม่ผ่าน validation → 400', async () => {
      await request(app.getHttpServer())
        .post('/companies')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: '', code: 'ไม่ใช่ ascii' })
        .expect(400);
    });

    it('DELETE = soft delete → isActive เป็น false แต่ข้อมูลยังอยู่', async () => {
      await request(app.getHttpServer())
        .delete(`/companies/${createdCompanyId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const stillThere = await prisma.company.findUnique({ where: { id: createdCompanyId } });
      expect(stillThere).not.toBeNull();
      expect(stillThere?.isActive).toBe(false);
    });

    it('Site CRUD: admin สร้าง site ได้ และ viewer ถูกปฏิเสธ', async () => {
      const created = await request(app.getHttpServer())
        .post(`/companies/${createdCompanyId}/sites`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Head Office' })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/companies/${createdCompanyId}/sites`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ name: 'DR Site' })
        .expect(403);

      await request(app.getHttpServer())
        .delete(`/companies/${createdCompanyId}/sites/${created.body.id as string}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);
    });

    it('บัญชีถูกปิดใช้งานแล้ว token เดิมใช้ต่อไม่ได้ → 401', async () => {
      await prisma.user.update({ where: { email: VIEWER_EMAIL }, data: { isActive: false } });

      await request(app.getHttpServer())
        .get('/companies')
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(401);
    });
  });
});
