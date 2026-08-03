import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HealthResponse } from './health.types';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthResponse> {
    const connected = await this.prisma.isHealthy();
    return {
      status: connected ? 'ok' : 'error',
      db: connected ? 'connected' : 'disconnected',
    };
  }
}
