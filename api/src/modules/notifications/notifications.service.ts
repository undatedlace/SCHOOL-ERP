import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthContext } from '../../common/auth-context.js';
import {
  Page,
  PageQueryDto,
  skipTake,
} from '../../common/dto/page-query.dto.js';
import { PrismaService } from '../../database/prisma.service.js';

export interface NewNotification {
  /** What happened, like "leave.requested". */
  type: string;
  title: string;
  body?: string;
  /** Where in the app it leads, for example "/app/leave". */
  link?: string;
}

const view = (n: {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
}) => ({
  id: n.id,
  type: n.type,
  title: n.title,
  body: n.body,
  link: n.link,
  read: n.readAt !== null,
  createdAt: n.createdAt,
});

/**
 * The one way the system tells people things. Features call `notify` or `notifyPermission`; people read
 * their own messages through the bell. E-mail, push and SMS can later read the same table as extra channels.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Writes one message for each person (once each; nobody is told twice about the same thing). */
  async notify(
    schoolId: string,
    userIds: (string | null | undefined)[],
    n: NewNotification,
  ): Promise<number> {
    const ids = [...new Set(userIds.filter((u): u is string => !!u))];
    if (ids.length === 0) return 0;
    const res = await this.prisma.notification.createMany({
      data: ids.map((userId) => ({
        schoolId,
        userId,
        type: n.type,
        title: n.title,
        body: n.body ?? null,
        link: n.link ?? null,
      })),
    });
    return res.count;
  }

  /** Tells everyone who holds a permission (current accounts only), except one person if given. */
  async notifyPermission(
    schoolId: string,
    permission: string,
    n: NewNotification,
    exceptUserId?: string,
  ): Promise<number> {
    const users = await this.prisma.user.findMany({
      where: {
        schoolId,
        status: 'ACTIVE',
        ...(exceptUserId ? { id: { not: exceptUserId } } : {}),
        roles: {
          some: {
            role: {
              permissions: { some: { permission: { code: permission } } },
            },
          },
        },
      },
      select: { id: true },
    });
    return this.notify(
      schoolId,
      users.map((u) => u.id),
      n,
    );
  }

  /** The signed-in person's own messages, newest first. */
  async list(
    auth: AuthContext,
    q: PageQueryDto & { unread?: boolean },
  ): Promise<Page<ReturnType<typeof view>> & { unread: number }> {
    const where = {
      userId: auth.userId,
      schoolId: auth.schoolId,
      ...(q.unread ? { readAt: null } : {}),
    };
    const [rows, total, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...skipTake(q),
      }),
      this.prisma.notification.count({ where }),
      this.unreadCount(auth),
    ]);
    return {
      items: rows.map(view),
      total,
      page: q.page,
      pageSize: q.pageSize,
      unread,
    };
  }

  unreadCount(auth: AuthContext): Promise<number> {
    return this.prisma.notification.count({
      where: { userId: auth.userId, schoolId: auth.schoolId, readAt: null },
    });
  }

  async markRead(auth: AuthContext, id: string) {
    // Someone else's message looks like one that does not exist.
    const found = await this.prisma.notification.findFirst({
      where: { id, userId: auth.userId, schoolId: auth.schoolId },
      select: { id: true, readAt: true },
    });
    if (!found) throw new NotFoundException('Notification not found');
    if (!found.readAt) {
      await this.prisma.notification.update({
        where: { id },
        data: { readAt: new Date() },
      });
    }
    return { unread: await this.unreadCount(auth) };
  }

  async markAllRead(auth: AuthContext) {
    await this.prisma.notification.updateMany({
      where: { userId: auth.userId, schoolId: auth.schoolId, readAt: null },
      data: { readAt: new Date() },
    });
    return { unread: 0 };
  }
}
