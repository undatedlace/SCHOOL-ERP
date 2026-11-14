import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/database/prisma.service.js';
import { MessagingService } from '../src/modules/messaging/messaging.service.js';
import { NotificationsService } from '../src/modules/notifications/notifications.service.js';
import {
  Agent,
  adminAgent,
  createSettledUser,
  createTestApp,
  loginAndSettle,
  unique,
} from './helpers.js';

const mobile = () => `9${Math.floor(100000000 + Math.random() * 899999999)}`;

// A real 1x1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWM4UaEBAAN0AWme5/1hAAAAAElFTkSuQmCC',
  'base64',
);

/** India time is UTC+5:30. 2026-11-16 is a Monday and 2026-11-15 a Sunday. */
const ist = (iso: string) => new Date(`${iso}+05:30`);

interface Person {
  agent: Agent;
  userId: string;
  name: string;
}
interface Kid {
  id: string;
  name: string;
  first: string;
  parent: Agent;
  student?: Agent;
}

describe('messaging (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let svc: MessagingService;
  let notifications: NotificationsService;
  let superAdmin: Agent;
  let schoolAdmin: Agent;
  let office: Agent;
  let teacherCT: Person; // class teacher of A, also teaches nothing else
  let teacherSub: Person; // maths teacher of A
  let teacherB: Person; // class teacher of B
  let teacherNone: Person;
  let kidA1: Kid; // student login and a parent login
  let kidA2: Kid; // student login
  let kidB: Kid;
  let divA: string;
  let divB: string;
  let classA: string;
  let classB: string;
  let maths: string;
  let mathsName: string;

  const uid = async (who: Agent) =>
    (await who.get('/api/auth/me').expect(200)).body as {
      id: string;
      fullName: string;
    };

  async function teacher(
    name: string,
    divisionId?: string,
    subjectId?: string,
  ): Promise<Person & { assignmentId?: string }> {
    const email = `${unique('t')}@test.local`;
    const created = (
      await superAdmin
        .post('/api/staff')
        .send({
          firstName: name,
          surname: unique('Rao'),
          gender: 'FEMALE',
          designation: 'Teacher',
          email,
          account: { roleCodes: ['TEACHER'] },
        })
        .expect(201)
    ).body;
    let assignmentId: string | undefined;
    if (divisionId) {
      assignmentId = (
        await superAdmin
          .post('/api/teaching-assignments')
          .send({ staffId: created.id, divisionId, subjectId })
          .expect(201)
      ).body.id;
    }
    const agent = await loginAndSettle(
      app,
      email,
      created.temporaryPassword,
      'Teacher-Pass-123',
    );
    const me = await uid(agent);
    return { agent, userId: me.id, name: me.fullName, assignmentId };
  }

  async function admit(
    divisionId: string,
    classId: string,
    studentLogin: boolean,
  ): Promise<Kid> {
    const surname = unique('Msg');
    const a = (
      await office
        .post('/api/admissions/applications')
        .send({
          answers: {
            classApplied: classId,
            surname,
            firstName: 'Noor',
            gender: 'FEMALE',
            dateOfBirth: '2021-06-15',
            undertakingReceived: true,
          },
        })
        .expect(201)
    ).body;
    await office
      .post(`/api/admissions/applications/${a.id}/decision`)
      .send({ decision: 'GRANTED' })
      .expect(200);
    const m = mobile();
    const res = await office
      .post(`/api/admissions/applications/${a.id}/admit`)
      .send({
        divisionId,
        guardians: [
          { fullName: 'Imran Shaikh', relationship: 'FATHER', mobile: m },
        ],
      })
      .expect(201);
    const detail = (
      await office.get(`/api/students/${res.body.studentId}`).expect(200)
    ).body;
    const acc = await office
      .post(`/api/guardians/${detail.guardians[0].id}/account`)
      .expect(201);
    const parent = await loginAndSettle(
      app,
      m,
      acc.body.temporaryPassword,
      'Parent-Pass-123',
    );
    let student: Agent | undefined;
    if (studentLogin) {
      const sl = await office
        .post(`/api/students/${res.body.studentId}/account`)
        .expect(201);
      student = await loginAndSettle(
        app,
        sl.body.loginId,
        sl.body.temporaryPassword,
        'Student-Pass-123',
      );
    }
    return {
      id: res.body.studentId as string,
      name: `Noor ${surname}`,
      first: 'Noor',
      parent,
      student,
    };
  }

  type Start = Record<string, unknown>;
  const startAsFamily = (who: Agent, teacherUserId: string, over: Start = {}) =>
    who.post('/api/messages').send({
      teacherUserId,
      subject: 'About homework',
      body: 'Hello, may I ask about the homework?',
      ...over,
    });
  const startAsTeacher = (who: Agent, studentId: string, over: Start = {}) =>
    who.post('/api/messages').send({
      studentId,
      subject: 'About class',
      body: 'Good morning, a quick note about class.',
      ...over,
    });
  const reply = (who: Agent, id: string, body: object) =>
    who.post(`/api/messages/${id}/messages`).send(body);
  const inbox = async (who: Agent) =>
    (await who.get('/api/notifications?pageSize=100').expect(200)).body
      .items as {
      type: string;
      title: string;
      body: string | null;
      link: string | null;
    }[];
  const upload = async (who: Agent, purpose = 'message-attachment') =>
    (
      await who
        .post('/api/files')
        .field('purpose', purpose)
        .attach('file', PNG, 'photo.png')
        .expect(201)
    ).body.id as string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    svc = app.get(MessagingService);
    notifications = app.get(NotificationsService);
    superAdmin = await adminAgent(app);
    schoolAdmin = (await createSettledUser(app, superAdmin, 'SCHOOL_ADMIN'))
      .agent;
    office = (await createSettledUser(app, superAdmin, 'OFFICE_STAFF')).agent;
    const years = (await superAdmin.get('/api/academic-years').expect(200))
      .body as { isCurrent: boolean }[];
    if (!years.some((y) => y.isCurrent)) {
      await superAdmin
        .post('/api/academic-years')
        .send({
          name: unique('AY'),
          startDate: '2026-04-01',
          endDate: '2027-03-31',
          isCurrent: true,
        })
        .expect(201);
    }
    const cls = async () =>
      (
        await superAdmin
          .post('/api/classes')
          .send({ name: unique('Std') })
          .expect(201)
      ).body.id as string;
    classA = await cls();
    classB = await cls();
    divA = (
      await superAdmin
        .post(`/api/classes/${classA}/divisions`)
        .send({ name: 'A' })
        .expect(201)
    ).body.id;
    divB = (
      await superAdmin
        .post(`/api/classes/${classB}/divisions`)
        .send({ name: 'A' })
        .expect(201)
    ).body.id;
    mathsName = unique('Maths');
    maths = (
      await superAdmin
        .post('/api/subjects')
        .send({ name: mathsName })
        .expect(201)
    ).body.id;
    const ct = await teacher('Asha', divA);
    teacherCT = ct;
    teacherSub = await teacher('Meera', divA, maths);
    teacherB = await teacher('Bina', divB);
    teacherNone = await teacher('Nina');
    kidA1 = await admit(divA, classA, true);
    kidA2 = await admit(divA, classA, true);
    kidB = await admit(divB, classB, true);
  });
  afterAll(() => app.close());
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('starting a conversation', () => {
    it('a student starts one with the class teacher; the teacher is told in a generic way and it comes first in their inbox', async () => {
      const body = 'A private worry that must not leak into notifications';
      const res = await startAsFamily(kidA1.student!, teacherCT.userId, {
        body,
      }).expect(201);
      expect(res.body.conversation).toMatchObject({
        subject: 'About homework',
        status: 'OPEN',
        myRole: 'family',
        canReply: true,
        readOnlyReason: null,
        student: { id: kidA1.id, name: kidA1.name },
        teacher: {
          userId: teacherCT.userId,
          name: teacherCT.name,
          isClassTeacher: true,
        },
        unreadCount: 0,
      });
      expect(res.body.conversation.student.className).toBeTruthy();
      expect(res.body.conversation.student.divisionName).toBe('A');
      expect(res.body.message).toMatchObject({
        body,
        senderIsMe: true,
        sender: { side: 'family' },
      });
      expect(res.body.deliveredQuietly).toBeDefined();

      const items = await inbox(teacherCT.agent);
      const note = items.find((n) =>
        n.link?.endsWith(res.body.conversation.id),
      );
      expect(note).toMatchObject({
        type: 'message.received',
        title: 'New message about Noor',
        link: `/app/messages/${res.body.conversation.id}`,
      });
      expect(JSON.stringify(items)).not.toContain('private worry');

      const list = (await teacherCT.agent.get('/api/messages').expect(200))
        .body;
      const row = list.items.find(
        (c: { id: string }) => c.id === res.body.conversation.id,
      );
      expect(row).toMatchObject({
        unreadCount: 1,
        canReply: true,
        myRole: 'teacher',
        lastMessage: { senderIsMe: false },
      });
      expect(row.lastMessage.bodyPreview).toBe(body);
      expect(list.items[0].id).toBe(row.id); // unread first

      const audit = await prisma.auditLog.findFirst({
        where: {
          action: 'messages.conversation_started',
          entityId: res.body.conversation.id,
        },
      });
      expect(audit).not.toBeNull();
      expect(JSON.stringify(audit!.metadata)).not.toContain('private worry');
    });

    it("a parent's login can start one with a subject teacher; the contacts list names the teachers", async () => {
      const contacts = (
        await kidA1.parent.get('/api/messages/contacts').expect(200)
      ).body;
      expect(contacts.kind).toBe('family');
      const ids = contacts.items.map(
        (c: { teacherUserId: string }) => c.teacherUserId,
      );
      expect(ids).toEqual(
        expect.arrayContaining([teacherCT.userId, teacherSub.userId]),
      );
      expect(ids).not.toContain(teacherB.userId);
      expect(ids).not.toContain(teacherNone.userId);
      const ct = contacts.items.find(
        (c: { teacherUserId: string }) => c.teacherUserId === teacherCT.userId,
      );
      expect(ct).toMatchObject({
        studentId: kidA1.id,
        isClassTeacher: true,
        teacherName: teacherCT.name,
      });
      const sub = contacts.items.find(
        (c: { teacherUserId: string }) => c.teacherUserId === teacherSub.userId,
      );
      expect(sub).toMatchObject({
        isClassTeacher: false,
        subjects: [mathsName],
      });

      const res = await startAsFamily(kidA1.parent, teacherSub.userId).expect(
        201,
      );
      expect(res.body.conversation.teacher.subjects).toEqual([mathsName]);
      // The student's own login sees the same conversation (same student).
      const mine = (await kidA1.student!.get('/api/messages').expect(200)).body;
      expect(
        mine.items.some(
          (c: { id: string }) => c.id === res.body.conversation.id,
        ),
      ).toBe(true);
    });

    it('is refused with a teacher of another division, a teacher with no classes, and yourself', async () => {
      await startAsFamily(kidA1.student!, teacherB.userId).expect(403);
      await startAsFamily(kidA1.student!, teacherNone.userId).expect(403);
      await startAsFamily(kidA1.student!, randomUUID()).expect(403);
      await startAsFamily(
        kidA1.student!,
        (await uid(kidA1.student!)).id,
      ).expect(400);
    });

    it("another student's id from a family login looks like a student that does not exist", async () => {
      await startAsFamily(kidA1.student!, teacherCT.userId, {
        studentId: kidA2.id,
      }).expect(404);
      await startAsFamily(kidA1.student!, teacherCT.userId, {
        studentId: kidA1.id,
      }).expect(201);
    });

    it('a teacher starts one with a student of a division they teach, and the family is told', async () => {
      const res = await startAsTeacher(teacherCT.agent, kidA2.id).expect(201);
      expect(res.body.conversation).toMatchObject({
        myRole: 'teacher',
        canReply: true,
        student: { id: kidA2.id },
      });
      expect(res.body.deliveredQuietly).toBe(false);
      const items = await inbox(kidA2.student!);
      expect(
        items.find(
          (n) => n.link === `/portal/messages/${res.body.conversation.id}`,
        ),
      ).toMatchObject({
        type: 'message.received',
        title: `New message from ${teacherCT.name}`,
      });
      // The subject teacher also teaches division A.
      await startAsTeacher(teacherSub.agent, kidA2.id).expect(201);
    });

    it('is refused for a student of another division, a made-up student, or no one at all', async () => {
      await startAsTeacher(teacherCT.agent, kidB.id).expect(403);
      await startAsTeacher(teacherNone.agent, kidA1.id).expect(403);
      await startAsTeacher(teacherCT.agent, randomUUID()).expect(404);
      await teacherCT.agent
        .post('/api/messages')
        .send({ subject: 'x', body: 'y' })
        .expect(400);
    });

    it('a teacher sees their students as contacts, with a search', async () => {
      const all = (
        await teacherCT.agent.get('/api/messages/contacts').expect(200)
      ).body;
      expect(all.kind).toBe('teacher');
      const ids = all.items.map((s: { studentId: string }) => s.studentId);
      expect(ids).toEqual(expect.arrayContaining([kidA1.id, kidA2.id]));
      expect(ids).not.toContain(kidB.id);
      const found = (
        await teacherCT.agent
          .get(
            `/api/messages/contacts?q=${encodeURIComponent(kidA2.name.split(' ')[1])}`,
          )
          .expect(200)
      ).body;
      expect(
        found.items.map((s: { studentId: string }) => s.studentId),
      ).toEqual([kidA2.id]);
    });

    it('checks the text: plain, 1 to 2,000 characters, and a short subject', async () => {
      const html = '<b>bold</b> & <script>alert(1)</script>';
      const res = await startAsFamily(kidA1.student!, teacherCT.userId, {
        body: html,
      }).expect(201);
      expect(res.body.message.body).toBe(html); // stored and returned exactly as written
      await startAsFamily(kidA1.student!, teacherCT.userId, {
        body: '   ',
      }).expect(400);
      await startAsFamily(kidA1.student!, teacherCT.userId, {
        body: 'x'.repeat(2001),
      }).expect(400);
      await startAsFamily(kidA1.student!, teacherCT.userId, {
        subject: 'x'.repeat(121),
      }).expect(400);
      await startAsFamily(kidA1.student!, teacherCT.userId, {
        body: 'x'.repeat(2000),
        subject: 'x'.repeat(120),
      }).expect(201);
    });

    it('people without the messages permission cannot take part', async () => {
      await office.get('/api/messages').expect(403);
      await office.get('/api/messages/contacts').expect(403);
      await office
        .post('/api/messages')
        .send({ studentId: kidA1.id, subject: 's', body: 'b' })
        .expect(403);
    });
  });

  describe('who can see a conversation', () => {
    let convId: string;
    beforeAll(async () => {
      convId = (
        await startAsFamily(kidA1.student!, teacherCT.userId, {
          subject: 'Seen by two',
        }).expect(201)
      ).body.conversation.id;
    });

    it('both sides can open and reply; everyone else gets "not found"', async () => {
      await kidA1.student!.get(`/api/messages/${convId}`).expect(200);
      await kidA1.parent.get(`/api/messages/${convId}`).expect(200);
      await teacherCT.agent.get(`/api/messages/${convId}`).expect(200);
      for (const who of [
        kidA2.student!,
        kidB.parent,
        teacherSub.agent,
        teacherB.agent,
        teacherNone.agent,
        office,
      ]) {
        await who.get(`/api/messages/${convId}`).expect(404);
        await reply(who, convId, { body: 'hello' }).expect(
          who === office ? 403 : 404,
        );
        await who.post(`/api/messages/${convId}/read`).expect(404);
      }
      const theirs = (await kidB.parent.get('/api/messages').expect(200)).body;
      expect(theirs.items.some((c: { id: string }) => c.id === convId)).toBe(
        false,
      );
      await reply(teacherCT.agent, convId, { body: 'Of course.' }).expect(201);
      await reply(kidA1.parent, convId, { body: 'Thank you!' }).expect(201);
    });

    it('the family and the teacher cannot use the administrator view or close', async () => {
      await kidA1.student!.get('/api/messages?all=true').expect(403);
      await teacherCT.agent.get('/api/messages?all=true').expect(403);
      await teacherCT.agent
        .post(`/api/messages/${convId}/close`)
        .send({ reason: 'I would like to' })
        .expect(403);
      await kidA1
        .student!.post(`/api/messages/${convId}/close`)
        .send({ reason: 'I would like to' })
        .expect(403);
    });

    it('pages through messages with a cursor, newest last', async () => {
      const id = (
        await startAsFamily(kidA2.student!, teacherCT.userId, {
          subject: 'Paging',
          body: 'm1',
        }).expect(201)
      ).body.conversation.id;
      for (const n of [2, 3, 4, 5]) {
        await reply(n % 2 ? kidA2.student! : teacherCT.agent, id, {
          body: `m${n}`,
        }).expect(201);
      }
      const first = (
        await kidA2.student!.get(`/api/messages/${id}?limit=2`).expect(200)
      ).body;
      expect(first.messages.map((m: { body: string }) => m.body)).toEqual([
        'm4',
        'm5',
      ]);
      expect(first.hasMore).toBe(true);
      const second = (
        await kidA2
          .student!.get(
            `/api/messages/${id}?limit=2&before=${first.nextBefore}`,
          )
          .expect(200)
      ).body;
      expect(second.messages.map((m: { body: string }) => m.body)).toEqual([
        'm2',
        'm3',
      ]);
      const third = (
        await kidA2
          .student!.get(
            `/api/messages/${id}?limit=2&before=${second.nextBefore}`,
          )
          .expect(200)
      ).body;
      expect(third.messages.map((m: { body: string }) => m.body)).toEqual([
        'm1',
      ]);
      expect(third.hasMore).toBe(false);
      expect(third.safetyNotice).toBe(
        'The school can read messages for safety.',
      );
      // A cursor from another conversation is not accepted.
      await kidA2
        .student!.get(`/api/messages/${id}?before=${randomUUID()}`)
        .expect(404);
    });
  });

  describe('unread counts', () => {
    it('count what the other side wrote, and clear when read', async () => {
      const id = (
        await startAsFamily(kidA2.student!, teacherSub.userId, {
          subject: 'Unread test',
          body: 'first',
        }).expect(201)
      ).body.conversation.id;
      await reply(kidA2.student!, id, { body: 'second' }).expect(201);

      const before = (
        await teacherSub.agent.get('/api/messages/unread-count').expect(200)
      ).body;
      expect(before.unread).toBeGreaterThanOrEqual(1);
      const row = (
        await teacherSub.agent.get('/api/messages?unread=true').expect(200)
      ).body.items.find((c: { id: string }) => c.id === id);
      expect(row.unreadCount).toBe(2);
      // The sender has no unread of their own message.
      const own = (
        await kidA2.student!.get('/api/messages').expect(200)
      ).body.items.find((c: { id: string }) => c.id === id);
      expect(own.unreadCount).toBe(0);

      const after = (
        await teacherSub.agent.post(`/api/messages/${id}/read`).expect(200)
      ).body;
      expect(after.unread).toBe(before.unread - 1);
      const cleared = (
        await teacherSub.agent.get('/api/messages?unread=true').expect(200)
      ).body;
      expect(cleared.items.some((c: { id: string }) => c.id === id)).toBe(
        false,
      );

      // A reply from the teacher is unread for the student, and the teacher's own reply clears their side.
      await reply(teacherSub.agent, id, { body: 'third' }).expect(201);
      const student = (
        await kidA2.student!.get('/api/messages').expect(200)
      ).body.items.find((c: { id: string }) => c.id === id);
      expect(student.unreadCount).toBe(1);
      expect(student.lastMessage).toMatchObject({ senderIsMe: false });
      expect(
        (await kidA2.student!.get('/api/messages/unread-count').expect(200))
          .body.unreadMessages,
      ).toBeGreaterThanOrEqual(1);
    });
  });

  describe('administrators', () => {
    let convId: string;
    beforeAll(async () => {
      convId = (
        await startAsFamily(kidA1.student!, teacherSub.userId, {
          subject: 'Admin oversight',
        }).expect(201)
      ).body.conversation.id;
    });

    it('read every conversation read only, and each opening is audited; they cannot send', async () => {
      for (const admin of [superAdmin, schoolAdmin]) {
        const list = (
          await admin.get('/api/messages?all=true&pageSize=100').expect(200)
        ).body;
        expect(list.items.some((c: { id: string }) => c.id === convId)).toBe(
          true,
        );
        const before = await prisma.auditLog.count({
          where: { action: 'messages.conversation_viewed', entityId: convId },
        });
        const detail = (await admin.get(`/api/messages/${convId}`).expect(200))
          .body;
        expect(detail).toMatchObject({
          myRole: 'admin',
          canReply: false,
          readOnlyReason:
            'Administrators can read conversations but not reply.',
        });
        expect(detail.messages.length).toBeGreaterThan(0);
        expect(
          await prisma.auditLog.count({
            where: { action: 'messages.conversation_viewed', entityId: convId },
          }),
        ).toBe(before + 1);
        await reply(admin, convId, { body: 'I will join in' }).expect(403);
      }
      const entry = await prisma.auditLog.findFirst({
        where: { action: 'messages.conversation_viewed', entityId: convId },
      });
      expect(JSON.stringify(entry!.metadata ?? {})).not.toContain('Hello');
      // Their own inbox (no all=true) holds only conversations they are part of.
      const own = (await schoolAdmin.get('/api/messages').expect(200)).body;
      expect(own.items).toEqual([]);
    });

    it('filters by class, division, teacher, date and a search', async () => {
      const q = async (qs: string) =>
        (
          (
            await superAdmin
              .get(`/api/messages?all=true&pageSize=100&${qs}`)
              .expect(200)
          ).body.items as { id: string; student: { id: string } }[]
        ).map((c) => c.id);
      expect(await q(`classId=${classA}`)).toContain(convId);
      expect(await q(`classId=${classB}`)).not.toContain(convId);
      expect(await q(`divisionId=${divA}`)).toContain(convId);
      expect(await q(`divisionId=${divB}`)).not.toContain(convId);
      expect(await q(`teacherUserId=${teacherSub.userId}`)).toContain(convId);
      expect(await q(`teacherUserId=${teacherCT.userId}`)).not.toContain(
        convId,
      );
      expect(await q(`q=${encodeURIComponent('Admin oversight')}`)).toEqual([
        convId,
      ]);
      expect(
        await q(`q=${encodeURIComponent(kidA1.name.split(' ')[1])}`),
      ).toContain(convId);
      expect(await q(`q=${encodeURIComponent(teacherSub.name)}`)).toContain(
        convId,
      );
      expect(await q(`from=2999-01-01`)).toEqual([]);
      expect(await q(`to=2000-01-01`)).toEqual([]);
      expect(await q(`from=2000-01-01&to=2999-01-01`)).toContain(convId);
    });

    it('close a conversation with a reason; it becomes read only for everyone and both sides are told', async () => {
      await superAdmin
        .post(`/api/messages/${convId}/close`)
        .send({})
        .expect(400);
      await superAdmin
        .post(`/api/messages/${convId}/close`)
        .send({ reason: 'ab' })
        .expect(400);
      const closed = (
        await schoolAdmin
          .post(`/api/messages/${convId}/close`)
          .send({ reason: 'Moved to a meeting with the parent' })
          .expect(200)
      ).body;
      expect(closed).toMatchObject({
        status: 'CLOSED',
        canReply: false,
        readOnlyReason: 'This conversation was closed by the school.',
        closeReason: 'Moved to a meeting with the parent',
      });
      await schoolAdmin
        .post(`/api/messages/${convId}/close`)
        .send({ reason: 'again' })
        .expect(400);
      await reply(kidA1.student!, convId, { body: 'still there?' }).expect(403);
      await reply(teacherSub.agent, convId, { body: 'hello' }).expect(403);
      const view = (
        await kidA1.student!.get(`/api/messages/${convId}`).expect(200)
      ).body;
      expect(view).toMatchObject({ canReply: false, status: 'CLOSED' });
      expect(
        await prisma.auditLog.count({
          where: { action: 'messages.conversation_closed', entityId: convId },
        }),
      ).toBe(1);
      expect(
        (await inbox(kidA1.student!)).some((n) => n.type === 'message.closed'),
      ).toBe(true);
      expect(
        (await inbox(teacherSub.agent)).some(
          (n) => n.type === 'message.closed',
        ),
      ).toBe(true);
    });
  });

  describe('the scope is checked on every send', () => {
    it('removing the teaching assignment makes the conversation read only', async () => {
      // A separate class teacher so the other tests keep theirs.
      const c = await superAdmin
        .post('/api/classes')
        .send({ name: unique('Std') })
        .expect(201);
      const d = (
        await superAdmin
          .post(`/api/classes/${c.body.id}/divisions`)
          .send({ name: 'A' })
          .expect(201)
      ).body.id as string;
      const t = await teacher('Rina', d);
      const kid = await admit(d, c.body.id, true);
      const id = (
        await startAsFamily(kid.student!, t.userId, {
          subject: 'Scope',
        }).expect(201)
      ).body.conversation.id;
      await reply(t.agent, id, { body: 'Hi' }).expect(201);

      await superAdmin
        .delete(`/api/teaching-assignments/${t.assignmentId}`)
        .expect(204);

      const view = (await kid.student!.get(`/api/messages/${id}`).expect(200))
        .body;
      expect(view).toMatchObject({
        canReply: false,
        readOnlyReason: "This teacher no longer teaches this student's class.",
      });
      expect(view.messages.length).toBe(2); // history stays readable
      await reply(kid.student!, id, { body: 'Hello?' }).expect(403);
      await reply(t.agent, id, { body: 'Hello?' }).expect(403);
      const row = (
        await t.agent.get('/api/messages').expect(200)
      ).body.items.find((x: { id: string }) => x.id === id);
      expect(row).toMatchObject({ canReply: false });
      await startAsFamily(kid.student!, t.userId).expect(403);
      await startAsTeacher(t.agent, kid.id).expect(403);

      // Assigned again: it works again.
      await superAdmin
        .post('/api/teaching-assignments')
        .send({
          staffId: (
            await prisma.staff.findFirstOrThrow({ where: { userId: t.userId } })
          ).id,
          divisionId: d,
        })
        .expect(201);
      await reply(t.agent, id, { body: 'Back again' }).expect(201);
    });

    it('a student who has left makes it read only', async () => {
      const c = await superAdmin
        .post('/api/classes')
        .send({ name: unique('Std') })
        .expect(201);
      const d = (
        await superAdmin
          .post(`/api/classes/${c.body.id}/divisions`)
          .send({ name: 'A' })
          .expect(201)
      ).body.id as string;
      const t = await teacher('Tara', d);
      const kid = await admit(d, c.body.id, false);
      const id = (await startAsTeacher(t.agent, kid.id).expect(201)).body
        .conversation.id;
      await prisma.student.update({
        where: { id: kid.id },
        data: { status: 'LEFT', leftOn: new Date() },
      });
      const view = (await t.agent.get(`/api/messages/${id}`).expect(200)).body;
      expect(view).toMatchObject({
        canReply: false,
        readOnlyReason: 'This student is no longer at the school.',
      });
      await reply(t.agent, id, { body: 'Hello?' }).expect(403);
    });

    it('the change of year makes an old conversation read only', async () => {
      const yearBefore = await prisma.academicYear.findFirstOrThrow({
        where: { isCurrent: true },
      });
      const id = (
        await startAsFamily(kidA2.student!, teacherCT.userId, {
          subject: 'Year change',
        }).expect(201)
      ).body.conversation.id;
      const next = await prisma.academicYear.create({
        data: {
          schoolId: yearBefore.schoolId,
          name: unique('Next'),
          startDate: new Date('2030-04-01'),
          endDate: new Date('2031-03-31'),
          isCurrent: true,
        },
      });
      await prisma.academicYear.update({
        where: { id: yearBefore.id },
        data: { isCurrent: false },
      });
      try {
        const view = (
          await kidA2.student!.get(`/api/messages/${id}`).expect(200)
        ).body;
        expect(view.canReply).toBe(false);
        await reply(teacherCT.agent, id, { body: 'x' }).expect(403);
      } finally {
        await prisma.academicYear.update({
          where: { id: yearBefore.id },
          data: { isCurrent: true },
        });
        await prisma.academicYear.delete({ where: { id: next.id } });
      }
      await reply(teacherCT.agent, id, { body: 'back' }).expect(201);
    });
  });

  describe('attachments', () => {
    it('are served only to the two sides and to administrators; the generic route refuses them', async () => {
      const fileId = await upload(kidA1.student!);
      const sent = await startAsFamily(kidA1.student!, teacherCT.userId, {
        subject: 'With a picture',
        fileIds: [fileId],
      }).expect(201);
      expect(sent.body.message.files).toEqual([
        expect.objectContaining({
          id: fileId,
          name: 'photo.png',
          mimeType: 'image/png',
        }),
      ]);
      const id = sent.body.conversation.id;
      const url = `/api/messages/${id}/files/${fileId}`;
      await kidA1.student!.get(url).expect(200);
      await kidA1.parent.get(url).expect(200);
      await teacherCT.agent.get(url).expect(200);
      await superAdmin.get(url).expect(200);
      await schoolAdmin.get(url).expect(200);
      for (const who of [
        kidA2.student!,
        kidB.parent,
        teacherSub.agent,
        teacherNone.agent,
        office,
      ]) {
        await who.get(url).expect(404);
      }
      // The file is not reachable through another conversation, or the generic file route.
      const other = (
        await startAsFamily(kidA1.student!, teacherCT.userId, {
          subject: 'Another',
        }).expect(201)
      ).body.conversation.id;
      await kidA1
        .student!.get(`/api/messages/${other}/files/${fileId}`)
        .expect(404);
      for (const who of [kidA1.student!, teacherCT.agent, superAdmin]) {
        await who.get(`/api/files/${fileId}`).expect(404);
      }
    });

    it('cannot be attached by someone else, twice, in the wrong purpose, or more than three', async () => {
      const mine = await upload(kidA1.student!);
      const theirs = await upload(teacherCT.agent);
      const wrong = await upload(kidA1.student!, 'homework-submission');
      const conv = (
        await startAsFamily(kidA1.student!, teacherCT.userId, {
          subject: 'Files',
        }).expect(201)
      ).body.conversation.id;
      await reply(kidA1.student!, conv, {
        body: 'x',
        fileIds: [theirs],
      }).expect(400);
      await reply(kidA1.student!, conv, { body: 'x', fileIds: [wrong] }).expect(
        400,
      );
      await reply(kidA1.student!, conv, {
        body: 'x',
        fileIds: [randomUUID()],
      }).expect(400);
      await reply(kidA1.student!, conv, { body: 'x', fileIds: [mine] }).expect(
        201,
      );
      await reply(kidA1.student!, conv, { body: 'x', fileIds: [mine] }).expect(
        400,
      );
      const four = await Promise.all(
        [1, 2, 3, 4].map(() => upload(kidA1.student!)),
      );
      await reply(kidA1.student!, conv, { body: 'x', fileIds: four }).expect(
        400,
      );
      const three = four.slice(0, 3);
      const ok = await reply(kidA1.student!, conv, {
        body: 'x',
        fileIds: three,
      }).expect(201);
      expect(ok.body.message.files).toHaveLength(3);
    });

    it('only people who may use messages can upload them', async () => {
      await office
        .post('/api/files')
        .field('purpose', 'message-attachment')
        .attach('file', PNG, 'x.png')
        .expect(403);
    });
  });

  describe('quiet hours', () => {
    it("hold the teacher's push, not the inbox, for a family message at night and on Sundays", async () => {
      const notify = vi.spyOn(notifications, 'notify');
      vi.spyOn(svc, 'now').mockReturnValue(ist('2026-11-16T20:30:00')); // Monday evening
      const night = await startAsFamily(kidA1.student!, teacherCT.userId, {
        subject: 'Quiet',
      }).expect(201);
      expect(night.body.deliveredQuietly).toBe(true);
      const call = notify.mock.calls.find(
        (c) =>
          c[2].type === 'message.received' && c[1].includes(teacherCT.userId),
      )!;
      expect(call[2].pushAt).toEqual(ist('2026-11-17T07:00:00'));
      // The inbox row exists at once.
      expect(
        (await inbox(teacherCT.agent)).some(
          (n) => n.link === `/app/messages/${night.body.conversation.id}`,
        ),
      ).toBe(true);

      // A reply on Sunday waits until Monday morning.
      notify.mockClear();
      vi.spyOn(svc, 'now').mockReturnValue(ist('2026-11-15T11:00:00'));
      const sunday = await reply(kidA1.student!, night.body.conversation.id, {
        body: 'Sunday question',
      }).expect(201);
      expect(sunday.body.deliveredQuietly).toBe(true);
      expect(notify.mock.calls[0][2].pushAt).toEqual(
        ist('2026-11-16T07:00:00'),
      );
    });

    it('do not apply in school hours, and never to messages to families', async () => {
      const notify = vi.spyOn(notifications, 'notify');
      vi.spyOn(svc, 'now').mockReturnValue(ist('2026-11-16T10:00:00'));
      const day = await startAsFamily(kidA1.student!, teacherCT.userId, {
        subject: 'Daytime',
      }).expect(201);
      expect(day.body.deliveredQuietly).toBe(false);
      expect(notify.mock.calls[0][2].pushAt).toBeUndefined();

      notify.mockClear();
      vi.spyOn(svc, 'now').mockReturnValue(ist('2026-11-16T22:00:00'));
      const toFamily = await reply(teacherCT.agent, day.body.conversation.id, {
        body: 'Late evening reply',
      }).expect(201);
      expect(toFamily.body.deliveredQuietly).toBe(false);
      expect(notify.mock.calls[0][2].pushAt).toBeUndefined();
    });

    it('follow the school settings, which the Super Admin can change', async () => {
      await superAdmin
        .patch('/api/school')
        .send({ messageQuietStart: '25:00' })
        .expect(400);
      await superAdmin
        .patch('/api/school')
        .send({ messageQuietEnd: '7am' })
        .expect(400);
      const saved = (
        await superAdmin
          .patch('/api/school')
          .send({
            messageQuietStart: '12:00',
            messageQuietEnd: '14:00',
            messageQuietSundays: false,
          })
          .expect(200)
      ).body;
      expect(saved).toMatchObject({
        messageQuietStart: '12:00',
        messageQuietEnd: '14:00',
        messageQuietSundays: false,
      });
      try {
        const notify = vi.spyOn(notifications, 'notify');
        vi.spyOn(svc, 'now').mockReturnValue(ist('2026-11-15T12:30:00')); // a Sunday, now not quiet all day
        const res = await startAsFamily(kidA1.student!, teacherCT.userId, {
          subject: 'Lunch',
        }).expect(201);
        expect(res.body.deliveredQuietly).toBe(true);
        expect(notify.mock.calls[0][2].pushAt).toEqual(
          ist('2026-11-15T14:00:00'),
        );
        notify.mockClear();
        vi.spyOn(svc, 'now').mockReturnValue(ist('2026-11-15T20:00:00'));
        const evening = await reply(kidA1.student!, res.body.conversation.id, {
          body: 'evening',
        }).expect(201);
        expect(evening.body.deliveredQuietly).toBe(false);
      } finally {
        await superAdmin
          .patch('/api/school')
          .send({
            messageQuietStart: '19:00',
            messageQuietEnd: '07:00',
            messageQuietSundays: true,
          })
          .expect(200);
      }
      // Others cannot change them.
      await schoolAdmin
        .patch('/api/school')
        .send({ messageQuietStart: '20:00' })
        .expect(403);
    });
  });

  describe('rate limit', () => {
    it('allows 30 sends an hour per person, then refuses', async () => {
      // A fresh student, so other tests keep their allowance.
      const kid = await admit(divA, classA, true);
      const id = (
        await startAsFamily(kid.student!, teacherCT.userId, {
          subject: 'Many',
        }).expect(201)
      ).body.conversation.id;
      for (let i = 1; i < 30; i++) {
        await reply(kid.student!, id, { body: `m${i}` }).expect(201);
      }
      const res = await reply(kid.student!, id, {
        body: 'one too many',
      }).expect(429);
      expect(res.body.message).toMatch(/30 messages an hour/);
      // The teacher has their own allowance.
      await reply(teacherCT.agent, id, { body: 'still fine' }).expect(201);
    });
  });
});
