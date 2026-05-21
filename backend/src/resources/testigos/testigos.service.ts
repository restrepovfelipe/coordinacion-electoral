import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ScopeType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PermissionsService } from '../../permissions/permissions.service.js';
import { UserWithScopes } from '../../common/types/request-with-user.js';
import { CreateTestigoDto } from './dto/create-testigo.dto.js';
import { UpdateTestigoDto } from './dto/update-testigo.dto.js';

@Injectable()
export class TestigosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  async create(
    puestoId: number,
    dto: CreateTestigoDto,
    user: UserWithScopes,
  ) {
    return this.prisma.$transaction(async (tx) => {
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
  }

  async update(id: number, dto: UpdateTestigoDto, user: UserWithScopes) {
    const existing = await this.prisma.testigo.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Testigo not found');

    if (existing.puestoId === null) throw new ForbiddenException();
    const canAccess = await this.permissions.canAccess(user, ScopeType.PUESTO, existing.puestoId);
    if (!canAccess) throw new ForbiddenException();

    return this.prisma.$transaction(async (tx) => {
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
  }

  async remove(id: number, user: UserWithScopes) {
    const existing = await this.prisma.testigo.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Testigo not found');

    if (existing.puestoId === null) throw new ForbiddenException();
    const canAccess = await this.permissions.canAccess(user, ScopeType.PUESTO, existing.puestoId);
    if (!canAccess) throw new ForbiddenException();

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
  }
}
