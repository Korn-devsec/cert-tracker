import { Module } from '@nestjs/common';
import { CertificatesModule } from '../certificates/certificates.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  // ใช้ service ของสองโมดูลนี้เพื่อให้ตัวเลข/ตัวกรองในรายงานตรงกับหน้าจอ
  imports: [CertificatesModule, DashboardModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
