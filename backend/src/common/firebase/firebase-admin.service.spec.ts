import { Test } from '@nestjs/testing';

// Capture the options passed to initializeApp so we can assert on them.
const mockInitializeApp = jest.fn();
const mockGetApps = jest.fn();
const mockGetAuth = jest.fn().mockReturnValue({});

jest.mock('firebase-admin/app', () => ({
  initializeApp: (...args: unknown[]) => mockInitializeApp(...args),
  getApps: () => mockGetApps(),
  applicationDefault: jest.fn().mockReturnValue({ type: 'applicationDefault' }),
}));
jest.mock('firebase-admin/auth', () => ({
  getAuth: () => mockGetAuth(),
}));

import { FirebaseAdminService } from './firebase-admin.service.js';

describe('FirebaseAdminService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('initialises with projectId=comando-electoral-amva when no app exists', async () => {
    mockGetApps.mockReturnValue([]);

    const module = await Test.createTestingModule({
      providers: [FirebaseAdminService],
    }).compile();
    module.get(FirebaseAdminService);

    expect(mockInitializeApp).toHaveBeenCalledTimes(1);
    const callArg = mockInitializeApp.mock.calls[0][0] as Record<string, unknown>;
    // This test MUST fail if someone removes or changes the explicit projectId —
    // that would silently break token verification for all users.
    expect(callArg.projectId).toBe('comando-electoral-amva');
  });

  it('skips initializeApp when an app is already registered', async () => {
    mockGetApps.mockReturnValue([{}]);

    const module = await Test.createTestingModule({
      providers: [FirebaseAdminService],
    }).compile();
    module.get(FirebaseAdminService);

    expect(mockInitializeApp).not.toHaveBeenCalled();
  });
});
