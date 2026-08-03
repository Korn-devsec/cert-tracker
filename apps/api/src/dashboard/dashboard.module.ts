import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  controllers: [DashboardController],
  providers: [DashboardService],
  // ReportsModule ใช้ตัวเลขชุดเดียวกับ Dashboard เพื่อให้รายงานตรงกับหน้าจอ
  exports: [DashboardService],
})
export class DashboardModule {}
