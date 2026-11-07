import { Directive, TemplateRef, ViewContainerRef, effect, inject, input } from '@angular/core';
import { AuthService } from '../core/auth.service';

/**
 * Shows the element only if the user holds the permission:
 * `<button *appHasPermission="'users.manage'">`.
 * This only tidies the screen. The API enforces access.
 */
@Directive({ selector: '[appHasPermission]' })
export class HasPermission {
  private readonly template = inject(TemplateRef);
  private readonly container = inject(ViewContainerRef);
  private readonly auth = inject(AuthService);

  readonly appHasPermission = input.required<string>();

  constructor() {
    effect(() => {
      this.container.clear();
      if (this.auth.has(this.appHasPermission())) this.container.createEmbeddedView(this.template);
    });
  }
}
