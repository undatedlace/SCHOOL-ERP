import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard.js';

function context(permissions: string[] | undefined): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class Dummy {},
    switchToHttp: () => ({
      getRequest: () => ({ auth: permissions ? { permissions } : undefined }),
    }),
  } as unknown as ExecutionContext;
}

function guardRequiring(required: string[] | undefined) {
  const reflector = {
    getAllAndOverride: () => required,
  } as unknown as Reflector;
  return new PermissionsGuard(reflector);
}

describe('PermissionsGuard', () => {
  it('allows routes that declare no permissions', () => {
    expect(guardRequiring(undefined).canActivate(context(['x']))).toBe(true);
    expect(guardRequiring([]).canActivate(context([]))).toBe(true);
  });

  it('allows a user who holds every required permission', () => {
    const guard = guardRequiring(['fees.read', 'fees.payment.create']);
    expect(
      guard.canActivate(context(['fees.read', 'fees.payment.create', 'other'])),
    ).toBe(true);
  });

  it('forbids a user missing any required permission', () => {
    const guard = guardRequiring(['fees.read', 'fees.payment.create']);
    expect(() => guard.canActivate(context(['fees.read']))).toThrow(
      ForbiddenException,
    );
  });

  it('forbids when there is no authenticated user at all', () => {
    expect(() =>
      guardRequiring(['fees.read']).canActivate(context(undefined)),
    ).toThrow(ForbiddenException);
  });
});
