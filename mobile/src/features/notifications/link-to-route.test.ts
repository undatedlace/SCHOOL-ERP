import { linkToRoute, notificationsRoute } from './link-to-route';

const ID = '01a1daa9-ce8f-7287-acf4-d49c05d81923';

describe('linkToRoute (family)', () => {
  it.each([
    ['/portal/homework', '/family/homework'],
    ['/portal/results', '/family/results'],
    ['/portal/attendance', '/family/attendance'],
    ['/portal/fees', '/family/fees'],
    ['/portal/notices', '/family/notices'],
    ['/portal/calendar', '/family/calendar'],
    ['/portal/timetable', '/family/timetable'],
    ['/portal/absence', '/family/report-absence'],
    ['/portal/messages', '/family/messages'],
    ['/portal/notifications', '/family/notifications'],
    ['/portal', '/family'],
    ['/portal/', '/family'],
  ])('%s opens %s', (link, route) => {
    expect(linkToRoute(link)).toBe(route);
  });

  it('opens one message, notice or homework by id', () => {
    expect(linkToRoute(`/portal/messages/${ID}`)).toBe(`/family/messages/${ID}`);
    expect(linkToRoute(`/portal/notices/${ID}`)).toBe(`/family/notices/${ID}`);
    expect(linkToRoute(`/portal/homework/${ID}`)).toBe(`/family/homework/${ID}`);
  });

  it('ignores a query string or a fragment', () => {
    expect(linkToRoute('/portal/fees?x=1')).toBe('/family/fees');
    expect(linkToRoute(`/portal/messages/${ID}#latest`)).toBe(`/family/messages/${ID}`);
  });

  it('goes to the section when the id is not a plain id', () => {
    expect(linkToRoute('/portal/messages/a b')).toBe('/family/messages');
    expect(linkToRoute(`/portal/results/${ID}`)).toBe('/family/results');
  });

  it('falls back to the notifications list for anything unknown or unsafe', () => {
    const fallback = notificationsRoute('family');
    expect(fallback).toBe('/family/notifications');
    for (const link of [
      null,
      undefined,
      '',
      '   ',
      '/portal/unknown',
      '/app/leave',
      '/something/else',
      'https://evil.example/portal/fees',
      '//evil.example/portal/fees',
      'schoolerp://family/fees',
      '/portal/../admin',
      '/portal/messages/x/y/z',
      '/portal\\fees',
      'portal/fees',
    ]) {
      expect(linkToRoute(link)).toBe(fallback);
    }
  });
});

describe('linkToRoute (teacher)', () => {
  it('maps staff links that have a teacher screen', () => {
    expect(linkToRoute(`/app/messages/${ID}`, 'teacher')).toBe(`/teacher/messages/${ID}`);
    expect(linkToRoute('/app/homework', 'teacher')).toBe('/teacher/homework');
    expect(linkToRoute('/app/my-leave', 'teacher')).toBe('/teacher/my-leave');
    expect(linkToRoute('/app/my-timetable?weekOf=2026-11-16', 'teacher')).toBe('/teacher');
  });

  it('does not send a teacher to portal pages, or a family to staff pages', () => {
    expect(linkToRoute('/portal/fees', 'teacher')).toBe('/teacher/notifications');
    expect(linkToRoute('/app/my-leave', 'family')).toBe('/family/notifications');
  });

  it('falls back for staff pages the app does not have', () => {
    expect(linkToRoute('/app/student-leave', 'teacher')).toBe('/teacher/notifications');
    expect(linkToRoute(`/app/students/${ID}`, 'teacher')).toBe('/teacher/notifications');
  });
});
