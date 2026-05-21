import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { FirebaseAdminModule } from '../common/firebase/firebase-admin.module.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [CommonModule, PrismaModule, FirebaseAdminModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
