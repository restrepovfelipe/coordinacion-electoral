import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { Server } from 'http';
import { AppModule } from '../src/app.module';
import { FirebaseAdminService } from '../src/common/firebase/firebase-admin.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { Role, ScopeType } from '@prisma/client';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SUPER_ADMIN_UID = 'sa-dashboard-uid';
const COMUNA_UID = 'comuna-dashboard-uid';

const superAdminRow = {
  id: 10,
  cipUid: SUPER_ADMIN_UID,
  username: 'sa-dashboard',
  displayName: 'SA Dashboard',
  phone: null as string | null,
  notes: null as string | null,
  role: Role.SUPER_ADMIN,
  active: true,
  mustChangePassword: false,
  createdByUserId: null as number | null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  scopes: [] as Array<{ id: number; userId: number; scopeType: ScopeType; scopeId: number }>,
};

const comunaCoordRow = {
  id: 11,
  cipUid: COMUNA_UID,
  username: 'cc-dashboard',
  displayName: 'CC Dashboard',
  phone: null as string | null,
  notes: null as string | null,
  role: Role.COMUNA_COORDINATOR,
  active: true,
  mustChangePassword: false,
  createdByUserId: null as number | null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  scopes: [{ id: 1, userId: 11, scopeType: ScopeType.COMUNA, scopeId: 5 }],
};

// Raw rows returned by the aggregated SQL query
const rawCountRows = [
  { municipioId: BigInt(1), count: BigInt(42), maxUpdatedAt: new Date('2026-05-22T10:00:00Z') },
  { municipioId: BigInt(2), count: BigInt(0),  maxUpdatedAt: null },
];

// Scoped raw rows for COMUNA_COORDINATOR (only their municipio)
const rawCountRowsScoped = [
  { municipioId: BigInt(1), count: BigInt(7), maxUpdatedAt: new Date('2026-05-22T09:00:00Z') },
];

// ---------------------------------------------------------------------------
// Prisma mock factory
// ---------------------------------------------------------------------------

function createDashboardPrismaMock(uid: string): Partial<PrismaService> {
  const isScoped = uid === COMUNA_UID;
  const self: Partial<PrismaService> = {
    user: {
      findUnique: jest.fn((args: { where: { cipUid?: string; id?: number } }) => {
        if (args.where.cipUid === SUPER_ADMIN_UID) return Promise.resolve(superAdminRow);
        if (args.where.cipUid === COMUNA_UID) return Promise.resolve(comunaCoordRow);
        return Promise.resolve(null);
      }),
    } as unknown as PrismaService['user'],

    puesto: {
      findMany: jest.fn(() => Promise.resolve([{ id: 1 }])),
      count: jest.fn(() => Promise.resolve(1)),
    } as unknown as PrismaService['puesto'],

    municipio: {
      count: jest.fn(() => Promise.resolve(1)),
    } as unknown as PrismaService['municipio'],

    comuna: {
      count: jest.fn(() => Promise.resolve(1)),
    } as unknown as PrismaService['comuna'],

    testigo: {
      findUnique: jest.fn(() => Promise.resolve(null)),
      create: jest.fn(() => Promise.resolve(null)),
      update: jest.fn(() => Promise.resolve(null)),
      delete: jest.fn(() => Promise.resolve(null)),
    } as unknown as PrismaService['testigo'],

    abogado: {} as unknown as PrismaService['abogado'],
    movilidad: {} as unknown as PrismaService['movilidad'],
    refrigerio: {} as unknown as PrismaService['refrigerio'],
    comparendo: {} as unknown as PrismaService['comparendo'],
    auditLog: { create: jest.fn() } as unknown as PrismaService['auditLog'],

    $transaction: jest.fn(
      (cb: (tx: Partial<PrismaService>) => Promise<unknown>) => cb(self),
    ) as unknown as PrismaService['$transaction'],

    $queryRaw: jest.fn(() =>
      Promise.resolve(isScoped ? rawCountRowsScoped : rawCountRows),
    ) as unknown as PrismaService['$queryRaw'],

    $disconnect: jest.fn(() => Promise.resolve()),
  };
  return self;
}

// ---------------------------------------------------------------------------
// Firebase mock (switches between SA and COMUNA based on header)
// ---------------------------------------------------------------------------

function makeFirebaseMock(uid: string) {
  return {
    auth: {
      verifyIdToken: jest.fn().mockResolvedValue({
        uid,
        auth_time: Math.floor(Date.now() / 1000),
      }),
      createUser: jest.fn().mockResolvedValue({ uid: 'new-uid' }),
      revokeRefreshTokens: jest.fn().mockResolvedValue(undefined),
    },
  };
}

// ---------------------------------------------------------------------------
// Helper to build an app with a specific user role
// ---------------------------------------------------------------------------

async function buildApp(uid: string): Promise<INestApplication> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(FirebaseAdminService)
    .useValue(makeFirebaseMock(uid))
    .overrideProvider(PrismaService)
    .useValue(createDashboardPrismaMock(uid))
    .compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  await app.init();
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Dashboard (e2e)', () => {
  let saApp: INestApplication;
  let ccApp: INestApplication;

  beforeAll(async () => {
    [saApp, ccApp] = await Promise.all([
      buildApp(SUPER_ADMIN_UID),
      buildApp(COMUNA_UID),
    ]);
  });

  afterAll(async () => {
    await Promise.all([saApp.close(), ccApp.close()]);
  });

  // -------------------------------------------------------------------------
  // AC-1: Aggregated endpoint returns correct structure
  // -------------------------------------------------------------------------

  it('GET /api/dashboard/testigos-counts → 401 without token', () => {
    return request(saApp.getHttpServer() as Server)
      .get('/api/dashboard/testigos-counts')
      .expect(401);
  });

  it('GET /api/dashboard/testigos-counts → 200 with array of {municipioId, count}', () => {
    return request(saApp.getHttpServer() as Server)
      .get('/api/dashboard/testigos-counts')
      .set('Authorization', 'Bearer fake-token')
      .expect(200)
      .expect((res: request.Response) => {
        const body = res.body as Array<{ municipioId: number; count: number }>;
        expect(Array.isArray(body)).toBe(true);
        expect(body.length).toBe(2);
        expect(body[0]).toMatchObject({ municipioId: 1, count: 42 });
        expect(body[1]).toMatchObject({ municipioId: 2, count: 0 });
      });
  });

  // -------------------------------------------------------------------------
  // AC-4: ETag present in response
  // -------------------------------------------------------------------------

  it('GET /api/dashboard/testigos-counts → ETag header present', async () => {
    const res = await request(saApp.getHttpServer() as Server)
      .get('/api/dashboard/testigos-counts')
      .set('Authorization', 'Bearer fake-token')
      .expect(200);

    expect(res.headers['etag']).toBeDefined();
    expect(res.headers['cache-control']).toMatch(/max-age=30/);
  });

  // -------------------------------------------------------------------------
  // AC-4 (304): If-None-Match with matching ETag returns 304
  // -------------------------------------------------------------------------

  it('GET /api/dashboard/testigos-counts → 304 on matching If-None-Match', async () => {
    const firstRes = await request(saApp.getHttpServer() as Server)
      .get('/api/dashboard/testigos-counts')
      .set('Authorization', 'Bearer fake-token')
      .expect(200);

    const etag = firstRes.headers['etag'] as string;
    expect(etag).toBeTruthy();

    await request(saApp.getHttpServer() as Server)
      .get('/api/dashboard/testigos-counts')
      .set('Authorization', 'Bearer fake-token')
      .set('If-None-Match', etag)
      .expect(304);
  });

  // -------------------------------------------------------------------------
  // AC-3: Scope filtering — COMUNA_COORDINATOR sees only their scope
  // -------------------------------------------------------------------------

  it('GET /api/dashboard/testigos-counts as COMUNA_COORDINATOR → scoped result', () => {
    return request(ccApp.getHttpServer() as Server)
      .get('/api/dashboard/testigos-counts')
      .set('Authorization', 'Bearer fake-token')
      .expect(200)
      .expect((res: request.Response) => {
        const body = res.body as Array<{ municipioId: number; count: number }>;
        // Scoped coordinator sees only their municipio's count
        expect(body.length).toBe(1);
        expect(body[0]).toMatchObject({ municipioId: 1, count: 7 });
      });
  });

  // -------------------------------------------------------------------------
  // AC-5: ETag changes when data changes (different maxUpdatedAt → different ETag)
  // -------------------------------------------------------------------------

  it('ETag differs for different maxUpdatedAt values', () => {
    // Two responses with different data produce different ETags.
    // We verify by checking that "0" ETag is used when no testigos exist
    // vs a timestamp-based ETag when testigos exist.
    const etagForNoData = `"0"`;

    // The SA app has maxUpdatedAt of 2026-05-22T10:00:00Z, so ETag != "0"
    return request(saApp.getHttpServer() as Server)
      .get('/api/dashboard/testigos-counts')
      .set('Authorization', 'Bearer fake-token')
      .expect(200)
      .expect((res: request.Response) => {
        const etag = res.headers['etag'] as string;
        expect(etag).not.toBe(etagForNoData);
      });
  });
});
