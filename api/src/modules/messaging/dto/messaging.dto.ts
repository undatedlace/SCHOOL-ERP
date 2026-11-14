import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
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
} from 'class-validator';
import {
  DATE_MESSAGE,
  DATE_PATTERN,
  queryBool,
} from '../../../common/dto/filters.js';
import { PageQueryDto } from '../../../common/dto/page-query.dto.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export const MAX_BODY = 2000;
export const MAX_SUBJECT = 120;
export const MAX_FILES = 3;

export class StartConversationDto {
  @ApiPropertyOptional({
    description:
      'The student the conversation is about. Required for a teacher; for a family login only when it sees several students.',
  })
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @ApiPropertyOptional({
    description:
      'The teacher to write to. Sent by a family login; a teacher omits it.',
  })
  @IsOptional()
  @IsUUID()
  teacherUserId?: string;

  @ApiProperty({ maxLength: MAX_SUBJECT, description: 'Plain text.' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_SUBJECT)
  subject: string;

  @ApiProperty({
    maxLength: MAX_BODY,
    description: 'The first message, plain text.',
  })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_BODY)
  body: string;

  @ApiPropertyOptional({
    type: [String],
    description:
      'Files uploaded with the purpose "message-attachment" (up to 3).',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_FILES)
  @IsUUID('all', { each: true })
  @Type(() => String)
  fileIds?: string[];
}

export class SendMessageDto {
  @ApiProperty({ maxLength: MAX_BODY, description: 'Plain text.' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_BODY)
  body: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_FILES)
  @IsUUID('all', { each: true })
  @Type(() => String)
  fileIds?: string[];
}

export class CloseConversationDto {
  @ApiProperty({ minLength: 3, maxLength: 500 })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}

export class ListConversationsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({
    description:
      'Administrators only (messages.read_all): list every conversation in the school, read only.',
  })
  @IsOptional()
  @queryBool()
  @IsBoolean()
  all?: boolean;

  @ApiPropertyOptional({
    description: 'Only conversations with unread messages (not with all=true).',
  })
  @IsOptional()
  @queryBool()
  @IsBoolean()
  unread?: boolean;

  @ApiPropertyOptional({
    description: 'Search the subject, student name and teacher name.',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ description: 'all=true only.' })
  @IsOptional()
  @IsUUID()
  classId?: string;

  @ApiPropertyOptional({ description: 'all=true only.' })
  @IsOptional()
  @IsUUID()
  divisionId?: string;

  @ApiPropertyOptional({ description: 'all=true only.' })
  @IsOptional()
  @IsUUID()
  teacherUserId?: string;

  @ApiPropertyOptional({
    description: 'all=true only. Last message on or after this day.',
  })
  @IsOptional()
  @Matches(DATE_PATTERN, { message: DATE_MESSAGE })
  from?: string;

  @ApiPropertyOptional({
    description: 'all=true only. Last message on or before this day.',
  })
  @IsOptional()
  @Matches(DATE_PATTERN, { message: DATE_MESSAGE })
  to?: string;
}

export class ConversationDetailQueryDto {
  @ApiPropertyOptional({
    description:
      'Return messages older than this message id (cursor paging, newest last).',
  })
  @IsOptional()
  @IsUUID()
  before?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 30;
}

export class ContactsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({
    enum: ['family', 'teacher'],
    description:
      'Which list to return. Default: "teacher" when the person teaches a division this year, otherwise "family".',
  })
  @IsOptional()
  @IsIn(['family', 'teacher'])
  as?: 'family' | 'teacher';

  @ApiPropertyOptional({
    description: 'Teacher list: search the student name or admission number.',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ description: 'Teacher list: only this division.' })
  @IsOptional()
  @IsUUID()
  divisionId?: string;
}
