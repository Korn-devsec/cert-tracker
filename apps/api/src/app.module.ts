import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { CertificatesModule } from './certificates/certificates.module';
import { CompaniesModule } from './companies/companies.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { HealthModule } from './health/health.module';
import { HistoryModule } from './history/history.module';
import { ImportsModule } from './imports/imports.module';
import { PrismaModule } from './prisma/prisma.module';
import { TasksModule } from './tasks/tasks.module';

@Module({
  imports: [
    // โหลด .env เข้า process.env ก่อน module อื่น (PrismaClient ต้องใช้ DATABASE_URL)
    ConfigModule.forRoot({ isGlobal: true, cache: true }),
    PrismaModule,
    HistoryModule,
    AuthModule,
    CompaniesModule,
    ImportsModule,
    CertificatesModule,
    TasksModule,
    DashboardModule,
    HealthModule,
  ],
  providers: [
    // ปิดทุก endpoint เป็นค่าเริ่มต้น — ต้องติด @Public() เพื่อเปิด (login, health)
    // ลำดับสำคัญ: JwtAuthGuard ต้องมาก่อน RolesGuard เพราะ RolesGuard อ่าน request.user
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
