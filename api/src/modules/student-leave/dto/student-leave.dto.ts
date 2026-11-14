import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  DATE_MESSAGE,
  DATE_PATTERN,
  queryBool,
} from '../../../common/dto/filters.js';
import { PageQueryDto } from '../../../common/dto/page-query.dto.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export const STUDENT_LEAVE_STATUSES = [
  'PENDING',
  'APPROVED',
  'REFUSED',
  'WITHDRAWN',
] as const;
export type StudentLeaveStatusName = (typeof STUDENT_LEAVE_STATUSES)[number];

export class RequestStudentLeaveDto {
  /** Left out when the login sees exactly one student. */
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @Matches(DATE_PATTERN, { message: DATE_MESSAGE })
  fromDate: string;

  /** Left out for a single day. */
  @IsOptional()
  @Matches(DATE_PATTERN, { message: DATE_MESSAGE })
  toDate?: string;

  /** For a single day only. */
  @IsOptional()
  @IsBoolean()
  halfDay?: boolean;

  /** Plain text. */
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Give a reason' })
  @MaxLength(500)
  reason: string;
}

export class PreviewStudentLeaveQueryDto {
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @Matches(DATE_PATTERN, { message: DATE_MESSAGE })
  fromDate: string;

  @IsOptional()
  @Matches(DATE_PATTERN, { message: DATE_MESSAGE })
  toDate?: string;

  @IsOptional()
  @queryBool()
  @IsBoolean()
  halfDay?: boolean;
}

export class DecideStudentLeaveDto {
  @IsBoolean()
  approve: boolean;

  /** Required when refusing. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class ListStudentLeaveQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn(STUDENT_LEAVE_STATUSES)
  status?: StudentLeaveStatusName;

  @IsOptional()
  @IsUUID()
  studentId?: string;

  /** The students in this division this year. */
  @IsOptional()
  @IsUUID()
  divisionId?: string;

  /** Leave touching this day or later. */
  @IsOptional()
  @Matches(DATE_PATTERN, { message: DATE_MESSAGE })
  from?: string;

  /** Leave touching this day or earlier. */
  @IsOptional()
  @Matches(DATE_PATTERN, { message: DATE_MESSAGE })
  to?: string;
}

export class CountsQueryDto {
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @IsUUID()
  divisionId?: string;
}
