import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { StudentDocumentType } from '../../../generated/prisma/enums.js';

export class AddDocumentDto {
  /** From POST /files with purpose "student-document". */
  @IsUUID()
  fileId: string;

  @IsEnum(StudentDocumentType)
  type: StudentDocumentType;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(120)
  title?: string;
}
