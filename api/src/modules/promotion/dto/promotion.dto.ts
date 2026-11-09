import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export enum PromotionAction {
  /** Moves up to a division of a higher class. */
  PROMOTE = 'PROMOTE',
  /** Stays in the same class, in a division of it. */
  REPEAT = 'REPEAT',
  /** Leaves the school (including finishing the last class). */
  LEFT = 'LEFT',
}

export class YearsQueryDto {
  @IsUUID()
  fromAcademicYearId: string;

  @IsUUID()
  toAcademicYearId: string;
}

export class PlanQueryDto extends YearsQueryDto {
  @IsUUID()
  divisionId: string;
}

export class PromotionEntryDto {
  @IsUUID()
  studentId: string;

  @IsEnum(PromotionAction)
  action: PromotionAction;

  /** The division in the new year. Required for PROMOTE and REPEAT. */
  @IsOptional()
  @IsUUID()
  divisionId?: string;
}

export class RunPromotionDto extends PlanQueryDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => PromotionEntryDto)
  entries: PromotionEntryDto[];
}
