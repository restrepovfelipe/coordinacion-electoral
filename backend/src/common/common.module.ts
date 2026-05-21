import { Module } from '@nestjs/common';
import { FirebaseAdminModule } from './firebase/firebase-admin.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { AuthGuard } from './guards/auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { ScopeGuard } from './guards/scope.guard.js';

@Module({
  imports: [FirebaseAdminModule, PrismaModule, PermissionsModule],
  providers: [AuthGuard, RolesGuard, ScopeGuard],
  exports: [AuthGuard, RolesGuard, ScopeGuard, FirebaseAdminModule],
})
export class CommonModule {}
