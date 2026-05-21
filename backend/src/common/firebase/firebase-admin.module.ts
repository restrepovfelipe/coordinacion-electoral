import { Module } from '@nestjs/common';
import { FirebaseAdminService } from './firebase-admin.service.js';

@Module({
  providers: [FirebaseAdminService],
  exports: [FirebaseAdminService],
})
export class FirebaseAdminModule {}
