import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { HistoryAction, User } from '@prisma/client';
import { hashPassword, verifyPassword } from '../common/password';
import { HistoryService } from '../history/history.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser, JwtPayload, LoginResult } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly history: HistoryService,
  ) {}

  async login(dto: LoginDto): Promise<LoginResult> {
    const email = normalizeEmail(dto.email);
    const user = await this.prisma.user.findUnique({ where: { email } });

    // ใช้ข้อความเดียวกันทุกกรณีที่ล็อกอินไม่ผ่าน เพื่อไม่ให้เดาได้ว่าอีเมลนี้มีในระบบหรือไม่
    const invalidCredentials = (): UnauthorizedException =>
      new UnauthorizedException('อีเมลหรือรหัสผ่านไม่ถูกต้อง');

    if (user === null || !user.isActive) {
      throw invalidCredentials();
    }
    if (!(await verifyPassword(dto.password, user.passwordHash))) {
      throw invalidCredentials();
    }

    return this.issueToken(user);
  }

  /** สร้างผู้ใช้ใหม่ — controller จำกัดให้เฉพาะ ADMIN เรียกได้ */
  async register(dto: RegisterDto, actor: AuthenticatedUser): Promise<AuthenticatedUser> {
    const email = normalizeEmail(dto.email);
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing !== null) {
      throw new ConflictException(`มีผู้ใช้อีเมล ${email} อยู่ในระบบแล้ว`);
    }

    const created = await this.prisma.user.create({
      data: {
        email,
        name: dto.name.trim(),
        role: dto.role,
        passwordHash: await hashPassword(dto.password),
      },
    });

    await this.history.write({
      action: HistoryAction.USER_CREATED,
      actor: actor.email,
      actorId: actor.id,
      detail: `สร้างผู้ใช้ ${created.email} สิทธิ์ ${created.role}`,
      metadata: { userId: created.id, role: created.role },
    });

    return toAuthenticatedUser(created);
  }

  private async issueToken(user: User): Promise<LoginResult> {
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    const expiresIn = this.config.get<string>('JWT_EXPIRES_IN') ?? '1d';
    return {
      accessToken: await this.jwtService.signAsync(payload),
      expiresIn,
      user: toAuthenticatedUser(user),
    };
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toAuthenticatedUser(user: User): AuthenticatedUser {
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}
