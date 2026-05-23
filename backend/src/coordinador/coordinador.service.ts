import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ScopeType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { UserWithScopes } from '../common/types/request-with-user.js';
import { PatchAdhocDto } from './dto/patch-adhoc.dto.js';

export type ScopeTypeLower = 'municipio' | 'zona' | 'comuna' | 'puesto';

const SCOPE_MAP: Record<ScopeTypeLower, ScopeType> = {
  municipio: ScopeType.MUNICIPIO,
  zona: ScopeType.ZONA,
  comuna: ScopeType.COMUNA,
  puesto: ScopeType.PUESTO,
};

export interface CoordinadorDisplay {
  source: 'user' | 'adhoc' | 'none';
  nombre: string | null;
  telefono: string | null;
  userId?: number;
}

@Injectable()
export class CoordinadorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  private toScopeType(raw: string): ScopeType {
    const lower = raw.toLowerCase() as ScopeTypeLower;
    const mapped = SCOPE_MAP[lower];
    if (!mapped) throw new NotFoundException(`Unknown scopeType: ${raw}`);
    return mapped;
  }

  async display(
    scopeTypeRaw: string,
    id: number,
  ): Promise<CoordinadorDisplay> {
    const scopeType = this.toScopeType(scopeTypeRaw);

    // Check for user-coordinator (a user scoped directly to this entity)
    const userCoord = await this.prisma.user.findFirst({
      where: {
        active: true,
        scopes: { some: { scopeType, scopeId: id } },
      },
      select: { id: true, displayName: true, phone: true },
    });

    if (userCoord) {
      return {
        source: 'user',
        nombre: userCoord.displayName,
        telefono: userCoord.phone ?? null,
        userId: userCoord.id,
      };
    }

    // Check for ad-hoc coordinator stored on the scope entity
    const adhocData = await this.getAdhocFields(scopeType, id);
    if (adhocData.coordinadorAdHocNombre) {
      return {
        source: 'adhoc',
        nombre: adhocData.coordinadorAdHocNombre,
        telefono: adhocData.coordinadorAdHocTelefono ?? null,
      };
    }

    return { source: 'none', nombre: null, telefono: null };
  }

  async patchAdhoc(
    scopeTypeRaw: string,
    id: number,
    dto: PatchAdhocDto,
    actor: UserWithScopes,
  ): Promise<CoordinadorDisplay> {
    const scopeType = this.toScopeType(scopeTypeRaw);

    // 409 if a user-coordinator already exists for this scope
    const userCoord = await this.prisma.user.findFirst({
      where: { active: true, scopes: { some: { scopeType, scopeId: id } } },
      select: { id: true },
    });
    if (userCoord) {
      throw new ConflictException(
        'A user-coordinator is already assigned to this scope. Remove the user assignment first.',
      );
    }

    const before = await this.getAdhocFields(scopeType, id);
    await this.setAdhocFields(scopeType, id, dto.nombre ?? null, dto.telefono ?? null);
    const after = await this.getAdhocFields(scopeType, id);

    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: 'coordinador.adhoc.patch',
        targetType: scopeType,
        targetId: id,
        beforeJson: before as object,
        afterJson: after as object,
      },
    });

    await this.realtime.notify({
      type: 'coordinador:adhoc_changed',
      scopeType: scopeType as string,
      scopeId: id,
      payload: { scopeType, scopeId: id, nombre: dto.nombre ?? null, telefono: dto.telefono ?? null },
    });

    return this.display(scopeTypeRaw, id);
  }

  private async getAdhocFields(
    scopeType: ScopeType,
    id: number,
  ): Promise<{ coordinadorAdHocNombre: string | null; coordinadorAdHocTelefono: string | null }> {
    const select = {
      coordinadorAdHocNombre: true,
      coordinadorAdHocTelefono: true,
    } as const;

    let row:
      | { coordinadorAdHocNombre: string | null; coordinadorAdHocTelefono: string | null }
      | null = null;

    switch (scopeType) {
      case ScopeType.MUNICIPIO:
        row = await this.prisma.municipio.findUnique({ where: { id }, select });
        break;
      case ScopeType.ZONA:
        row = await this.prisma.zona.findUnique({ where: { id }, select });
        break;
      case ScopeType.COMUNA:
        row = await this.prisma.comuna.findUnique({ where: { id }, select });
        break;
      case ScopeType.PUESTO:
        row = await this.prisma.puesto.findUnique({ where: { id }, select });
        break;
      default:
        throw new NotFoundException(`scopeType ${scopeType} does not support ad-hoc coordinators`);
    }

    if (!row) throw new NotFoundException(`${scopeType} with id ${id} not found`);
    return row;
  }

  private async setAdhocFields(
    scopeType: ScopeType,
    id: number,
    nombre: string | null,
    telefono: string | null,
  ): Promise<void> {
    const data = {
      coordinadorAdHocNombre: nombre,
      coordinadorAdHocTelefono: telefono,
    };

    switch (scopeType) {
      case ScopeType.MUNICIPIO:
        await this.prisma.municipio.update({ where: { id }, data });
        break;
      case ScopeType.ZONA:
        await this.prisma.zona.update({ where: { id }, data });
        break;
      case ScopeType.COMUNA:
        await this.prisma.comuna.update({ where: { id }, data });
        break;
      case ScopeType.PUESTO:
        await this.prisma.puesto.update({ where: { id }, data });
        break;
      default:
        throw new NotFoundException(`scopeType ${scopeType} does not support ad-hoc coordinators`);
    }
  }
}
