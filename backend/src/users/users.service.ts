import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, ScopeType, User, UserScope } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { FirebaseAdminService } from '../common/firebase/firebase-admin.service.js';
import { UserWithScopes } from '../common/types/request-with-user.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UpdateSelfDto } from './dto/update-self.dto.js';
import { AddScopeDto } from './dto/add-scope.dto.js';
import { ListUsersQueryDto } from './dto/list-users-query.dto.js';

type UserWithScopesResult = User & { scopes: UserScope[] };

const ROLE_SCOPE_TYPE: Record<Role, ScopeType | null> = {
  [Role.SUPER_ADMIN]: null,
  [Role.REGIONAL_COORDINATOR]: null,
  [Role.MUNICIPAL_COORDINATOR]: ScopeType.MUNICIPIO,
  [Role.ZONE_COORDINATOR]: ScopeType.ZONA,
  [Role.COMUNA_COORDINATOR]: ScopeType.COMUNA,
  [Role.PUESTO_COORDINATOR]: ScopeType.PUESTO,
};
type UserWithoutCipUid = Omit<UserWithScopesResult, 'cipUid'>;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly firebaseAdmin: FirebaseAdminService,
  ) {}

  private omitCipUid<T extends { cipUid?: string }>(user: T): Omit<T, 'cipUid'> {
    const { cipUid: _cipUid, ...rest } = user;
    return rest as Omit<T, 'cipUid'>;
  }

  async list(query: ListUsersQueryDto, actor: UserWithScopes): Promise<{
    data: UserWithoutCipUid[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.UserWhereInput = {};
    if (query.role !== undefined) where.role = query.role;
    if (query.active !== undefined) where.active = query.active;

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: { scopes: true },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users.map((u) => this.omitCipUid(u)),
      total,
      page,
      limit,
    };
  }

  async findOne(id: number): Promise<UserWithoutCipUid> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { scopes: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return this.omitCipUid(user);
  }

  async updateSelf(actor: UserWithScopes, dto: UpdateSelfDto): Promise<UserWithoutCipUid> {
    if (dto.newPassword) {
      await this.firebaseAdmin.auth.updateUser(actor.cipUid, { password: dto.newPassword });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.user.update({
        where: { id: actor.id },
        data: {
          ...(dto.displayName !== undefined && { displayName: dto.displayName }),
          ...(dto.phone !== undefined && { phone: dto.phone }),
        },
        include: { scopes: true },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'user.updateSelf',
          targetType: 'User',
          targetId: actor.id,
          afterJson: { displayName: result.displayName, phone: result.phone } as Prisma.InputJsonValue,
        },
      });

      return result;
    });

    return this.omitCipUid(updated);
  }

  async create(dto: CreateUserDto, actor: UserWithScopes): Promise<UserWithoutCipUid> {
    // REGIONAL cannot create SUPER_ADMIN users
    if (actor.role === Role.REGIONAL_COORDINATOR && dto.role === Role.SUPER_ADMIN) {
      throw new ForbiddenException('Coordinador Regional no puede crear Super Administradores');
    }

    // Create the Firebase user first (outside the Prisma transaction so we can roll back if needed)
    let cipUid: string | null = null;
    try {
      const firebaseUser = await this.firebaseAdmin.auth.createUser({
        email: `${dto.username}@defensores.local`,
        password: dto.password,
        emailVerified: false,
      });
      cipUid = firebaseUser.uid;
    } catch (err: any) {
      if (err?.code === 'auth/email-already-exists') {
        throw new ConflictException(`El usuario '${dto.username}' ya existe en el sistema`);
      }
      throw new InternalServerErrorException(
        `Error al crear el usuario en autenticación: ${err?.message ?? 'desconocido'}`,
      );
    }

    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            username: dto.username,
            displayName: dto.displayName,
            phone: dto.phone,
            notes: dto.notes,
            role: dto.role,
            cipUid,
            mustChangePassword: false,
            createdByUserId: actor.id,
            scopes: dto.scopes
              ? {
                  create: dto.scopes.map((s) => ({
                    scopeType: s.scopeType,
                    scopeId: s.scopeId,
                  })),
                }
              : undefined,
          },
          include: { scopes: true },
        });

        await tx.auditLog.create({
          data: {
            actorUserId: actor.id,
            action: 'user.create',
            targetType: 'User',
            targetId: created.id,
            afterJson: {
              id: created.id,
              username: created.username,
              displayName: created.displayName,
              role: created.role,
              scopes: created.scopes.map(s => ({ scopeType: s.scopeType, scopeId: s.scopeId })),
            } as Prisma.InputJsonValue,
          },
        });

        return created;
      });

      return this.omitCipUid(user);
    } catch (err: any) {
      // Roll back the Firebase user so the system stays in sync
      if (cipUid) {
        await this.firebaseAdmin.auth.deleteUser(cipUid).catch(() => {});
      }
      // Translate Prisma unique-constraint violation into a meaningful 409
      if (err?.code === 'P2002') {
        throw new ConflictException(`El nombre de usuario '${dto.username}' ya está en uso`);
      }
      throw err;
    }
  }

  async update(id: number, dto: UpdateUserDto, actor: UserWithScopes): Promise<UserWithoutCipUid> {
    const existing = await this.prisma.user.findUnique({
      where: { id },
      include: { scopes: true },
    });
    if (!existing) throw new NotFoundException('User not found');

    // REGIONAL cannot edit SUPER_ADMINs
    if (actor.role === Role.REGIONAL_COORDINATOR && existing.role === Role.SUPER_ADMIN) {
      throw new ForbiddenException('Coordinador Regional no puede editar Super Administradores');
    }
    // REGIONAL cannot promote anyone to SUPER_ADMIN
    if (actor.role === Role.REGIONAL_COORDINATOR && dto.role === Role.SUPER_ADMIN) {
      throw new ForbiddenException('Coordinador Regional no puede asignar rol Super Administrador');
    }

    // Validate scope type matches effective role
    const effectiveRole = dto.role ?? existing.role;
    const expectedScopeType = ROLE_SCOPE_TYPE[effectiveRole];
    if (dto.scope !== undefined && dto.scope !== null) {
      if (dto.scope.type !== expectedScopeType) {
        throw new BadRequestException(
          `El tipo de scope '${dto.scope.type}' no corresponde al rol '${effectiveRole}' (se espera '${expectedScopeType ?? 'ninguno'}')`,
        );
      }
    }

    if (dto.newPassword) {
      await this.firebaseAdmin.auth.updateUser(existing.cipUid, { password: dto.newPassword });
    }

    // Build only the Prisma model fields that are actually provided in the DTO
    // (avoids PrismaClientValidationError when data ends up empty after stripping undefineds)
    const modelData: Prisma.UserUpdateInput = {
      ...(dto.displayName !== undefined && { displayName: dto.displayName }),
      ...(dto.phone !== undefined && { phone: dto.phone }),
      ...(dto.notes !== undefined && { notes: dto.notes }),
      ...(dto.role !== undefined && { role: dto.role }),
      ...(dto.active !== undefined && { active: dto.active }),
      ...(dto.mustChangePassword !== undefined && { mustChangePassword: dto.mustChangePassword }),
    };

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = Object.keys(modelData).length > 0
        ? await tx.user.update({ where: { id }, data: modelData, include: { scopes: true } })
        : await tx.user.findUniqueOrThrow({ where: { id }, include: { scopes: true } });

      // Replace scopes if 'scope' field is present in the payload (including null → clear)
      if (dto.scope !== undefined) {
        await tx.userScope.deleteMany({ where: { userId: id } });
        if (dto.scope !== null) {
          await tx.userScope.create({
            data: { userId: id, scopeType: dto.scope.type, scopeId: dto.scope.id },
          });
        }
        // Re-fetch to get updated scopes
        result.scopes = await tx.userScope.findMany({ where: { userId: id } });
      }

      const { cipUid: _before, ...beforeJson } = existing;
      const { cipUid: _after, ...afterJson } = result;

      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'user.update',
          targetType: 'User',
          targetId: id,
          beforeJson: {
            ...beforeJson,
            scopes: existing.scopes.map(s => ({ type: s.scopeType, id: s.scopeId })),
          } as Prisma.InputJsonValue,
          afterJson: {
            ...afterJson,
            scope: dto.scope ?? null,
          } as Prisma.InputJsonValue,
        },
      });

      return result;
    });

    return this.omitCipUid(updated);
  }

  async deactivate(id: number, actor: UserWithScopes): Promise<void> {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('User not found');

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { active: false },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'user.deactivate',
          targetType: 'User',
          targetId: id,
          beforeJson: { id: existing.id, username: existing.username, active: existing.active } as Prisma.InputJsonValue,
          afterJson: { id: existing.id, username: existing.username, active: false } as Prisma.InputJsonValue,
        },
      });
    });

    await this.firebaseAdmin.auth.revokeRefreshTokens(existing.cipUid);
  }

  async hardDelete(id: number, actor: UserWithScopes): Promise<void> {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('User not found');
    if (existing.active) throw new BadRequestException('User must be deactivated before deletion');

    // Delete from Firebase first (can retry if Prisma fails, but not vice versa)
    await this.firebaseAdmin.auth.deleteUser(existing.cipUid);

    await this.prisma.$transaction(async (tx) => {
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'user.hardDelete',
          targetType: 'User',
          targetId: id,
          beforeJson: { id: existing.id, username: existing.username } as Prisma.InputJsonValue,
        },
      });
      await tx.userScope.deleteMany({ where: { userId: id } });
      await tx.user.delete({ where: { id } });
    });
  }

  async addScope(userId: number, dto: AddScopeDto, actor: UserWithScopes): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    await this.prisma.$transaction(async (tx) => {
      const scope = await tx.userScope.upsert({
        where: {
          userId_scopeType_scopeId: {
            userId,
            scopeType: dto.scopeType,
            scopeId: dto.scopeId,
          },
        },
        create: {
          userId,
          scopeType: dto.scopeType,
          scopeId: dto.scopeId,
        },
        update: {},
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'user.scope.add',
          targetType: 'UserScope',
          targetId: scope.id,
          afterJson: { userId, scopeType: dto.scopeType, scopeId: dto.scopeId } as Prisma.InputJsonValue,
        },
      });
    });
  }

  async removeScope(userId: number, scopeRecordId: number, actor: UserWithScopes): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const scope = await this.prisma.userScope.findUnique({ where: { id: scopeRecordId } });
    if (!scope || scope.userId !== userId) throw new NotFoundException('Scope not found');

    await this.prisma.$transaction(async (tx) => {
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'user.scope.remove',
          targetType: 'UserScope',
          targetId: scopeRecordId,
          beforeJson: { userId: scope.userId, scopeType: scope.scopeType, scopeId: scope.scopeId } as Prisma.InputJsonValue,
        },
      });

      await tx.userScope.delete({ where: { id: scopeRecordId } });
    });
  }
}
