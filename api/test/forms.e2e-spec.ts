import { INestApplication } from '@nestjs/common';
import {
  Agent,
  adminAgent,
  createSettledUser,
  createTestApp,
} from './helpers.js';

type Schema = {
  sections: { id: string; title: string; fields: Record<string, unknown>[] }[];
};

/** A field id nobody has used before, so the tests can be run again on the same database. */
const freshId = (prefix: string) =>
  `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

describe('form builder (e2e)', () => {
  let app: INestApplication;
  let admin: Agent;

  beforeAll(async () => {
    ({ app } = await createTestApp());
    admin = await adminAgent(app);
    // Leave no draft behind from an earlier run.
    await admin.delete('/api/forms/admission/draft');
  });
  afterAll(() => app.close());

  /** Starts a draft, lets the test change its schema, and saves it. */
  async function editDraft(change: (schema: Schema) => void) {
    const draft = (await admin.post('/api/forms/admission/draft').expect(200))
      .body;
    const schema = structuredClone(draft.schema) as Schema;
    change(schema);
    return admin.put('/api/forms/admission/draft').send({ schema });
  }

  it('is only for people who may manage forms', async () => {
    for (const role of ['TEACHER', 'OFFICE_STAFF', 'ACCOUNTANT']) {
      const user = await createSettledUser(app, admin, role);
      await user.agent.get('/api/forms').expect(403);
      await user.agent.post('/api/forms/admission/draft').expect(403);
      await user.agent.post('/api/forms/admission/publish').expect(403);
    }
  });

  it('lists the admission form with its published version', async () => {
    const res = await admin.get('/api/forms').expect(200);
    const admission = res.body.find(
      (f: { key: string }) => f.key === 'admission',
    );
    expect(admission).toMatchObject({
      name: 'Application for admission',
      hasDraft: false,
    });
    expect(admission.publishedVersion).toBeGreaterThanOrEqual(1);
    // Each kind of staff has an onboarding form of its own.
    expect(
      res.body.filter((f: { key: string }) => f.key.startsWith('staff-'))
        .length,
    ).toBeGreaterThanOrEqual(3);
  });

  it('returns the published form, built from the paper form', async () => {
    const res = await admin.get('/api/forms/admission').expect(200);
    expect(res.body.published.status).toBe('PUBLISHED');
    expect(res.body.requiredSystem).toContain('student.dateOfBirth');

    const ids = (res.body.published.schema as Schema).sections.flatMap((s) =>
      s.fields.map((f) => f.id),
    );
    expect(ids).toEqual(
      expect.arrayContaining([
        'surname',
        'firstName',
        'dateOfBirth',
        'siblings',
        'undertakingReceived',
      ]),
    );
  });

  it('404s on a form that does not exist', async () => {
    await admin.get('/api/forms/nonsense').expect(404);
    await admin.post('/api/forms/nonsense/draft').expect(404);
  });

  it('starting a draft copies the published form, and starting twice gives the same draft', async () => {
    const published = (await admin.get('/api/forms/admission').expect(200)).body
      .published;
    const first = (await admin.post('/api/forms/admission/draft').expect(200))
      .body;
    const second = (await admin.post('/api/forms/admission/draft').expect(200))
      .body;

    expect(first.status).toBe('DRAFT');
    expect(first.version).toBe(published.version + 1);
    expect(first.schema).toEqual(published.schema);
    expect(second.id).toBe(first.id);
    expect((await admin.get('/api/forms').expect(200)).body[0].hasDraft).toBe(
      true,
    );
  });

  it('saves a valid change to the draft without touching the published form', async () => {
    const before = (await admin.get('/api/forms/admission').expect(200)).body
      .published;
    const res = await editDraft((s) =>
      s.sections[1].fields.push({
        id: freshId('blood'),
        type: 'text',
        label: 'Blood group',
        width: 'third',
      }),
    );
    expect(res.status).toBe(200);

    const after = (await admin.get('/api/forms/admission').expect(200)).body;
    expect(after.published.schema).toEqual(before.schema);
    expect(JSON.stringify(after.draft.schema)).toContain('blood');
  });

  it('rejects a draft that is not a valid form, and says why', async () => {
    const res = await editDraft((s) => {
      s.sections[1].fields.push({
        id: 'surname',
        type: 'text',
        label: 'Duplicate',
      }); // id already used
      s.sections[1].fields.push({
        id: 'colour',
        type: 'select',
        label: 'Colour',
      }); // no options
    });
    expect(res.status).toBe(400);
    expect(res.body.problems.join(' ')).toMatch(/used twice/);
    expect(res.body.problems.join(' ')).toMatch(/at least one option/);
  });

  it('does not store unexpected properties', async () => {
    await editDraft((s) => {
      s.sections[1].fields.push({
        id: 'note',
        type: 'text',
        label: 'Note',
        danger: '<script>',
      });
    }).then((r) => expect(r.status).toBe(200));
    const draft = (await admin.get('/api/forms/admission').expect(200)).body
      .draft;
    expect(JSON.stringify(draft.schema)).not.toContain('danger');
  });

  it('rejects a body that is not a form at all', async () => {
    await admin.post('/api/forms/admission/draft').expect(200);
    await admin
      .put('/api/forms/admission/draft')
      .send({ schema: 'x' })
      .expect(400);
    await admin.put('/api/forms/admission/draft').send({}).expect(400);
    await admin
      .put('/api/forms/admission/draft')
      .send({ schema: { sections: 'x' } })
      .expect(400);
  });

  it('cannot save without a draft', async () => {
    await admin.delete('/api/forms/admission/draft');
    await admin
      .put('/api/forms/admission/draft')
      .send({ schema: { sections: [] } })
      .expect(404);
    await admin.delete('/api/forms/admission/draft').expect(404);
    await admin.post('/api/forms/admission/publish').expect(404);
  });

  it('will not publish a form that lacks a core field or makes one optional', async () => {
    await editDraft((s) => {
      s.sections[1].fields = s.sections[1].fields.filter(
        (f) => f.system !== 'student.dateOfBirth',
      );
    }).then((r) => expect(r.status).toBe(200));
    const missing = await admin
      .post('/api/forms/admission/publish')
      .expect(400);
    expect(missing.body.problems.join(' ')).toMatch(/student.dateOfBirth/);

    await editDraft((s) => {
      s.sections[1].fields.push({
        id: 'dateOfBirth',
        type: 'date',
        label: 'Date of birth',
        system: 'student.dateOfBirth',
      });
      const surname = s.sections[1].fields.find(
        (f) => f.system === 'student.surname',
      )!;
      delete surname['required'];
    }).then((r) => expect(r.status).toBe(200));
    const optional = await admin
      .post('/api/forms/admission/publish')
      .expect(400);
    expect(optional.body.problems.join(' ')).toMatch(/must stay required/);
  });

  it('publishes a draft as the next version and archives the old one', async () => {
    await admin.delete('/api/forms/admission/draft');
    const before = (await admin.get('/api/forms/admission').expect(200)).body
      .published;

    await editDraft((s) =>
      s.sections[1].fields.push({
        id: freshId('blood'),
        type: 'select',
        label: 'Blood group',
        options: [
          { value: 'A_POS', label: 'A+' },
          { value: 'O_POS', label: 'O+' },
        ],
      }),
    ).then((r) => expect(r.status).toBe(200));
    const published = (
      await admin.post('/api/forms/admission/publish').expect(200)
    ).body;

    expect(published.status).toBe('PUBLISHED');
    expect(published.version).toBe(before.version + 1);

    const now = (await admin.get('/api/forms/admission').expect(200)).body;
    expect(now.published.version).toBe(before.version + 1);
    expect(now.draft).toBeNull();

    // The new version is what the office sees.
    const office = await createSettledUser(app, admin, 'OFFICE_STAFF');
    const live = (await office.agent.get('/api/admissions/form').expect(200))
      .body;
    expect(live.version).toBe(before.version + 1);
  });

  it('records form changes in the audit log', async () => {
    const res = await admin
      .get('/api/audit-logs?action=forms.&pageSize=100')
      .expect(200);
    const actions = res.body.items.map((i: { action: string }) => i.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'forms.draft_started',
        'forms.draft_saved',
        'forms.published',
      ]),
    );
  });
});
