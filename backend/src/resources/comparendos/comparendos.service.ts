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
import { CreateComparendoDto } from './dto/create-comparendo.dto.js';
import { UpdateComparendoDto } from './dto/update-comparendo.dto.js';

@Injectable()
export class ComparendosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  async create(dto: CreateComparendoDto, user: UserWithScopes) {
    const canAccess = await this.permissions.canAccess(
      user,
      dto.scopeType,
      dto.scopeId,
    );
    if (!canAccess) throw new ForbiddenException();

    return this.prisma.$transaction(async (tx) => {
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
  }

  async update(
    id: number,
    dto: UpdateComparendoDto,
    user: UserWithScopes,
    ifMatch?: string,
  ) {
    const existing = await this.prisma.comparendo.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Comparendo not found');

    if (ifMatch && existing.updatedAt.toISOString() !== ifMatch) {
      throw new HttpException('Precondition Failed', HttpStatus.PRECONDITION_FAILED);
    }

    return this.prisma.$transaction(async (tx) => {
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
  }

  async remove(id: number, user: UserWithScopes) {
    const existing = await this.prisma.comparendo.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Comparendo not found');

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
  }
}
