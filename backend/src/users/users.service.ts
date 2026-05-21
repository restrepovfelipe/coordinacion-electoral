import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Prisma, Role, User, UserScope } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { FirebaseAdminService } from '../common/firebase/firebase-admin.service.js';
import { UserWithScopes } from '../common/types/request-with-user.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { AddScopeDto } from './dto/add-scope.dto.js';
import { ListUsersQueryDto } from './dto/list-users-query.dto.js';

type UserWithScopesResult = User & { scopes: UserScope[] };
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

  async create(dto: CreateUserDto, actor: UserWithScopes): Promise<UserWithoutCipUid> {
    const password = randomBytes(12).toString('base64url');

    const firebaseUser = await this.firebaseAdmin.auth.createUser({
      email: `${dto.username}@cmd.local`,
      password,
      emailVerified: false,
    });

    const cipUid = firebaseUser.uid;

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          username: dto.username,
          displayName: dto.displayName,
          phone: dto.phone,
          notes: dto.notes,
          role: dto.role,
          cipUid,
          mustChangePassword: true,
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
          } as Prisma.InputJsonValue,
        },
      });

      return created;
    });

    return this.omitCipUid(user);
  }

  async update(id: number, dto: UpdateUserDto, actor: UserWithScopes): Promise<UserWithoutCipUid> {
    const existing = await this.prisma.user.findUnique({
      where: { id },
      include: { scopes: true },
    });
    if (!existing) throw new NotFoundException('User not found');

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.user.update({
        where: { id },
        data: {
          displayName: dto.displayName,
          phone: dto.phone,
          notes: dto.notes,
          role: dto.role,
          active: dto.active,
          mustChangePassword: dto.mustChangePassword,
        },
        include: { scopes: true },
      });

      const { cipUid: _before, ...beforeJson } = existing;
      const { cipUid: _after, ...afterJson } = result;

      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'user.update',
          targetType: 'User',
          targetId: id,
          beforeJson: beforeJson as Prisma.InputJsonValue,
          afterJson: afterJson as Prisma.InputJsonValue,
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
