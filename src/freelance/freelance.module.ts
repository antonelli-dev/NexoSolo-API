import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { FreelanceController } from './freelance.controller';
import { FreelanceService } from './freelance.service';

@Module({
  imports: [PrismaModule],
  controllers: [FreelanceController],
  providers: [FreelanceService],
  exports: [FreelanceService],
})
export class FreelanceModule {}
