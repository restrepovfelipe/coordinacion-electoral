import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ScopeType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PermissionsService } from '../../permissions/permissions.service.js';
import { UserWithScopes } from '../../common/types/request-with-user.js';
import { CreateComparendoDto } from './dto/create-comparendo.dto.js';
import { UpdateComparendoDto } from './dto/update-comparendo.dto.js';
import { RealtimeService } from '../../realtime/realtime.service.js';

@Injectable()
export class ComparendosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly realtime: RealtimeService,
  ) {}

  async create(dto: CreateComparendoDto, user: UserWithScopes) {
    const canAccess = await this.permissions.canAccess(
      user,
      dto.scopeType,
      dto.scopeId,
    );
    if (!canAccess) throw new ForbiddenException();

    const result = await this.prisma.$transaction(async (tx) => {
      const comparendo = await tx.comparendo.create({
        data: {
          scopeType: dto.scopeType,
          scopeId: dto.scopeId,
          date: new Date(dto.date),
          description: dto.description,
          status: dto.status,
          notes: dto.notes,
          createdById: user.id,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          action: 'comparendo.create',
          targetType: 'Comparendo',
          targetId: comparendo.id,
          afterJson: comparendo,
        },
      });
      return comparendo;
    });
    await this.realtime.notify({
      type: 'comparendo.create',
      scopeType: dto.scopeType,
      scopeId: dto.scopeId,
      payload: { id: result.id },
    });
    return result;
  }

  async findByComuna(comunaId: number, user: UserWithScopes) {
    const canAccess = await this.permissions.canAccess(
      user,
      ScopeType.COMUNA,
      comunaId,
    );
    if (!canAccess) throw new ForbiddenException();
    return this.prisma.comparendo.findMany({
      where: { scopeType: ScopeType.COMUNA, scopeId: comunaId },
      orderBy: { date: 'asc' as const },
    });
  }

  // Returns all comparendos (scopeType=COMUNA) for every commune in a municipality.
  async findByMuni(municipioId: number): Promise<Array<{ id: number; scopeId: number; date: Date; description: string; status: string; notes: string | null; updatedAt: Date }>> {
    const comunas = await this.prisma.comuna.findMany({
      where: { municipioId },
      select: { id: true },
    });
    const comunaIds = comunas.map(c => c.id);
    if (comunaIds.length === 0) return [];
    return this.prisma.comparendo.findMany({
      where: { scopeType: ScopeType.COMUNA, scopeId: { in: comunaIds } },
      select: { id: true, scopeId: true, date: true, description: true, status: true, notes: true, updatedAt: true },
      orderBy: { date: 'asc' as const },
    });
  }

  async update(
    id: number,
    dto: UpdateComparendoDto,
    user: UserWithScopes,
    ifMatch?: string,
  ) {
    const existing = await this.prisma.comparendo.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Comparendo not found');

    const hasAccess = await this.permissions.canAccess(
      user,
      existing.scopeType,
      existing.scopeId,
    );
    if (!hasAccess) throw new ForbiddenException();

    if (ifMatch && existing.updatedAt.toISOString() !== ifMatch) {
      throw new HttpException(
        'Precondition Failed',
        HttpStatus.PRECONDITION_FAILED,
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.comparendo.update({
        where: { id },
        data: {
          date: dto.date !== undefined ? new Date(dto.date) : undefined,
          description: dto.description,
          status: dto.status,
          notes: dto.notes,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          action: 'comparendo.update',
          targetType: 'Comparendo',
          targetId: id,
          beforeJson: existing,
          afterJson: updated,
        },
      });
      return updated;
    });
    await this.realtime.notify({
      type: 'comparendo.update',
      scopeType: existing.scopeType,
      scopeId: existing.scopeId,
      payload: { id },
    });
    return result;
  }

  async remove(id: number, user: UserWithScopes) {
    const existing = await this.prisma.comparendo.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Comparendo not found');

    const hasAccess = await this.permissions.canAccess(
      user,
      existing.scopeType,
      existing.scopeId,
    );
    if (!hasAccess) throw new ForbiddenException();

    await this.prisma.$transaction(async (tx) => {
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          action: 'comparendo.delete',
          targetType: 'Comparendo',
          targetId: id,
          beforeJson: existing,
        },
      });
      await tx.comparendo.delete({ where: { id } });
    });
    await this.realtime.notify({
      type: 'comparendo.delete',
      scopeType: existing.scopeType,
      scopeId: existing.scopeId,
      payload: { id },
    });
  }
}
