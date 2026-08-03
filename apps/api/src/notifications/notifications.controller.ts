import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { NotificationLog, Prisma, UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { buildMeta, paginationArgs, type Paginated } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import { TestRunDto } from './dto/test-run.dto';
import { NotificationsService } from './notifications.service';
import type { NotificationRunResult } from './notifications.types';

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * สั่งสแกน/ส่งแจ้งเตือนทันทีโดยไม่ต้องรอ cron (ADMIN เท่านั้น)
   * ส่ง `preview: true` เพื่อดูว่าจะแจ้งใครบ้างโดยไม่ส่งและไม่บันทึกอะไร
   */
  @Roles(UserRole.ADMIN)
  @Post('test-run')
  @HttpCode(HttpStatus.OK)
  testRun(
    @Body() dto: TestRunDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<NotificationRunResult> {
    return this.notifications.run({
      trigger: 'manual',
      preview: dto.preview,
      companyId: dto.companyId,
      actor: actor.email,
      actorId: actor.id,
    });
  }

  /** ประวัติการแจ้งเตือน (อ่านได้ทุก role) — ใช้ตรวจว่าใบไหนแจ้งขั้นไหนไปแล้วเมื่อไร */
  @Get()
  async findAll(@Query() query: ListNotificationsDto): Promise<Paginated<NotificationLog>> {
    const now = new Date();
    const { page, pageSize, skip, take } = paginationArgs(query);

    const where: Prisma.NotificationLogWhereInput = {};
    if (query.certificateId !== undefined) {
      where.certificateId = query.certificateId;
    }
    if (query.companyId !== undefined) {
      where.certificate = { companyId: query.companyId };
    }
    if (query.tier !== undefined) {
      where.tier = query.tier;
    }
    if (query.channel !== undefined) {
      where.channel = query.channel;
    }
    if (query.isSuccess !== undefined) {
      where.isSuccess = query.isSuccess === 'true';
    }

    const [total, data] = await Promise.all([
      this.prisma.notificationLog.count({ where }),
      this.prisma.notificationLog.findMany({
        where,
        orderBy: { sentAt: 'desc' },
        skip,
        take,
        include: {
          certificate: {
            select: {
              id: true,
              commonName: true,
              endpoint: true,
              expiresAt: true,
              company: { select: { id: true, code: true, name: true } },
            },
          },
        },
      }),
    ]);

    return { data, meta: buildMeta({ page, pageSize }, total, now) };
  }
}
