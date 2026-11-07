import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../core/auth.service';
import { HasPermission } from './has-permission.directive';

@Component({
  imports: [HasPermission],
  template: `<button *appHasPermission="'users.manage'">Add user</button>`,
})
class Host {}

describe('HasPermission', () => {
  function render(permissions: string[]) {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const auth = TestBed.inject(AuthService);
    auth.clear();
    auth.me.set({ id: '1', fullName: 'T', roles: [], permissions, mustChangePassword: false });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    return fixture;
  }

  it('shows the element to users who hold the permission', () => {
    const fixture = render(['users.manage']);
    expect(fixture.nativeElement.querySelector('button')?.textContent).toContain('Add user');
  });

  it('hides it from everyone else', () => {
    const fixture = render(['academics.read']);
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });

  it('reacts when the permissions change', () => {
    const fixture = render([]);
    expect(fixture.nativeElement.querySelector('button')).toBeNull();

    TestBed.inject(AuthService).me.update((m) => ({ ...m!, permissions: ['users.manage'] }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button')).not.toBeNull();
  });
});
