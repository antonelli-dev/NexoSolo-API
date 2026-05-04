import { ServiceUnavailableException } from '@nestjs/common';

import { AiService } from './ai.service';

describe('AiService', () => {
  const prisma = {} as any;

  beforeEach(() => {
    delete process.env.AI_PROVIDER;
    delete process.env.AI_API_KEY;
    delete process.env.AI_BASE_URL;
    delete process.env.AI_MODEL;
  });

  it('throws AI_NOT_CONFIGURED when AI_API_KEY missing', async () => {
    const svc = new AiService(prisma);
    await expect(
      svc.pricingCoach('u1', {
        projectDescription: 'Landing page copy',
        quotedAmountCents: 100_00,
        currency: 'EUR',
      } as any),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
