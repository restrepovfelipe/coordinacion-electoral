import { Injectable } from '@nestjs/common';
import { initializeApp, getApps, applicationDefault } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';

@Injectable()
export class FirebaseAdminService {
  readonly auth: Auth;

  constructor() {
    if (getApps().length === 0) {
      // projectId must be explicit: Cloud Run auto-sets GOOGLE_CLOUD_PROJECT=coordinacion-electoral
      // (the GCP project), but Firebase Auth tokens carry aud=comando-electoral-amva (the Firebase
      // project). Without this, verifyIdToken throws an aud-mismatch error → silent 401 for everyone.
      initializeApp({ credential: applicationDefault(), projectId: 'comando-electoral-amva' });
    }
    this.auth = getAuth();
  }
}
