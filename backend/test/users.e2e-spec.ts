import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { Server } from 'http';
import { AppModule } from '../src/app.module';
import { FirebaseAdminService } from '../src/common/firebase/firebase-admin.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { Role, ScopeType } from '@prisma/client';

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const SUPER_ADMIN_UID = 'super-admin-uid';
const VIEWER_UID = 'viewer-uid';

const makeUserRow = (
  id: number,
  role: Role,
  cipUid: string,
  active = true,
) => ({
  id,
  cipUid,
  username: `user${id}`,
  displayName: `User ${id}`,
  phone: null,
  notes: null,
  role,
  active,
  mustChangePassword: false,
  createdByUserId: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  scopes: [] as Array<{
    id: number;
    userId: number;
    scopeType: ScopeType;
    scopeId: number;
  }>,
});

const superAdminRow = makeUserRow(1, Role.SUPER_ADMIN, SUPER_ADMIN_UID);
const viewerRow = makeUserRow(2, Role.PUESTO_COORDINATOR, VIEWER_UID);
const targetUserRow = makeUserRow(3, Role.PUESTO_COORDINATOR, 'target-uid');

// ---------------------------------------------------------------------------
// Prisma mock factory
// ---------------------------------------------------------------------------

function createMockPrismaService(
  authenticatedUid: string,
): Partial<PrismaService> {
  const userByUid: Record<string, typeof superAdminRow> = {
    [SUPER_ADMIN_UID]: superAdminRow,
    [VIEWER_UID]: viewerRow,
  };

  const userById: Record<number, typeof superAdminRow> = {
    1: superAdminRow,
    2: viewerRow,
    3: targetUserRow,
  };

  // $transaction executes the callback with the same mock as `tx`
  const self: Partial<PrismaService> = {
    user: {
      findUnique: jest.fn(
        (args: { where: { cipUid?: string; id?: number } }) => {
          if (args.where.cipUid !== undefined) {
            return Promise.resolve(
              userByUid[args.where.cipUid] ?? null,
            );
          }
          if (args.where.id !== undefined) {
            return Promise.resolve(userById[args.where.id] ?? null);
          }
          return Promise.resolve(null);
        },
      ),
      findMany: jest.fn(() =>
        Promise.resolve([superAdminRow, viewerRow, targetUserRow]),
      ),
      count: jest.fn(() => Promise.resolve(3)),
      create: jest.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve({
          ...targetUserRow,
          id: 99,
          cipUid: 'new-firebase-uid',
          username: args.data['username'] as string,
          displayName: args.data['displayName'] as string,
        }),
      ),
      update: jest.fn(
        (args: { where: { id: number }; data: Record<string, unknown> }) =>
          Promise.resolve({
            ...(userById[args.where.id] ?? targetUserRow),
            ...args.data,
          }),
      ),
    } as unknown as PrismaService['user'],
    auditLog: {
      create: jest.fn(() => Promise.resolve({ id: 1 })),
    } as unknown as PrismaService['auditLog'],
    $transaction: jest.fn(
      (cb: (tx: Partial<PrismaService>) => Promise<unknown>) => cb(self),
    ) as unknown as PrismaService['$transaction'],
    $disconnect: jest.fn(() => Promise.resolve()),
  } as Partial<PrismaService>;

  void authenticatedUid; // param kept for clarity in callers
  return self;
}

// ---------------------------------------------------------------------------
// Firebase admin mock
// ---------------------------------------------------------------------------

const makeFirebaseMock = (uid: string) => ({
  auth: {
    verifyIdToken: jest.fn().mockResolvedValue({
      uid,
      auth_time: Math.floor(Date.now() / 1000),
    }),
    createUser: jest
      .fn()
      .mockResolvedValue({ uid: 'new-firebase-uid' }),
    revokeRefreshTokens: jest.fn().mockResolvedValue(undefined),
  },
});

// ---------------------------------------------------------------------------
// Helper: create and configure a NestJS test app
// ---------------------------------------------------------------------------

async function buildApp(
  firebaseMock: ReturnType<typeof makeFirebaseMock>,
  prismaMock: Partial<PrismaService>,
): Promise<INestApplication> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(FirebaseAdminService)
    .useValue(firebaseMock)
    .overrideProvider(PrismaService)
    .useValue(prismaMock)
    .compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  await app.init();
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('UsersController (e2e)', () => {
  let appSuperAdmin: INestApplication;
  let appViewer: INestApplication;

  beforeAll(async () => {
    appSuperAdmin = await buildApp(
      makeFirebaseMock(SUPER_ADMIN_UID),
      createMockPrismaService(SUPER_ADMIN_UID) as PrismaService,
    );
    appViewer = await buildApp(
      makeFirebaseMock(VIEWER_UID),
      createMockPrismaService(VIEWER_UID) as PrismaService,
    );
  });

  afterAll(async () => {
    await appSuperAdmin.close();
    await appViewer.close();
  });

  // -------------------------------------------------------------------------
  // GET /api/users
  // -------------------------------------------------------------------------

  it('GET /api/users → 401 without token', () => {
    return request(appSuperAdmin.getHttpServer() as Server)
      .get('/api/users')
      .expect(401);
  });

  it('GET /api/users → 403 when authenticated as non-SUPER_ADMIN', () => {
    return request(appViewer.getHttpServer() as Server)
      .get('/api/users')
      .set('Authorization', 'Bearer fake-viewer-token')
      .expect(403);
  });

  it('GET /api/users → 200 when authenticated as SUPER_ADMIN', () => {
    return request(appSuperAdmin.getHttpServer() as Server)
      .get('/api/users')
      .set('Authorization', 'Bearer fake-super-admin-token')
      .expect(200)
      .expect((res: request.Response) => {
        const body = res.body as { data: unknown[]; total: number };
        expect(Array.isArray(body.data)).toBe(true);
        expect(typeof body.total).toBe('number');
      });
  });

  // -------------------------------------------------------------------------
  // POST /api/users
  // -------------------------------------------------------------------------

  it('POST /api/users → 201 creates user', () => {
    const payload = {
      username: 'newuser',
      displayName: 'New User',
      role: Role.PUESTO_COORDINATOR,
      password: 'securePass1',
    };

    return request(appSuperAdmin.getHttpServer() as Server)
      .post('/api/users')
      .set('Authorization', 'Bearer fake-super-admin-token')
      .send(payload)
      .expect(201)
      .expect((res: request.Response) => {
        const body = res.body as { username: string };
        expect(body.username).toBe('newuser');
      });
  });

  it('POST /api/users → 400 when missing required fields', () => {
    return request(appSuperAdmin.getHttpServer() as Server)
      .post('/api/users')
      .set('Authorization', 'Bearer fake-super-admin-token')
      .send({ username: 'incomplete' }) // missing displayName, role, and password
      .expect(400);
  });

  // -------------------------------------------------------------------------
  // GET /api/users/:id
  // -------------------------------------------------------------------------

  it('GET /api/users/:id → 200 for existing user', () => {
    return request(appSuperAdmin.getHttpServer() as Server)
      .get('/api/users/3')
      .set('Authorization', 'Bearer fake-super-admin-token')
      .expect(200)
      .expect((res: request.Response) => {
        const body = res.body as { id: number };
        expect(body.id).toBe(3);
      });
  });

  it('GET /api/users/:id → 404 for non-existent user', () => {
    return request(appSuperAdmin.getHttpServer() as Server)
      .get('/api/users/9999')
      .set('Authorization', 'Bearer fake-super-admin-token')
      .expect(404);
  });

  // -------------------------------------------------------------------------
  // PATCH /api/users/:id
  // -------------------------------------------------------------------------

  it('PATCH /api/users/:id → 200 updates displayName', () => {
    return request(appSuperAdmin.getHttpServer() as Server)
      .patch('/api/users/3')
      .set('Authorization', 'Bearer fake-super-admin-token')
      .send({ displayName: 'Updated Name' })
      .expect(200)
      .expect((res: request.Response) => {
        const body = res.body as { displayName: string };
        expect(body.displayName).toBe('Updated Name');
      });
  });

  // -------------------------------------------------------------------------
  // DELETE /api/users/:id
  // -------------------------------------------------------------------------

  it('DELETE /api/users/:id → 204 deactivates user', () => {
    return request(appSuperAdmin.getHttpServer() as Server)
      .delete('/api/users/3')
      .set('Authorization', 'Bearer fake-super-admin-token')
      .expect(204);
  });
});
