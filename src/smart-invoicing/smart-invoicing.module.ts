import { Module } from '@nestjs/common';
import { SmartInvoicingController } from './smart-invoicing.controller';
import { SmartInvoicingService } from './smart-invoicing.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SmartInvoicingController],
  providers: [SmartInvoicingService],
  exports: [SmartInvoicingService],
})
export class SmartInvoicingModule {}
