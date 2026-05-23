import { ForbiddenException } from '@nestjs/common';
import { ScopeType } from '@prisma/client';
import { AbogadosService } from './abogados.service.js';

function makeUser(role: string, id = 1) {
  return { id, role, scopes: [] } as any;
}

function makeAbogado(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: 'Test Abogado',
    phone: null,
    notes: null,
    municipioId: 5,
    createdById: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('AbogadosService.findByMunicipio', () => {
  let service: AbogadosService;
  let mockPrisma: any;
  let mockPermissions: any;
  let mockRealtime: any;

  beforeEach(() => {
    mockPrisma = {
      abogado: { findMany: jest.fn() },
    };
    mockPermissions = { canAccess: jest.fn() };
    mockRealtime = { notify: jest.fn() };
    service = new AbogadosService(mockPrisma, mockPermissions, mockRealtime);
  });

  it('returns abogados for accessible municipio', async () => {
    const abogados = [makeAbogado(), makeAbogado({ id: 2, name: 'Second' })];
    mockPermissions.canAccess.mockResolvedValue(true);
    mockPrisma.abogado.findMany.mockResolvedValue(abogados);

    const result = await service.findByMunicipio(5, makeUser('SUPER_ADMIN'));

    expect(result).toEqual(abogados);
    expect(mockPrisma.abogado.findMany).toHaveBeenCalledWith({
      where: { municipioId: 5 },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('returns empty array when municipio has no abogados', async () => {
    mockPermissions.canAccess.mockResolvedValue(true);
    mockPrisma.abogado.findMany.mockResolvedValue([]);

    const result = await service.findByMunicipio(
      99,
      makeUser('MUNICIPAL_COORDINATOR'),
    );

    expect(result).toEqual([]);
  });

  it('throws ForbiddenException when user cannot access the municipio', async () => {
    mockPermissions.canAccess.mockResolvedValue(false);

    await expect(
      service.findByMunicipio(5, makeUser('PUESTO_COORDINATOR')),
    ).rejects.toThrow(ForbiddenException);

    expect(mockPrisma.abogado.findMany).not.toHaveBeenCalled();
  });

  it('calls canAccess with MUNICIPIO scope type and the given municipioId', async () => {
    mockPermissions.canAccess.mockResolvedValue(true);
    mockPrisma.abogado.findMany.mockResolvedValue([]);

    await service.findByMunicipio(7, makeUser('REGIONAL_COORDINATOR'));

    expect(mockPermissions.canAccess).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'REGIONAL_COORDINATOR' }),
      ScopeType.MUNICIPIO,
      7,
    );
  });
});
