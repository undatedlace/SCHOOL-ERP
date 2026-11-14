import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthContext } from '../../common/auth-context.js';
import { Page, skipTake } from '../../common/dto/page-query.dto.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { FilesService } from '../files/files.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import {
  CloseConversationDto,
  ContactsQueryDto,
  ConversationDetailQueryDto,
  ListConversationsQueryDto,
  MAX_FILES,
  SendMessageDto,
  StartConversationDto,
} from './dto/messaging.dto.js';
import { DEFAULT_QUIET, quietPushAt } from './quiet-hours.js';

export const MESSAGE_PURPOSE = 'message-attachment';
export const SAFETY_NOTICE = 'The school can read messages for safety.';
export const SENDS_PER_HOUR = 30;
const PREVIEW_LENGTH = 120;

const ADMIN_READ_ONLY = 'Administrators can read conversations but not reply.';
const CLOSED_TEXT = 'This conversation was closed by the school.';

/** A member of staff who can be written to: current, with an active login that may use messages. */
const MESSAGEABLE_STAFF = {
  status: 'ACTIVE' as const,
  userId: { not: null },
  user: {
    status: 'ACTIVE' as const,
    roles: {
      some: {
        role: {
          permissions: { some: { permission: { code: 'messages.use' } } },
        },
      },
    },
  },
} satisfies Prisma.StaffWhereInput;

const CONV_INCLUDE = {
  student: {
    select: {
      id: true,
      firstName: true,
      surname: true,
      userId: true,
      photoFileId: true,
      status: true,
      guardians: { select: { guardian: { select: { userId: true } } } },
    },
  },
  teacher: { select: { id: true, fullName: true } },
} satisfies Prisma.ConversationInclude;
type ConvRow = Prisma.ConversationGetPayload<{ include: typeof CONV_INCLUDE }>;

const MESSAGE_INCLUDE = {
  sender: { select: { id: true, fullName: true } },
  files: {
    include: {
      file: {
        select: {
          id: true,
          originalName: true,
          mimeType: true,
          sizeBytes: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.ConversationMessageInclude;
type MessageRow = Prisma.ConversationMessageGetPayload<{
  include: typeof MESSAGE_INCLUDE;
}>;

export type Role = 'family' | 'teacher' | 'admin';

interface Placement {
  divisionId: string;
  className: string;
  divisionName: string;
  /** True when this is the enrolment of the current academic year. */
  current: boolean;
}
interface Teaching {
  isClassTeacher: boolean;
  subjects: string[];
}
interface Ctx {
  yearId: string | null;
  place: Map<string, Placement>;
  /** "divisionId:teacherUserId" to what the teacher teaches there this year (current teachers only). */
  teaches: Map<string, Teaching>;
}

const studentName = (s: { firstName: string; surname: string }) =>
  `${s.firstName} ${s.surname}`;

const fileView = (f: {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}) => ({
  id: f.id,
  name: f.originalName,
  mimeType: f.mimeType,
  sizeBytes: f.sizeBytes,
});

/** The start of a day in India time, as an instant. */
const istStart = (iso: string) => new Date(`${iso}T00:00:00+05:30`);

@Injectable()
export class MessagingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly files: FilesService,
  ) {}

  /** The clock, in one place so quiet hours can be tested. */
  now(): Date {
    return new Date();
  }

  private can = (auth: AuthContext, p: string) => auth.permissions.includes(p);

  private async currentYearId(schoolId: string): Promise<string | null> {
    const year = await this.prisma.academicYear.findFirst({
      where: { schoolId, isCurrent: true },
      select: { id: true },
    });
    return year?.id ?? null;
  }

  // ---------------------------------------------------------------- who is who

  /** Students this login sees as family (its own record, or a linked guardian): active and in a class this year. */
  private async familyKids(auth: AuthContext, yearId: string) {
    const rows = await this.prisma.enrollment.findMany({
      where: {
        schoolId: auth.schoolId,
        academicYearId: yearId,
        student: {
          status: 'ACTIVE',
          OR: [
            { userId: auth.userId },
            { guardians: { some: { guardian: { userId: auth.userId } } } },
          ],
        },
      },
      select: {
        divisionId: true,
        division: { select: { name: true, class: { select: { name: true } } } },
        student: {
          select: { id: true, firstName: true, surname: true },
        },
      },
    });
    return rows.map((r) => ({
      studentId: r.student.id,
      firstName: r.student.firstName,
      name: studentName(r.student),
      divisionId: r.divisionId,
      className: r.division.class.name,
      divisionName: r.division.name,
    }));
  }

  /** Divisions this person teaches this year (class teacher or subject teacher), as a current staff member. */
  private async taughtDivisions(
    schoolId: string,
    yearId: string,
    userId: string,
  ): Promise<Set<string>> {
    const where = {
      schoolId,
      academicYearId: yearId,
      staff: { userId, status: 'ACTIVE' as const },
    };
    const [a, b] = await Promise.all([
      this.prisma.classTeacher.findMany({
        where,
        select: { divisionId: true },
      }),
      this.prisma.subjectTeacher.findMany({
        where,
        select: { divisionId: true },
      }),
    ]);
    return new Set([...a, ...b].map((r) => r.divisionId));
  }

  /**
   * For these divisions, the teachers who can be written to this year: class teacher and subject teachers who
   * are current staff with an active login that may use messages. Keyed "divisionId:userId".
   */
  private async teachingIn(
    schoolId: string,
    yearId: string,
    divisionIds: string[],
    userIds?: string[],
    messageableOnly = false,
  ): Promise<Map<string, Teaching & { userId: string; name: string }>> {
    const out = new Map<string, Teaching & { userId: string; name: string }>();
    if (divisionIds.length === 0) return out;
    const staff = messageableOnly
      ? MESSAGEABLE_STAFF
      : {
          status: 'ACTIVE' as const,
          userId: { not: null },
          user: { status: 'ACTIVE' as const },
        };
    const where = {
      schoolId,
      academicYearId: yearId,
      divisionId: { in: divisionIds },
      staff: {
        ...staff,
        ...(userIds ? { userId: { in: userIds } } : {}),
      },
    };
    const staffSelect = {
      select: { userId: true, user: { select: { fullName: true } } },
    };
    const [cts, sts] = await Promise.all([
      this.prisma.classTeacher.findMany({
        where,
        select: { divisionId: true, staff: staffSelect },
      }),
      this.prisma.subjectTeacher.findMany({
        where,
        select: {
          divisionId: true,
          subject: { select: { name: true } },
          staff: staffSelect,
        },
      }),
    ]);
    const entry = (
      divisionId: string,
      s: { userId: string | null; user: { fullName: string } | null },
    ) => {
      const key = `${divisionId}:${s.userId}`;
      let e = out.get(key);
      if (!e) {
        e = {
          userId: s.userId!,
          name: s.user?.fullName ?? '',
          isClassTeacher: false,
          subjects: [],
        };
        out.set(key, e);
      }
      return e;
    };
    for (const c of cts) entry(c.divisionId, c.staff).isClassTeacher = true;
    for (const s of sts) {
      const e = entry(s.divisionId, s.staff);
      if (!e.subjects.includes(s.subject.name)) e.subjects.push(s.subject.name);
    }
    for (const e of out.values()) e.subjects.sort((a, b) => a.localeCompare(b));
    return out;
  }

  private async loadCtx(schoolId: string, rows: ConvRow[]): Promise<Ctx> {
    const yearId = await this.currentYearId(schoolId);
    const place = new Map<string, Placement>();
    const studentIds = [...new Set(rows.map((r) => r.studentId))];
    if (studentIds.length) {
      const enrolments = await this.prisma.enrollment.findMany({
        where: { schoolId, studentId: { in: studentIds } },
        select: {
          studentId: true,
          academicYearId: true,
          startedOn: true,
          divisionId: true,
          division: {
            select: { name: true, class: { select: { name: true } } },
          },
        },
        orderBy: { startedOn: 'desc' },
      });
      for (const e of enrolments) {
        const current = e.academicYearId === yearId;
        const have = place.get(e.studentId);
        // The current year wins; otherwise the latest enrolment (the list is newest first).
        if (have && (have.current || !current)) continue;
        place.set(e.studentId, {
          divisionId: e.divisionId,
          className: e.division.class.name,
          divisionName: e.division.name,
          current,
        });
      }
    }
    const teaches = new Map<string, Teaching>();
    if (yearId) {
      const divisionIds = [
        ...new Set(
          [...place.values()].filter((p) => p.current).map((p) => p.divisionId),
        ),
      ];
      const teacherIds = [...new Set(rows.map((r) => r.teacherUserId))];
      const found = await this.teachingIn(
        schoolId,
        yearId,
        divisionIds,
        teacherIds,
      );
      for (const [k, v] of found) teaches.set(k, v);
    }
    return { yearId, place, teaches };
  }

  /** Why a conversation can no longer be written to, or null when it can. */
  private readOnlyReason(row: ConvRow, ctx: Ctx): string | null {
    if (row.status === 'CLOSED') return CLOSED_TEXT;
    if (!ctx.yearId) return 'There is no current academic year.';
    if (row.student.status !== 'ACTIVE')
      return 'This student is no longer at the school.';
    const place = ctx.place.get(row.studentId);
    if (!place?.current) return 'This student is not in a class this year.';
    if (!ctx.teaches.has(`${place.divisionId}:${row.teacherUserId}`)) {
      return "This teacher no longer teaches this student's class.";
    }
    return null;
  }

  private roleOf(auth: AuthContext, row: ConvRow): Role | null {
    if (this.can(auth, 'messages.use')) {
      if (row.teacherUserId === auth.userId) return 'teacher';
      if (
        row.student.userId === auth.userId ||
        row.student.guardians.some((g) => g.guardian.userId === auth.userId)
      ) {
        return 'family';
      }
    }
    return this.can(auth, 'messages.read_all') ? 'admin' : null;
  }

  /** Conversations this person takes part in (never the administrator's oversight). */
  private participantWhere(auth: AuthContext): Prisma.ConversationWhereInput {
    if (!this.can(auth, 'messages.use')) return { id: { in: [] } };
    return {
      schoolId: auth.schoolId,
      OR: [
        { teacherUserId: auth.userId },
        {
          student: {
            OR: [
              { userId: auth.userId },
              { guardians: { some: { guardian: { userId: auth.userId } } } },
            ],
          },
        },
      ],
    };
  }

  /** The conversation and the caller's part in it; someone with no part and no oversight gets "not found". */
  private async access(auth: AuthContext, id: string) {
    const row = await this.prisma.conversation.findFirst({
      where: { id, schoolId: auth.schoolId },
      include: CONV_INCLUDE,
    });
    if (!row) throw new NotFoundException('Conversation not found');
    const role = this.roleOf(auth, row);
    if (!role) throw new NotFoundException('Conversation not found');
    return { row, role };
  }

  // ---------------------------------------------------------------- views

  /** Unread messages per conversation for one person (messages from others after they last read). */
  private async unreadMap(
    userId: string,
    ids: string[],
  ): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.$queryRaw<
      { conversation_id: string; n: number }[]
    >(Prisma.sql`
      SELECT m.conversation_id, count(*)::int AS n
      FROM conversation_messages m
      LEFT JOIN conversation_reads r
        ON r.conversation_id = m.conversation_id AND r.user_id = ${userId}::uuid
      WHERE m.conversation_id IN (${Prisma.join(ids.map((i) => Prisma.sql`${i}::uuid`))})
        AND m.sender_user_id <> ${userId}::uuid
        AND (r.last_read_at IS NULL OR m.created_at > r.last_read_at)
      GROUP BY m.conversation_id`);
    return new Map(rows.map((r) => [r.conversation_id, Number(r.n)]));
  }

  private async lastMessages(ids: string[]) {
    if (ids.length === 0) return new Map<string, LastRow>();
    const rows = await this.prisma.$queryRaw<LastRow[]>(Prisma.sql`
      SELECT DISTINCT ON (conversation_id)
        conversation_id, sender_user_id, left(body, ${PREVIEW_LENGTH}) AS body, created_at
      FROM conversation_messages
      WHERE conversation_id IN (${Prisma.join(ids.map((i) => Prisma.sql`${i}::uuid`))})
      ORDER BY conversation_id, created_at DESC, id DESC`);
    return new Map(rows.map((r) => [r.conversation_id, r]));
  }

  private async views(
    auth: AuthContext,
    rows: ConvRow[],
    unread: Map<string, number>,
  ) {
    if (rows.length === 0) return [];
    const ctx = await this.loadCtx(auth.schoolId, rows);
    const last = await this.lastMessages(rows.map((r) => r.id));
    return rows.map((r) => {
      const role = this.roleOf(auth, r) as Role;
      const place = ctx.place.get(r.studentId);
      const teaching = place
        ? ctx.teaches.get(`${place.divisionId}:${r.teacherUserId}`)
        : undefined;
      const scopeReason = this.readOnlyReason(r, ctx);
      const readOnlyReason =
        role === 'admin'
          ? r.status === 'CLOSED'
            ? CLOSED_TEXT
            : ADMIN_READ_ONLY
          : scopeReason;
      const l = last.get(r.id);
      return {
        id: r.id,
        subject: r.subject,
        status: r.status,
        myRole: role,
        createdAt: r.createdAt,
        lastMessageAt: r.lastMessageAt,
        closedAt: r.closedAt,
        closeReason: r.closeReason,
        student: {
          id: r.student.id,
          name: studentName(r.student),
          className: place?.className ?? null,
          divisionName: place?.divisionName ?? null,
          photoFileId: r.student.photoFileId,
        },
        teacher: {
          userId: r.teacher.id,
          name: r.teacher.fullName,
          subjects: teaching?.subjects ?? [],
          isClassTeacher: teaching?.isClassTeacher ?? false,
        },
        lastMessage: l
          ? {
              bodyPreview: l.body.replace(/\s+/g, ' ').trim(),
              senderIsMe: l.sender_user_id === auth.userId,
              createdAt: l.created_at,
            }
          : null,
        unreadCount: unread.get(r.id) ?? 0,
        canReply: role !== 'admin' && readOnlyReason === null,
        readOnlyReason,
      };
    });
  }

  private messageView(auth: AuthContext, m: MessageRow, row: ConvRow) {
    return {
      id: m.id,
      body: m.body,
      createdAt: m.createdAt,
      senderIsMe: m.senderUserId === auth.userId,
      sender: {
        userId: m.sender.id,
        name: m.sender.fullName,
        side: m.senderUserId === row.teacherUserId ? 'teacher' : 'family',
      },
      files: m.files.map((f) => fileView(f.file)),
    };
  }

  // ---------------------------------------------------------------- reading

  async list(
    auth: AuthContext,
    q: ListConversationsQueryDto,
  ): Promise<Page<Awaited<ReturnType<MessagingService['views']>>[number]>> {
    const all = q.all === true;
    if (all ? !this.can(auth, 'messages.read_all') : !this.canAny(auth)) {
      throw new ForbiddenException();
    }
    const yearId = await this.currentYearId(auth.schoolId);
    const filters = this.filters(auth, q, yearId);
    const where: Prisma.ConversationWhereInput = {
      AND: [
        all ? { schoolId: auth.schoolId } : this.participantWhere(auth),
        ...filters,
      ],
    };

    if (all) {
      const [rows, total] = await Promise.all([
        this.prisma.conversation.findMany({
          where,
          include: CONV_INCLUDE,
          orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
          ...skipTake(q),
        }),
        this.prisma.conversation.count({ where }),
      ]);
      // An administrator reading everything has nothing "unread": the unread count is for people in the thread.
      return {
        items: await this.views(auth, rows, new Map()),
        total,
        page: q.page,
        pageSize: q.pageSize,
      };
    }

    // A person's own conversations are few, so the order (unread first) is decided here.
    const mine = await this.prisma.conversation.findMany({
      where,
      select: { id: true, lastMessageAt: true },
      orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
      take: 1000,
    });
    const unread = await this.unreadMap(
      auth.userId,
      mine.map((m) => m.id),
    );
    const ordered = mine
      .filter((m) => !q.unread || (unread.get(m.id) ?? 0) > 0)
      .map((m, i) => ({ id: m.id, i, u: (unread.get(m.id) ?? 0) > 0 }))
      .sort((a, b) => Number(b.u) - Number(a.u) || a.i - b.i);
    const slice = ordered.slice((q.page - 1) * q.pageSize, q.page * q.pageSize);
    const rows = await this.prisma.conversation.findMany({
      where: { id: { in: slice.map((s) => s.id) }, schoolId: auth.schoolId },
      include: CONV_INCLUDE,
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const ordRows = slice.flatMap((s) => {
      const r = byId.get(s.id);
      return r ? [r] : [];
    });
    return {
      items: await this.views(auth, ordRows, unread),
      total: ordered.length,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  private canAny(auth: AuthContext) {
    return (
      this.can(auth, 'messages.use') || this.can(auth, 'messages.read_all')
    );
  }

  private filters(
    auth: AuthContext,
    q: ListConversationsQueryDto,
    yearId: string | null,
  ): Prisma.ConversationWhereInput[] {
    const out: Prisma.ConversationWhereInput[] = [];
    if (q.teacherUserId) out.push({ teacherUserId: q.teacherUserId });
    if ((q.classId || q.divisionId) && yearId) {
      out.push({
        student: {
          enrollments: {
            some: {
              academicYearId: yearId,
              ...(q.divisionId ? { divisionId: q.divisionId } : {}),
              ...(q.classId ? { division: { classId: q.classId } } : {}),
            },
          },
        },
      });
    }
    if (q.from) out.push({ lastMessageAt: { gte: istStart(q.from) } });
    if (q.to) {
      const next = new Date(istStart(q.to).getTime() + 86_400_000);
      out.push({ lastMessageAt: { lt: next } });
    }
    for (const token of (q.q ?? '').split(/\s+/).filter(Boolean)) {
      out.push({
        OR: [
          { subject: { contains: token, mode: 'insensitive' } },
          { student: { firstName: { contains: token, mode: 'insensitive' } } },
          { student: { surname: { contains: token, mode: 'insensitive' } } },
          { teacher: { fullName: { contains: token, mode: 'insensitive' } } },
        ],
      });
    }
    void auth;
    return out;
  }

  async detail(
    auth: AuthContext,
    id: string,
    q: ConversationDetailQueryDto,
    ip?: string,
  ) {
    const { row, role } = await this.access(auth, id);
    // An administrator reading a conversation they are not part of leaves a trace, once per opening.
    if (role === 'admin' && !q.before) {
      await this.record(auth, 'messages.conversation_viewed', id, ip);
    }
    const where: Prisma.ConversationMessageWhereInput = { conversationId: id };
    if (q.before) {
      const cursor = await this.prisma.conversationMessage.findFirst({
        where: { id: q.before, conversationId: id },
        select: { id: true, createdAt: true },
      });
      if (!cursor) throw new NotFoundException('Message not found');
      where.OR = [
        { createdAt: { lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { lt: cursor.id } },
      ];
    }
    const found = await this.prisma.conversationMessage.findMany({
      where,
      include: MESSAGE_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
    });
    const hasMore = found.length > q.limit;
    const page = found.slice(0, q.limit).reverse();
    const unread =
      role === 'admin'
        ? new Map<string, number>()
        : await this.unreadMap(auth.userId, [id]);
    const [view] = await this.views(auth, [row], unread);
    return {
      ...view,
      safetyNotice: SAFETY_NOTICE,
      messages: page.map((m) => this.messageView(auth, m, row)),
      hasMore,
      nextBefore: hasMore && page.length ? page[0].id : null,
    };
  }

  async unreadCount(auth: AuthContext) {
    const mine = await this.prisma.conversation.findMany({
      where: this.participantWhere(auth),
      select: { id: true },
    });
    const map = await this.unreadMap(
      auth.userId,
      mine.map((m) => m.id),
    );
    let messages = 0;
    for (const n of map.values()) messages += n;
    return { unread: map.size, unreadMessages: messages };
  }

  async markRead(auth: AuthContext, id: string) {
    const { role } = await this.access(auth, id);
    if (role !== 'admin') {
      const lastReadAt = new Date();
      await this.prisma.conversationRead.upsert({
        where: {
          conversationId_userId: { conversationId: id, userId: auth.userId },
        },
        create: {
          schoolId: auth.schoolId,
          conversationId: id,
          userId: auth.userId,
          lastReadAt,
        },
        update: { lastReadAt },
      });
    }
    return this.unreadCount(auth);
  }

  // ---------------------------------------------------------------- contacts

  async contacts(auth: AuthContext, q: ContactsQueryDto) {
    const yearId = await this.currentYearId(auth.schoolId);
    if (!yearId) {
      return {
        kind: q.as ?? 'family',
        items: [],
        total: 0,
        page: 1,
        pageSize: q.pageSize,
      };
    }
    const taught = await this.taughtDivisions(
      auth.schoolId,
      yearId,
      auth.userId,
    );
    const kind = q.as ?? (taught.size > 0 ? 'teacher' : 'family');

    if (kind === 'family') {
      const kids = await this.familyKids(auth, yearId);
      const teaching = await this.teachingIn(
        auth.schoolId,
        yearId,
        [...new Set(kids.map((k) => k.divisionId))],
        undefined,
        true,
      );
      const items = kids.flatMap((k) =>
        [...teaching.entries()]
          .filter(([key]) => key.startsWith(`${k.divisionId}:`))
          .map(([, t]) => ({
            studentId: k.studentId,
            studentName: k.name,
            className: k.className,
            divisionName: k.divisionName,
            teacherUserId: t.userId,
            teacherName: t.name,
            subjects: t.subjects,
            isClassTeacher: t.isClassTeacher,
          })),
      );
      items.sort(
        (a, b) =>
          a.studentName.localeCompare(b.studentName) ||
          Number(b.isClassTeacher) - Number(a.isClassTeacher) ||
          a.teacherName.localeCompare(b.teacherName),
      );
      return {
        kind,
        items,
        total: items.length,
        page: 1,
        pageSize: items.length,
      };
    }

    const divisionIds = q.divisionId
      ? taught.has(q.divisionId)
        ? [q.divisionId]
        : []
      : [...taught];
    const where: Prisma.EnrollmentWhereInput = {
      schoolId: auth.schoolId,
      academicYearId: yearId,
      divisionId: { in: divisionIds },
      student: {
        status: 'ACTIVE',
        AND: (q.q ?? '')
          .split(/\s+/)
          .filter(Boolean)
          .map((t) => ({
            OR: [
              { firstName: { contains: t, mode: 'insensitive' as const } },
              { surname: { contains: t, mode: 'insensitive' as const } },
              { admissionNo: { contains: t, mode: 'insensitive' as const } },
            ],
          })),
      },
    };
    const [rows, total] = await Promise.all([
      this.prisma.enrollment.findMany({
        where,
        select: {
          divisionId: true,
          division: {
            select: { name: true, class: { select: { name: true } } },
          },
          student: {
            select: {
              id: true,
              firstName: true,
              surname: true,
              admissionNo: true,
              photoFileId: true,
            },
          },
        },
        orderBy: [
          { division: { class: { sortOrder: 'asc' } } },
          { division: { name: 'asc' } },
          { student: { surname: 'asc' } },
          { student: { firstName: 'asc' } },
        ],
        ...skipTake(q),
      }),
      this.prisma.enrollment.count({ where }),
    ]);
    return {
      kind,
      items: rows.map((r) => ({
        studentId: r.student.id,
        name: studentName(r.student),
        admissionNo: r.student.admissionNo,
        className: r.division.class.name,
        divisionId: r.divisionId,
        divisionName: r.division.name,
        photoFileId: r.student.photoFileId,
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  // ---------------------------------------------------------------- writing

  async start(auth: AuthContext, dto: StartConversationDto, ip?: string) {
    if (!this.can(auth, 'messages.use')) throw new ForbiddenException();
    const yearId = await this.currentYearId(auth.schoolId);
    if (!yearId) {
      throw new BadRequestException(
        'There is no current academic year. Ask the school.',
      );
    }

    let studentId: string;
    let teacherUserId: string;
    if (dto.teacherUserId) {
      // The family side: the student's own login, or a guardian's login.
      if (dto.teacherUserId === auth.userId) {
        throw new BadRequestException('You cannot message yourself');
      }
      const kids = await this.familyKids(auth, yearId);
      if (kids.length === 0) {
        throw new ForbiddenException(
          'No student in a class this year is linked to your login',
        );
      }
      let kid = kids[0];
      if (dto.studentId) {
        const found = kids.find((k) => k.studentId === dto.studentId);
        // A student who is not yours looks like one that does not exist.
        if (!found) throw new NotFoundException('Student not found');
        kid = found;
      } else if (kids.length > 1) {
        throw new BadRequestException(
          'Choose which student the message is about (studentId)',
        );
      }
      const teaching = await this.teachingIn(
        auth.schoolId,
        yearId,
        [kid.divisionId],
        [dto.teacherUserId],
        true,
      );
      if (!teaching.has(`${kid.divisionId}:${dto.teacherUserId}`)) {
        throw new ForbiddenException(
          "You can message only your child's class teacher and subject teachers",
        );
      }
      studentId = kid.studentId;
      teacherUserId = dto.teacherUserId;
    } else {
      // The teacher side.
      if (!dto.studentId) {
        throw new BadRequestException(
          'Choose a student (studentId), or a teacher (teacherUserId)',
        );
      }
      const enrolment = await this.prisma.enrollment.findFirst({
        where: {
          schoolId: auth.schoolId,
          academicYearId: yearId,
          studentId: dto.studentId,
          student: { status: 'ACTIVE' },
        },
        select: { divisionId: true },
      });
      if (!enrolment) throw new NotFoundException('Student not found');
      const taught = await this.taughtDivisions(
        auth.schoolId,
        yearId,
        auth.userId,
      );
      if (!taught.has(enrolment.divisionId)) {
        throw new ForbiddenException(
          'You can message only students in the divisions you teach',
        );
      }
      studentId = dto.studentId;
      teacherUserId = auth.userId;
    }

    await this.checkRate(auth);
    const fileIds = await this.checkFiles(auth, dto.fileIds);
    const clock = this.now();

    const created = await this.prisma.$transaction(async (tx) => {
      const conv = await tx.conversation.create({
        data: {
          schoolId: auth.schoolId,
          studentId,
          teacherUserId,
          subject: dto.subject,
          startedByUserId: auth.userId,
        },
        select: { id: true },
      });
      const message = await tx.conversationMessage.create({
        data: {
          schoolId: auth.schoolId,
          conversationId: conv.id,
          senderUserId: auth.userId,
          body: dto.body,
          files: {
            create: fileIds.map((fileId) => ({
              schoolId: auth.schoolId,
              fileId,
            })),
          },
        },
        include: MESSAGE_INCLUDE,
      });
      await tx.conversation.update({
        where: { id: conv.id },
        data: { lastMessageAt: message.createdAt },
      });
      await tx.conversationRead.create({
        data: {
          schoolId: auth.schoolId,
          conversationId: conv.id,
          userId: auth.userId,
          lastReadAt: message.createdAt,
        },
      });
      return { id: conv.id, message };
    });

    await this.record(auth, 'messages.conversation_started', created.id, ip, {
      studentId,
      teacherUserId,
      files: fileIds.length,
    });
    const row = await this.prisma.conversation.findUniqueOrThrow({
      where: { id: created.id },
      include: CONV_INCLUDE,
    });
    const deliveredQuietly = await this.tell(auth, row, clock);
    const [conversation] = await this.views(auth, [row], new Map());
    return {
      conversation,
      message: this.messageView(auth, created.message, row),
      deliveredQuietly,
    };
  }

  async send(auth: AuthContext, id: string, dto: SendMessageDto) {
    const { row, role } = await this.access(auth, id);
    if (role === 'admin') {
      throw new ForbiddenException(
        'Administrators can read conversations but cannot send messages',
      );
    }
    // The scope is checked on every send, not only at the start.
    const ctx = await this.loadCtx(auth.schoolId, [row]);
    const reason = this.readOnlyReason(row, ctx);
    if (reason) throw new ForbiddenException(reason);

    await this.checkRate(auth);
    const fileIds = await this.checkFiles(auth, dto.fileIds);
    const clock = this.now();

    const message = await this.prisma.$transaction(async (tx) => {
      const m = await tx.conversationMessage.create({
        data: {
          schoolId: auth.schoolId,
          conversationId: id,
          senderUserId: auth.userId,
          body: dto.body,
          files: {
            create: fileIds.map((fileId) => ({
              schoolId: auth.schoolId,
              fileId,
            })),
          },
        },
        include: MESSAGE_INCLUDE,
      });
      await tx.conversation.update({
        where: { id },
        data: { lastMessageAt: m.createdAt },
      });
      // Writing a reply means the sender has read everything up to it.
      await tx.conversationRead.upsert({
        where: {
          conversationId_userId: { conversationId: id, userId: auth.userId },
        },
        create: {
          schoolId: auth.schoolId,
          conversationId: id,
          userId: auth.userId,
          lastReadAt: m.createdAt,
        },
        update: { lastReadAt: m.createdAt },
      });
      return m;
    });
    const deliveredQuietly = await this.tell(auth, row, clock);
    const [conversation] = await this.views(auth, [row], new Map());
    return {
      conversation,
      message: this.messageView(auth, message, row),
      deliveredQuietly,
    };
  }

  async close(
    auth: AuthContext,
    id: string,
    dto: CloseConversationDto,
    ip?: string,
  ) {
    const { row } = await this.access(auth, id);
    if (!this.can(auth, 'messages.read_all')) throw new ForbiddenException();
    if (row.status === 'CLOSED') {
      throw new BadRequestException('This conversation is already closed');
    }
    await this.prisma.conversation.update({
      where: { id },
      data: {
        status: 'CLOSED',
        closedByUserId: auth.userId,
        closedAt: new Date(),
        closeReason: dto.reason,
      },
    });
    await this.record(auth, 'messages.conversation_closed', id, ip, {
      reason: dto.reason,
    });
    // Both sides are told, without any message text.
    await this.notifications.notify(auth.schoolId, [row.teacherUserId], {
      type: 'message.closed',
      title: `The school closed a conversation about ${row.student.firstName}`,
      link: `/app/messages/${id}`,
    });
    await this.notifications.notify(auth.schoolId, this.familyLogins(row), {
      type: 'message.closed',
      title: 'The school closed a conversation',
      link: `/portal/messages/${id}`,
    });
    const fresh = await this.prisma.conversation.findUniqueOrThrow({
      where: { id },
      include: CONV_INCLUDE,
    });
    const [conversation] = await this.views(auth, [fresh], new Map());
    return conversation;
  }

  // ---------------------------------------------------------------- files

  /** A file on a message, for the two sides of the conversation and for administrators who may read all. */
  async openFile(auth: AuthContext, id: string, fileId: string) {
    await this.access(auth, id);
    const attached = await this.prisma.conversationMessageFile.findFirst({
      where: { fileId, message: { conversationId: id } },
      select: { id: true },
    });
    if (!attached) throw new NotFoundException('File not found');
    return this.files.openScoped(auth.schoolId, fileId, MESSAGE_PURPOSE);
  }

  // ---------------------------------------------------------------- helpers

  /** At most 30 sends an hour per person. */
  private async checkRate(auth: AuthContext) {
    const since = new Date(Date.now() - 3_600_000);
    const sent = await this.prisma.conversationMessage.count({
      where: { senderUserId: auth.userId, createdAt: { gte: since } },
    });
    if (sent >= SENDS_PER_HOUR) {
      throw new HttpException(
        `You can send ${SENDS_PER_HOUR} messages an hour. Please try again later.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /** Checks that these are the caller's own, unattached message uploads. */
  private async checkFiles(auth: AuthContext, ids?: string[]) {
    const unique = [...new Set(ids ?? [])];
    if (unique.length > MAX_FILES) {
      throw new BadRequestException(
        `At most ${MAX_FILES} files can be attached`,
      );
    }
    const own = await this.files.ownUploads(
      auth.schoolId,
      auth.userId,
      MESSAGE_PURPOSE,
      unique,
    );
    if (own.size !== unique.length) {
      throw new BadRequestException('An attached file is not valid');
    }
    const taken = unique.length
      ? await this.prisma.conversationMessageFile.count({
          where: { fileId: { in: unique } },
        })
      : 0;
    if (taken > 0) {
      throw new BadRequestException('An attached file is already in use');
    }
    return unique;
  }

  private familyLogins(row: ConvRow): string[] {
    return [
      row.student.userId,
      ...row.student.guardians.map((g) => g.guardian.userId),
    ].filter((u): u is string => !!u);
  }

  /**
   * Tells the other side. The title is generic: a notification never carries the message text.
   * Returns true when the push was held back for quiet hours (a family message reaching a teacher at night).
   */
  private async tell(
    auth: AuthContext,
    row: ConvRow,
    clock: Date,
  ): Promise<boolean> {
    if (auth.userId === row.teacherUserId) {
      await this.notifications.notify(
        auth.schoolId,
        this.familyLogins(row).filter((u) => u !== auth.userId),
        {
          type: 'message.received',
          title: `New message from ${row.teacher.fullName}`,
          link: `/portal/messages/${row.id}`,
        },
      );
      return false;
    }
    const school = await this.prisma.school.findUniqueOrThrow({
      where: { id: auth.schoolId },
      select: {
        messageQuietStart: true,
        messageQuietEnd: true,
        messageQuietSundays: true,
      },
    });
    const pushAt = quietPushAt(clock, {
      start: school.messageQuietStart ?? DEFAULT_QUIET.start,
      end: school.messageQuietEnd ?? DEFAULT_QUIET.end,
      sundays: school.messageQuietSundays,
    });
    await this.notifications.notify(auth.schoolId, [row.teacherUserId], {
      type: 'message.received',
      title: `New message about ${row.student.firstName}`,
      link: `/app/messages/${row.id}`,
      ...(pushAt ? { pushAt } : {}),
    });
    return pushAt !== null;
  }

  private record(
    auth: AuthContext,
    action: string,
    entityId: string,
    ip?: string,
    metadata?: Prisma.InputJsonObject,
  ) {
    return this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action,
      entityType: 'conversation',
      entityId,
      metadata,
      ip,
    });
  }
}

interface LastRow {
  conversation_id: string;
  sender_user_id: string;
  body: string;
  created_at: Date;
}
