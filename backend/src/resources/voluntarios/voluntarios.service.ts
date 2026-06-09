import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ScopeType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PermissionsService } from '../../permissions/permissions.service.js';
import { UserWithScopes } from '../../common/types/request-with-user.js';
import { CreateVoluntarioDto } from './dto/create-voluntario.dto.js';
import { UpdateVoluntarioDto } from './dto/update-voluntario.dto.js';

@Injectable()
export class VoluntariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  async findByComuna(comunaId: number) {
    return this.prisma.voluntario.findMany({
      where: { comunaId },
      orderBy: { id: 'asc' },
    });
  }

  async create(comunaId: number, dto: CreateVoluntarioDto, user: UserWithScopes) {
    const comuna = await this.prisma.comuna.findUnique({ where: { id: comunaId } });
    if (!comuna) throw new NotFoundException('Comuna not found');

    const canAccess = await this.permissions.canAccess(user, ScopeType.COMUNA, comunaId);
    if (!canAccess) throw new ForbiddenException();

    const voluntario = await this.prisma.voluntario.create({
      data: { ...dto, comunaId, createdById: user.id },
    });

    await this.prisma.auditLog.create({
      data: {
        actorUserId: user.id,
        action: 'voluntario.create',
        targetType: 'Voluntario',
        targetId: voluntario.id,
        afterJson: voluntario,
      },
    });

    return voluntario;
  }

  async update(id: number, dto: UpdateVoluntarioDto, user: UserWithScopes) {
    const existing = await this.prisma.voluntario.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Voluntario not found');

    const canAccess = await this.permissions.canAccess(user, ScopeType.COMUNA, existing.comunaId);
    if (!canAccess) throw new ForbiddenException();

    const updated = await this.prisma.voluntario.update({ where: { id }, data: dto });

    await this.prisma.auditLog.create({
      data: {
        actorUserId: user.id,
        action: 'voluntario.update',
        targetType: 'Voluntario',
        targetId: id,
        beforeJson: existing,
        afterJson: updated,
      },
    });

    return updated;
  }

  async remove(id: number, user: UserWithScopes) {
    const existing = await this.prisma.voluntario.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Voluntario not found');

    const canAccess = await this.permissions.canAccess(user, ScopeType.COMUNA, existing.comunaId);
    if (!canAccess) throw new ForbiddenException();

    await this.prisma.auditLog.create({
      data: {
        actorUserId: user.id,
        action: 'voluntario.delete',
        targetType: 'Voluntario',
        targetId: id,
        beforeJson: existing,
      },
    });

    await this.prisma.voluntario.delete({ where: { id } });
  }
}
