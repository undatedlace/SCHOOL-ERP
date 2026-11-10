import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthContext } from '../../common/auth-context.js';
import { dateOnly, todayIso } from '../../common/dates.js';
import { Page, skipTake } from '../../common/dto/page-query.dto.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { FilesService } from '../files/files.service.js';
import { fileIds, FormSchema, validateAnswers } from '../forms/form-schema.js';
import { STAFF_FORM_PREFIX } from '../forms/form-kinds.js';
import { FormsService } from '../forms/forms.service.js';
import { UsersService } from '../users/users.service.js';
import {
  AccountDto,
  CreateStaffDto,
  ListStaffQueryDto,
  STAFF_ROLES,
  UpdateStaffDto,
} from './dto/staff.dto.js';

const ACCOUNT_INCLUDE = {
  staffType: { select: { id: true, name: true, isTeaching: true } },
  user: {
    select: {
      id: true,
      status: true,
      mustChangePassword: true,
      roles: { select: { role: { select: { code: true, name: true } } } },
    },
  },
} satisfies Prisma.StaffInclude;

type Row = Prisma.StaffGetPayload<{ include: typeof ACCOUNT_INCLUDE }>;

const fullName = (s: { firstName: string; surname: string }) =>
  `${s.firstName} ${s.surname}`;

const view = (s: Row) => ({
  id: s.id,
  employeeNo: s.employeeNo,
  fullName: fullName(s),
  firstName: s.firstName,
  surname: s.surname,
  gender: s.gender,
  dateOfBirth: s.dateOfBirth,
  mobile: s.mobile,
  email: s.email,
  designation: s.designation,
  qualification: s.qualification,
  address: s.address,
  photoFileId: s.photoFileId,
  status: s.status,
  staffType: s.staffType,
  joinedOn: s.joinedOn,
  leftOn: s.leftOn,
  account: s.user
    ? {
        userId: s.user.id,
        status: s.user.status,
        mustChangePassword: s.user.mustChangePassword,
        roles: s.user.roles.map((r) => r.role),
      }
    : null,
});

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly users: UsersService,
    private readonly files: FilesService,
    private readonly forms: FormsService,
  ) {}

  /**
   * Staff with staff.read_all (admin, office) see everyone. Anyone else with
   * staff.read (teachers, other staff) sees only their own record.
   */
  private visible(auth: AuthContext): Prisma.StaffWhereInput {
    return auth.permissions.includes('staff.read_all')
      ? {}
      : { userId: auth.userId };
  }

  async list(
    auth: AuthContext,
    q: ListStaffQueryDto,
  ): Promise<Page<ReturnType<typeof view>>> {
    const where: Prisma.StaffWhereInput = {
      schoolId: auth.schoolId,
      ...this.visible(auth),
      ...(q.status ? { status: q.status } : {}),
      ...(q.gender ? { gender: q.gender } : {}),
      ...(q.staffTypeId ? { staffTypeId: q.staffTypeId } : {}),
      ...(q.designation
        ? { designation: { contains: q.designation, mode: 'insensitive' } }
        : {}),
      ...(q.joinedFrom || q.joinedTo
        ? {
            joinedOn: {
              ...(q.joinedFrom ? { gte: dateOnly(q.joinedFrom) } : {}),
              ...(q.joinedTo ? { lte: dateOnly(q.joinedTo) } : {}),
            },
          }
        : {}),
      ...(q.role
        ? { user: { roles: { some: { role: { code: q.role } } } } }
        : q.hasLogin === undefined
          ? {}
          : { userId: q.hasLogin ? { not: null } : null }),
      ...(q.search
        ? {
            OR: [
              { firstName: { contains: q.search, mode: 'insensitive' } },
              { surname: { contains: q.search, mode: 'insensitive' } },
              { employeeNo: { contains: q.search, mode: 'insensitive' } },
              { designation: { contains: q.search, mode: 'insensitive' } },
              { mobile: { contains: q.search } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.staff.findMany({
        where,
        include: ACCOUNT_INCLUDE,
        orderBy: [{ surname: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
        ...skipTake(q),
      }),
      this.prisma.staff.count({ where }),
    ]);
    return {
      items: rows.map(view),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  async findOne(auth: AuthContext, id: string) {
    const row = await this.prisma.staff.findFirst({
      where: { id, schoolId: auth.schoolId, ...this.visible(auth) },
      include: ACCOUNT_INCLUDE,
    });
    // Same answer for "does not exist" and "not yours to see".
    if (!row) throw new NotFoundException('Staff member not found');
    return {
      ...view(row),
      onboarding: await this.onboarding(auth, row),
    };
  }

  /**
   * The onboarding form and what was answered, for administrators only: it holds identity papers.
   * The form shown is the version the answers were filled in with.
   */
  private async onboarding(
    auth: AuthContext,
    row: { formId: string | null; answers: Prisma.JsonValue },
  ) {
    if (!auth.permissions.includes('staff.manage') || !row.formId) return null;
    const form = await this.prisma.formDefinition.findFirst({
      where: { id: row.formId, schoolId: auth.schoolId },
      select: { id: true, version: true, name: true, schema: true },
    });
    if (!form) return null;
    return {
      formId: form.id,
      version: form.version,
      name: form.name,
      schema: form.schema as unknown as FormSchema,
      answers: (row.answers ?? {}) as Record<string, unknown>,
    };
  }

  /**
   * Works out the type, form version and checked answers to save. A new type means that type's live form;
   * the same type keeps the version the record was filled in with. Throws a message that says what to fix.
   */
  private async resolveOnboarding(
    auth: AuthContext,
    typeId: string | undefined,
    rawAnswers: Record<string, unknown> | undefined,
    current?: { staffTypeId: string | null; formId: string | null },
  ): Promise<{
    staffTypeId: string;
    formId: string;
    answers: Prisma.InputJsonObject;
  } | null> {
    if (typeId === undefined && rawAnswers === undefined) return null;
    const changing = typeId !== undefined && typeId !== current?.staffTypeId;
    // Naming the same type again, with no answers, changes nothing.
    if (rawAnswers === undefined && !changing) return null;
    const staffTypeId = typeId ?? current?.staffTypeId ?? undefined;
    if (!staffTypeId) {
      throw new BadRequestException(
        'Choose a staff type before adding details',
      );
    }
    if (changing) {
      const type = await this.prisma.staffType.findFirst({
        where: { id: staffTypeId, schoolId: auth.schoolId, active: true },
        select: { id: true },
      });
      if (!type)
        throw new BadRequestException('Choose a staff type from the list');
    }
    const form =
      changing || !current?.formId
        ? await this.forms.ensurePublished(
            auth.schoolId,
            `${STAFF_FORM_PREFIX}${staffTypeId}`,
          )
        : await this.prisma.formDefinition.findFirstOrThrow({
            where: { id: current.formId, schoolId: auth.schoolId },
          });
    const schema = form.schema as unknown as FormSchema;
    const raw = rawAnswers ?? {};
    const [photos, documents] = await Promise.all([
      this.files.existing(
        auth.schoolId,
        'staff-photo',
        fileIds(schema, raw, 'image'),
      ),
      this.files.existing(
        auth.schoolId,
        'staff-document',
        fileIds(schema, raw, 'document'),
      ),
    ]);
    const { answers, errors } = validateAnswers(schema, raw, {
      classIds: new Set(),
      fileIds: new Set([...photos, ...documents]),
    });
    if (Object.keys(errors).length > 0) {
      throw new BadRequestException({
        message: Object.values(errors).join('. '),
        errors,
      });
    }
    return {
      staffTypeId,
      formId: form.id,
      answers: answers as Prisma.InputJsonObject,
    };
  }

  async create(auth: AuthContext, dto: CreateStaffDto, ip?: string) {
    if (dto.account) this.assertMayGiveAccess(auth, dto.account);
    if (dto.account && !dto.email && !dto.mobile) {
      throw new BadRequestException(
        'Give an email address or a mobile number so the person can sign in',
      );
    }
    await this.assertPhoto(auth.schoolId, dto.photoFileId);
    const onboarding = await this.resolveOnboarding(
      auth,
      dto.staffTypeId,
      dto.answers,
    );

    let temporaryPassword: string | undefined;
    let created: { id: string };
    try {
      created = await this.prisma.$transaction(async (tx) => {
        // One at a time per school, so two additions can never get the same number.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`staff:${auth.schoolId}`}))`;
        const last = await tx.staff.aggregate({
          where: { schoolId: auth.schoolId },
          _max: { seq: true },
        });
        const seq = (last._max.seq ?? 0) + 1;

        let employeeNo = dto.employeeNo;
        if (employeeNo) {
          const clash = await tx.staff.findFirst({
            where: { schoolId: auth.schoolId, employeeNo },
            select: { id: true },
          });
          if (clash)
            throw new ConflictException(
              `Employee number ${employeeNo} is already used`,
            );
        } else {
          let candidate = seq;
          while (
            await tx.staff.findFirst({
              where: { schoolId: auth.schoolId, employeeNo: String(candidate) },
              select: { id: true },
            })
          ) {
            candidate++;
          }
          employeeNo = String(candidate);
        }

        let userId: string | null = null;
        if (dto.account) {
          const account = await this.users.createAccount(tx, auth.schoolId, {
            fullName: fullName(dto),
            email: dto.email,
            mobile: dto.mobile,
            roleCodes: dto.account.roleCodes,
          });
          userId = account.id;
          temporaryPassword = account.temporaryPassword;
        }

        return tx.staff.create({
          data: {
            schoolId: auth.schoolId,
            seq,
            employeeNo,
            firstName: dto.firstName,
            surname: dto.surname,
            gender: dto.gender,
            dateOfBirth: dto.dateOfBirth ? dateOnly(dto.dateOfBirth) : null,
            mobile: dto.mobile ?? null,
            email: dto.email ?? null,
            designation: dto.designation,
            qualification: dto.qualification ?? null,
            address: dto.address ?? null,
            photoFileId: dto.photoFileId ?? null,
            joinedOn: dateOnly(dto.joinedOn ?? todayIso()),
            userId,
            ...onboarding,
          },
          select: { id: true },
        });
      });
    } catch (error) {
      throw this.conflict(error);
    }

    await this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action: 'staff.created',
      entityType: 'staff',
      entityId: created.id,
      metadata: dto.account ? { roles: dto.account.roleCodes.join(',') } : {},
      ip,
    });
    return {
      ...(await this.findOne(auth, created.id)),
      ...(temporaryPassword ? { temporaryPassword } : {}),
    };
  }

  async update(
    auth: AuthContext,
    id: string,
    dto: UpdateStaffDto,
    ip?: string,
  ) {
    const existing = await this.prisma.staff.findFirst({
      where: { id, schoolId: auth.schoolId },
      select: {
        id: true,
        status: true,
        userId: true,
        firstName: true,
        surname: true,
        staffTypeId: true,
        formId: true,
      },
    });
    if (!existing) throw new NotFoundException('Staff member not found');
    await this.assertPhoto(auth.schoolId, dto.photoFileId);
    const onboarding = await this.resolveOnboarding(
      auth,
      dto.staffTypeId,
      dto.answers,
      existing,
    );

    const {
      dateOfBirth,
      joinedOn,
      status,
      leftOn,
      staffTypeId: _type,
      answers: _answers,
      ...rest
    } = dto;
    void _type;
    void _answers;
    const data: Prisma.StaffUncheckedUpdateInput = {
      ...rest,
      ...onboarding,
    };
    if (dateOfBirth) data.dateOfBirth = dateOnly(dateOfBirth);
    if (joinedOn) data.joinedOn = dateOnly(joinedOn);

    const changingStatus = status !== undefined && status !== existing.status;
    if (status === 'LEFT') {
      data.status = 'LEFT';
      data.leftOn = dateOnly(leftOn ?? todayIso());
    } else if (status === 'ACTIVE') {
      data.status = 'ACTIVE';
      data.leftOn = null;
    } else if (leftOn) {
      throw new BadRequestException(
        'leftOn can only be set together with status LEFT',
      );
    }

    // Leaving switches the login off and signs the person out everywhere; rejoining
    // switches it back on. This runs first because it refuses to lock out the last
    // School Admin or the person making the change, and then nothing else is touched.
    if (changingStatus && existing.userId) {
      await this.users.update(
        auth,
        existing.userId,
        { status: status === 'LEFT' ? 'DISABLED' : 'ACTIVE' },
        ip,
      );
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.staff.update({ where: { id }, data });
        // The account shows the same name.
        if (existing.userId && (dto.firstName || dto.surname)) {
          await tx.user.update({
            where: { id: existing.userId },
            data: {
              fullName: fullName({
                firstName: dto.firstName ?? existing.firstName,
                surname: dto.surname ?? existing.surname,
              }),
            },
          });
        }
      });
    } catch (error) {
      throw this.conflict(error);
    }

    await this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action: changingStatus ? 'staff.status_changed' : 'staff.updated',
      entityType: 'staff',
      entityId: id,
      metadata: {
        fields: Object.keys(dto).join(','),
        ...(status ? { status } : {}),
      },
      ip,
    });
    return this.findOne(auth, id);
  }

  /** Gives a member of staff who has no login one, with a temporary password shown once. */
  async addAccount(
    auth: AuthContext,
    id: string,
    dto: AccountDto,
    ip?: string,
  ) {
    this.assertMayGiveAccess(auth, dto);
    const staff = await this.prisma.staff.findFirst({
      where: { id, schoolId: auth.schoolId },
    });
    if (!staff) throw new NotFoundException('Staff member not found');
    if (staff.userId)
      throw new ConflictException('This person already has a login');
    if (staff.status !== 'ACTIVE')
      throw new BadRequestException(
        'Rejoin this person before giving them a login',
      );
    if (!staff.email && !staff.mobile) {
      throw new BadRequestException(
        'Add an email address or a mobile number first, so the person can sign in',
      );
    }

    let temporaryPassword: string | undefined;
    try {
      await this.prisma.$transaction(async (tx) => {
        const account = await this.users.createAccount(tx, auth.schoolId, {
          fullName: fullName(staff),
          email: staff.email ?? undefined,
          mobile: staff.mobile ?? undefined,
          roleCodes: dto.roleCodes,
        });
        temporaryPassword = account.temporaryPassword;
        await tx.staff.update({
          where: { id },
          data: { userId: account.id },
        });
      });
    } catch (error) {
      throw this.conflict(error);
    }
    await this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action: 'staff.account_created',
      entityType: 'staff',
      entityId: id,
      metadata: { roles: dto.roleCodes.join(',') },
      ip,
    });
    return { ...(await this.findOne(auth, id)), temporaryPassword };
  }

  // ---------- helpers ----------

  /** Creating logins is an administrator's job (users.manage), and only for staff roles. */
  private assertMayGiveAccess(auth: AuthContext, account: AccountDto) {
    if (!auth.permissions.includes('users.manage')) {
      throw new ForbiddenException(
        'Only an administrator can give someone a login',
      );
    }
    this.users.assertMayGrantRoles(auth, account.roleCodes);
    const bad = account.roleCodes.filter((c) => !STAFF_ROLES.includes(c));
    if (bad.length) {
      throw new BadRequestException(
        `${bad.join(', ')} cannot be given to a member of staff`,
      );
    }
  }

  private async assertPhoto(schoolId: string, id: string | undefined) {
    if (!id) return;
    const found = await this.files.existing(schoolId, 'staff-photo', [id]);
    if (!found.has(id))
      throw new BadRequestException('Upload the photograph again');
  }

  private conflict(error: unknown): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const target = JSON.stringify(error.meta?.target ?? '');
      return new ConflictException(
        /employee_no|employeeNo/.test(target)
          ? 'That employee number is already used'
          : 'That email address or mobile number is already used by another login',
      );
    }
    return error;
  }
}
