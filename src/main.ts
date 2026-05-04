import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { configureApp } from './bootstrap/configure-app';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });
  configureApp(app);

  if (process.env.SWAGGER !== '0') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('LetraScope API')
      .setDescription('Freelance / CRM REST API (JWT Bearer).')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api', app, document);
  }

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  if (process.env.NODE_ENV === 'production') {
    console.log(
      JSON.stringify({
        level: 'log',
        time: new Date().toISOString(),
        msg: 'Nest listening',
        port: Number(port),
      }),
    );
  } else {
    // eslint-disable-next-line no-console
    console.log(`Listening on http://localhost:${port}`);
  }

  // Graceful shutdown handling
  const gracefulShutdown = async (signal: string) => {
    console.log(`Received ${signal}, starting graceful shutdown...`);
    await app.close();
    console.log('Graceful shutdown completed');
    process.exit(0);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

bootstrap().catch((error) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});
