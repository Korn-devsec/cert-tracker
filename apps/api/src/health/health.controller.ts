import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { HealthService } from './health.service';
import { HealthResponse } from './health.types';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /** เปิดให้เรียกได้โดยไม่ต้อง login — monitoring/docker healthcheck ต้องใช้ */
  @Public()
  @Get()
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthResponse> {
    const result = await this.healthService.check();
    // ต่อ DB ไม่ได้ = ระบบใช้งานจริงไม่ได้ → ตอบ 503 เพื่อให้ monitoring จับได้
    res.status(result.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return result;
  }
}
