import 'dotenv/config';
import argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../src/generated/prisma/client.js';
import {
  DEFAULT_ADMISSION_FORM,
  DEFAULT_ADMISSION_FORM_NAME,
  PHOTO_FIELDS,
} from '../src/modules/forms/default-admission-form.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const PERMISSIONS = [
  'users.manage',
  'settings.manage',
  'audit.read',
  'dashboard.view',
  'insights.admissions',
  'insights.staff',
  'forms.manage',
  'academics.read',
  'academics.manage',
  'admissions.read',
  'admissions.manage',
  'students.read',
  'students.read_all',
  'students.manage',
  'students.remove',
  'students.documents.read',
  'students.promote',
  'portal.accounts.manage',
  'staff.read',
  'staff.read_all',
  'staff.manage',
  'attendance.read',
  'attendance.read_all',
  'attendance.mark',
  'attendance.mark_all',
  'marks.enter',
  'results.publish',
  'results.read',
  'fees.read',
  'fees.read_all',
  'fees.structure.manage',
  'fees.concession.manage',
  'fees.payment.create',
  'fees.payment.reverse',
  'notices.read',
  'notices.create',
  'notices.read_all',
  'notices.manage_all',
  'calendar.read',
  'calendar.manage',
  'staff_attendance.read',
  'staff_attendance.read_all',
  'staff_attendance.manage',
  'admins.manage',
  'leave.apply',
  'leave.manage',
  'fees.reminder.send',
  'homework.manage',
  'homework.manage_all',
  'homework.read',
];

// Scope ("own class", "own child") is checked in services, not here.
/**
 * What only the Super Admin (the trustees) may do. The School Admin runs the school day to day with
 * every other permission, including all of Finance except reversing payments and giving concessions.
 */
const SUPER_ADMIN_ONLY = [
  'admins.manage',
  'settings.manage',
  'audit.read',
  'fees.payment.reverse',
  'fees.concession.manage',
];

type RoleDef = {
  name: string;
  permissions: string[] | 'ALL' | { allExcept: string[] };
};
const ROLES: Record<string, RoleDef> = {
  SUPER_ADMIN: { name: 'Super Admin', permissions: 'ALL' },
  SCHOOL_ADMIN: {
    name: 'School Admin',
    permissions: { allExcept: SUPER_ADMIN_ONLY },
  },
  OFFICE_STAFF: {
    name: 'Office Staff',
    permissions: [
      'academics.read',
      'admissions.read',
      'admissions.manage',
      'students.read',
      'students.read_all',
      'students.manage',
      'students.documents.read',
      'portal.accounts.manage',
      'staff.read',
      'staff.read_all',
      'attendance.read',
      'attendance.read_all',
      'staff_attendance.read_all',
      'insights.admissions',
      'notices.read',
      'calendar.read',
      'notices.read_all',
      'notices.create',
      'calendar.manage',
      'dashboard.view',
    ],
  },
  ACCOUNTANT: {
    name: 'Accountant',
    permissions: [
      'academics.read',
      'admissions.read',
      'students.read',
      'students.read_all',
      'students.documents.read',
      'fees.read',
      'fees.read_all',
      'fees.structure.manage',
      'fees.payment.create',
      'fees.reminder.send',
      'notices.read',
      'calendar.read',
      'notices.read_all',
      'notices.create',
      'dashboard.view',
    ],
  },
  TEACHER: {
    name: 'Teacher',
    permissions: [
      'academics.read',
      'students.read',
      'students.read_all',
      'staff.read',
      'attendance.read',
      'attendance.mark',
      'staff_attendance.read',
      'leave.apply',
      'marks.enter',
      'results.read',
      'homework.manage',
      'notices.read',
      'calendar.read',
      'notices.create',
      'dashboard.view',
    ],
  },
  STAFF: {
    name: 'Staff',
    permissions: [
      'staff.read',
      'staff_attendance.read',
      'leave.apply',
      'notices.read',
      'calendar.read',
    ],
  },
  PARENT: {
    name: 'Parent',
    permissions: [
      'students.read',
      'attendance.read',
      'results.read',
      'fees.read',
      'homework.read',
      'notices.read',
      'calendar.read',
    ],
  },
  STUDENT: {
    name: 'Student',
    permissions: [
      'students.read',
      'attendance.read',
      'results.read',
      'fees.read',
      'homework.read',
      'notices.read',
      'calendar.read',
    ],
  },
};

async function main() {
  // Permissions
  for (const code of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code },
      update: {},
      create: { code },
    });
  }
  const allPermissions = await prisma.permission.findMany();

  // Roles and their permissions
  for (const [code, def] of Object.entries(ROLES)) {
    const role = await prisma.role.upsert({
      where: { code },
      update: { name: def.name },
      create: { code, name: def.name },
    });
    const perms = def.permissions;
    const wanted =
      perms === 'ALL'
        ? allPermissions
        : Array.isArray(perms)
          ? allPermissions.filter((p) => perms.includes(p.code))
          : allPermissions.filter((p) => !perms.allExcept.includes(p.code));
    // Make the role match the list exactly, so a permission taken away here is taken away in the database.
    await prisma.rolePermission.deleteMany({
      where: {
        roleId: role.id,
        permissionId: { notIn: wanted.map((p) => p.id) },
      },
    });
    await prisma.rolePermission.createMany({
      data: wanted.map((p) => ({ roleId: role.id, permissionId: p.id })),
      skipDuplicates: true,
    });
  }

  // School
  const school =
    // Oldest first: the same rule the app uses to decide which school a login belongs to.
    (await prisma.school.findFirst({ orderBy: { createdAt: 'asc' } })) ??
    (await prisma.school.create({ data: { name: 'Demo School' } }));

  // The kinds of employee the school starts with. The school adds more (Driver, Librarian...) in Settings.
  for (const [i, t] of [
    { name: 'Teacher', isTeaching: true },
    { name: 'Clerk', isTeaching: false },
    { name: 'Peon', isTeaching: false },
  ].entries()) {
    await prisma.staffType.upsert({
      where: { schoolId_name: { schoolId: school.id, name: t.name } },
      update: {},
      create: { schoolId: school.id, ...t, sortOrder: i + 1 },
    });
  }

  // The school's admission form, as published version 1. Editable later in the form builder.
  const hasAdmissionForm = await prisma.formDefinition.findFirst({
    where: { schoolId: school.id, key: 'admission' },
    select: { id: true },
  });
  if (!hasAdmissionForm) {
    await prisma.formDefinition.create({
      data: {
        schoolId: school.id,
        key: 'admission',
        version: 1,
        name: DEFAULT_ADMISSION_FORM_NAME,
        status: 'PUBLISHED',
        publishedAt: new Date(),
        schema: DEFAULT_ADMISSION_FORM as unknown as Prisma.InputJsonObject,
      },
    });
  }

  // Improvements to the admission form reach a database that already has the form as a new
  // published version, once. Each step does nothing when its change is already there, and a school
  // that has changed that part of the form in the builder is left alone.
  type Field = { id: string; type: string; system?: string; newRow?: boolean };
  type LooseSchema = {
    sections: { id: string; title?: string; fields: Field[] }[];
  };
  async function upgradeAdmissionForm(
    message: string,
    change: (schema: LooseSchema) => boolean,
  ) {
    const live = await prisma.formDefinition.findFirst({
      where: { schoolId: school.id, key: 'admission', status: 'PUBLISHED' },
    });
    if (!live) return;
    const schema = structuredClone(live.schema) as unknown as LooseSchema;
    if (schema.sections.length === 0 || !change(schema)) return;

    const last = await prisma.formDefinition.aggregate({
      where: { schoolId: school.id, key: 'admission' },
      _max: { version: true },
    });
    await prisma.$transaction([
      prisma.formDefinition.update({
        where: { id: live.id },
        data: { status: 'ARCHIVED' },
      }),
      prisma.formDefinition.create({
        data: {
          schoolId: school.id,
          key: 'admission',
          version: (last._max.version ?? live.version) + 1,
          name: live.name,
          status: 'PUBLISHED',
          publishedAt: new Date(),
          schema: schema as unknown as Prisma.InputJsonObject,
        },
      }),
    ]);
    console.log(`Admission form: ${message} (new version published).`);
  }
  const everyField = (schema: LooseSchema) =>
    schema.sections.flatMap((s) => s.fields);

  await upgradeAdmissionForm('added the four photograph boxes', (schema) => {
    if (everyField(schema).some((f) => f.type === 'image')) return false;
    const first =
      schema.sections.find((s) => s.id === 'admission') ?? schema.sections[0];
    first.fields.push(...structuredClone(PHOTO_FIELDS));
    return true;
  });

  await upgradeAdmissionForm('photographs start on their own row', (schema) => {
    const photo = everyField(schema).find((f) => f.system === 'student.photo');
    if (!photo || photo.newRow !== undefined) return false;
    photo.newRow = true;
    return true;
  });

  await upgradeAdmissionForm('added the age limits table', (schema) => {
    if (everyField(schema).some((f) => f.type === 'ageLimits')) return false;
    const section = DEFAULT_ADMISSION_FORM.sections.find(
      (s) => s.id === 'ageLimits',
    );
    if (!section) return false;
    // Before the declaration, as on the paper form; at the end if the form has no declaration.
    const at = schema.sections.findIndex((s) => s.id === 'declaration');
    schema.sections.splice(
      at < 0 ? schema.sections.length : at,
      0,
      structuredClone(section),
    );
    return true;
  });

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
  // The first login belongs to the trustees' role. Further admins are made from the Users screen.
  const adminRole = await prisma.role.findUniqueOrThrow({
    where: { code: 'SUPER_ADMIN' },
  });
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
