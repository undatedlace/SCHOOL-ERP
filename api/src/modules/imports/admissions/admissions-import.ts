import { BadRequestException, Injectable } from '@nestjs/common';
import type ExcelJS from 'exceljs';
import type { AuthContext } from '../../../common/auth-context.js';
import { checkEligibility } from '../../../common/age.js';
import { todayIso } from '../../../common/dates.js';
import { PrismaService } from '../../../database/prisma.service.js';
import type { ApplicationStatus } from '../../../generated/prisma/enums.js';
import {
  AdmissionsService,
  ImportedApplication,
} from '../../admissions/admissions.service.js';
import {
  cleanMobile,
  suggestGuardians,
} from '../../admissions/guardian-suggestions.js';
import {
  DISPLAY_ONLY_TYPES,
  FormField,
  FormSchema,
  GENDER_VALUES,
  systemValue,
  validateAnswers,
} from '../../forms/form-schema.js';
import type { GuardianInputDto } from '../../students/dto/students.dto.js';
import {
  Choice,
  Parsed,
  Plain,
  asText,
  isBlank,
  parseChoice,
  parseDate,
  parseMobile,
  parseNumber,
  parseText,
  parseYesNo,
} from '../cells.js';
import {
  CheckResult,
  CheckedRow,
  ImportHandler,
  Template,
  messageOf,
} from '../import-types.js';
import {
  Column,
  Lists,
  addHowTo,
  addTable,
  newWorkbook,
  readTables,
  writeAbout,
} from '../workbook.js';

const SHEET = 'Applications';
/** Repeating questions (siblings) get this many sets of columns. */
const GROUP_ROWS = 3;

const STATUS_CHOICES: Choice[] = [
  { value: 'RECEIVED', label: 'Received' },
  { value: 'UNDER_REVIEW', label: 'Under review' },
  { value: 'GRANTED', label: 'Granted' },
  { value: 'REFUSED', label: 'Refused' },
  { value: 'WITHDRAWN', label: 'Withdrawn' },
];
const DECIDED = new Set(['GRANTED', 'REFUSED', 'WITHDRAWN']);
const PRIMARY_CHOICES: Choice[] = [
  { value: 'FATHER', label: 'Father' },
  { value: 'MOTHER', label: 'Mother' },
  { value: 'GUARDIAN', label: 'Guardian' },
];
const YES_NO = ['Yes', 'No'];

interface Year {
  id: string;
  name: string;
  start: string;
  end: string;
  ageCutoff: string | null;
}
interface Klass {
  id: string;
  name: string;
  sortOrder: number;
  minAgeYears: number | null;
  admissionsOpen: boolean;
}
interface Div {
  id: string;
  label: string;
  classId: string;
}

interface Setup {
  form: { id: string; version: number; schema: FormSchema };
  years: Year[];
  classes: Klass[];
  divisions: Div[];
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const show = (isoDate: string) =>
  `${isoDate.slice(8, 10)}/${isoDate.slice(5, 7)}/${isoDate.slice(0, 4)}`;

/** Answerable questions of the form, in form order, with the section they sit in. */
function questions(schema: FormSchema) {
  return schema.sections.flatMap((s) =>
    s.fields
      .filter((f) => !DISPLAY_ONLY_TYPES.includes(f.type))
      .filter((f) => f.type !== 'image' && f.type !== 'document')
      .map((f) => ({ section: s.title, field: f })),
  );
}

const yearKey = (id: string) => `y:${id}`;

/**
 * Admission applications from Excel: new paper forms, and the last few years' forms, including
 * children who were admitted and have studied here since. The template is made from the
 * school's published admission form, so it changes when the form does.
 */
@Injectable()
export class AdmissionsImport implements ImportHandler {
  readonly kind = 'ADMISSIONS' as const;
  /** Admitting a child makes a student, so both are needed (the same pair as "Admit"). */
  readonly permissions = ['admissions.manage', 'students.manage'];

  constructor(
    private readonly prisma: PrismaService,
    private readonly admissions: AdmissionsService,
  ) {}

  private async setup(schoolId: string): Promise<Setup> {
    const [form, years, classes, divisions] = await Promise.all([
      this.admissions.getForm(schoolId),
      this.prisma.academicYear.findMany({
        where: { schoolId },
        orderBy: { startDate: 'asc' },
      }),
      this.prisma.schoolClass.findMany({
        where: { schoolId },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.division.findMany({
        where: { schoolId },
        include: { class: { select: { name: true, sortOrder: true } } },
      }),
    ]);
    if (years.length === 0)
      throw new BadRequestException(
        'Set up the academic years in Academic setup first',
      );
    return {
      form,
      years: years.map((y) => ({
        id: y.id,
        name: y.name,
        start: iso(y.startDate),
        end: iso(y.endDate),
        ageCutoff: y.ageCutoffDate ? iso(y.ageCutoffDate) : null,
      })),
      classes: classes.map((c) => ({
        id: c.id,
        name: c.name,
        sortOrder: c.sortOrder,
        minAgeYears: c.minAgeYears,
        admissionsOpen: c.admissionsOpen,
      })),
      divisions: divisions
        .sort(
          (a, b) =>
            a.class.sortOrder - b.class.sortOrder ||
            a.name.localeCompare(b.name),
        )
        .map((d) => ({
          id: d.id,
          label: `${d.class.name} - ${d.name}`,
          classId: d.classId,
        })),
    };
  }

  // ---------------------------------------------------------------------------
  // Template
  // ---------------------------------------------------------------------------

  private columns(setup: Setup, lists: Lists): Column[] {
    const classChoices = setup.classes.map((c) => c.name);
    const statusList = lists.add(
      'Status',
      STATUS_CHOICES.map((c) => c.label),
    );
    const yesNo = lists.add('Yes or no', YES_NO);
    const divisionList = lists.add(
      'Class and division',
      setup.divisions.map((d) => d.label),
    );

    const cols: Column[] = [
      {
        key: 'formNo',
        header: 'Form no',
        format: 'text',
        note: 'The number printed on the paper form. Leave blank and the app gives the next number.',
      },
      {
        key: 'receivedOn',
        header: 'Date received',
        required: true,
        format: 'date',
        note: 'The date on the form (DD/MM/YYYY).',
      },
      {
        key: 'year',
        header: 'Academic year',
        required: true,
        list: lists.add(
          'Academic year',
          setup.years.map((y) => y.name),
        ),
        note: 'The year the child applied to join.',
      },
      {
        key: 'status',
        header: 'Status',
        list: statusList,
        note: 'Blank means Received.',
      },
      {
        key: 'decidedOn',
        header: 'Decision date',
        format: 'date',
        note: 'When it was granted, refused or withdrawn. Blank means the date received.',
      },
      {
        key: 'decisionNote',
        header: 'Decision note',
        width: 30,
        note: 'Required when refused: the reason.',
      },
    ];

    // The form's own questions, headed as on the form.
    const qs = questions(setup.form.schema);
    const labelCount = new Map<string, number>();
    for (const q of qs)
      labelCount.set(q.field.label, (labelCount.get(q.field.label) ?? 0) + 1);
    const heading = (q: { section: string; field: FormField }) =>
      (labelCount.get(q.field.label) ?? 0) > 1
        ? `${q.section} – ${q.field.label}`
        : q.field.label;

    const fieldColumn = (
      f: FormField,
      key: string,
      header: string,
      required: boolean,
    ): Column => {
      const base: Column = {
        key,
        header,
        required,
        ...(f.helpText ? { note: f.helpText } : {}),
      };
      switch (f.type) {
        case 'date':
          return { ...base, format: 'date' };
        case 'checkbox':
          return { ...base, list: yesNo };
        case 'select':
        case 'radio':
          return {
            ...base,
            list: lists.add(
              `${key} choices`,
              f.optionsFrom === 'classes'
                ? classChoices
                : (f.options ?? []).map((o) => o.label),
            ),
          };
        case 'number':
          return base;
        default:
          return {
            ...base,
            format: 'text',
            width: f.type === 'textarea' ? 40 : undefined,
          };
      }
    };

    for (const q of qs) {
      const f = q.field;
      if (f.type === 'group') {
        const rows = Math.min(f.maxItems ?? GROUP_ROWS, GROUP_ROWS);
        for (let n = 1; n <= rows; n++) {
          for (const c of f.fields ?? []) {
            cols.push(
              fieldColumn(
                c,
                `g:${f.id}:${n}:${c.id}`,
                `${f.label} ${n} – ${c.label}`,
                false,
              ),
            );
          }
        }
        continue;
      }
      cols.push(fieldColumn(f, `f:${f.id}`, heading(q), !!f.required));
    }

    cols.push(
      {
        key: 'enrolled',
        header: 'Admitted as a student?',
        list: yesNo,
        note: 'Yes when the child joined the school. Only for granted applications. Blank means yes if a class is filled in below.',
      },
      {
        key: 'admissionNo',
        header: 'Admission no / student ID',
        format: 'text',
        note: "Leave blank and the app gives the next ID by the school's convention.",
      },
      {
        key: 'joinedOn',
        header: 'Joined on',
        format: 'date',
        note: 'The first day at school. Blank means the start of the academic year (or the decision date, if later).',
      },
      {
        key: 'fatherMobile',
        header: "Father's mobile",
        format: 'text',
        note: "Blank means the family mobile from the form. The father's name comes from the form.",
      },
      {
        key: 'motherMobile',
        header: "Mother's mobile",
        format: 'text',
        note: 'Blank means the family mobile from the form.',
      },
      {
        key: 'guardianMobile',
        header: "Guardian's mobile",
        format: 'text',
      },
      {
        key: 'primary',
        header: 'Primary contact',
        list: lists.add(
          'Primary contact',
          PRIMARY_CHOICES.map((c) => c.label),
        ),
        note: 'Who the school calls first. Blank means the father (or the first one given).',
      },
    );
    for (const y of setup.years) {
      cols.push({
        key: yearKey(y.id),
        header: `Class & division in ${y.name}`,
        list: divisionList,
        width: 18,
        note: `Only for admitted children: the class and division in ${y.name}. Leave blank for years before the child joined; a blank year after joining means the child had left by then.`,
      });
    }
    cols.push({
      key: 'leftOn',
      header: 'Left school on',
      format: 'date',
      note: 'Only when the child has left the school.',
    });
    return cols;
  }

  async template(auth: AuthContext): Promise<Template> {
    const setup = await this.setup(auth.schoolId);
    const wb = newWorkbook();
    addHowTo(wb, 'Admission applications: how to fill this file', [
      'One row per application form. Headings marked * must be filled in.',
      'The columns follow the admission form published in the app (version ' +
        setup.form.version +
        '). If the form is changed and published again, download a new template.',
      'Dates: write them as DD/MM/YYYY (for example 05/06/2024), or use Excel dates.',
      'Choices (class, gender, status, yes/no): pick from the drop-down in the cell.',
      '',
      'Old applications:',
      'Fill in "Date received" and "Academic year" as on the paper form. For a decided form, set "Status" and "Decision date".',
      '',
      'Children who were admitted:',
      'Set Status to Granted and fill in "Class & division" for the year they joined. Then fill in the class and division for every later year they studied here (the class they were in that year), up to this year.',
      'If a child left, fill in "Left school on" and leave the years after that blank.',
      "Guardians are made from the father's, mother's and guardian's names on the form. A parent with two children is recognised by the same name and mobile number, so brothers and sisters share one parent record.",
      '',
      'Not in this file: photos (add them later on the application or student page) and fees (use the fees template).',
      '',
      'When you upload the file, nothing is saved at first: the app checks every row and shows what it found. Rows with errors are left out; you can download them, fix them and upload them again.',
    ]);
    const lists = new Lists(wb);
    addTable(wb, SHEET, this.columns(setup, lists), [], { freezeColumns: 1 });
    // Put the instructions first and the data sheet second.
    writeAbout(wb, {
      kind: this.kind,
      schoolId: auth.schoolId,
      params: { formId: setup.form.id, formVersion: setup.form.version },
    });
    return { fileName: 'admission-applications-template.xlsx', workbook: wb };
  }

  // ---------------------------------------------------------------------------
  // Check
  // ---------------------------------------------------------------------------

  async check(
    auth: AuthContext,
    wb: ExcelJS.Workbook,
    params: Record<string, unknown>,
  ): Promise<CheckResult> {
    const setup = await this.setup(auth.schoolId);
    const table = readTables(wb).find((t) => t.sheet === SHEET);
    if (!table)
      throw new BadRequestException(`The "${SHEET}" sheet is missing`);
    const warnings: string[] = [];
    if (params.formId !== setup.form.id) {
      warnings.push(
        'The admission form has been published again since this template was made: questions added since are blank, and questions removed are ignored.',
      );
    }

    // What is already in the school, to catch numbers used twice and children entered twice.
    const [apps, students] = await Promise.all([
      this.prisma.application.findMany({
        where: { schoolId: auth.schoolId },
        select: {
          academicYearId: true,
          formNo: true,
          studentName: true,
          dateOfBirth: true,
        },
      }),
      this.prisma.student.findMany({
        where: { schoolId: auth.schoolId },
        select: {
          admissionNo: true,
          firstName: true,
          fatherName: true,
          surname: true,
          dateOfBirth: true,
        },
      }),
    ]);
    const usedFormNos = new Set(
      apps.map((a) => `${a.academicYearId}|${a.formNo.toLowerCase()}`),
    );
    const usedAdmissionNos = new Set(
      students.map((s) => s.admissionNo.toLowerCase()),
    );
    const person = (name: string, dob: Date | string | null) =>
      `${name.toLowerCase().replace(/\s+/g, ' ')}|${dob ? (typeof dob === 'string' ? dob : iso(dob)) : ''}`;
    const knownPeople = new Set([
      ...apps.map((a) => person(a.studentName, a.dateOfBirth)),
      ...students.map((s) =>
        person(
          [s.firstName, s.fatherName, s.surname].filter(Boolean).join(' '),
          s.dateOfBirth,
        ),
      ),
    ]);
    const inFile = {
      formNos: new Set<string>(),
      admissionNos: new Set<string>(),
      people: new Set<string>(),
    };

    const rows: CheckedRow[] = table.rows.map((r) => {
      const row: CheckedRow = {
        sheet: r.sheet,
        rowNumber: r.rowNumber,
        label: `Row ${r.rowNumber}`,
        values: r.values,
        errors: [],
        warnings: [],
      };
      try {
        this.checkRow(setup, r.values, row, {
          usedFormNos,
          usedAdmissionNos,
          knownPeople,
          inFile,
          person,
        });
      } catch (error) {
        row.errors.push(messageOf(error));
      }
      return row;
    });
    if (warnings.length && rows[0]) rows[0].warnings.unshift(...warnings);
    return {
      params: { formId: setup.form.id, formVersion: setup.form.version },
      rows,
    };
  }

  private checkRow(
    setup: Setup,
    v: Record<string, Plain>,
    row: CheckedRow,
    seen: {
      usedFormNos: Set<string>;
      usedAdmissionNos: Set<string>;
      knownPeople: Set<string>;
      inFile: {
        formNos: Set<string>;
        admissionNos: Set<string>;
        people: Set<string>;
      };
      person: (name: string, dob: string | null) => string;
    },
  ) {
    const errors = row.errors;
    const take = <T>(p: Parsed<T>): T | undefined => {
      if (p.ok) return p.value;
      errors.push(p.error);
      return undefined;
    };
    const today = todayIso();
    const schema = setup.form.schema;
    const classChoices = setup.classes.map((c) => ({
      value: c.id,
      label: c.name,
    }));

    // ----- the application -----
    const formNo = take(parseText(v.formNo, 'Form no', 30)) ?? null;
    const receivedOn = take(parseDate(v.receivedOn, 'Date received'));
    if (receivedOn === null) errors.push('Date received is required');
    if (receivedOn && receivedOn > today)
      errors.push('Date received cannot be in the future');
    const yearId = take(
      parseChoice(
        v.year,
        setup.years.map((y) => ({ value: y.id, label: y.name })),
        'Academic year',
      ),
    );
    if (yearId === null) errors.push('Academic year is required');
    const year = setup.years.find((y) => y.id === yearId);
    const status = (take(parseChoice(v.status, STATUS_CHOICES, 'Status')) ??
      'RECEIVED') as ApplicationStatus;
    let decidedOn = take(parseDate(v.decidedOn, 'Decision date')) ?? null;
    const decisionNote =
      take(parseText(v.decisionNote, 'Decision note', 500)) ?? null;
    if (DECIDED.has(status)) {
      decidedOn ??= receivedOn ?? null;
      if (decidedOn && decidedOn > today)
        errors.push('Decision date cannot be in the future');
      if (decidedOn && receivedOn && decidedOn < receivedOn)
        errors.push('Decision date cannot be before the date received');
    } else if (decidedOn) {
      row.warnings.push(
        'Decision date is ignored: the application is not decided',
      );
      decidedOn = null;
    }
    if (status === 'REFUSED' && !decisionNote)
      errors.push('Write the reason for refusing in "Decision note"');

    if (formNo && yearId) {
      const key = `${yearId}|${formNo.toLowerCase()}`;
      if (seen.usedFormNos.has(key))
        errors.push(`Form number ${formNo} is already used in ${year?.name}`);
      else if (seen.inFile.formNos.has(key))
        errors.push(`Form number ${formNo} appears twice in this file`);
      seen.inFile.formNos.add(key);
    }

    // ----- the form's answers -----
    const raw: Record<string, unknown> = {};
    // Cells that could not be read are reported once, by the reader, not again by the form check.
    const unreadable = new Set<string>();
    const read = (f: FormField, cell: Plain, label: string, path: string) => {
      const before = errors.length;
      const value = this.answer(f, cell, label, classChoices, errors);
      if (errors.length > before) unreadable.add(path);
      return value;
    };
    for (const { field: f } of questions(schema)) {
      if (f.type === 'group') {
        const items: Record<string, unknown>[] = [];
        for (let n = 1; n <= GROUP_ROWS; n++) {
          const item: Record<string, unknown> = {};
          for (const c of f.fields ?? []) {
            const cell = v[`g:${f.id}:${n}:${c.id}`];
            if (cell === undefined) continue;
            item[c.id] = read(
              c,
              cell,
              `${f.label} ${n} – ${c.label}`,
              `${f.id}[${n - 1}].${c.id}`,
            );
          }
          items.push(item);
        }
        raw[f.id] = items;
        continue;
      }
      raw[f.id] = read(f, v[`f:${f.id}`] ?? null, f.label, f.id);
    }
    const checked = validateAnswers(schema, raw, {
      classIds: new Set(setup.classes.map((c) => c.id)),
      fileIds: new Set(),
    });
    const groupLabel = (path: string) => {
      const m = /^(\w+)\[(\d+)\]/.exec(path);
      if (!m) return '';
      const g = questions(schema).find((q) => q.field.id === m[1]);
      return g ? `${g.field.label} ${Number(m[2]) + 1}: ` : '';
    };
    for (const [path, message] of Object.entries(checked.errors)) {
      if (!unreadable.has(path)) errors.push(`${groupLabel(path)}${message}`);
    }
    const answers = checked.answers;
    const text = (key: Parameters<typeof systemValue>[2]) => {
      const a = systemValue(schema, answers, key);
      return typeof a === 'string' ? a : '';
    };
    const firstName = text('student.firstName');
    const fatherName = text('student.fatherName');
    const surname = text('student.surname');
    const dob = text('student.dateOfBirth') || null;
    const classId = text('student.class') || null;
    const gender = text('student.gender');
    const studentName = [firstName, fatherName, surname]
      .filter(Boolean)
      .join(' ');
    if (studentName)
      row.label = formNo ? `${studentName} (form ${formNo})` : studentName;

    // Entered twice? Only a warning: twins and namesakes exist.
    if (studentName && dob) {
      const who = seen.person(studentName, dob);
      if (seen.knownPeople.has(who))
        row.warnings.push(
          `${studentName}, born ${show(dob)}, is already in the app`,
        );
      else if (seen.inFile.people.has(who))
        row.warnings.push(
          `${studentName}, born ${show(dob)}, appears twice in this file`,
        );
      seen.inFile.people.add(who);
    }

    // Age advice, the same as on the screen.
    const cls = setup.classes.find((c) => c.id === classId);
    if (cls && dob && year) {
      const advice = checkEligibility({
        className: cls.name,
        dateOfBirth: dob,
        asOn: year.ageCutoff ?? receivedOn ?? today,
        minAgeYears: cls.minAgeYears,
        admissionsOpen: true, // an old form was taken when the class was open
      });
      row.warnings.push(...advice.issues);
    }

    // ----- admitted as a student? -----
    const enrolledCell = take(parseYesNo(v.enrolled, 'Admitted as a student?'));
    const yearCells = setup.years.map((y) => ({
      year: y,
      division: take(
        parseChoice(
          v[yearKey(y.id)],
          setup.divisions.map((d) => ({ value: d.id, label: d.label })),
          `Class & division in ${y.name}`,
        ),
      ),
    }));
    const anyYear = yearCells.some((c) => c.division);
    const enrolled = enrolledCell ?? anyYear;
    const admissionNo =
      take(parseText(v.admissionNo, 'Admission no', 30)) ?? null;
    const leftOn = take(parseDate(v.leftOn, 'Left school on')) ?? null;

    let enrol: ImportedApplication['enrol'] = null;
    if (!enrolled) {
      if (anyYear)
        errors.push(
          'A class is filled in, but "Admitted as a student?" says No',
        );
      if (admissionNo || leftOn)
        errors.push(
          'Admission no and "Left school on" are only for admitted children',
        );
    } else if (status !== 'GRANTED') {
      errors.push(
        'Only a granted application can be admitted: set Status to Granted',
      );
    } else if (year) {
      enrol = this.enrolment(setup, row, {
        year,
        yearCells,
        classId,
        receivedOn: receivedOn ?? null,
        decidedOn,
        joinedOnCell: v.joinedOn,
        leftOn,
        today,
      });
      if (!GENDER_VALUES.includes(gender) || !dob)
        errors.push('Gender and date of birth are needed to admit the child');
      const guardians = this.guardians(v, answers, errors);
      if (admissionNo) {
        const key = admissionNo.toLowerCase();
        if (seen.usedAdmissionNos.has(key))
          errors.push(`Admission number ${admissionNo} is already used`);
        else if (seen.inFile.admissionNos.has(key))
          errors.push(
            `Admission number ${admissionNo} appears twice in this file`,
          );
        seen.inFile.admissionNos.add(key);
      }
      if (enrol) {
        enrol.admissionNo = admissionNo;
        enrol.guardians = guardians;
        enrol.student = {
          firstName,
          fatherName: fatherName || null,
          surname,
          gender: gender as 'MALE' | 'FEMALE' | 'OTHER',
          dateOfBirth: dob ?? '',
        };
      }
    }

    if (errors.length === 0 && yearId && receivedOn) {
      const data: ImportedApplication = {
        academicYearId: yearId,
        formNo,
        receivedOn,
        status,
        decidedOn,
        decisionNote,
        answers,
        studentName,
        dateOfBirth: dob,
        classId,
        enrol,
      };
      row.data = data;
    }
  }

  /** One answer from a cell, converted to what the form expects. Unreadable cells add an error. */
  private answer(
    f: FormField,
    cell: Plain,
    label: string,
    classChoices: Choice[],
    errors: string[],
  ): unknown {
    if (isBlank(cell)) return f.type === 'checkbox' ? undefined : null;
    const take = <T>(p: Parsed<T>) => {
      if (p.ok) return p.value;
      errors.push(p.error);
      return undefined;
    };
    switch (f.type) {
      case 'date':
        return take(parseDate(cell, label));
      case 'number':
        return take(parseNumber(cell, label));
      case 'checkbox':
        return take(parseYesNo(cell, label)) ?? undefined;
      case 'select':
      case 'radio':
        return take(
          parseChoice(
            cell,
            f.optionsFrom === 'classes' ? classChoices : (f.options ?? []),
            label,
          ),
        );
      default:
        return asText(cell);
    }
  }

  /**
   * Every year the child studied here, from the admission year on, with the dates each
   * enrolment ran. Checks the years make sense: no gaps, never a lower class, a leaving date
   * inside the last year.
   */
  private enrolment(
    setup: Setup,
    row: CheckedRow,
    a: {
      year: Year;
      yearCells: { year: Year; division: string | null | undefined }[];
      classId: string | null;
      receivedOn: string | null;
      decidedOn: string | null;
      joinedOnCell: Plain;
      leftOn: string | null;
      today: string;
    },
  ): ImportedApplication['enrol'] {
    const errors = row.errors;
    const startIdx = a.yearCells.findIndex((c) => c.year.id === a.year.id);
    const before = a.yearCells.slice(0, startIdx).filter((c) => c.division);
    for (const c of before)
      errors.push(
        `Class & division in ${c.year.name} is before the year applied for (${a.year.name}): leave it blank`,
      );

    const firstDivision = a.yearCells[startIdx].division;
    if (!firstDivision) {
      errors.push(
        `Fill in "Class & division in ${a.year.name}" (the class the child joined)`,
      );
      return null;
    }
    const div = setup.divisions.find((d) => d.id === firstDivision);
    if (div && a.classId && div.classId !== a.classId) {
      const cls = setup.classes.find((c) => c.id === a.classId);
      errors.push(
        `${div.label} is not a division of ${cls?.name ?? 'the class applied for'}`,
      );
    }

    // Joined on: as written, or the later of the decision and the start of the year.
    let joinedOn: string | undefined;
    const typed = parseDate(a.joinedOnCell, 'Joined on');
    if (!typed.ok) errors.push(typed.error);
    else if (typed.value) joinedOn = typed.value;
    else {
      const decided = a.decidedOn ?? a.receivedOn ?? a.year.start;
      joinedOn = decided > a.year.start ? decided : a.year.start;
    }
    if (joinedOn && (joinedOn < a.year.start || joinedOn > a.year.end)) {
      errors.push(
        `Joined on must be inside ${a.year.name} (${show(a.year.start)} to ${show(a.year.end)})`,
      );
    }

    // The years studied: one after another, no gaps. A year that has started with no class
    // means the child had left before it.
    const studied: { year: Year; divisionId: string }[] = [
      { year: a.year, divisionId: firstDivision },
    ];
    let stopped: Year | null = null;
    for (const c of a.yearCells.slice(startIdx + 1)) {
      // Years should follow one another. One that overlaps the last year studied (set up by
      // mistake) is ignored when blank and refused when filled.
      const prev = studied[studied.length - 1].year;
      if (c.year.start <= prev.end) {
        if (c.division)
          errors.push(
            `${c.year.name} overlaps ${prev.name}: fill in only one of them`,
          );
        continue;
      }
      if (c.division) {
        if (stopped) {
          errors.push(
            `There is no class for ${stopped.name} but there is one for ${c.year.name}: fill in ${stopped.name}`,
          );
          break;
        }
        studied.push({ year: c.year, divisionId: c.division });
      } else if (!stopped && c.year.start <= a.today) {
        stopped = c.year;
      }
    }
    const last = studied[studied.length - 1];
    if (stopped && !a.leftOn) {
      errors.push(
        `No class for ${stopped.name}: fill it in, or write the date the child left in "Left school on"`,
      );
    }
    if (a.leftOn) {
      if (a.leftOn > a.today)
        errors.push('"Left school on" cannot be in the future');
      if (joinedOn && a.leftOn < joinedOn)
        errors.push('"Left school on" cannot be before the child joined');
      if (a.leftOn < last.year.start || a.leftOn > last.year.end) {
        errors.push(
          `The child left on ${show(a.leftOn)}, which is not in ${last.year.name}, the last year with a class: fill in the classes up to the year the child left`,
        );
      }
    }

    // Classes only go up: same class is "kept back", a lower class is a mistake.
    const order = (divisionId: string) => {
      const d = setup.divisions.find((x) => x.id === divisionId);
      return setup.classes.find((c) => c.id === d?.classId)?.sortOrder ?? 0;
    };
    for (let i = 1; i < studied.length; i++) {
      const prev = order(studied[i - 1].divisionId);
      const now = order(studied[i].divisionId);
      if (now < prev)
        errors.push(
          `${studied[i].year.name} is in a lower class than ${studied[i - 1].year.name}`,
        );
      else if (now === prev)
        row.warnings.push(`Stays in the same class in ${studied[i].year.name}`);
    }

    if (!joinedOn) return null;
    return {
      admissionNo: null,
      student: {
        firstName: '',
        fatherName: null,
        surname: '',
        gender: 'MALE',
        dateOfBirth: '',
      },
      guardians: [],
      years: studied.map((s, i) => ({
        academicYearId: s.year.id,
        divisionId: s.divisionId,
        startedOn: i === 0 ? joinedOn : s.year.start,
        endedOn: i < studied.length - 1 ? s.year.end : a.leftOn,
      })),
      leftOn: a.leftOn,
    };
  }

  /** The guardians: names from the form, mobiles from the form or the columns beside it. */
  private guardians(
    v: Record<string, Plain>,
    answers: Record<string, unknown>,
    errors: string[],
  ): GuardianInputDto[] {
    const mobiles: Record<string, string | null | undefined> = {};
    for (const [rel, key, label] of [
      ['FATHER', 'fatherMobile', "Father's mobile"],
      ['MOTHER', 'motherMobile', "Mother's mobile"],
      ['GUARDIAN', 'guardianMobile', "Guardian's mobile"],
    ] as const) {
      const p = parseMobile(v[key], label);
      if (!p.ok) errors.push(p.error);
      else mobiles[rel] = p.value;
    }
    const primary = parseChoice(v.primary, PRIMARY_CHOICES, 'Primary contact');
    if (!primary.ok) errors.push(primary.error);

    const list = suggestGuardians(answers).map((g) => ({
      ...g,
      fullName: g.fullName.slice(0, 100),
      mobile: mobiles[g.relationship] ?? g.mobile,
      email:
        g.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(g.email)
          ? g.email
          : undefined,
    }));
    if (list.length === 0) {
      errors.push(
        "Fill in the father's, mother's or guardian's name: the child needs at least one guardian",
      );
      return [];
    }
    for (const g of list) {
      if (g.fullName.length < 2)
        errors.push(`${g.relationship.toLowerCase()}'s name is too short`);
      if (g.mobile) g.mobile = cleanMobile(g.mobile) || undefined;
    }
    const want = primary.ok ? primary.value : null;
    if (want && !list.some((g) => g.relationship === want)) {
      errors.push(
        `Primary contact is ${want.toLowerCase()}, but there is no ${want.toLowerCase()}'s name on the form`,
      );
    }
    return list.map((g, i) => ({
      fullName: g.fullName,
      relationship: g.relationship,
      ...(g.mobile ? { mobile: g.mobile } : {}),
      ...(g.email ? { email: g.email } : {}),
      ...(g.occupation ? { occupation: g.occupation.slice(0, 100) } : {}),
      isPrimary: want ? g.relationship === want : i === 0,
    }));
  }

  // ---------------------------------------------------------------------------
  // Import
  // ---------------------------------------------------------------------------

  async run(
    auth: AuthContext,
    batch: { id: string; params: Record<string, unknown> },
    rows: CheckedRow[],
  ): Promise<void> {
    const form = await this.admissions.getForm(auth.schoolId);
    if (form.id !== batch.params.formId) {
      throw new BadRequestException(
        'The admission form was published again after this file was checked. Upload the file again.',
      );
    }
    // One row at a time, in file order, so brothers and sisters further down find their parents.
    for (const row of rows) {
      try {
        const done = await this.admissions.importOne(
          auth,
          batch.id,
          form.id,
          row.data as ImportedApplication,
        );
        row.outcome = {
          status: 'IMPORTED',
          ref: done.studentId
            ? { type: 'student', id: done.studentId }
            : { type: 'application', id: done.applicationId },
        };
      } catch (error) {
        row.outcome = { status: 'FAILED', message: messageOf(error) };
      }
    }
  }
}
