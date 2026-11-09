import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class FeesInsightQueryDto {
  /** Defaults to the current year. */
  @IsOptional()
  @IsUUID()
  academicYearId?: string;
}

export class AttendanceInsightQueryDto {
  /** How many days back to look, today included. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(90)
  days: number = 30;
}
