import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { Server } from 'http';
import { AppModule } from '../src/app.module';
import { FirebaseAdminService } from '../src/common/firebase/firebase-admin.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { Role, ScopeType } from '@prisma/client';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const SUPER_ADMIN_UID = 'super-admin-uid';

const superAdminRow = {
  id: 1,
  cipUid: SUPER_ADMIN_UID,
  username: 'superadmin',
  displayName: 'Super Admin',
  phone: null as string | null,
  notes: null as string | null,
  role: Role.SUPER_ADMIN,
  active: true,
  mustChangePassword: false,
  createdByUserId: null as number | null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  scopes: [] as Array<{
    id: number;
    userId: number;
    scopeType: ScopeType;
    scopeId: number;
  }>,
};

const makeTestigo = (id: number) => ({
  id,
  name: 'Test Testigo',
  cedula: null as string | null,
  phone: null as string | null,
  notes: null as string | null,
  puestoId: 1,
  createdById: 1,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
});

const makeAbogado = (id: number) => ({
  id,
  name: 'Test Abogado',
  phone: null as string | null,
  notes: null as string | null,
  municipioId: 1,
  createdById: 1,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
});

const makeMovilidad = (id: number) => ({
  id,
  scopeType: ScopeType.MUNICIPIO,
  scopeId: 1,
  vehicleType: 'car',
  plate: 'ABC123',
  driverName: 'Driver',
  driverPhone: null as string | null,
  notes: null as string | null,
  createdById: 1,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
});

const makeRefrigerio = (id: number) => ({
  id,
  scopeType: ScopeType.MUNICIPIO,
  scopeId: 1,
  count: 0,
  status: null as string | null,
  notes: null as string | null,
  createdById: 1,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
});

const makeComparendo = (id: number) => ({
  id,
  scopeType: ScopeType.MUNICIPIO,
  scopeId: 1,
  date: new Date('2026-05-21T00:00:00Z'),
  description: 'Test comparendo',
  status: null as string | null,
  notes: null as string | null,
  createdById: 1,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
});

// ---------------------------------------------------------------------------
// Prisma mock factory for resources
// ---------------------------------------------------------------------------

function createResourcesPrismaMock(): Partial<PrismaService> {
  const self: Partial<PrismaService> = {
    user: {
      findUnique: jest.fn((args: { where: { cipUid?: string; id?: number } }) => {
        if (args.where.cipUid === SUPER_ADMIN_UID) {
          return Promise.resolve(superAdminRow);
        }
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
      findUnique: jest.fn((args: { where: { id: number } }) => {
        // Return null to trigger 404 for non-existent testigo (id=9999)
        if (args.where.id === 9999) return Promise.resolve(null);
        return Promise.resolve(makeTestigo(args.where.id));
      }),
      create: jest.fn(() => Promise.resolve(makeTestigo(101))),
      update: jest.fn((args: { where: { id: number }; data: Record<string, unknown> }) =>
        Promise.resolve({ ...makeTestigo(args.where.id), ...args.data }),
      ),
      delete: jest.fn(() => Promise.resolve(makeTestigo(101))),
    } as unknown as PrismaService['testigo'],

    abogado: {
      findUnique: jest.fn((args: { where: { id: number } }) => {
        if (args.where.id === 9999) return Promise.resolve(null);
        return Promise.resolve(makeAbogado(args.where.id));
      }),
      create: jest.fn(() => Promise.resolve(makeAbogado(102))),
      update: jest.fn((args: { where: { id: number }; data: Record<string, unknown> }) =>
        Promise.resolve({ ...makeAbogado(args.where.id), ...args.data }),
      ),
      delete: jest.fn(() => Promise.resolve(makeAbogado(102))),
    } as unknown as PrismaService['abogado'],

    movilidad: {
      findUnique: jest.fn((args: { where: { id: number } }) => {
        if (args.where.id === 9999) return Promise.resolve(null);
        return Promise.resolve(makeMovilidad(args.where.id));
      }),
      create: jest.fn(() => Promise.resolve(makeMovilidad(103))),
      update: jest.fn((args: { where: { id: number }; data: Record<string, unknown> }) =>
        Promise.resolve({ ...makeMovilidad(args.where.id), ...args.data }),
      ),
      delete: jest.fn(() => Promise.resolve(makeMovilidad(103))),
    } as unknown as PrismaService['movilidad'],

    refrigerio: {
      findUnique: jest.fn((args: { where: { id: number } }) => {
        if (args.where.id === 9999) return Promise.resolve(null);
        return Promise.resolve(makeRefrigerio(args.where.id));
      }),
      create: jest.fn(() => Promise.resolve(makeRefrigerio(104))),
      update: jest.fn((args: { where: { id: number }; data: Record<string, unknown> }) =>
        Promise.resolve({ ...makeRefrigerio(args.where.id), ...args.data }),
      ),
      delete: jest.fn(() => Promise.resolve(makeRefrigerio(104))),
    } as unknown as PrismaService['refrigerio'],

    comparendo: {
      findUnique: jest.fn((args: { where: { id: number } }) => {
        if (args.where.id === 9999) return Promise.resolve(null);
        return Promise.resolve(makeComparendo(args.where.id));
      }),
      create: jest.fn(() => Promise.resolve(makeComparendo(105))),
      update: jest.fn((args: { where: { id: number }; data: Record<string, unknown> }) =>
        Promise.resolve({ ...makeComparendo(args.where.id), ...args.data }),
      ),
      delete: jest.fn(() => Promise.resolve(makeComparendo(105))),
    } as unknown as PrismaService['comparendo'],

    auditLog: {
      create: jest.fn(() => Promise.resolve({ id: 1 })),
    } as unknown as PrismaService['auditLog'],

    $transaction: jest.fn(
      (cb: (tx: Partial<PrismaService>) => Promise<unknown>) => cb(self),
    ) as unknown as PrismaService['$transaction'],

    $queryRaw: jest.fn(() =>
      Promise.resolve([{ id: BigInt(1) }]),
    ) as unknown as PrismaService['$queryRaw'],

    $disconnect: jest.fn(() => Promise.resolve()),
  };

  return self;
}

// ---------------------------------------------------------------------------
// Firebase mock (always resolves as SUPER_ADMIN)
// ---------------------------------------------------------------------------

const firebaseMock = {
  auth: {
    verifyIdToken: jest.fn().mockResolvedValue({
      uid: SUPER_ADMIN_UID,
      auth_time: Math.floor(Date.now() / 1000),
    }),
    createUser: jest.fn().mockResolvedValue({ uid: 'new-uid' }),
    revokeRefreshTokens: jest.fn().mockResolvedValue(undefined),
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Resources (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(FirebaseAdminService)
      .useValue(firebaseMock)
      .overrideProvider(PrismaService)
      .useValue(createResourcesPrismaMock())
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // -------------------------------------------------------------------------
  // Testigos
  // -------------------------------------------------------------------------

  it('POST /api/puestos/:id/testigos → 401 without token', () => {
    return request(app.getHttpServer() as Server)
      .post('/api/puestos/1/testigos')
      .send({ name: 'Test Testigo' })
      .expect(401);
  });

  it('POST /api/puestos/:id/testigos → 201 creates testigo', () => {
    return request(app.getHttpServer() as Server)
      .post('/api/puestos/1/testigos')
      .set('Authorization', 'Bearer fake-token')
      .send({ name: 'Test Testigo' })
      .expect(201)
      .expect((res: request.Response) => {
        const body = res.body as { name: string };
        expect(body.name).toBe('Test Testigo');
      });
  });

  it('PATCH /api/testigos/:id → 404 for non-existent testigo', () => {
    return request(app.getHttpServer() as Server)
      .patch('/api/testigos/9999')
      .set('Authorization', 'Bearer fake-token')
      .send({ name: 'Updated' })
      .expect(404);
  });

  it('PATCH /api/testigos/:id → 200 updates testigo', () => {
    return request(app.getHttpServer() as Server)
      .patch('/api/testigos/1')
      .set('Authorization', 'Bearer fake-token')
      .send({ name: 'Updated Name' })
      .expect(200)
      .expect((res: request.Response) => {
        const body = res.body as { name: string };
        expect(body.name).toBe('Updated Name');
      });
  });

  // -------------------------------------------------------------------------
  // Abogados
  // -------------------------------------------------------------------------

  it('POST /api/municipios/:id/abogados → 201 creates abogado', () => {
    return request(app.getHttpServer() as Server)
      .post('/api/municipios/1/abogados')
      .set('Authorization', 'Bearer fake-token')
      .send({ name: 'Test Abogado' })
      .expect(201)
      .expect((res: request.Response) => {
        const body = res.body as { name: string };
        expect(body.name).toBe('Test Abogado');
      });
  });

  it('POST /api/municipios/:id/abogados → 401 without token', () => {
    return request(app.getHttpServer() as Server)
      .post('/api/municipios/1/abogados')
      .send({ name: 'Test Abogado' })
      .expect(401);
  });

  // -------------------------------------------------------------------------
  // Movilidad
  // -------------------------------------------------------------------------

  it('POST /api/movilidad → 201 creates movilidad record', () => {
    const payload = {
      scopeType: ScopeType.MUNICIPIO,
      scopeId: 1,
      vehicleType: 'car',
      plate: 'ABC123',
      driverName: 'Driver Name',
    };

    return request(app.getHttpServer() as Server)
      .post('/api/movilidad')
      .set('Authorization', 'Bearer fake-token')
      .send(payload)
      .expect(201)
      .expect((res: request.Response) => {
        const body = res.body as { vehicleType: string };
        expect(body.vehicleType).toBe('car');
      });
  });

  it('POST /api/movilidad → 401 without token', () => {
    return request(app.getHttpServer() as Server)
      .post('/api/movilidad')
      .send({
        scopeType: ScopeType.MUNICIPIO,
        scopeId: 1,
        vehicleType: 'car',
        plate: 'ABC123',
        driverName: 'Driver',
      })
      .expect(401);
  });

  // -------------------------------------------------------------------------
  // Refrigerios
  // -------------------------------------------------------------------------

  it('POST /api/refrigerios → 201 creates refrigerio', () => {
    const payload = {
      scopeType: ScopeType.MUNICIPIO,
      scopeId: 1,
    };

    return request(app.getHttpServer() as Server)
      .post('/api/refrigerios')
      .set('Authorization', 'Bearer fake-token')
      .send(payload)
      .expect(201)
      .expect((res: request.Response) => {
        const body = res.body as { scopeType: string };
        expect(body.scopeType).toBe(ScopeType.MUNICIPIO);
      });
  });

  it('POST /api/refrigerios → 401 without token', () => {
    return request(app.getHttpServer() as Server)
      .post('/api/refrigerios')
      .send({ scopeType: ScopeType.MUNICIPIO, scopeId: 1 })
      .expect(401);
  });

  // -------------------------------------------------------------------------
  // Comparendos
  // -------------------------------------------------------------------------

  it('POST /api/comparendos → 201 creates comparendo', () => {
    const payload = {
      scopeType: ScopeType.MUNICIPIO,
      scopeId: 1,
      date: '2026-05-21',
      description: 'Test comparendo description',
    };

    return request(app.getHttpServer() as Server)
      .post('/api/comparendos')
      .set('Authorization', 'Bearer fake-token')
      .send(payload)
      .expect(201)
      .expect((res: request.Response) => {
        const body = res.body as { description: string };
        expect(body.description).toBe('Test comparendo description');
      });
  });

  it('POST /api/comparendos → 401 without token', () => {
    return request(app.getHttpServer() as Server)
      .post('/api/comparendos')
      .send({
        scopeType: ScopeType.MUNICIPIO,
        scopeId: 1,
        date: '2026-05-21',
        description: 'Test',
      })
      .expect(401);
  });

  it('POST /api/comparendos → 400 when missing required fields', () => {
    return request(app.getHttpServer() as Server)
      .post('/api/comparendos')
      .set('Authorization', 'Bearer fake-token')
      .send({ scopeType: ScopeType.MUNICIPIO }) // missing scopeId, date, description
      .expect(400);
  });
});
