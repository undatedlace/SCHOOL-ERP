import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '../../generated/prisma/client.js';

const KNOWN: Record<string, [number, string]> = {
  P2002: [409, 'A record with these values already exists'],
  P2003: [
    409,
    'This record is in use, or refers to something that does not exist',
  ],
  P2025: [404, 'Record not found'],
};

/** Turns common database errors into proper HTTP responses instead of 500s. */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const known = KNOWN[exception.code];
    if (!known) this.logger.error(`${exception.code}: ${exception.message}`);
    const [statusCode, message] = known ?? [500, 'Database error'];
    res.status(statusCode).json({ statusCode, message });
  }
}
