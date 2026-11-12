import { Controller, Get } from '@nestjs/common';
import { Public } from './common/decorators/public.decorator.js';
import { PrismaService } from './database/prisma.service.js';
import { SchoolService } from './modules/school/school.service.js';

@Controller()
export class AppController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolService,
  ) {}

  /** For load balancers and uptime checks. Proves the app can reach the database. */
  @Public()
  @Get('health')
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  }

  /**
   * What the app should tell everyone about this copy of it, before sign-in: on a test copy
   * (PPE) a banner and where to send feedback (both null in production), and whether sign-in
   * needs to offer a school code.
   */
  @Public()
  @Get('app-info')
  async appInfo() {
    const text = (v?: string) => (v && v.trim() ? v.trim() : null);
    const feedbackUrl = text(process.env.FEEDBACK_URL);
    return {
      environmentLabel: text(process.env.APP_ENV_LABEL),
      // Only an https address is passed on, so the link can never be a script.
      feedbackUrl: feedbackUrl?.startsWith('https://') ? feedbackUrl : null,
      // With more than one school, the sign-in page offers a box for the school code.
      schoolCodeOffered: (await this.schools.schoolCount()) > 1,
    };
  }
}
