import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const password = 'Admin@123';
  const hash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email: 'admin@erp.local' },
    update: {},
    create: {
      email: 'admin@erp.local',
      firstName: 'Rahul',
      lastName: 'Admin',
      passwordHash: hash,
      userType: 'internal',
      isActive: true,
      employeeCode: 'EMP001',
    },
  });

  // Assign super_admin role
  const role = await prisma.role.findUnique({ where: { roleCode: 'super_admin' } });
  if (role) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });
  }

  console.log('Admin user created:');
  console.log(`   Email:    admin@erp.local`);
  console.log(`   Password: Admin@123`);
  console.log(`   Role:     super_admin`);
  console.log(`   ID:       ${user.id}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
