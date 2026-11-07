import {
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SaveDraftDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name?: string;

  /** Checked in depth by validateFormSchema. */
  @IsObject()
  schema: Record<string, unknown>;
}
