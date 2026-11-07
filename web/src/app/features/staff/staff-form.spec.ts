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
});
