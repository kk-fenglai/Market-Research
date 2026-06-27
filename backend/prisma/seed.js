// Seed: platform baseline (super admin + optional demo users).
//
// Safety:
//   - The admin user is always upserted (needed for first deploy on any env).
//   - Demo user accounts are only created in NON-production environments
//     unless you explicitly set ALLOW_PROD_SEED=true.
//
// 业务示例数据(DELF 题库)已随业务模块移除。换业务时在此处按需补种子。
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

const IS_PROD = process.env.NODE_ENV === 'production';
const ALLOW_PROD_SEED = process.env.ALLOW_PROD_SEED === 'true';

async function main() {
  console.log(`🌱 Seeding database (NODE_ENV=${process.env.NODE_ENV || 'development'})...`);

  // ---- Super Admin — always ensure exists ----
  // 下次建站：设 ADMIN_EMAIL / ADMIN_INITIAL_PASSWORD 两个 env 即可，无需改代码。
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com';
  const adminInitialPwd = process.env.ADMIN_INITIAL_PASSWORD || 'ChangeMe$Admin@2026!Prod';
  if (IS_PROD && !process.env.ADMIN_INITIAL_PASSWORD) {
    console.warn('⚠️  ADMIN_INITIAL_PASSWORD not set — using default. Change it immediately after first login.');
  }
  const adminPwdHash = await bcrypt.hash(adminInitialPwd, 12);
  await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { role: 'SUPER_ADMIN', status: 'ACTIVE', emailVerified: true },
    create: {
      email: ADMIN_EMAIL,
      passwordHash: adminPwdHash,
      name: 'Super Admin',
      plan: 'AI_UNLIMITED',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
  });
  console.log(`✅ Super admin ready: ${ADMIN_EMAIL}`);
  console.log('⚠️  Change this password IMMEDIATELY after first login!');

  // ---- Demo users — dev/staging only ----
  if (IS_PROD && !ALLOW_PROD_SEED) {
    console.log('⏭️  Skipping demo users (NODE_ENV=production).');
    return;
  }

  const demoPwd = await bcrypt.hash('demo1234', 12);
  await prisma.user.upsert({
    where: { email: 'demo@example.com' },
    update: { emailVerified: true },
    create: {
      email: 'demo@example.com',
      passwordHash: demoPwd,
      name: '演示用户',
      plan: 'STANDARD',
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
  });
  await prisma.user.upsert({
    where: { email: 'free@example.com' },
    update: { emailVerified: true },
    create: {
      email: 'free@example.com',
      passwordHash: demoPwd,
      name: '免费用户',
      plan: 'FREE',
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
  });

  console.log('🎉 Seed complete!');
  console.log('Test accounts:');
  console.log('  demo@example.com / demo1234  (标准版)');
  console.log('  free@example.com / demo1234  (免费版)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
