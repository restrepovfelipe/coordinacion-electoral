import { ForbiddenException } from '@nestjs/common';
import { ScopeType } from '@prisma/client';
import { ComparendosService } from './comparendos.service.js';

function makeUser(role: string, id = 1) {
  return { id, role, scopes: [] } as any;
}

function makeComparendo(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    scopeType: ScopeType.COMUNA,
    scopeId: 4,
    date: new Date('2026-05-31'),
    description: 'Test comparendo',
    status: null,
    notes: null,
    createdById: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('ComparendosService.findByComuna', () => {
  let service: ComparendosService;
  let mockPrisma: any;
  let mockPermissions: any;
  let mockRealtime: any;

  beforeEach(() => {
    mockPrisma = {
      comparendo: { findMany: jest.fn() },
    };
    mockPermissions = { canAccess: jest.fn() };
    mockRealtime = { notify: jest.fn() };
    service = new ComparendosService(mockPrisma, mockPermissions, mockRealtime);
  });

  it('returns comparendos for accessible comuna', async () => {
    const items = [
      makeComparendo(),
      makeComparendo({ id: 2, description: 'Second' }),
    ];
    mockPermissions.canAccess.mockResolvedValue(true);
    mockPrisma.comparendo.findMany.mockResolvedValue(items);

    const result = await service.findByComuna(4, makeUser('SUPER_ADMIN'));

    expect(result).toEqual(items);
    expect(mockPrisma.comparendo.findMany).toHaveBeenCalledWith({
      where: { scopeType: ScopeType.COMUNA, scopeId: 4 },
      orderBy: { date: 'asc' },
    });
  });

  it('returns empty array when comuna has no comparendos', async () => {
    mockPermissions.canAccess.mockResolvedValue(true);
    mockPrisma.comparendo.findMany.mockResolvedValue([]);

    const result = await service.findByComuna(
      99,
      makeUser('MUNICIPAL_COORDINATOR'),
    );

    expect(result).toEqual([]);
  });

  it('throws ForbiddenException when user cannot access the comuna', async () => {
    mockPermissions.canAccess.mockResolvedValue(false);

    await expect(
      service.findByComuna(4, makeUser('PUESTO_COORDINATOR')),
    ).rejects.toThrow(ForbiddenException);

    expect(mockPrisma.comparendo.findMany).not.toHaveBeenCalled();
  });

  it('PUESTO_COORDINATOR with access passes scope check and receives results', async () => {
    // canAccess returns true when PUESTO_COORDINATOR has a puesto in the comuna
    // (PermissionsService handles this via CTE — here we just confirm the service
    // delegates correctly and does not special-case the role)
    const items = [makeComparendo()];
    mockPermissions.canAccess.mockResolvedValue(true);
    mockPrisma.comparendo.findMany.mockResolvedValue(items);

    const result = await service.findByComuna(
      4,
      makeUser('PUESTO_COORDINATOR'),
    );

    expect(result).toEqual(items);
    expect(mockPermissions.canAccess).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'PUESTO_COORDINATOR' }),
      ScopeType.COMUNA,
      4,
    );
  });

  it('calls canAccess with COMUNA scope type and the given comunaId', async () => {
    mockPermissions.canAccess.mockResolvedValue(true);
    mockPrisma.comparendo.findMany.mockResolvedValue([]);

    await service.findByComuna(12, makeUser('REGIONAL_COORDINATOR'));

    expect(mockPermissions.canAccess).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'REGIONAL_COORDINATOR' }),
      ScopeType.COMUNA,
      12,
    );
  });
});
