import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { MessageService } from '@openng/optimus-ui/api';
import { AuthService } from '../../core/auth.service';
import { StaffMember } from '../../core/models';
import { StaffForm } from './staff-form';

interface Internals {
  form: { patchValue(v: Record<string, unknown>): void; getRawValue(): Record<string, unknown> };
  save(): Promise<void>;
  error: () => string | null;
  employeeNoError: () => string | null;
}

@Component({
  imports: [StaffForm],
  template: `<app-staff-form [(visible)]="open" (saved)="saved = $event" />`,
})
class Host {
  open = true;
  saved: StaffMember | null = null;
}

function setup(permissions: string[] = ['staff.manage', 'users.manage']) {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), MessageService],
  });
  const auth = TestBed.inject(AuthService);
  auth.clear();
  auth.me.set({
    id: 'u',
    fullName: 'Admin',
    roles: ['SCHOOL_ADMIN'],
    permissions,
    mustChangePassword: false,
  });
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const form = fixture.debugElement.children[0].componentInstance as unknown as Internals;
  return {
    fixture,
    form,
    http: TestBed.inject(HttpTestingController),
    host: fixture.componentInstance,
  };
}

const fill = (over: Record<string, unknown> = {}) => ({
  firstName: ' Asha ',
  surname: 'Rao',
  designation: 'Teacher',
  mobile: '9876543210',
  ...over,
});

describe('StaffForm', () => {
  it('offers the login section only to people who may create logins', async () => {
    const admin = setup();
    await admin.fixture.whenStable();
    admin.fixture.detectChanges();
    expect(document.body.textContent).toContain('Give this person a login');

    TestBed.resetTestingModule();
    document.body.innerHTML = '';
    const office = setup(['staff.manage']);
    await office.fixture.whenStable();
    office.fixture.detectChanges();
    expect(document.body.textContent).not.toContain('Give this person a login');
  });

  it('sends the person without a login, trimming and leaving out empty values', async () => {
    const { form, http, host } = setup();
    form.form.patchValue(fill());
    const done = form.save();

    const req = http.expectOne('/api/staff');
    expect(req.request.body).toMatchObject({
      firstName: 'Asha',
      surname: 'Rao',
      designation: 'Teacher',
      mobile: '9876543210',
      gender: 'FEMALE',
    });
    expect(req.request.body).not.toHaveProperty('account');
    expect(req.request.body).not.toHaveProperty('email');
    expect(req.request.body.joinedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    req.flush({ id: 's1', fullName: 'Asha Rao' });
    await done;
    expect(host.saved).toMatchObject({ id: 's1' });
    http.verify();
  });

  it('sends the login roles when a login is wanted', async () => {
    const { form, http } = setup();
    form.form.patchValue(fill({ giveLogin: true, roleCodes: ['TEACHER'] }));
    const done = form.save();
    const req = http.expectOne('/api/staff');
    expect(req.request.body.account).toEqual({ roleCodes: ['TEACHER'] });
    req.flush({ id: 's1', fullName: 'Asha Rao', temporaryPassword: 'abc' });
    await done;
  });

  it('will not ask for a login without a role, or without a way to sign in', async () => {
    const { form, http } = setup();
    form.form.patchValue(fill({ giveLogin: true, roleCodes: [] }));
    await form.save();
    expect(form.error()).toMatch(/Choose a role/);

    form.form.patchValue(fill({ giveLogin: true, roleCodes: ['TEACHER'], mobile: '', email: '' }));
    await form.save();
    expect(form.error()).toMatch(/email address or a mobile number/);
    http.expectNone('/api/staff');
  });

  it('does not send an incomplete form', async () => {
    const { form, http } = setup();
    form.form.patchValue({ firstName: '', surname: '', designation: '' });
    await form.save();
    http.expectNone('/api/staff');
  });

  it('shows a taken employee number on that field and other errors in the dialog', async () => {
    const { form, http } = setup();
    form.form.patchValue(fill({ employeeNo: '12' }));
    let done = form.save();
    http
      .expectOne('/api/staff')
      .flush(
        { message: 'Employee number 12 is already used' },
        { status: 409, statusText: 'Conflict' },
      );
    await done;
    expect(form.employeeNoError()).toContain('Employee number 12');
    expect(form.error()).toBeNull();

    done = form.save();
    http
      .expectOne('/api/staff')
      .flush(
        { message: 'That email address or mobile number is already used by another login' },
        { status: 409, statusText: 'Conflict' },
      );
    await done;
    expect(form.error()).toContain('already used by another login');
  });

  describe('type of staff and onboarding details', () => {
    const teacherType = {
      id: 't1',
      name: 'Teacher',
      isTeaching: true,
      active: true,
      staffCount: 1,
      formKey: 'staff-t1',
    };
    const schema = {
      sections: [
        {
          id: 'pro',
          title: 'Professional details',
          fields: [
            { id: 'subjects', type: 'text', label: 'Subjects taught' },
            { id: 'idProof', type: 'document', label: 'Identity proof' },
          ],
        },
      ],
    };

    it('offers the type only to administrators who set types up', async () => {
      const plain = setup(['staff.manage', 'users.manage']);
      await plain.fixture.whenStable();
      plain.fixture.detectChanges();
      plain.http.expectNone('/api/staff-types');
      expect(document.body.textContent).not.toContain('Type of staff');
    });

    it('shows the questions for the chosen type, with a document upload, and sends the answers with the person', async () => {
      TestBed.resetTestingModule();
      document.body.innerHTML = '';
      const { fixture, form, http, host } = setup(['staff.manage', 'users.manage', 'forms.manage']);
      http.expectOne((r) => r.url === '/api/staff-types').flush([teacherType]);
      await fixture.whenStable();
      fixture.detectChanges();
      expect(document.body.textContent).toContain('Type of staff');

      (
        form as unknown as { form: { patchValue(v: Record<string, unknown>): void } }
      ).form.patchValue(fill({ staffTypeId: 't1', designation: '' }));
      http
        .expectOne('/api/staff-types/t1/form')
        .flush({ key: 'staff-t1', name: 'x', version: 1, schema });
      await fixture.whenStable();
      fixture.detectChanges();
      expect(document.body.textContent).toContain('Teacher details');
      expect(document.body.textContent).toContain('Subjects taught');
      expect(document.querySelector('app-document-upload')).not.toBeNull();
      // The designation starts as the type's name when it was empty.
      expect(form.form.getRawValue()['designation']).toBe('Teacher');

      const subjects = Array.from(
        document.querySelectorAll('input[type=text], input:not([type])'),
      ).find((i) => (i as HTMLInputElement).id.includes('subjects')) as
        HTMLInputElement | undefined;
      if (subjects) {
        subjects.value = 'Maths';
        subjects.dispatchEvent(new Event('input', { bubbles: true }));
      }
      void form.save();
      const req = http.expectOne((r) => r.method === 'POST' && r.url === '/api/staff');
      expect(req.request.body.staffTypeId).toBe('t1');
      expect(req.request.body.answers).toBeDefined();
      req.flush({ id: 's1', fullName: 'Asha Rao' });
      await fixture.whenStable();
      expect(host.saved?.id).toBe('s1');
    });
  });
});
