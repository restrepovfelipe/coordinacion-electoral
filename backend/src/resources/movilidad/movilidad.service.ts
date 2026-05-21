import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ScopeType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PermissionsService } from '../../permissions/permissions.service.js';
import { UserWithScopes } from '../../common/types/request-with-user.js';
import { CreateMovilidadDto } from './dto/create-movilidad.dto.js';
import { UpdateMovilidadDto } from './dto/update-movilidad.dto.js';

@Injectable()
export class MovilidadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  async create(dto: CreateMovilidadDto, user: UserWithScopes) {
    const canAccess = await this.permissions.canAccess(
      user,
      dto.scopeType,
      dto.scopeId,
    );
    if (!canAccess) throw new ForbiddenException();

    return this.prisma.$transaction(async (tx) => {
      const movilidad = await tx.movilidad.create({
        data: {
          ...dto,
          createdById: user.id,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          action: 'movilidad.create',
          targetType: 'Movilidad',
          targetId: movilidad.id,
          afterJson: movilidad,
        },
      });
      return movilidad;
    });
  }

  async update(id: number, dto: UpdateMovilidadDto, user: UserWithScopes) {
    const existing = await this.prisma.movilidad.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Movilidad not found');

    const hasAccess = await this.permissions.canAccess(user, existing.scopeType as ScopeType, existing.scopeId);
    if (!hasAccess) throw new ForbiddenException();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.movilidad.update({ where: { id }, data: dto });
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          action: 'movilidad.update',
          targetType: 'Movilidad',
          targetId: id,
          beforeJson: existing,
          afterJson: updated,
        },
      });
      return updated;
    });
  }

  async remove(id: number, user: UserWithScopes) {
    const existing = await this.prisma.movilidad.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Movilidad not found');

    const hasAccess = await this.permissions.canAccess(user, existing.scopeType as ScopeType, existing.scopeId);
    if (!hasAccess) throw new ForbiddenException();

    await this.prisma.$transaction(async (tx) => {
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          action: 'movilidad.delete',
          targetType: 'Movilidad',
          targetId: id,
          beforeJson: existing,
        },
      });
      await tx.movilidad.delete({ where: { id } });
    });
  }
}
