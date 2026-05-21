import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PermissionsService } from './permissions.service.js';

@Module({
  imports: [PrismaModule],
  providers: [PermissionsService],
  exports: [PermissionsService],
})
export class PermissionsModule {}
