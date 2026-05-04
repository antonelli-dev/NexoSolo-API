import { Module } from '@nestjs/common';
import { DocumentScannerController } from './document-scanner.controller';
import { DocumentScannerService } from './document-scanner.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DocumentScannerController],
  providers: [DocumentScannerService],
  exports: [DocumentScannerService],
})
export class DocumentsModule {}
