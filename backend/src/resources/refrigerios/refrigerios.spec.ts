import { ForbiddenException } from '@nestjs/common';
import { ScopeType } from '@prisma/client';
import { RefrigeriosService } from './refrigerios.service.js';

function makeUser(role: string, id = 1) {
  return { id, role, scopes: [] } as any;
}

function makeRefrigerio(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    scopeType: ScopeType.PUESTO,
    scopeId: 3,
    count: 10,
    status: 'PENDIENTE',
    notes: null,
    createdById: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('RefrigeriosService.findByPuesto', () => {
  let service: RefrigeriosService;
  let mockPrisma: any;
  let mockPermissions: any;
  let mockRealtime: any;

  beforeEach(() => {
    mockPrisma = {
      refrigerio: { findMany: jest.fn() },
    };
    mockPermissions = { canAccess: jest.fn() };
    mockRealtime = { notify: jest.fn() };
    service = new RefrigeriosService(mockPrisma, mockPermissions, mockRealtime);
  });

  it('returns refrigerios for accessible puesto', async () => {
    const items = [makeRefrigerio(), makeRefrigerio({ id: 2, count: 5 })];
    mockPermissions.canAccess.mockResolvedValue(true);
    mockPrisma.refrigerio.findMany.mockResolvedValue(items);

    const result = await service.findByPuesto(3, makeUser('SUPER_ADMIN'));

    expect(result).toEqual(items);
    expect(mockPrisma.refrigerio.findMany).toHaveBeenCalledWith({
      where: { scopeType: ScopeType.PUESTO, scopeId: 3 },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('returns empty array when puesto has no refrigerios', async () => {
    mockPermissions.canAccess.mockResolvedValue(true);
    mockPrisma.refrigerio.findMany.mockResolvedValue([]);

    const result = await service.findByPuesto(
      99,
      makeUser('PUESTO_COORDINATOR'),
    );

    expect(result).toEqual([]);
  });

  it('throws ForbiddenException when user cannot access the puesto', async () => {
    mockPermissions.canAccess.mockResolvedValue(false);

    await expect(
      service.findByPuesto(3, makeUser('PUESTO_COORDINATOR')),
    ).rejects.toThrow(ForbiddenException);

    expect(mockPrisma.refrigerio.findMany).not.toHaveBeenCalled();
  });

  it('calls canAccess with PUESTO scope type and the given puestoId', async () => {
    mockPermissions.canAccess.mockResolvedValue(true);
    mockPrisma.refrigerio.findMany.mockResolvedValue([]);

    await service.findByPuesto(7, makeUser('REGIONAL_COORDINATOR'));

    expect(mockPermissions.canAccess).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'REGIONAL_COORDINATOR' }),
      ScopeType.PUESTO,
      7,
    );
  });
});
