import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role, ScopeType } from '@prisma/client';
import { UsersService } from './users.service.js';

// ─── helpers ────────────────────────────────────────────────────────────────

function makeActor(role: Role, id = 1) {
  return {
    id,
    username: 'actor',
    displayName: 'Actor',
    phone: null,
    notes: null,
    role,
    active: true,
    cipUid: 'actor-uid',
    mustChangePassword: false,
    createdAt: new Date(),
    createdByUserId: null,
    lastLoginAt: null,
    updatedAt: new Date(),
    scopes: [],
  } as any;
}

function makeExisting(overrides: Partial<{ id: number; role: Role; cipUid: string; scopes: any[] }> = {}) {
  return {
    id: 2,
    username: 'target',
    displayName: 'Target',
    phone: null,
    notes: null,
    role: Role.PUESTO_COORDINATOR,
    active: true,
    cipUid: 'target-uid',
    mustChangePassword: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdByUserId: null,
    lastLoginAt: null,
    scopes: [{ id: 10, userId: 2, scopeType: ScopeType.PUESTO, scopeId: 1 }],
    ...overrides,
  };
}

function makeMockTx(updatedUser: any, newScopes: any[] = []) {
  return {
    user: {
      update: jest.fn().mockResolvedValue({ ...updatedUser, scopes: newScopes }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ ...updatedUser, scopes: newScopes }),
    },
    userScope: {
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({ id: 20, userId: 2, scopeType: ScopeType.MUNICIPIO, scopeId: 5 }),
      findMany: jest.fn().mockResolvedValue(newScopes),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
}

describe('UsersService.update() — scope replacement', () => {
  let service: UsersService;
  let prisma: any;
  let firebaseAdmin: any;

  beforeEach(() => {
    firebaseAdmin = { auth: { updateUser: jest.fn().mockResolvedValue({}) } };
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn() },
      userScope: { deleteMany: jest.fn(), create: jest.fn(), findMany: jest.fn() },
      auditLog: { create: jest.fn() },
      $transaction: jest.fn(),
    };
    service = new UsersService(prisma as any, firebaseAdmin as any);
  });

  it('replaces scope when scope provided in DTO', async () => {
    const existing = makeExisting({ role: Role.MUNICIPAL_COORDINATOR });
    prisma.user.findUnique.mockResolvedValue(existing);
    const tx = makeMockTx(
      { ...existing, role: Role.MUNICIPAL_COORDINATOR },
      [{ id: 20, userId: 2, scopeType: ScopeType.MUNICIPIO, scopeId: 5 }],
    );
    prisma.$transaction.mockImplementation((cb: (tx: any) => any) => cb(tx));

    const actor = makeActor(Role.SUPER_ADMIN);
    const result = await service.update(2, {
      role: Role.MUNICIPAL_COORDINATOR,
      scope: { type: ScopeType.MUNICIPIO, id: 5 },
    }, actor);

    expect(tx.userScope.deleteMany).toHaveBeenCalledWith({ where: { userId: 2 } });
    expect(tx.userScope.create).toHaveBeenCalledWith({
      data: { userId: 2, scopeType: ScopeType.MUNICIPIO, scopeId: 5 },
    });
  });

  it('clears scope when scope is null', async () => {
    const existing = makeExisting({ role: Role.SUPER_ADMIN, scopes: [] });
    prisma.user.findUnique.mockResolvedValue(existing);
    const tx = makeMockTx({ ...existing }, []);
    prisma.$transaction.mockImplementation((cb: (tx: any) => any) => cb(tx));

    await service.update(2, { scope: null }, makeActor(Role.SUPER_ADMIN));

    expect(tx.userScope.deleteMany).toHaveBeenCalledWith({ where: { userId: 2 } });
    expect(tx.userScope.create).not.toHaveBeenCalled();
  });

  it('does NOT touch scopes when scope field is absent from DTO', async () => {
    const existing = makeExisting({ role: Role.PUESTO_COORDINATOR });
    prisma.user.findUnique.mockResolvedValue(existing);
    const tx = makeMockTx({ ...existing, displayName: 'Updated' });
    prisma.$transaction.mockImplementation((cb: (tx: any) => any) => cb(tx));

    await service.update(2, { displayName: 'Updated' }, makeActor(Role.SUPER_ADMIN));

    expect(tx.userScope.deleteMany).not.toHaveBeenCalled();
    expect(tx.userScope.create).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when scope type mismatches role', async () => {
    const existing = makeExisting({ role: Role.MUNICIPAL_COORDINATOR });
    prisma.user.findUnique.mockResolvedValue(existing);

    await expect(
      service.update(2, { scope: { type: ScopeType.PUESTO, id: 1 } }, makeActor(Role.SUPER_ADMIN)),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws ForbiddenException when REGIONAL edits SUPER_ADMIN user', async () => {
    const existing = makeExisting({ role: Role.SUPER_ADMIN, scopes: [] });
    prisma.user.findUnique.mockResolvedValue(existing);

    await expect(
      service.update(2, { displayName: 'Hack' }, makeActor(Role.REGIONAL_COORDINATOR)),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when REGIONAL promotes user to SUPER_ADMIN', async () => {
    const existing = makeExisting({ role: Role.MUNICIPAL_COORDINATOR, scopes: [] });
    prisma.user.findUnique.mockResolvedValue(existing);

    await expect(
      service.update(2, { role: Role.SUPER_ADMIN }, makeActor(Role.REGIONAL_COORDINATOR)),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws NotFoundException for unknown user', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.update(999, { displayName: 'x' }, makeActor(Role.SUPER_ADMIN)),
    ).rejects.toThrow(NotFoundException);
  });

  it('validates that PUESTO_COORDINATOR scope must be PUESTO type', async () => {
    const existing = makeExisting({ role: Role.PUESTO_COORDINATOR });
    prisma.user.findUnique.mockResolvedValue(existing);

    await expect(
      service.update(2, { scope: { type: ScopeType.MUNICIPIO, id: 1 } }, makeActor(Role.SUPER_ADMIN)),
    ).rejects.toThrow(BadRequestException);
  });

  it('SUPER_ADMIN with scope null passes validation (expectedScopeType is null)', async () => {
    const existing = makeExisting({ role: Role.SUPER_ADMIN, scopes: [] });
    prisma.user.findUnique.mockResolvedValue(existing);
    const tx = makeMockTx({ ...existing }, []);
    prisma.$transaction.mockImplementation((cb: (tx: any) => any) => cb(tx));

    // scope: null with SUPER_ADMIN is valid (clear scopes)
    await expect(
      service.update(2, { role: Role.SUPER_ADMIN, scope: null }, makeActor(Role.SUPER_ADMIN)),
    ).resolves.not.toThrow();
  });
});
