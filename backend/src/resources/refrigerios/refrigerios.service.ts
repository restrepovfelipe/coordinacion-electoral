import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PermissionsService } from '../../permissions/permissions.service.js';
import { UserWithScopes } from '../../common/types/request-with-user.js';
import { CreateRefrigerioDto } from './dto/create-refrigerio.dto.js';
import { UpdateRefrigerioDto } from './dto/update-refrigerio.dto.js';

@Injectable()
export class RefrigeriosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  async create(dto: CreateRefrigerioDto, user: UserWithScopes) {
    const canAccess = await this.permissions.canAccess(
      user,
      dto.scopeType,
      dto.scopeId,
    );
    if (!canAccess) throw new ForbiddenException();

    return this.prisma.$transaction(async (tx) => {
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
  }

  async update(
    id: number,
    dto: UpdateRefrigerioDto,
    user: UserWithScopes,
    ifMatch?: string,
  ) {
    const existing = await this.prisma.refrigerio.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Refrigerio not found');

    if (ifMatch && existing.updatedAt.toISOString() !== ifMatch) {
      throw new HttpException('Precondition Failed', HttpStatus.PRECONDITION_FAILED);
    }

    return this.prisma.$transaction(async (tx) => {
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
  }

  async remove(id: number, user: UserWithScopes) {
    const existing = await this.prisma.refrigerio.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Refrigerio not found');

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
  }
}
