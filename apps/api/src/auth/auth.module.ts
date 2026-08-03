import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

/** รูปแบบที่ jsonwebtoken รับ เช่น `3600`, `30m`, `1d` */
const EXPIRES_IN_PATTERN = /^\d+(ms|s|m|h|d|w|y)?$/;

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        if (secret === undefined || secret.length === 0) {
          // ล้มตอน boot ดีกว่าปล่อยให้ระบบเซ็น token ด้วย secret ว่าง
          throw new Error('ต้องตั้งค่า JWT_SECRET ใน .env ก่อนเริ่มระบบ');
        }
        const expiresIn = config.get<string>('JWT_EXPIRES_IN') ?? '1d';
        if (!EXPIRES_IN_PATTERN.test(expiresIn)) {
          throw new Error(
            `JWT_EXPIRES_IN รูปแบบไม่ถูกต้อง: "${expiresIn}" (ตัวอย่างที่ใช้ได้: 30m, 1d)`,
          );
        }

        return {
          secret,
          // expiresIn ของ jsonwebtoken เป็น template literal type แต่ค่าจาก .env เป็น string ธรรมดา
          // ตรวจรูปแบบด้านบนแล้วจึง cast (ไม่ใช้ any)
          signOptions: { expiresIn } as JwtModuleOptions['signOptions'],
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  // export JwtModule ด้วย เพราะ JwtAuthGuard ที่ลงทะเบียนเป็น global guard ใน AppModule ต้องใช้ JwtService
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
