import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role, ScopeType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PermissionsService } from '../../permissions/permissions.service.js';
import { UserWithScopes } from '../../common/types/request-with-user.js';
import { CreateTestigoDto } from './dto/create-testigo.dto.js';
import { UpdateTestigoDto } from './dto/update-testigo.dto.js';
import { RealtimeService } from '../../realtime/realtime.service.js';
import { ListTestigosQueryDto } from './dto/list-testigos-query.dto.js';

@Injectable()
export class TestigosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly realtime: RealtimeService,
  ) {}

  async findByPuesto(puestoId: number) {
    return this.prisma.testigo.findMany({
      where: { puestoId },
      orderBy: { id: 'asc' },
    });
  }

  async list(query: ListTestigosQueryDto, user: UserWithScopes) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    // puestoId filter
    if (query.sinPuesto === true) {
      where['puestoId'] = null;
    } else if (query.puestoId !== undefined) {
      where['puestoId'] = query.puestoId;
    } else if (user.role !== Role.SUPER_ADMIN) {
      const accessibleIds = await this.permissions.accessiblePuestoIds(user);
      where['puestoId'] = { in: [...accessibleIds] };
    }

    // municipioId filter (only when not sinPuesto)
    if (query.municipioId !== undefined && query.sinPuesto !== true) {
      where['puesto'] = { municipioId: query.municipioId };
    }

    // search filter
    if (query.search) {
      where['OR'] = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { cedula: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.testigo.findMany({
        where,
        include: {
          puesto: { select: { id: true, name: true, municipioId: true } },
        },
        orderBy: [{ puestoId: 'asc' }, { id: 'asc' }],
        skip,
        take: limit,
      }),
      this.prisma.testigo.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async bulkAssign(testigoIds: number[], puestoId: number, user: UserWithScopes) {
    const canAccess = await this.permissions.canAccess(user, ScopeType.PUESTO, puestoId);
    if (!canAccess) throw new ForbiddenException();

    const puesto = await this.prisma.puesto.findUnique({ where: { id: puestoId } });
    if (!puesto) throw new NotFoundException('Puesto not found');

    const testigos = await this.prisma.testigo.findMany({ where: { id: { in: testigoIds } } });

    await this.prisma.$transaction(async (tx) => {
      for (const t of testigos) {
        await tx.testigo.update({ where: { id: t.id }, data: { puestoId } });
        await tx.auditLog.create({
          data: {
            actorUserId: user.id,
            action: 'testigo.bulkAssign',
            targetType: 'Testigo',
            targetId: t.id,
            beforeJson: t,
            afterJson: { ...t, puestoId },
          },
        });
      }
    });

    await this.realtime.notify({
      type: 'testigo:count_changed',
      municipioId: puesto.municipioId,
      payload: { municipioId: puesto.municipioId },
    });

    return { assigned: testigos.length };
  }

  async create(
    puestoId: number,
    dto: CreateTestigoDto,
    user: UserWithScopes,
  ) {
    const puesto = await this.prisma.puesto.findUnique({ where: { id: puestoId }, select: { municipioId: true } });
    if (!puesto) throw new NotFoundException('Puesto not found');

    const result = await this.prisma.$transaction(async (tx) => {
      const testigo = await tx.testigo.create({
        data: {
          ...dto,
          puestoId,
          createdById: user.id,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          action: 'testigo.create',
          targetType: 'Testigo',
          targetId: testigo.id,
          afterJson: testigo,
        },
      });
      return testigo;
    });
    await this.realtime.notify({ type: 'testigo.create', puestoId, payload: { id: result.id } });
    await this.realtime.notify({
      type: 'testigo:count_changed',
      municipioId: puesto.municipioId,
      payload: { municipioId: puesto.municipioId },
    });
    return result;
  }

  async update(id: number, dto: UpdateTestigoDto, user: UserWithScopes) {
    const existing = await this.prisma.testigo.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Testigo not found');

    if (existing.puestoId === null) throw new ForbiddenException();
    const canAccess = await this.permissions.canAccess(user, ScopeType.PUESTO, existing.puestoId);
    if (!canAccess) throw new ForbiddenException();

    const puesto = await this.prisma.puesto.findUnique({ where: { id: existing.puestoId }, select: { municipioId: true } });

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.testigo.update({ where: { id }, data: dto });
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          action: 'testigo.update',
          targetType: 'Testigo',
          targetId: id,
          beforeJson: existing,
          afterJson: updated,
        },
      });
      return updated;
    });
    await this.realtime.notify({ type: 'testigo.update', puestoId: existing.puestoId, payload: { id } });
    if (puesto) {
      await this.realtime.notify({
        type: 'testigo:count_changed',
        municipioId: puesto.municipioId,
        payload: { municipioId: puesto.municipioId },
      });
    }
    return result;
  }

  async remove(id: number, user: UserWithScopes) {
    const existing = await this.prisma.testigo.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Testigo not found');

    if (existing.puestoId === null) throw new ForbiddenException();
    const canAccess = await this.permissions.canAccess(user, ScopeType.PUESTO, existing.puestoId);
    if (!canAccess) throw new ForbiddenException();

    const puesto = await this.prisma.puesto.findUnique({ where: { id: existing.puestoId }, select: { municipioId: true } });

    await this.prisma.$transaction(async (tx) => {
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          action: 'testigo.delete',
          targetType: 'Testigo',
          targetId: id,
          beforeJson: existing,
        },
      });
      await tx.testigo.delete({ where: { id } });
    });
    await this.realtime.notify({ type: 'testigo.delete', puestoId: existing.puestoId, payload: { id } });
    if (puesto) {
      await this.realtime.notify({
        type: 'testigo:count_changed',
        municipioId: puesto.municipioId,
        payload: { municipioId: puesto.municipioId },
      });
    }
  }
}
