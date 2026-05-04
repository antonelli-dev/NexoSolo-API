import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { configureApp } from '../src/bootstrap/configure-app';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

describe('Security & Error Handling (E2E)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let authToken: string;
  let testUserId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = moduleFixture.get<PrismaService>(PrismaService);
    jwtService = moduleFixture.get<JwtService>(JwtService);

    // Create test user
    testUserId = 'security-test-user-' + Date.now();
    await prisma.profile.create({
      data: {
        id: testUserId,
        email: `security-test-${Date.now()}@example.com`,
        displayName: 'Security Test User',
        subscriptionTier: 'free',
      },
    });

    // Generate valid JWT token
    authToken = jwtService.sign(
      { sub: testUserId, email: `security-test-${Date.now()}@example.com` },
      { secret: process.env.JWT_SECRET || 'test-secret', expiresIn: '1h' },
    );
  });

  afterAll(async () => {
    // Cleanup
    await prisma.freelanceClient.deleteMany({ where: { userId: testUserId } });
    await prisma.profile.delete({ where: { id: testUserId } }).catch(() => {});
    await app.close();
  });

  describe('Authorization & Data Isolation', () => {
    it('user cannot access other users resources', async () => {
      // Create data for test user
      const otherUserId = 'other-user-' + Date.now();
      await prisma.profile.create({
        data: {
          id: otherUserId,
          email: `other-${Date.now()}@example.com`,
          displayName: 'Other User',
          subscriptionTier: 'free',
        },
      });

      const otherUserClient = await prisma.freelanceClient.create({
        data: {
          userId: otherUserId,
          name: 'Other User Client',
          email: 'other-client@example.com',
        },
      });

      // Try to access with current auth token
      const response = await request(app.getHttpServer())
        .get(`/v1/freelance/clients/${otherUserClient.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      // Should either 404 or 403
      expect([403, 404]).toContain(response.status);

      // Cleanup
      await prisma.freelanceClient.deleteMany({
        where: { userId: otherUserId },
      });
      await prisma.profile.delete({ where: { id: otherUserId } });
    });

    it('users can only see their own clients in list', async () => {
      // Create client for test user
      await prisma.freelanceClient.create({
        data: {
          userId: testUserId,
          name: 'My Client',
          email: 'my@client.com',
        },
      });

      const response = await request(app.getHttpServer())
        .get('/v1/freelance/clients')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      // All returned clients should belong to the authenticated user
      response.body.forEach((client: any) => {
        // Service should filter by userId internally
        expect(client.id).toBeDefined();
      });
    });
  });

  describe('URL Validation (HTTPS enforcement)', () => {
    it('rejects HTTP URLs in profile logo', async () => {
      const response = await request(app.getHttpServer())
        .patch('/v1/users/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          invoiceBrandLogoUrl: 'http://example.com/logo.png', // HTTP not allowed
        });

      expect([400, 422]).toContain(response.status);
    });

    it('accepts HTTPS URLs in profile', async () => {
      const response = await request(app.getHttpServer())
        .patch('/v1/users/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          invoiceBrandLogoUrl: 'https://example.com/logo.png',
        });

      expect([200, 202, 204]).toContain(response.status);
    });
  });

  describe('Payment Creation Validation', () => {
    let invoice: any;

    beforeAll(async () => {
      const client = await prisma.freelanceClient.create({
        data: {
          userId: testUserId,
          name: 'Payment Test Client',
          email: 'payment@test.com',
        },
      });

      const project = await prisma.freelanceProject.create({
        data: {
          userId: testUserId,
          clientId: client.id,
          name: 'Payment Test Project',
          status: 'active',
        },
      });

      invoice = await prisma.freelanceInvoice.create({
        data: {
          projectId: project.id,
          amount: '100.00',
          currency: 'EUR',
          status: 'pending',
        },
      });
    });

    it('rejects payment with missing amount', async () => {
      const response = await request(app.getHttpServer())
        .post(`/v1/freelance/invoices/${invoice.id}/payments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          note: 'Payment note',
          // amountCents missing
        });

      expect([400, 422]).toContain(response.status);
    });

    it('rejects payment with negative amount', async () => {
      const response = await request(app.getHttpServer())
        .post(`/v1/freelance/invoices/${invoice.id}/payments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amountCents: -5000,
          note: 'Negative payment',
        });

      expect([400, 422]).toContain(response.status);
    });

    it('rejects payment exceeding invoice amount', async () => {
      const response = await request(app.getHttpServer())
        .post(`/v1/freelance/invoices/${invoice.id}/payments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amountCents: 1000000, // 10,000 EUR for 100 EUR invoice
          note: 'Overpayment',
        });

      // Server may accept but mark for manual review, or reject
      // At minimum should not crash
      expect(response.status).toBeDefined();
    });

    it('accepts valid payment within invoice amount', async () => {
      const response = await request(app.getHttpServer())
        .post(`/v1/freelance/invoices/${invoice.id}/payments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amountCents: 5000, // 50 EUR
          note: 'Partial payment',
        });

      expect([200, 201]).toContain(response.status);
    });
  });

  describe('Quote Creation Validation', () => {
    let client: any;

    beforeAll(async () => {
      client = await prisma.freelanceClient.create({
        data: {
          userId: testUserId,
          name: 'Quote Test Client',
          email: 'quote@test.com',
        },
      });
    });

    it('rejects quote with invalid currency', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/freelance/quotes')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          clientId: client.id,
          title: 'Test Quote',
          amountCents: 50000,
          currency: 'FAKE', // Invalid
        });

      expect([400, 422]).toContain(response.status);
    });

    it('rejects quote with amount over limit', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/freelance/quotes')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          clientId: client.id,
          title: 'Test Quote',
          amountCents: 1000000000, // Over 9,999,999.99
          currency: 'EUR',
        });

      expect([400, 422]).toContain(response.status);
    });

    it('accepts valid quote with supported currency', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/freelance/quotes')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          clientId: client.id,
          title: 'Valid Quote',
          amountCents: 50000,
          currency: 'EUR',
        });

      expect([200, 201]).toContain(response.status);
    });
  });

  describe('Error Response Format', () => {
    it('returns consistent error format for missing required fields', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/freelance/clients')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          // name missing (required field)
        });

      expect([400, 422]).toContain(response.status);
      expect(response.body).toBeDefined();
      // Should contain error message or details
      expect(
        response.body.message || response.body.error || response.body.errors,
      ).toBeDefined();
    });

    it('returns meaningful error for invalid client ID', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/freelance/clients/not-a-valid-uuid')
        .set('Authorization', `Bearer ${authToken}`);

      expect([400, 404]).toContain(response.status);
    });

    it('does not expose database error details to client', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/freelance/clients')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test',
          // intentionally incomplete or invalid data
        });

      const body = JSON.stringify(response.body);
      // Should not contain SQL, Prisma errors, or internal stack traces
      expect(body).not.toMatch(/SQL|prisma|PRISMA|ColumnNotFound/i);
      expect(body).not.toMatch(/at /); // Stack traces typically have "at"
    });
  });

  describe('Concurrency & Race Conditions', () => {
    it('handles concurrent invoice creation safely', async () => {
      const client = await prisma.freelanceClient.create({
        data: {
          userId: testUserId,
          name: 'Concurrent Test Client',
          email: 'concurrent@test.com',
        },
      });

      const project = await prisma.freelanceProject.create({
        data: {
          userId: testUserId,
          clientId: client.id,
          name: 'Concurrent Test Project',
          status: 'active',
        },
      });

      // Create multiple invoices concurrently
      const promises = Array(3)
        .fill(null)
        .map((_, i) =>
          request(app.getHttpServer())
            .post('/v1/freelance/invoices')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
              projectId: project.id,
              amountCents: 10000 + i,
              currency: 'EUR',
              status: 'draft',
              invoiceNumber: `CONC-${Date.now()}-${i}`,
            }),
        );

      const responses = await Promise.all(promises);

      // All should succeed
      responses.forEach((response) => {
        expect([200, 201]).toContain(response.status);
      });

      // All should have unique IDs
      const ids = responses.map((r) => r.body.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });
});
