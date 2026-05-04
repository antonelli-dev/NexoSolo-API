import { Module } from '@nestjs/common';
import { RolesController } from './roles.controller';
import { RoleService, RoleStrategyFactory } from './role.strategy';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [RolesController],
  providers: [RoleService, RoleStrategyFactory],
  exports: [RoleService, RoleStrategyFactory],
})
export class RolesModule {}
