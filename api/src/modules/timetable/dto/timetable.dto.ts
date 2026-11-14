import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { DATE_MESSAGE, DATE_PATTERN } from '../../../common/dto/filters.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const emptyToNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const v = value.trim();
  return v === '' ? null : v;
};
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const TIME_MESSAGE = 'Write times as HH:mm, for example 08:30';

export class ScheduleQueryDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;
}

export class CreateScheduleDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name: string;

  /** Copy the rows of another schedule (any year) to start from. */
  @IsOptional()
  @IsUUID()
  copyFromId?: string;
}

export class UpdateScheduleDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name?: string;

  /** false switches it off; true switches it on again. */
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class SlotDto {
  /** Present when the row already exists, so its timetable is kept. */
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsIn(['PERIOD', 'BREAK', 'ASSEMBLY'])
  kind: 'PERIOD' | 'BREAK' | 'ASSEMBLY';

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  label: string;

  @Matches(TIME, { message: TIME_MESSAGE })
  startsAt: string;

  @Matches(TIME, { message: TIME_MESSAGE })
  endsAt: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(6, { each: true })
  days: number[];

  /** Ignored: rows are kept in the order sent. Accepted so a row can be sent back as it was read. */
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class ReplaceSlotsDto {
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => SlotDto)
  slots: SlotDto[];
}

export class BreakDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(11)
  afterPeriod: number;

  @Transform(trim)
  @IsString()
  @MaxLength(40)
  label: string;

  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(180)
  minutes: number;
}

export class GenerateSlotsDto {
  @Matches(TIME, { message: TIME_MESSAGE })
  firstStart: string;

  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(180)
  periodMinutes: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  periodsPerDay: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(30)
  gapMinutes: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(120)
  assemblyMinutes?: number;

  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => BreakDto)
  breaks: BreakDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(6, { each: true })
  days: number[];
}

export class ClassScheduleDto {
  @IsUUID()
  classId: string;

  /** null takes the class off any schedule (only when its divisions have no timetable). */
  @ValidateIf((o: ClassScheduleDto) => o.scheduleId !== null)
  @IsUUID()
  scheduleId: string | null;
}

export class SetClassSchedulesDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ClassScheduleDto)
  classes: ClassScheduleDto[];
}

export class WeekQueryDto {
  /** Any day of the week to show. Today when missing. */
  @IsOptional()
  @Matches(DATE_PATTERN, { message: DATE_MESSAGE })
  weekOf?: string;
}

export class EntryDto {
  @IsUUID()
  slotId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(6)
  weekday: number;

  /** null or missing = a free period (the box is cleared). */
  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((o: EntryDto) => o.subjectId != null)
  @IsUUID()
  subjectId?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((o: EntryDto) => o.staffId != null)
  @IsUUID()
  staffId?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((o: EntryDto) => o.room != null)
  @IsString()
  @MaxLength(40)
  room?: string | null;
}

export class SetEntriesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => EntryDto)
  entries: EntryDto[];
}

export class ReassignDto {
  @IsUUID()
  divisionId: string;

  @IsUUID()
  subjectId: string;

  @IsUUID()
  fromStaffId: string;

  @IsUUID()
  toStaffId: string;

  /** Also make them the subject teacher in Academic setup (marks, homework and attendance follow it). */
  @IsOptional()
  @IsBoolean()
  alsoSubjectTeacher?: boolean;
}

export class DayQueryDto {
  @IsOptional()
  @Matches(DATE_PATTERN, { message: DATE_MESSAGE })
  date?: string;
}

export class FreeTeachersQueryDto {
  @Matches(DATE_PATTERN, { message: DATE_MESSAGE })
  date: string;

  @IsUUID()
  divisionId: string;

  @IsUUID()
  slotId: string;
}

export class CreateAdjustmentDto {
  @Matches(DATE_PATTERN, { message: DATE_MESSAGE })
  date: string;

  @IsUUID()
  divisionId: string;

  @IsUUID()
  slotId: string;

  @IsIn(['SUBSTITUTE', 'CANCELLED'])
  kind: 'SUBSTITUTE' | 'CANCELLED';

  @ValidateIf((o: CreateAdjustmentDto) => o.kind === 'SUBSTITUTE')
  @IsUUID()
  substituteStaffId?: string;

  /** When the substitute teaches another subject that period. */
  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  reason: string;
}

export class CopyTimetableDto {
  @IsUUID()
  fromAcademicYearId: string;
}
