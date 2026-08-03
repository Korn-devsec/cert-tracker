import { Module } from '@nestjs/common';
import { EmailChannel } from './channels/email.channel';
import { LineChannel } from './channels/line.channel';
import {
  NOTIFICATION_CHANNELS,
  type NotificationChannelAdapter,
} from './channels/notification-channel';
import { NotificationsController } from './notifications.controller';
import { NotificationScheduler } from './notifications.scheduler';
import { NotificationsService } from './notifications.service';

@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationScheduler,
    EmailChannel,
    LineChannel,
    {
      // รายการช่องทางทั้งหมด — เพิ่มช่องทางใหม่ได้ที่นี่จุดเดียว service ไม่ต้องแก้
      provide: NOTIFICATION_CHANNELS,
      useFactory: (email: EmailChannel, line: LineChannel): NotificationChannelAdapter[] => [
        email,
        line,
      ],
      inject: [EmailChannel, LineChannel],
    },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
