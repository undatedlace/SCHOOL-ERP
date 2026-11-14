import { Pipe, PipeTransform } from '@angular/core';

/** "13:05" as "1:05 PM" (the API and the database keep 24-hour "HH:mm"). */
export function time12(value: string | null | undefined): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value ?? '');
  if (!m) return value ?? '';
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}

@Pipe({ name: 'time12' })
export class Time12Pipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return time12(value);
  }
}
