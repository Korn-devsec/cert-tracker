/**
 * Seed ข้อมูลตั้งต้น: บริษัทตัวอย่าง 2 แห่ง + ผู้ใช้ระดับ admin 1 คน
 *
 * รันซ้ำได้ (idempotent) — ใช้ upsert และ**ไม่**เขียนรหัสผ่านทับถ้ามี user อยู่แล้ว
 * ตั้งใจไม่ seed ข้อมูล certificate เพราะกฎห้าม hard-code ข้อมูล cert ในโค้ด
 * (ข้อมูล cert ต้องเข้าระบบผ่านการ import Excel เท่านั้น)
 *
 * **ย้ายมาอยู่ใน `src/` ตอน Phase 8** เพื่อให้ถูกคอมไพล์ไปอยู่ใน `dist` ด้วย
 * container จึงรัน seed ได้ด้วย `node dist/seed.js` โดยไม่ต้องมี ts-node หรือซอร์สในภาพ
 * (`prisma/seed.ts` เหลือเป็นตัวห่อบางๆ ให้คำสั่ง `prisma db seed` ตอน dev ใช้)
 */
import { HistoryAction, PrismaClient, UserRole } from '@prisma/client';
import { hashPassword } from './common/password';

const SEED_ACTOR = 'system:seed';

/** บริษัทตัวอย่างสำหรับทดสอบ multi-tenant — ใช้โดเมน example เพื่อไม่ให้ปนกับข้อมูลจริง */
const SAMPLE_COMPANIES = [
  { name: 'SME Bank', code: 'SMEBANK', contactEmail: 'it-security@smebank.example.co.th' },
  {
    name: 'PTT Public Company Limited',
    code: 'PTT',
    contactEmail: 'it-security@ptt.example.co.th',
  },
];

const DEFAULT_ADMIN_EMAIL = 'admin@example.com';
const DEFAULT_ADMIN_PASSWORD = 'ChangeMe!12345';

async function seedCompanies(prisma: PrismaClient): Promise<void> {
  for (const company of SAMPLE_COMPANIES) {
    const existing = await prisma.company.findUnique({ where: { code: company.code } });

    const saved = await prisma.company.upsert({
      where: { code: company.code },
      update: { name: company.name, contactEmail: company.contactEmail },
      create: company,
    });

    if (existing === null) {
      // กฎเหล็กข้อ 6: การสร้างบริษัทต้องมีประวัติ
      await prisma.historyLog.create({
        data: {
          action: HistoryAction.COMPANY_CREATED,
          actor: SEED_ACTOR,
          companyId: saved.id,
          detail: `สร้างบริษัทตัวอย่าง ${saved.name} (${saved.code}) จาก seed script`,
        },
      });
      console.log(`  + สร้างบริษัท ${saved.code} — ${saved.name}`);
    } else {
      console.log(`  = บริษัท ${saved.code} มีอยู่แล้ว (อัปเดตข้อมูลให้ตรงกับ seed)`);
    }
  }
}

async function seedAdminUser(prisma: PrismaClient): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL ?? DEFAULT_ADMIN_EMAIL;
  const configured = process.env.SEED_ADMIN_PASSWORD;
  const password =
    configured === undefined || configured.length === 0 ? DEFAULT_ADMIN_PASSWORD : configured;

  if (configured === undefined || configured.length === 0) {
    console.warn(
      `  ! ไม่พบ SEED_ADMIN_PASSWORD — ใช้รหัสผ่านชั่วคราว "${DEFAULT_ADMIN_PASSWORD}" ` +
        'กรุณาเปลี่ยนก่อนใช้งานจริง',
    );
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing !== null) {
    // ไม่เขียนรหัสผ่านทับ เพื่อไม่ให้ seed ซ้ำแล้วรีเซ็ตรหัสที่ผู้ใช้เปลี่ยนไปแล้ว
    await prisma.user.update({
      where: { email },
      data: { role: UserRole.ADMIN, isActive: true },
    });
    console.log(`  = ผู้ใช้ ${email} มีอยู่แล้ว (คงรหัสผ่านเดิม ยืนยัน role = ADMIN)`);
    return;
  }

  await prisma.user.create({
    data: {
      email,
      name: 'System Administrator',
      role: UserRole.ADMIN,
      passwordHash: await hashPassword(password),
    },
  });
  console.log(`  + สร้างผู้ใช้ admin ${email}`);
}

export async function runSeed(prisma: PrismaClient = new PrismaClient()): Promise<void> {
  console.log('Seeding…');
  await seedCompanies(prisma);
  await seedAdminUser(prisma);

  const [companies, users] = await Promise.all([prisma.company.count(), prisma.user.count()]);
  console.log(`เสร็จแล้ว — companies: ${companies}, users: ${users}`);
}

/** ถูกเรียกทั้งจาก `prisma db seed` (ตอน dev) และ `node dist/seed.js` (ใน container) */
export async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await runSeed(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

// รันเฉพาะเมื่อถูกเรียกเป็นสคริปต์ ไม่ใช่ตอนถูก import
if (require.main === module) {
  main().catch((error: unknown) => {
    console.error('Seed ล้มเหลว:', error);
    process.exitCode = 1;
  });
}
