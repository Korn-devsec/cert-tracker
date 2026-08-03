import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { HealthService } from './health.service';

describe('HealthService', () => {
  const buildService = async (healthy: boolean): Promise<HealthService> => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        HealthService,
        {
          provide: PrismaService,
          useValue: { isHealthy: (): Promise<boolean> => Promise.resolve(healthy) },
        },
      ],
    }).compile();

    return moduleRef.get(HealthService);
  };

  it('ต่อ DB ได้ → { status: "ok", db: "connected" }', async () => {
    const service = await buildService(true);
    await expect(service.check()).resolves.toEqual({ status: 'ok', db: 'connected' });
  });

  it('ต่อ DB ไม่ได้ → { status: "error", db: "disconnected" }', async () => {
    const service = await buildService(false);
    await expect(service.check()).resolves.toEqual({ status: 'error', db: 'disconnected' });
  });
});
