import { INestApplication } from '@nestjs/common';
import {
  addDays,
  todayInIndia,
} from '../src/modules/attendance/attendance-rules.js';
import {
  Agent,
  adminAgent,
  createSettledUser,
  createTestApp,
  loginAndSettle,
  newAgent,
  unique,
} from './helpers.js';

const mobile = () => `9${Math.floor(100000000 + Math.random() * 899999999)}`;

describe('search and filters (e2e)', () => {
  let app: INestApplication;
  let admin: Agent;
  let office: Agent;
  let accountant: Agent;
  let teacher: Agent;
  let parentA: Agent;
  let parentB: Agent;
  let classId: string;
  let divId: string;
  const today = todayInIndia();
  const tag =
    unique('Zq')
      .replace(/[^a-zA-Z]/g, '')
      .slice(0, 8) || 'Zqtag';

  interface Kid {
    studentId: string;
    guardianId: string;
    mobile: string;
    surname: string;
    appId: string;
  }

  async function newApplication(
    over: Record<string, unknown> = {},
    surname = unique(tag),
  ) {
    const res = await office
      .post('/api/admissions/applications')
      .send({
        answers: {
          classApplied: classId,
          surname,
          firstName: 'Noor',
          gender: 'FEMALE',
          dateOfBirth: '2021-06-15',
          undertakingReceived: true,
          ...over,
        },
      })
      .expect(201);
    return { id: res.body.id as string, surname };
  }

  async function admit(
    over: Record<string, unknown> = {},
    joinedOn?: string,
  ): Promise<Kid> {
    const a = await newApplication(over);
    await office
      .post(`/api/admissions/applications/${a.id}/decision`)
      .send({ decision: 'GRANTED' })
      .expect(200);
    const m = mobile();
    const res = await office
      .post(`/api/admissions/applications/${a.id}/admit`)
      .send({
        divisionId: divId,
        ...(joinedOn ? { joinedOn } : {}),
        guardians: [
          { fullName: 'Imran Shaikh', relationship: 'FATHER', mobile: m },
        ],
      })
      .expect(201);
    const detail = (
      await office.get(`/api/students/${res.body.studentId}`).expect(200)
    ).body;
    return {
      studentId: res.body.studentId,
      guardianId: detail.guardians[0].id,
      mobile: m,
      surname: a.surname,
      appId: a.id,
    };
  }

  async function parentLogin(k: Kid) {
    const r = await office
      .post(`/api/guardians/${k.guardianId}/account`)
      .expect(201);
    return loginAndSettle(
      app,
      k.mobile,
      r.body.temporaryPassword,
      'Parent-Pass-123',
    );
  }

  const names = (res: {
    body: { items: { fullName?: string; studentName?: string }[] };
  }) => res.body.items.map((i) => i.fullName ?? i.studentName);

  let girl: Kid;
  let boy: Kid;
  let withLogin: Kid;

  beforeAll(async () => {
    ({ app } = await createTestApp());
    admin = await adminAgent(app);
    office = (await createSettledUser(app, admin, 'OFFICE_STAFF')).agent;
    accountant = (await createSettledUser(app, admin, 'ACCOUNTANT')).agent;
    teacher = (await createSettledUser(app, admin, 'TEACHER')).agent;

    const years = (await admin.get('/api/academic-years').expect(200)).body as {
      isCurrent: boolean;
    }[];
    if (!years.some((y) => y.isCurrent)) {
      await admin
        .post('/api/academic-years')
        .send({
          name: unique('AY'),
          startDate: '2026-04-01',
          endDate: '2027-03-31',
          isCurrent: true,
        })
        .expect(201);
    }
    classId = (
      await admin
        .post('/api/classes')
        .send({ name: unique('Std') })
        .expect(201)
    ).body.id;
    divId = (
      await admin
        .post(`/api/classes/${classId}/divisions`)
        .send({ name: 'A' })
        .expect(201)
    ).body.id;

    girl = await admit({ gender: 'FEMALE' }, addDays(today, -30));
    boy = await admit(
      { gender: 'MALE', firstName: 'Arjun' },
      addDays(today, -5),
    );
    withLogin = await admit({ gender: 'MALE', firstName: 'Zayd' });
    parentA = await parentLogin(girl);
    parentB = await parentLogin(boy);
    await office
      .post(`/api/students/${withLogin.studentId}/account`)
      .expect(201);
  });
  afterAll(() => app.close());

  describe('student filters', () => {
    const list = (qs: string) =>
      office.get(`/api/students?search=${tag}&pageSize=100&${qs}`);

    it('by gender', async () => {
      const f = names(await list('gender=FEMALE').expect(200));
      const m = names(await list('gender=MALE').expect(200));
      expect(f.length).toBe(1);
      expect(m.length).toBe(2);
      await list('gender=X').expect(400);
    });

    it('by the day they joined', async () => {
      const recent = names(
        await list(`joinedFrom=${addDays(today, -10)}`).expect(200),
      );
      expect(recent.length).toBe(2); // the boy and the one admitted today
      const old = names(
        await list(`joinedTo=${addDays(today, -20)}`).expect(200),
      );
      expect(old.length).toBe(1);
      await list('joinedFrom=2026-13-45x').expect(400);
    });

    it('by whether they have a login', async () => {
      expect(names(await list('hasLogin=true').expect(200)).length).toBe(1);
      expect(names(await list('hasLogin=false').expect(200)).length).toBe(2);
    });

    it("a parent's name or phone number finds the child", async () => {
      const byPhone = await office
        .get(`/api/students?search=${girl.mobile}`)
        .expect(200);
      expect(byPhone.body.items.map((i: { id: string }) => i.id)).toContain(
        girl.studentId,
      );
      const byName = await office
        .get(`/api/students?search=Imran&pageSize=100`)
        .expect(200);
      expect(byName.body.items.length).toBeGreaterThanOrEqual(3);
    });

    it('combine with the class and the search', async () => {
      const res = await list(`classId=${classId}&gender=MALE`).expect(200);
      expect(res.body.items.length).toBe(2);
    });
  });

  describe('staff filters', () => {
    const designation = `Zoologist${tag}`;
    beforeAll(async () => {
      const make = (over: Record<string, unknown>) =>
        admin
          .post('/api/staff')
          .send({
            firstName: 'Asha',
            surname: unique(tag),
            gender: 'FEMALE',
            designation,
            email: `${unique('s')}@test.local`,
            joinedOn: addDays(today, -100),
            ...over,
          })
          .expect(201);
      await make({ account: { roleCodes: ['TEACHER'] } });
      await make({ gender: 'MALE', joinedOn: addDays(today, -3) });
    });
    const list = (qs: string) =>
      admin.get(`/api/staff?designation=${designation}&pageSize=100&${qs}`);

    it('by designation, gender, joining date, login and role', async () => {
      expect(names(await list('').expect(200)).length).toBe(2);
      expect(names(await list('gender=MALE').expect(200)).length).toBe(1);
      expect(
        names(await list(`joinedFrom=${addDays(today, -10)}`).expect(200))
          .length,
      ).toBe(1);
      expect(
        names(await list(`joinedTo=${addDays(today, -50)}`).expect(200)).length,
      ).toBe(1);
      expect(names(await list('hasLogin=true').expect(200)).length).toBe(1);
      expect(names(await list('hasLogin=false').expect(200)).length).toBe(1);
      expect(names(await list('role=TEACHER').expect(200)).length).toBe(1);
      expect(names(await list('role=ACCOUNTANT').expect(200)).length).toBe(0);
      await list('gender=Q').expect(400);
    });
  });

  describe('application filters', () => {
    it('by the day received and whether the child was admitted', async () => {
      const open = await newApplication({}, unique(tag));
      const q = (qs: string) =>
        office.get(
          `/api/admissions/applications?search=${tag}&pageSize=100&${qs}`,
        );
      const admitted = names(await q('admitted=true').expect(200));
      const waiting = names(await q('admitted=false').expect(200));
      expect(admitted.length).toBeGreaterThanOrEqual(3);
      expect(waiting.some((n) => n?.includes(open.surname))).toBe(true);
      expect(waiting.some((n) => n?.includes(girl.surname))).toBe(false);
      expect(
        names(await q(`receivedFrom=${addDays(today, 1)}`).expect(200)).length,
      ).toBe(0);
      expect(
        names(await q(`receivedTo=${addDays(today, 1)}`).expect(200)).length,
      ).toBeGreaterThanOrEqual(4);
      await q('receivedFrom=yesterday').expect(400);
    });
  });

  describe('global search', () => {
    const find = (who: Agent, q: string, extra = '') =>
      who.get(`/api/search?q=${encodeURIComponent(q)}${extra}`).expect(200);
    const group = (
      res: {
        body: {
          groups: { type: string; hits: { id: string; path: string }[] }[];
        };
      },
      type: string,
    ) => res.body.groups.find((g) => g.type === type);

    it('finds a student, an application and a person by a few letters, with where to open them', async () => {
      const res = await find(office, girl.surname);
      const s = group(res, 'students')!;
      expect(s.hits.map((h) => h.id)).toContain(girl.studentId);
      expect(s.hits.find((h) => h.id === girl.studentId)!.path).toBe(
        `/app/students/${girl.studentId}`,
      );
      expect(group(res, 'applications')!.hits.map((h) => h.id)).toContain(
        girl.appId,
      );
      const staff = await find(admin, `Zoologist${tag}`);
      expect(group(staff, 'staff')!.hits.length).toBe(2);
    });

    it("finds a child by the parent's phone number", async () => {
      const res = await find(office, girl.mobile);
      expect(group(res, 'students')!.hits.map((h) => h.id)).toContain(
        girl.studentId,
      );
    });

    it('needs two letters and returns nothing otherwise', async () => {
      expect((await find(office, 'z')).body.groups).toEqual([]);
      expect((await find(office, '  ')).body.groups).toEqual([]);
    });

    it('limits each group and says when there is more', async () => {
      const res = await find(office, tag, '&limit=2');
      const s = group(res, 'students')!;
      expect(s.hits.length).toBe(2);
      expect((s as unknown as { more: boolean }).more).toBe(true);
      await office.get('/api/search?q=abc&limit=99').expect(400);
    });

    it('shows each role only what it may see', async () => {
      // The accountant reads students and applications but not staff.
      const acc = await find(accountant, tag);
      expect(group(acc, 'students')).toBeDefined();
      expect(
        group(await find(accountant, `Zoologist${tag}`), 'staff'),
      ).toBeUndefined();
      // A parent finds only their own child, never another family's.
      const mine = await find(parentA, girl.surname);
      expect(group(mine, 'students')!.hits.map((h) => h.id)).toEqual([
        girl.studentId,
      ]);
      const other = await find(parentA, boy.surname);
      expect(group(other, 'students')).toBeUndefined();
      expect(group(mine, 'applications')).toBeUndefined();
      expect(group(mine, 'staff')).toBeUndefined();
      expect(group(await find(parentB, boy.surname), 'students')).toBeDefined();
    });

    it('a teacher with no classes finds no students and no applications', async () => {
      const res = await find(teacher, tag);
      expect(group(res, 'students')).toBeUndefined();
      expect(group(res, 'applications')).toBeUndefined();
    });

    it('needs a signed-in person', async () => {
      await newAgent(app).get('/api/search?q=abc').expect(401);
    });
  });
});
