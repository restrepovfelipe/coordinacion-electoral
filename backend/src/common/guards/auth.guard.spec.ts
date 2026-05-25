import { ExecutionContext, Logger, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from './auth.guard.js';

function makeContext(headers: Record<string, string> = {}, query: Record<string, string> = {}) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers, query }),
    }),
  } as unknown as ExecutionContext;
}

const mockVerifyIdToken = jest.fn();
const mockFindUnique = jest.fn();

const firebaseAdmin = { auth: { verifyIdToken: mockVerifyIdToken } } as any;
const prisma = { user: { findUnique: mockFindUnique } } as any;

describe('AuthGuard', () => {
  let guard: AuthGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new AuthGuard(firebaseAdmin, prisma);
  });

  it('throws UnauthorizedException when no token is present', async () => {
    await expect(guard.canActivate(makeContext())).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException and LOGS the error when verifyIdToken rejects', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'error');
    mockVerifyIdToken.mockRejectedValue(new Error("Firebase ID token has incorrect 'aud' claim"));

    await expect(
      guard.canActivate(makeContext({ authorization: 'Bearer some-token' })),
    ).rejects.toThrow(UnauthorizedException);

    // This assertion MUST fail if the catch block becomes silent again.
    expect(logSpy).toHaveBeenCalledWith(
      'verifyIdToken failed',
      expect.stringContaining("incorrect 'aud' claim"),
    );
  });

  it('accepts a valid token whose auth_time is older than 3600 seconds (Firebase auto-refresh)', async () => {
    // auth_time is intentionally > 3600s ago — the old guard rejected these; the fixed guard must NOT.
    const fakeUser = { id: 2, cipUid: 'old-auth-uid', active: true, scopes: [] };
    mockVerifyIdToken.mockResolvedValue({
      uid: 'old-auth-uid',
      auth_time: Math.floor(Date.now() / 1000) - 7200, // 2 hours ago
    });
    mockFindUnique.mockResolvedValue(fakeUser);

    const req: Record<string, unknown> = { headers: { authorization: 'Bearer refreshed-token' }, query: {} };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(req.user).toBe(fakeUser);
  });

  it('throws UnauthorizedException when user is not found in DB', async () => {
    mockVerifyIdToken.mockResolvedValue({
      uid: 'missing-uid',
      auth_time: Math.floor(Date.now() / 1000) - 7200, // old auth_time — must still work up to DB check
    });
    mockFindUnique.mockResolvedValue(null);

    await expect(
      guard.canActivate(makeContext({ authorization: 'Bearer valid-token' })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when user.active is false', async () => {
    mockVerifyIdToken.mockResolvedValue({
      uid: 'inactive-uid',
      auth_time: Math.floor(Date.now() / 1000) - 7200, // old auth_time — guard must reach the active check
    });
    mockFindUnique.mockResolvedValue({ cipUid: 'inactive-uid', active: false, scopes: [] });

    await expect(
      guard.canActivate(makeContext({ authorization: 'Bearer valid-token' })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('attaches user to request and returns true for a valid token', async () => {
    const fakeUser = { id: 1, cipUid: 'uid-ok', active: true, scopes: [] };
    mockVerifyIdToken.mockResolvedValue({
      uid: 'uid-ok',
      auth_time: Math.floor(Date.now() / 1000),
    });
    mockFindUnique.mockResolvedValue(fakeUser);

    const req: Record<string, unknown> = { headers: { authorization: 'Bearer good-token' }, query: {} };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(req.user).toBe(fakeUser);
  });
});
