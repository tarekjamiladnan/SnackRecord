import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  const team = await prisma.team.upsert({
    where: { slug: 'admin-team' },
    update: { name: 'Admin Team' },
    create: {
      name: 'Admin Team',
      slug: 'admin-team',
      status: 'ACTIVE'
    }
  });

  console.log(`✓ Team ready: ${team.name}`);

  const passwordHash = await bcrypt.hash('adnan123', 12);
  const user = await prisma.user.upsert({
    where: { email: 'admin@gmail.com' },
    update: {
      name: 'Admin',
      passwordHash,
      teamId: team.id,
      role: 'TEAM_ADMIN',
      phone: null
    },
    create: {
      email: 'admin@gmail.com',
      name: 'Admin',
      phone: null,
      passwordHash,
      role: 'TEAM_ADMIN',
      teamId: team.id
    }
  });

  console.log(`✓ Admin user ready: ${user.email} (password: adnan123)`);

  await prisma.member.upsert({
    where: {
      userId: user.id
    },
    update: {
      name: user.name,
      email: user.email,
      phone: null,
      status: 'active'
    },
    create: {
      name: user.name,
      email: user.email,
      phone: null,
      userId: user.id,
      teamId: team.id,
      status: 'active'
    }
  });

  const superHash = await bcrypt.hash('Adnan@123', 12);
  const superUser = await prisma.user.upsert({
    where: { email: 'superadmin@gmail.com' },
    update: {
      name: 'Super Admin',
      passwordHash: superHash,
      teamId: team.id,
      role: 'SUPER_ADMIN',
      phone: null
    },
    create: {
      email: 'superadmin@gmail.com',
      name: 'Super Admin',
      phone: null,
      passwordHash: superHash,
      role: 'SUPER_ADMIN',
      teamId: team.id
    }
  });

  console.log(`✓ Super admin user ready: ${superUser.email} (password: Adnan@123)`);

  await prisma.member.upsert({
    where: {
      userId: superUser.id
    },
    update: {
      name: superUser.name,
      email: superUser.email,
      phone: null,
      status: 'active'
    },
    create: {
      name: superUser.name,
      email: superUser.email,
      phone: null,
      userId: superUser.id,
      teamId: team.id,
      status: 'active'
    }
  });

  console.log('✓ Super admin member record synced');
  console.log('\n✅ Database seeded successfully!');
  console.log('\n📝 Credentials:');
  console.log('   Super Admin: superadmin@gmail.com / Adnan@123');
  console.log('   Admin:       admin@gmail.com / adnan123');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
