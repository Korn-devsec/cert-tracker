import { Controller, Get, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import type { DashboardSummary } from './dashboard.types';
import { DashboardSummaryDto } from './dto/dashboard-summary.dto';

/** ตัวเลขสรุปอ่านได้ทุก role ที่ login แล้ว */
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  summary(@Query() query: DashboardSummaryDto): Promise<DashboardSummary> {
    return this.dashboardService.summary(query);
  }
}
