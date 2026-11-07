import { IsOptional, IsUUID } from 'class-validator';

export class AssignDto {
  @IsUUID()
  staffId: string;

  @IsUUID()
  divisionId: string;

  /** Leave out to make the person the class teacher of the division. */
  @IsOptional()
  @IsUUID()
  subjectId?: string;

  /** Defaults to the current academic year. */
  @IsOptional()
  @IsUUID()
  academicYearId?: string;
}

export class ChangeTeacherDto {
  @IsUUID()
  staffId: string;
}

export class ListAssignmentsQueryDto {
  /** Defaults to the current academic year. */
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsUUID()
  divisionId?: string;

  @IsOptional()
  @IsUUID()
  staffId?: string;
}
