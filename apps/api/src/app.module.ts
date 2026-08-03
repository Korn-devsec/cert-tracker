import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    // โหลด .env เข้า process.env ก่อน module อื่น (PrismaClient ต้องใช้ DATABASE_URL)
    ConfigModule.forRoot({ isGlobal: true, cache: true }),
    PrismaModule,
    HealthModule,
  ],
})
export class AppModule {}
