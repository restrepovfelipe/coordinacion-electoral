import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { PermissionsModule } from '../../permissions/permissions.module.js';
import { ReferenceController } from './reference.controller.js';
import { ReferenceService } from './reference.service.js';

@Module({
  imports: [CommonModule, PrismaModule, PermissionsModule],
  controllers: [ReferenceController],
  providers: [ReferenceService],
})
export class ReferenceModule {}
