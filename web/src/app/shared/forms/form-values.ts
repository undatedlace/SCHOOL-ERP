import {
  AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { FormField } from '../../core/models';
import { fromIsoDate, toIsoDate } from '../dates';

/**
 * Turning a form definition into Angular controls and back into answers.
 * Kept separate from the component so it can be tested without a browser.
 *
 * Control values: text and textarea are strings, number is number or null,
 * date is a Date or null, select and radio are a string or null, checkbox is a
 * boolean, and a repeating group is a FormArray with one FormGroup per row.
 */

const notBlank: ValidatorFn = (c: AbstractControl): ValidationErrors | null =>
  typeof c.value === 'string' && c.value.trim() === '' ? { required: true } : null;

export function buildControl(field: FormField, answer: unknown): AbstractControl {
  switch (field.type) {
    case 'group': {
      const rows = Array.isArray(answer) ? answer : [];
      return new FormArray(
        rows.map((row) => buildGroup(field.fields ?? [], isRecord(row) ? row : {})),
      );
    }
    case 'checkbox':
      return new FormControl(answer === true, {
        nonNullable: true,
        validators: field.required ? [Validators.requiredTrue] : [],
      });
    case 'number':
      return new FormControl<number | null>(typeof answer === 'number' ? answer : null, {
        validators: [
          ...(field.required ? [Validators.required] : []),
          ...(field.min !== undefined ? [Validators.min(field.min)] : []),
          ...(field.max !== undefined ? [Validators.max(field.max)] : []),
        ],
      });
    case 'date':
      return new FormControl<Date | null>(typeof answer === 'string' ? fromIsoDate(answer) : null, {
        validators: field.required ? [Validators.required] : [],
      });
    case 'image':
      return new FormControl<string | null>(typeof answer === 'string' ? answer : null, {
        validators: field.required ? [Validators.required] : [],
      });
    case 'select':
    case 'radio':
      return new FormControl<string | null>(typeof answer === 'string' ? answer : null, {
        validators: field.required ? [Validators.required] : [],
      });
    default:
      return new FormControl(typeof answer === 'string' ? answer : '', {
        nonNullable: true,
        validators: [
          ...(field.required ? [notBlank] : []),
          Validators.maxLength(field.maxLength ?? (field.type === 'textarea' ? 2000 : 500)),
        ],
      });
  }
}

export function buildGroup(fields: FormField[], answers: Record<string, unknown>): FormGroup {
  const group = new FormGroup({});
  for (const field of fields) {
    // A display-only block (the age limits table) has nothing to fill in.
    if (field.type === 'ageLimits') continue;
    group.addControl(field.id, buildControl(field, answers[field.id]));
  }
  return group;
}

/** The answers to send to the server: empty values are left out. */
export function readAnswers(fields: FormField[], group: FormGroup): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    const control = group.get(field.id);
    if (!control) continue;
    const value = readValue(field, control);
    if (value !== undefined) out[field.id] = value;
  }
  return out;
}

function readValue(field: FormField, control: AbstractControl): unknown {
  const v: unknown = control.value;
  switch (field.type) {
    case 'group': {
      const rows = (control as FormArray).controls
        .map((row) => readAnswers(field.fields ?? [], row as FormGroup))
        .filter((row) => Object.keys(row).length > 0);
      return rows.length > 0 ? rows : undefined;
    }
    case 'checkbox':
      return v === true ? true : undefined;
    case 'number':
      return typeof v === 'number' ? v : undefined;
    case 'date':
      return v instanceof Date ? toIsoDate(v) : undefined;
    case 'select':
    case 'radio':
    case 'image':
      return typeof v === 'string' && v !== '' ? v : undefined;
    default: {
      const text = typeof v === 'string' ? v.trim() : '';
      return text === '' ? undefined : text;
    }
  }
}

/** A new, empty row for a repeating group. */
export const newRow = (field: FormField): FormGroup => buildGroup(field.fields ?? [], {});

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
