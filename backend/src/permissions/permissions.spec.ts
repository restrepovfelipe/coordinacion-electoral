import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, HttpException, UnauthorizedException } from '@nestjs/common';
import { Role, ScopeType } from '@prisma/client';
import { of } from 'rxjs';
import { firstValueFrom } from 'rxjs';

import { PermissionsService } from './permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../common/guards/auth.guard';
import { FirebaseAdminService } from '../common/firebase/firebase-admin.service';
import { MustChangePasswordInterceptor } from '../common/interceptors/must-change-password.interceptor';
import { UserWithScopes } from '../common/types/request-with-user';

// ─── helpers ────────────────────────────────────────────────────────────────

function makeUser(
  role: Role,
  scopes: Array<{ scopeType: ScopeType; scopeId: number }>,
): UserWithScopes {
  return {
    id: 1,
    username: 'test',
    displayName: 'Test User',
    phone: null,
    notes: null,
    role,
    active: true,
    cipUid: 'mock-uid',
    mustChangePassword: false,
    createdAt: new Date(),
    createdByUserId: null,
    lastLoginAt: null,
    scopes: scopes.map((s, i) => ({ id: i + 1, userId: 1, ...s })),
    testigosCreated: [],
    abogadosCreated: [],
    movilidadCreated: [],
    refrigeriosCreated: [],
    comparendosCreated: [],
    auditEntries: [],
  } as unknown as UserWithScopes;
}

// ─── Section 1: PermissionsService ──────────────────────────────────────────

describe('PermissionsService', () => {
  let service: PermissionsService;
  let prisma: {
    puesto: { findMany: jest.Mock; count: jest.Mock };
    municipio: { count: jest.Mock };
    comuna: { count: jest.Mock };
    $queryRaw: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      puesto: { findMany: jest.fn(), count: jest.fn() },
      municipio: { count: jest.fn() },
      comuna: { count: jest.fn() },
      $queryRaw: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<PermissionsService>(PermissionsService);
  });

  // ── SUPER_ADMIN ────────────────────────────────────────────────────────────

  describe('SUPER_ADMIN', () => {
    it('canAccess SUBREGION → true', async () => {
      const user = makeUser(Role.SUPER_ADMIN, []);
      expect(await service.canAccess(user, ScopeType.SUBREGION, 1)).toBe(true);
    });

    it('canAccess MUNICIPIO → true', async () => {
      const user = makeUser(Role.SUPER_ADMIN, []);
      expect(await service.canAccess(user, ScopeType.MUNICIPIO, 1)).toBe(true);
    });

    it('canAccess ZONA → true', async () => {
      const user = makeUser(Role.SUPER_ADMIN, []);
      expect(await service.canAccess(user, ScopeType.ZONA, 1)).toBe(true);
    });

    it('canAccess COMUNA → true', async () => {
      const user = makeUser(Role.SUPER_ADMIN, []);
      expect(await service.canAccess(user, ScopeType.COMUNA, 1)).toBe(true);
    });

    it('canAccess PUESTO → true', async () => {
      const user = makeUser(Role.SUPER_ADMIN, []);
      expect(await service.canAccess(user, ScopeType.PUESTO, 1)).toBe(true);
    });

    it('accessiblePuestoIds returns all puestos from findMany', async () => {
      const user = makeUser(Role.SUPER_ADMIN, []);
      prisma.puesto.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
      const ids = await service.accessiblePuestoIds(user);
      expect(ids).toEqual(new Set([1, 2, 3]));
    });
  });

  // ── REGIONAL_COORDINATOR ──────────────────────────────────────────────────

  describe('REGIONAL_COORDINATOR (scope: SUBREGION 5)', () => {
    let user: UserWithScopes;

    beforeEach(() => {
      user = makeUser(Role.REGIONAL_COORDINATOR, [
        { scopeType: ScopeType.SUBREGION, scopeId: 5 },
      ]);
    });

    it('canAccess PUESTO 10 → true (in accessible set)', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 10n }, { id: 11n }]);
      expect(await service.canAccess(user, ScopeType.PUESTO, 10)).toBe(true);
    });

    it('canAccess PUESTO 99 → false (not in accessible set)', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 10n }, { id: 11n }]);
      expect(await service.canAccess(user, ScopeType.PUESTO, 99)).toBe(false);
    });

    it('canAccess MUNICIPIO 3 → true (puesto count > 0)', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 10n }, { id: 11n }]);
      prisma.puesto.count.mockResolvedValue(1);
      expect(await service.canAccess(user, ScopeType.MUNICIPIO, 3)).toBe(true);
    });

    it('canAccess MUNICIPIO 999 → false (puesto count = 0)', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 10n }, { id: 11n }]);
      prisma.puesto.count.mockResolvedValue(0);
      expect(await service.canAccess(user, ScopeType.MUNICIPIO, 999)).toBe(false);
    });

    it('canAccess SUBREGION 5 → true (municipio count > 0)', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 10n }, { id: 11n }]);
      prisma.municipio.count.mockResolvedValue(1);
      expect(await service.canAccess(user, ScopeType.SUBREGION, 5)).toBe(true);
    });

    it('canAccess SUBREGION 999 → false (municipio count = 0)', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 10n }, { id: 11n }]);
      prisma.municipio.count.mockResolvedValue(0);
      expect(await service.canAccess(user, ScopeType.SUBREGION, 999)).toBe(false);
    });

    it('canAccess ZONA 1 → true (comuna count > 0)', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 10n }, { id: 11n }]);
      prisma.comuna.count.mockResolvedValue(1);
      expect(await service.canAccess(user, ScopeType.ZONA, 1)).toBe(true);
    });

    it('canAccess COMUNA 8 → true (puesto count > 0)', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 10n }, { id: 11n }]);
      prisma.puesto.count.mockResolvedValue(1);
      expect(await service.canAccess(user, ScopeType.COMUNA, 8)).toBe(true);
    });
  });

  // ── MUNICIPAL_COORDINATOR ─────────────────────────────────────────────────

  describe('MUNICIPAL_COORDINATOR (scope: MUNICIPIO 7)', () => {
    let user: UserWithScopes;

    beforeEach(() => {
      user = makeUser(Role.MUNICIPAL_COORDINATOR, [
        { scopeType: ScopeType.MUNICIPIO, scopeId: 7 },
      ]);
    });

    it('canAccess PUESTO 20 → true (in accessible set)', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 20n }, { id: 21n }]);
      expect(await service.canAccess(user, ScopeType.PUESTO, 20)).toBe(true);
    });

    it('canAccess PUESTO 99 → false (not in accessible set)', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 20n }, { id: 21n }]);
      expect(await service.canAccess(user, ScopeType.PUESTO, 99)).toBe(false);
    });

    it('canAccess MUNICIPIO 7 → true (puesto count > 0 for municipioId 7)', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 20n }, { id: 21n }]);
      prisma.puesto.count.mockResolvedValue(1);
      expect(await service.canAccess(user, ScopeType.MUNICIPIO, 7)).toBe(true);
    });

    it('canAccess MUNICIPIO 999 → false (puesto count = 0)', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 20n }, { id: 21n }]);
      prisma.puesto.count.mockResolvedValue(0);
      expect(await service.canAccess(user, ScopeType.MUNICIPIO, 999)).toBe(false);
    });

    it('canAccess SUBREGION 2 → true (municipio count > 0)', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 20n }, { id: 21n }]);
      prisma.municipio.count.mockResolvedValue(1);
      expect(await service.canAccess(user, ScopeType.SUBREGION, 2)).toBe(true);
    });

    it('canAccess ZONA 3 → true (comuna count > 0)', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 20n }, { id: 21n }]);
      prisma.comuna.count.mockResolvedValue(1);
      expect(await service.canAccess(user, ScopeType.ZONA, 3)).toBe(true);
    });

    it('canAccess COMUNA 12 → true (puesto count > 0)', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 20n }, { id: 21n }]);
      prisma.puesto.count.mockResolvedValue(1);
      expect(await service.canAccess(user, ScopeType.COMUNA, 12)).toBe(true);
    });
  });

  // ── ZONE_COORDINATOR ──────────────────────────────────────────────────────

  describe('ZONE_COORDINATOR (scope: ZONA 2)', () => {
    let user: UserWithScopes;

    beforeEach(() => {
      user = makeUser(Role.ZONE_COORDINATOR, [
        { scopeType: ScopeType.ZONA, scopeId: 2 },
      ]);
    });

    it('canAccess PUESTO 30 → true (in accessible set)', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 30n }, { id: 31n }]);
      expect(await service.canAccess(user, ScopeType.PUESTO, 30)).toBe(true);
    });

    it('canAccess PUESTO 99 → false (not in accessible set)', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 30n }, { id: 31n }]);
      expect(await service.canAccess(user, ScopeType.PUESTO, 99)).toBe(false);
    });

    it('canAccess ZONA 2 → true (comuna count > 0)', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 30n }, { id: 31n }]);
      prisma.comuna.count.mockResolvedValue(1);
      expect(await service.canAccess(user, ScopeType.ZONA, 2)).toBe(true);
    });

    it('canAccess ZONA 999 → false (comuna count = 0)', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 30n }, { id: 31n }]);
      prisma.comuna.count.mockResolvedValue(0);
      expect(await service.canAccess(user, ScopeType.ZONA, 999)).toBe(false);
    });

    it('canAccess MUNICIPIO 5 → true (puesto count > 0)', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 30n }, { id: 31n }]);
      prisma.puesto.count.mockResolvedValue(1);
      expect(await service.canAccess(user, ScopeType.MUNICIPIO, 5)).toBe(true);
    });

    it('canAccess SUBREGION 1 → true (municipio count > 0)', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 30n }, { id: 31n }]);
      prisma.municipio.count.mockResolvedValue(1);
      expect(await service.canAccess(user, ScopeType.SUBREGION, 1)).toBe(true);
    });

    it('canAccess COMUNA 9 → true (puesto count > 0)', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 30n }, { id: 31n }]);
      prisma.puesto.count.mockResolvedValue(1);
      expect(await service.canAccess(user, ScopeType.COMUNA, 9)).toBe(true);
    });
  });

  // ── COMUNA_COORDINATOR ────────────────────────────────────────────────────

  describe('COMUNA_COORDINATOR (scope: COMUNA 15)', () => {
    let user: UserWithScopes;

    beforeEach(() => {
      user = makeUser(Role.COMUNA_COORDINATOR, [
        { scopeType: ScopeType.COMUNA, scopeId: 15 },
      ]);
    });

    it('canAccess PUESTO 40 → true (in accessible set)', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 40n }, { id: 41n }]);
      expect(await service.canAccess(user, ScopeType.PUESTO, 40)).toBe(true);
    });

    it('canAccess PUESTO 99 → false (not in accessible set)', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 40n }, { id: 41n }]);
      expect(await service.canAccess(user, ScopeType.PUESTO, 99)).toBe(false);
    });

    it('canAccess COMUNA 15 → true (puesto count > 0)', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 40n }, { id: 41n }]);
      prisma.puesto.count.mockResolvedValue(1);
      expect(await service.canAccess(user, ScopeType.COMUNA, 15)).toBe(true);
    });

    it('canAccess COMUNA 999 → false (puesto count = 0)', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 40n }, { id: 41n }]);
      prisma.puesto.count.mockResolvedValue(0);
      expect(await service.canAccess(user, ScopeType.COMUNA, 999)).toBe(false);
    });

    it('canAccess MUNICIPIO 4 → true (puesto count > 0)', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 40n }, { id: 41n }]);
      prisma.puesto.count.mockResolvedValue(1);
      expect(await service.canAccess(user, ScopeType.MUNICIPIO, 4)).toBe(true);
    });

    it('canAccess SUBREGION 1 → true (municipio count > 0)', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 40n }, { id: 41n }]);
      prisma.municipio.count.mockResolvedValue(1);
      expect(await service.canAccess(user, ScopeType.SUBREGION, 1)).toBe(true);
    });

    it('canAccess ZONA 2 → true (comuna count > 0)', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 40n }, { id: 41n }]);
      prisma.comuna.count.mockResolvedValue(1);
      expect(await service.canAccess(user, ScopeType.ZONA, 2)).toBe(true);
    });
  });

  // ── PUESTO_COORDINATOR ────────────────────────────────────────────────────

  describe('PUESTO_COORDINATOR (scope: PUESTO 50)', () => {
    let user: UserWithScopes;

    beforeEach(() => {
      user = makeUser(Role.PUESTO_COORDINATOR, [
        { scopeType: ScopeType.PUESTO, scopeId: 50 },
      ]);
    });

    it('canAccess PUESTO 50 → true (in accessible set)', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 50n }]);
      expect(await service.canAccess(user, ScopeType.PUESTO, 50)).toBe(true);
    });

    it('canAccess PUESTO 51 → false (not in accessible set)', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 50n }]);
      expect(await service.canAccess(user, ScopeType.PUESTO, 51)).toBe(false);
    });

    it('canAccess MUNICIPIO X → false (puesto 50 not in that municipio)', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 50n }]);
      prisma.puesto.count.mockResolvedValue(0);
      expect(await service.canAccess(user, ScopeType.MUNICIPIO, 999)).toBe(false);
    });

    it('canAccess SUBREGION X → false (no puestos in that subregion)', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 50n }]);
      prisma.municipio.count.mockResolvedValue(0);
      expect(await service.canAccess(user, ScopeType.SUBREGION, 999)).toBe(false);
    });

    it('canAccess ZONA X → false (no comunas in that zona)', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 50n }]);
      prisma.comuna.count.mockResolvedValue(0);
      expect(await service.canAccess(user, ScopeType.ZONA, 999)).toBe(false);
    });

    it('canAccess COMUNA X → false (puesto not in that comuna)', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 50n }]);
      prisma.puesto.count.mockResolvedValue(0);
      expect(await service.canAccess(user, ScopeType.COMUNA, 999)).toBe(false);
    });

    it('canAccess MUNICIPIO 7 → true (puesto count > 0)', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 50n }]);
      prisma.puesto.count.mockResolvedValue(1);
      expect(await service.canAccess(user, ScopeType.MUNICIPIO, 7)).toBe(true);
    });

    it('canAccess SUBREGION 1 → true (municipio count > 0)', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 50n }]);
      prisma.municipio.count.mockResolvedValue(1);
      expect(await service.canAccess(user, ScopeType.SUBREGION, 1)).toBe(true);
    });

    it('canAccess ZONA 2 → true (comuna count > 0)', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 50n }]);
      prisma.comuna.count.mockResolvedValue(1);
      expect(await service.canAccess(user, ScopeType.ZONA, 2)).toBe(true);
    });

    it('canAccess COMUNA 6 → true (puesto count > 0)', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 50n }]);
      prisma.puesto.count.mockResolvedValue(1);
      expect(await service.canAccess(user, ScopeType.COMUNA, 6)).toBe(true);
    });
  });

  // ── default / unknown scopeType ───────────────────────────────────────────

  describe('canAccess with unknown scopeType (default branch)', () => {
    it('returns false for an unknown scope type', async () => {
      const user = makeUser(Role.MUNICIPAL_COORDINATOR, [
        { scopeType: ScopeType.MUNICIPIO, scopeId: 1 },
      ]);
      prisma.$queryRaw.mockResolvedValue([{ id: 5n }]);
      // Cast to bypass TypeScript enum check and exercise the default branch
      const result = await service.canAccess(user, 'UNKNOWN_TYPE' as ScopeType, 1);
      expect(result).toBe(false);
    });
  });

  // ── ZONE_COORDINATOR Amendment 4 — Nororiental named cases ──────────────

  describe('ZONE_COORDINATOR Amendment 4 — Nororiental named cases', () => {
    const norientalUser = makeUser(Role.ZONE_COORDINATOR, [{ scopeType: ScopeType.ZONA, scopeId: 3 }]);
    // zona 3 = "Nororiental" in our test setup

    beforeEach(() => {
      // CTE returns puestos 101, 102, 103 — those in Nororiental's comunas
      prisma.$queryRaw.mockResolvedValue([{ id: 101n }, { id: 102n }, { id: 103n }]);
    });

    it('puesto in Nororiental zona is accessible', async () => {
      const result = await service.canAccess(norientalUser, ScopeType.PUESTO, 101);
      expect(result).toBe(true);
    });

    it('puesto in a different zona (Sur Oriental) is NOT accessible', async () => {
      // puesto 200 is not in the accessible set (Nororiental only returns 101-103)
      const result = await service.canAccess(norientalUser, ScopeType.PUESTO, 200);
      expect(result).toBe(false);
    });

    it('puesto outside Medellín entirely is NOT accessible', async () => {
      // puesto 300 is in a different municipio, not accessible to this zona coordinator
      const result = await service.canAccess(norientalUser, ScopeType.PUESTO, 300);
      expect(result).toBe(false);
    });
  });

  // ── accessiblePuestoIds: empty result ─────────────────────────────────────

  describe('accessiblePuestoIds', () => {
    it('returns empty set when $queryRaw returns no rows', async () => {
      const user = makeUser(Role.MUNICIPAL_COORDINATOR, [
        { scopeType: ScopeType.MUNICIPIO, scopeId: 1 },
      ]);
      prisma.$queryRaw.mockResolvedValue([]);
      const ids = await service.accessiblePuestoIds(user);
      expect(ids).toEqual(new Set());
    });

    it('correctly converts bigint ids to numbers', async () => {
      const user = makeUser(Role.MUNICIPAL_COORDINATOR, [
        { scopeType: ScopeType.MUNICIPIO, scopeId: 1 },
      ]);
      prisma.$queryRaw.mockResolvedValue([{ id: 1n }, { id: 2n }, { id: 9007199254740991n }]);
      const ids = await service.accessiblePuestoIds(user);
      expect(ids.has(1)).toBe(true);
      expect(ids.has(2)).toBe(true);
    });
  });
});

// ─── Section 2: AuthGuard ────────────────────────────────────────────────────

describe('AuthGuard', () => {
  let guard: AuthGuard;
  const mockVerifyIdToken = jest.fn();
  const mockFindUnique = jest.fn();

  const mockFirebaseAdmin = {
    auth: { verifyIdToken: mockVerifyIdToken },
  };

  const mockPrisma = {
    user: { findUnique: mockFindUnique },
  };

  function makeContext(headers: Record<string, string> = {}): ExecutionContext {
    const req = { headers, user: undefined as unknown };
    return {
      switchToHttp: () => ({
        getRequest: () => req,
      }),
    } as unknown as ExecutionContext;
  }

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthGuard,
        { provide: FirebaseAdminService, useValue: mockFirebaseAdmin },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    guard = module.get<AuthGuard>(AuthGuard);
  });

  it('valid token + active user → returns true and sets req.user', async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    mockVerifyIdToken.mockResolvedValue({
      uid: 'mock-uid-1',
      auth_time: nowSeconds - 100, // recent session
    });

    const activeUser = makeUser(Role.SUPER_ADMIN, []);
    mockFindUnique.mockResolvedValue(activeUser);

    const ctx = makeContext({ authorization: 'Bearer mock-cip-token' });
    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(mockVerifyIdToken).toHaveBeenCalledWith('mock-cip-token');
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { cipUid: 'mock-uid-1' },
      include: { scopes: true },
    });
  });

  it('no Authorization header → throws UnauthorizedException', async () => {
    const ctx = makeContext({});
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    expect(mockVerifyIdToken).not.toHaveBeenCalled();
  });

  it('invalid/expired token (verifyIdToken throws) → throws UnauthorizedException', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('Token expired'));
    const ctx = makeContext({ authorization: 'Bearer bad-mock-token' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('expired session (auth_time > 3600s ago) → throws UnauthorizedException with SESSION_EXPIRED', async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    mockVerifyIdToken.mockResolvedValue({
      uid: 'mock-uid-2',
      auth_time: nowSeconds - 4000, // > 3600 seconds ago
    });

    const ctx = makeContext({ authorization: 'Bearer mock-cip-token-old' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(
      new UnauthorizedException('SESSION_EXPIRED'),
    );
  });

  it('user not found in DB → throws UnauthorizedException', async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    mockVerifyIdToken.mockResolvedValue({
      uid: 'mock-uid-unknown',
      auth_time: nowSeconds - 100,
    });
    mockFindUnique.mockResolvedValue(null);

    const ctx = makeContext({ authorization: 'Bearer mock-cip-token-unknown' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('user found but inactive → throws UnauthorizedException', async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    mockVerifyIdToken.mockResolvedValue({
      uid: 'mock-uid-inactive',
      auth_time: nowSeconds - 100,
    });

    const inactiveUser = {
      ...makeUser(Role.MUNICIPAL_COORDINATOR, []),
      active: false,
    };
    mockFindUnique.mockResolvedValue(inactiveUser);

    const ctx = makeContext({ authorization: 'Bearer mock-cip-token-inactive' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('authorization header without Bearer prefix → throws UnauthorizedException', async () => {
    const ctx = makeContext({ authorization: 'Basic abc123' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    expect(mockVerifyIdToken).not.toHaveBeenCalled();
  });
});

// ─── Section 3: MustChangePasswordInterceptor ────────────────────────────────

describe('MustChangePasswordInterceptor', () => {
  let interceptor: MustChangePasswordInterceptor;

  function makeInterceptContext(
    url: string,
    user?: Partial<UserWithScopes>,
  ): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ url, user }),
      }),
    } as unknown as ExecutionContext;
  }

  const mockNext = { handle: () => of('response') };

  beforeEach(() => {
    interceptor = new MustChangePasswordInterceptor();
  });

  it('mustChangePassword=true + /api/subregiones → throws HttpException 412', async () => {
    const user = makeUser(Role.MUNICIPAL_COORDINATOR, []);
    const userWithFlag = { ...user, mustChangePassword: true };
    const ctx = makeInterceptContext('/api/subregiones', userWithFlag);

    expect(() => interceptor.intercept(ctx, mockNext)).toThrow(HttpException);

    try {
      interceptor.intercept(ctx, mockNext);
    } catch (e: unknown) {
      expect(e).toBeInstanceOf(HttpException);
      expect((e as HttpException).getStatus()).toBe(412);
      const response = (e as HttpException).getResponse() as { code: string };
      expect(response.code).toBe('PASSWORD_CHANGE_REQUIRED');
    }
  });

  it('mustChangePassword=true + /api/auth/me → passes through (exempt)', async () => {
    const user = makeUser(Role.MUNICIPAL_COORDINATOR, []);
    const userWithFlag = { ...user, mustChangePassword: true };
    const ctx = makeInterceptContext('/api/auth/me', userWithFlag);

    const result = interceptor.intercept(ctx, mockNext);
    const value = await firstValueFrom(result);
    expect(value).toBe('response');
  });

  it('mustChangePassword=true + /api/healthz → passes through (exempt)', async () => {
    const user = makeUser(Role.MUNICIPAL_COORDINATOR, []);
    const userWithFlag = { ...user, mustChangePassword: true };
    const ctx = makeInterceptContext('/api/healthz', userWithFlag);

    const result = interceptor.intercept(ctx, mockNext);
    const value = await firstValueFrom(result);
    expect(value).toBe('response');
  });

  it('mustChangePassword=false + /api/subregiones → passes through', async () => {
    const user = makeUser(Role.MUNICIPAL_COORDINATOR, []);
    const ctx = makeInterceptContext('/api/subregiones', user);

    const result = interceptor.intercept(ctx, mockNext);
    const value = await firstValueFrom(result);
    expect(value).toBe('response');
  });

  it('no user (unauthenticated) + /api/subregiones → passes through', async () => {
    const ctx = makeInterceptContext('/api/subregiones', undefined);

    const result = interceptor.intercept(ctx, mockNext);
    const value = await firstValueFrom(result);
    expect(value).toBe('response');
  });

  it('mustChangePassword=true + /api/auth/change-password → passes through (auth prefix exempt)', async () => {
    const user = makeUser(Role.SUPER_ADMIN, []);
    const userWithFlag = { ...user, mustChangePassword: true };
    const ctx = makeInterceptContext('/api/auth/change-password', userWithFlag);

    const result = interceptor.intercept(ctx, mockNext);
    const value = await firstValueFrom(result);
    expect(value).toBe('response');
  });
});
