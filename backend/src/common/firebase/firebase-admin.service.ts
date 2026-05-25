import { Injectable } from '@nestjs/common';
import { initializeApp, getApps, applicationDefault } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';

@Injectable()
export class FirebaseAdminService {
  readonly auth: Auth;

  constructor() {
    if (getApps().length === 0) {
      // projectId must be explicit: the GCP project and the Firebase Auth project are both
      // coordinacion-electoral. Tokens carry aud=coordinacion-electoral (verified 2026-05-25
      // by live JWT decode). Cloud Run sets GOOGLE_CLOUD_PROJECT=coordinacion-electoral
      // automatically, but we keep this explicit so it is never ambiguous and the test asserts it.
      // NOTE: comando-electoral-amva was a separate Firebase project used in error — deprecated.
      initializeApp({ credential: applicationDefault(), projectId: 'coordinacion-electoral' });
    }
    this.auth = getAuth();
  }
}
