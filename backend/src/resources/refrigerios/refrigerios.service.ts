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
import { CreateRefrigerioDto } from './dto/create-refrigerio.dto.js';
import { UpdateRefrigerioDto } from './dto/update-refrigerio.dto.js';
import { RealtimeService } from '../../realtime/realtime.service.js';

@Injectable()
export class RefrigeriosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly realtime: RealtimeService,
  ) {}

  async create(dto: CreateRefrigerioDto, user: UserWithScopes) {
    const canAccess = await this.permissions.canAccess(
      user,
      dto.scopeType,
      dto.scopeId,
    );
    if (!canAccess) throw new ForbiddenException();

    const result = await this.prisma.$transaction(async (tx) => {
      const refrigerio = await tx.refrigerio.create({
        data: {
          ...dto,
          createdById: user.id,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          action: 'refrigerio.create',
          targetType: 'Refrigerio',
          targetId: refrigerio.id,
          afterJson: refrigerio,
        },
      });
      return refrigerio;
    });
    await this.realtime.notify({ type: 'refrigerio.create', scopeType: dto.scopeType, scopeId: dto.scopeId, payload: { id: result.id } });
    return result;
  }

  async update(
    id: number,
    dto: UpdateRefrigerioDto,
    user: UserWithScopes,
    ifMatch?: string,
  ) {
    const existing = await this.prisma.refrigerio.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Refrigerio not found');

    const hasAccess = await this.permissions.canAccess(user, existing.scopeType as ScopeType, existing.scopeId);
    if (!hasAccess) throw new ForbiddenException();

    if (ifMatch && existing.updatedAt.toISOString() !== ifMatch) {
      throw new HttpException('Precondition Failed', HttpStatus.PRECONDITION_FAILED);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.refrigerio.update({ where: { id }, data: dto });
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          action: 'refrigerio.update',
          targetType: 'Refrigerio',
          targetId: id,
          beforeJson: existing,
          afterJson: updated,
        },
      });
      return updated;
    });
    await this.realtime.notify({ type: 'refrigerio.update', scopeType: existing.scopeType, scopeId: existing.scopeId, payload: { id } });
    return result;
  }

  async remove(id: number, user: UserWithScopes) {
    const existing = await this.prisma.refrigerio.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Refrigerio not found');

    const hasAccess = await this.permissions.canAccess(user, existing.scopeType as ScopeType, existing.scopeId);
    if (!hasAccess) throw new ForbiddenException();

    await this.prisma.$transaction(async (tx) => {
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          action: 'refrigerio.delete',
          targetType: 'Refrigerio',
          targetId: id,
          beforeJson: existing,
        },
      });
      await tx.refrigerio.delete({ where: { id } });
    });
    await this.realtime.notify({ type: 'refrigerio.delete', scopeType: existing.scopeType, scopeId: existing.scopeId, payload: { id } });
  }
}
