import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { AuthModule } from '../auth/auth.module';
import { LoggerModule } from '../common/logger.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ClientPortalController } from './client-portal.controller';
import { ClientPortalService } from './client-portal.service';

@Module({
  imports: [
    AuthModule,
    PrismaModule,
    JwtModule.register({
      secret: process.env.JWT_CLIENT_SECRET || 'client-portal-secret',
      signOptions: { expiresIn: '24h' },
    }),
    LoggerModule,
  ],
  controllers: [ClientPortalController],
  providers: [ClientPortalService],
  exports: [ClientPortalService],
})
export class ClientPortalModule {}
