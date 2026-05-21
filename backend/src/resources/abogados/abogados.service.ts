import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ScopeType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PermissionsService } from '../../permissions/permissions.service.js';
import { UserWithScopes } from '../../common/types/request-with-user.js';
import { CreateAbogadoDto } from './dto/create-abogado.dto.js';
import { UpdateAbogadoDto } from './dto/update-abogado.dto.js';

@Injectable()
export class AbogadosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  async create(
    municipioId: number,
    dto: CreateAbogadoDto,
    user: UserWithScopes,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const abogado = await tx.abogado.create({
        data: {
          ...dto,
          municipioId,
          createdById: user.id,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          action: 'abogado.create',
          targetType: 'Abogado',
          targetId: abogado.id,
          afterJson: abogado,
        },
      });
      return abogado;
    });
  }

  async update(id: number, dto: UpdateAbogadoDto, user: UserWithScopes) {
    const existing = await this.prisma.abogado.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Abogado not found');

    const canAccess = await this.permissions.canAccess(user, ScopeType.MUNICIPIO, existing.municipioId);
    if (!canAccess) throw new ForbiddenException();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.abogado.update({ where: { id }, data: dto });
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          action: 'abogado.update',
          targetType: 'Abogado',
          targetId: id,
          beforeJson: existing,
          afterJson: updated,
        },
      });
      return updated;
    });
  }

  async remove(id: number, user: UserWithScopes) {
    const existing = await this.prisma.abogado.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Abogado not found');

    const canAccess = await this.permissions.canAccess(user, ScopeType.MUNICIPIO, existing.municipioId);
    if (!canAccess) throw new ForbiddenException();

    await this.prisma.$transaction(async (tx) => {
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          action: 'abogado.delete',
          targetType: 'Abogado',
          targetId: id,
          beforeJson: existing,
        },
      });
      await tx.abogado.delete({ where: { id } });
    });
  }
}
