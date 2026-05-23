import { ConflictException, NotFoundException } from '@nestjs/common';
import { ScopeType, Role } from '@prisma/client';
import { CoordinadorService } from './coordinador.service.js';
import type { UserWithScopes } from '../common/types/request-with-user.js';

// ── Stubs ──────────────────────────────────────────────────────────────────────

function makeRealtime() {
  return { notify: jest.fn().mockResolvedValue(undefined) };
}

/** Build a Prisma stub. adhocData is the coordinator fields for the scope entity. */
function makePrisma(opts: {
  userCoordId?: number;
  adhocNombre?: string | null;
  adhocTelefono?: string | null;
  entityExists?: boolean;
}) {
  const entityExists = opts.entityExists !== false;
  const adhocRow = entityExists
    ? {
        coordinadorAdHocNombre: opts.adhocNombre ?? null,
        coordinadorAdHocTelefono: opts.adhocTelefono ?? null,
      }
    : null;

  const userFindFirst = opts.userCoordId
    ? jest.fn().mockResolvedValue({
        id: opts.userCoordId,
        displayName: 'Test User',
        phone: '+57300',
      })
    : jest.fn().mockResolvedValue(null);

  const entityFindUnique = jest.fn().mockResolvedValue(adhocRow);
  const entityUpdate = jest.fn().mockResolvedValue(adhocRow);
  const auditLogCreate = jest.fn().mockResolvedValue({});

  return {
    user: { findFirst: userFindFirst },
    municipio: { findUnique: entityFindUnique, update: entityUpdate },
    zona: { findUnique: entityFindUnique, update: entityUpdate },
    comuna: { findUnique: entityFindUnique, update: entityUpdate },
    puesto: { findUnique: entityFindUnique, update: entityUpdate },
    auditLog: { create: auditLogCreate },
    _mocks: { userFindFirst, entityFindUnique, entityUpdate, auditLogCreate },
  };
}

function makeActor(role: Role = Role.SUPER_ADMIN): UserWithScopes {
  return { id: 1, role, scopes: [], active: true } as unknown as UserWithScopes;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('CoordinadorService.display', () => {
  for (const scopeType of ['municipio', 'zona', 'comuna', 'puesto'] as const) {
    it(`returns source=user when a UserScope entry exists (${scopeType})`, async () => {
      const prisma = makePrisma({ userCoordId: 42 });
      const svc = new CoordinadorService(prisma as never, makeRealtime() as never);
      const result = await svc.display(scopeType, 1);
      expect(result.source).toBe('user');
      expect(result.userId).toBe(42);
      expect(result.nombre).toBe('Test User');
    });

    it(`returns source=adhoc when ad-hoc fields are set (${scopeType})`, async () => {
      const prisma = makePrisma({ adhocNombre: 'María', adhocTelefono: '+57311' });
      const svc = new CoordinadorService(prisma as never, makeRealtime() as never);
      const result = await svc.display(scopeType, 1);
      expect(result.source).toBe('adhoc');
      expect(result.nombre).toBe('María');
      expect(result.telefono).toBe('+57311');
    });

    it(`returns source=none when no coordinator is set (${scopeType})`, async () => {
      const prisma = makePrisma({});
      const svc = new CoordinadorService(prisma as never, makeRealtime() as never);
      const result = await svc.display(scopeType, 1);
      expect(result.source).toBe('none');
      expect(result.nombre).toBeNull();
    });
  }

  it('throws NotFoundException for unknown scopeType', async () => {
    const prisma = makePrisma({});
    const svc = new CoordinadorService(prisma as never, makeRealtime() as never);
    await expect(svc.display('unknown', 1)).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when entity does not exist', async () => {
    const prisma = makePrisma({ entityExists: false });
    const svc = new CoordinadorService(prisma as never, makeRealtime() as never);
    await expect(svc.display('municipio', 999)).rejects.toThrow(NotFoundException);
  });
});

describe('CoordinadorService.patchAdhoc', () => {
  it('throws ConflictException when user-coordinator already exists', async () => {
    const prisma = makePrisma({ userCoordId: 5 });
    const svc = new CoordinadorService(prisma as never, makeRealtime() as never);
    await expect(
      svc.patchAdhoc('municipio', 1, { nombre: 'X' }, makeActor()),
    ).rejects.toThrow(ConflictException);
  });

  it('updates ad-hoc fields and creates audit log', async () => {
    const prisma = makePrisma({});
    const realtime = makeRealtime();
    const svc = new CoordinadorService(prisma as never, realtime as never);

    await svc.patchAdhoc('puesto', 7, { nombre: 'Ana', telefono: '+573' }, makeActor());

    expect(prisma.puesto.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 7 },
        data: { coordinadorAdHocNombre: 'Ana', coordinadorAdHocTelefono: '+573' },
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'coordinador.adhoc.patch',
          targetType: ScopeType.PUESTO,
          targetId: 7,
        }),
      }),
    );
  });

  it('emits coordinador:adhoc_changed SSE event', async () => {
    const prisma = makePrisma({});
    const realtime = makeRealtime();
    const svc = new CoordinadorService(prisma as never, realtime as never);

    await svc.patchAdhoc('zona', 3, { nombre: 'Pedro' }, makeActor());

    expect(realtime.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'coordinador:adhoc_changed',
        scopeType: ScopeType.ZONA,
        scopeId: 3,
      }),
    );
  });

  it('allows clearing ad-hoc fields by passing null', async () => {
    const prisma = makePrisma({ adhocNombre: 'Viejo' });
    const svc = new CoordinadorService(prisma as never, makeRealtime() as never);

    await svc.patchAdhoc('comuna', 2, { nombre: null, telefono: null }, makeActor());

    expect(prisma.comuna.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { coordinadorAdHocNombre: null, coordinadorAdHocTelefono: null },
      }),
    );
  });
});
