import { Module } from '@nestjs/common';
import { PermissionsService } from './permissions.service.js';

// Skeleton — populated in T18: PermissionsService + transitive-scope CTE.
@Module({
  providers: [PermissionsService],
  exports: [PermissionsService],
})
export class PermissionsModule {}
