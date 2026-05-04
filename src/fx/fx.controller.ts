import { Controller, Get, Req, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import type { Request } from 'express';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FxService } from './fx.service';

type Authed = Request & { user: { sub: string } };

@Controller('v1/fx')
@UseGuards(JwtAuthGuard)
export class FxController {
  constructor(private readonly fx: FxService) {}

  /** ECB daily rates (EUR base). Cached ~1h on the server. */
  @Get('ecb-latest')
  async ecbLatest(@Req() _req: Authed) {
    try {
      return await this.fx.getEcbLatestFromEur();
    } catch (error) {
      // Si falla la API externa, devolver error 503 Service Unavailable
      throw new HttpException(
        'Exchange rate service temporarily unavailable',
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }
  }
}
