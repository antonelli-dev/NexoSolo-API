import {
  Controller,
  Get,
  Post,
  UseGuards,
  Req,
  Param,
  Body,
} from '@nestjs/common';
import { RoleService } from './role.strategy';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { Request } from 'express';

type Authed = Request & { user: { sub: string } };

@Controller('v1/roles')
@UseGuards(JwtAuthGuard)
export class RolesController {
  constructor(private readonly roleService: RoleService) {}

  @Get('dashboard')
  async getDashboard(@Req() req: Authed) {
    return this.roleService.getUserDashboard(req.user.sub);
  }

  @Get('permissions')
  async getPermissions(@Req() req: Authed) {
    return this.roleService.getUserPermissions(req.user.sub);
  }

  @Get('features')
  async getFeatures(@Req() req: Authed) {
    return this.roleService.getUserFeatures(req.user.sub);
  }

  @Post('check-access')
  async checkAccess(
    @Req() req: Authed,
    @Body() body: { resource: string }
  ) {
    return {
      canAccess: await this.roleService.canUserAccess(req.user.sub, body.resource)
    };
  }

  @Get('ui-components')
  async getUiComponents(@Req() req: Authed) {
    const strategy = await this.roleService.getUserRoleStrategy(req.user.sub);
    return strategy.getUiComponents(req.user.sub);
  }

  @Get('api-endpoints')
  async getApiEndpoints(@Req() req: Authed) {
    const strategy = await this.roleService.getUserRoleStrategy(req.user.sub);
    return strategy.getApiEndpoints(req.user.sub);
  }
}
