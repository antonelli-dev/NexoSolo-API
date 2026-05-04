import { Module, forwardRef } from '@nestjs/common';
import { DocumentScannerController } from './document-scanner.controller';
import { DocumentScannerService } from './document-scanner.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [PrismaModule, forwardRef(() => AiModule)],
  controllers: [DocumentScannerController],
  providers: [DocumentScannerService],
  exports: [DocumentScannerService],
})
export class DocumentsModule {}
