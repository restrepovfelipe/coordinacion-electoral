import { Module } from '@nestjs/common';
import { FirebaseAdminModule } from '../common/firebase/firebase-admin.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthGuard } from '../common/guards/auth.guard.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

@Module({
  imports: [FirebaseAdminModule, PrismaModule],
  controllers: [AuthController],
  providers: [AuthGuard, AuthService],
})
export class AuthModule {}
