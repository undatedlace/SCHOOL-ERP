import 'dotenv/config';
import argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const PERMISSIONS = [
  'users.manage', 'settings.manage', 'audit.read', 'dashboard.view',
  'academics.read', 'academics.manage',
  'admissions.read', 'admissions.manage',
  'students.read', 'students.manage',
  'staff.read', 'staff.manage',
  'attendance.read', 'attendance.mark',
  'homework.read', 'homework.manage',
  'marks.enter', 'results.publish', 'results.read',
  'fees.read', 'fees.structure.manage', 'fees.payment.create', 'fees.payment.reverse',
  'notices.read', 'notices.create',
];

// Scope ("own class", "own child") is checked in services, not here.
const ROLES: Record<string, { name: string; permissions: string[] | 'ALL' }> = {
  SCHOOL_ADMIN: { name: 'School Admin', permissions: 'ALL' },
  OFFICE_STAFF: {
    name: 'Office Staff',
    permissions: [
      'academics.read', 'admissions.read', 'admissions.manage', 'students.read',
      'students.manage', 'staff.read', 'attendance.read', 'notices.read',
      'notices.create', 'dashboard.view',
    ],
  },
  ACCOUNTANT: {
    name: 'Accountant',
    permissions: [
      'academics.read', 'admissions.read', 'students.read', 'fees.read',
      'fees.structure.manage', 'fees.payment.create', 'notices.read',
      'notices.create', 'dashboard.view',
    ],
  },
  TEACHER: {
    name: 'Teacher',
    permissions: [
      'academics.read', 'students.read', 'attendance.read', 'attendance.mark',
      'homework.read', 'homework.manage', 'marks.enter', 'notices.read',
      'notices.create', 'dashboard.view',
    ],
  },
  STAFF: { name: 'Staff', permissions: ['notices.read'] },
  PARENT: {
    name: 'Parent',
    permissions: [
      'students.read', 'attendance.read', 'homework.read', 'results.read',
      'fees.read', 'notices.read',
    ],
  },
  STUDENT: {
    name: 'Student',
    permissions: [
      'students.read', 'attendance.read', 'homework.read', 'results.read',
      'fees.read', 'notices.read',
    ],
  },
};

async function main() {
  // Permissions
  for (const code of PERMISSIONS) {
    await prisma.permission.upsert({ where: { code }, update: {}, create: { code } });
  }
  const allPermissions = await prisma.permission.findMany();

  // Roles and their permissions
  for (const [code, def] of Object.entries(ROLES)) {
    const role = await prisma.role.upsert({
      where: { code },
      update: { name: def.name },
      create: { code, name: def.name },
    });
    const wanted =
      def.permissions === 'ALL'
        ? allPermissions
        : allPermissions.filter((p) => def.permissions.includes(p.code));
    await prisma.rolePermission.createMany({
      data: wanted.map((p) => ({ roleId: role.id, permissionId: p.id })),
      skipDuplicates: true,
    });
  }

  // School
  const school =
    (await prisma.school.findFirst()) ??
    (await prisma.school.create({ data: { name: 'Demo School' } }));

  // First admin
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';
  const admin = await prisma.user.upsert({
    where: { schoolId_email: { schoolId: school.id, email } },
    update: {},
    create: {
      schoolId: school.id,
      fullName: 'School Admin',
      email,
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      mustChangePassword: true,
    },
  });
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: 'SCHOOL_ADMIN' } });
  await prisma.userRole.createMany({
    data: [{ userId: admin.id, roleId: adminRole.id }],
    skipDuplicates: true,
  });

  console.log(`Seeded. Admin login: ${email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());