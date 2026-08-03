import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    // ตั้งใจไม่ให้ล้มทั้งแอปถ้า DB ยังไม่พร้อม เพื่อให้ GET /health
    // ยังตอบได้ว่า db: "disconnected" (ใช้วินิจฉัยปัญหาได้ง่ายกว่า process ตายเงียบๆ)
    try {
      await this.$connect();
      this.logger.log('Connected to PostgreSQL');
    } catch (error) {
      this.logger.error(
        `Cannot connect to PostgreSQL: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** ping DB ด้วย query เบาที่สุด — ใช้โดย health check */
  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
