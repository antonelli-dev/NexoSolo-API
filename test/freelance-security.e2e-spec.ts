import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { configureApp } from '../src/bootstrap/configure-app';
import { AppModule } from '../src/app.module';

describe('Freelance API security (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /v1/freelance/clients without Authorization returns 401', () => {
    return request(app.getHttpServer())
      .get('/v1/freelance/clients')
      .expect(401);
  });

  it('POST /v1/auth/bootstrap without Authorization returns 401', () => {
    return request(app.getHttpServer())
      .post('/v1/auth/bootstrap')
      .send({})
      .expect(401);
  });
});
