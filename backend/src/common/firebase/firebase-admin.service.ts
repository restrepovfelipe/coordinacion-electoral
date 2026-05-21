import { Injectable } from '@nestjs/common';
import { initializeApp, getApps, applicationDefault } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';

@Injectable()
export class FirebaseAdminService {
  readonly auth: Auth;

  constructor() {
    if (getApps().length === 0) {
      initializeApp({ credential: applicationDefault() });
    }
    this.auth = getAuth();
  }
}
