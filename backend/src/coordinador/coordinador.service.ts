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

export type ScopeTypeLower = 'municipio' | 'zona' | 'comuna' | 'puesto' | 'subregion';

const SCOPE_MAP: Record<ScopeTypeLower, ScopeType> = {
  municipio: ScopeType.MUNICIPIO,
  zona: ScopeType.ZONA,
  comuna: ScopeType.COMUNA,
  puesto: ScopeType.PUESTO,
  subregion: ScopeType.SUBREGION,
};

export interface CoordinadorDisplay {
  source: 'user' | 'adhoc' | 'none';
  nombre: string | null;
  telefono: string | null;
  cedula?: string | null;
  correo?: string | null;
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

  // Returns coordinator info for every puesto in a municipality in two queries.
  // Response: Array<{ puestoId, nombre, telefono }>  (only entries with a coordinator)
  async puestosByMuni(municipioId: number): Promise<Array<{ puestoId: number; nombre: string; telefono: string | null; cedula: string | null; correo: string | null; nombre2: string | null; telefono2: string | null; cedula2: string | null; correo2: string | null; tag: string | null; notas: string | null }>> {
    // 1. Adhoc coordinators — fetch any puesto with coordinator, tag (non-default), or notes set
    const puestosAdhoc = await this.prisma.puesto.findMany({
      where: {
        municipioId,
        OR: [
          { coordinadorAdHocNombre: { not: null } },
          { notas: { not: null } },
          { tag: { in: ['ok', 'pr', 'pe', 'al'] } },
        ],
      },
      select: { id: true, coordinadorAdHocNombre: true, coordinadorAdHocTelefono: true, coordinadorAdHocCedula: true, coordinadorAdHocCorreo: true, coordinadorAdHocNombre2: true, coordinadorAdHocTelefono2: true, coordinadorAdHocCedula2: true, coordinadorAdHocCorreo2: true, tag: true, notas: true },
    });

    // 2. User-based coordinators — get all puesto IDs first, then scope+user
    const allPuestoIds = await this.prisma.puesto.findMany({
      where: { municipioId },
      select: { id: true },
    });
    const puestoIdSet = allPuestoIds.map(p => p.id);

    const userCoords = await this.prisma.userScope.findMany({
      where: { scopeType: ScopeType.PUESTO, scopeId: { in: puestoIdSet } },
      select: {
        scopeId: true,
        user: { select: { displayName: true, phone: true, active: true } },
      },
    });

    // Merge: user-coord takes priority over adhoc for the same puesto
    const result = new Map<number, { puestoId: number; nombre: string; telefono: string | null; cedula: string | null; correo: string | null; nombre2: string | null; telefono2: string | null; cedula2: string | null; correo2: string | null; tag: string | null; notas: string | null }>();

    for (const p of puestosAdhoc) {
      result.set(p.id, {
        puestoId: p.id,
        nombre: p.coordinadorAdHocNombre ?? '',
        telefono: p.coordinadorAdHocTelefono ?? null,
        cedula: p.coordinadorAdHocCedula ?? null,
        correo: p.coordinadorAdHocCorreo ?? null,
        nombre2: p.coordinadorAdHocNombre2 ?? null,
        telefono2: p.coordinadorAdHocTelefono2 ?? null,
        cedula2: p.coordinadorAdHocCedula2 ?? null,
        correo2: p.coordinadorAdHocCorreo2 ?? null,
        tag: p.tag ?? null,
        notas: p.notas ?? null,
      });
    }
    for (const uc of userCoords) {
      if (uc.user.active && uc.user.displayName) {
        result.set(uc.scopeId, { puestoId: uc.scopeId, nombre: uc.user.displayName, telefono: uc.user.phone ?? null, cedula: null, correo: null, nombre2: null, telefono2: null, cedula2: null, correo2: null, tag: null, notas: null });
      }
    }

    return Array.from(result.values());
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
    if (adhocData['coordinadorAdHocNombre']) {
      return {
        source: 'adhoc',
        nombre: adhocData['coordinadorAdHocNombre'],
        telefono: adhocData['coordinadorAdHocTelefono'] ?? null,
        cedula: adhocData['coordinadorAdHocCedula'] ?? null,
        correo: adhocData['coordinadorAdHocCorreo'] ?? null,
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
    await this.setAdhocFields(scopeType, id, dto.nombre ?? null, dto.telefono ?? null, dto.tag ?? null, dto.notas ?? null, dto.nombre2 ?? null, dto.telefono2 ?? null, dto.cedula ?? null, dto.correo ?? null, dto.cedula2 ?? null, dto.correo2 ?? null);
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
      payload: { scopeType, scopeId: id, nombre: dto.nombre ?? null, telefono: dto.telefono ?? null, tag: dto.tag ?? null, notas: dto.notas ?? null },
    });

    return this.display(scopeTypeRaw, id);
  }

  private async getAdhocFields(scopeType: ScopeType, id: number): Promise<Record<string, string | null>> {
    const selectBase = { coordinadorAdHocNombre: true, coordinadorAdHocTelefono: true } as const;
    const selectComuna = { coordinadorAdHocNombre: true, coordinadorAdHocTelefono: true, coordinadorAdHocCedula: true, coordinadorAdHocCorreo: true } as const;
    const selectPuesto = { coordinadorAdHocNombre: true, coordinadorAdHocTelefono: true, coordinadorAdHocCedula: true, coordinadorAdHocCorreo: true, coordinadorAdHocNombre2: true, coordinadorAdHocTelefono2: true, coordinadorAdHocCedula2: true, coordinadorAdHocCorreo2: true } as const;

    let row: Record<string, string | null> | null = null;

    switch (scopeType) {
      case ScopeType.MUNICIPIO:
        row = await this.prisma.municipio.findUnique({ where: { id }, select: selectBase });
        break;
      case ScopeType.ZONA:
        row = await this.prisma.zona.findUnique({ where: { id }, select: selectBase });
        break;
      case ScopeType.COMUNA:
        row = await this.prisma.comuna.findUnique({ where: { id }, select: selectComuna });
        break;
      case ScopeType.PUESTO:
        row = await this.prisma.puesto.findUnique({ where: { id }, select: selectPuesto });
        break;
      case ScopeType.SUBREGION:
        row = await this.prisma.subregion.findUnique({ where: { id }, select: selectBase });
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
    tag: string | null = null,
    notas: string | null = null,
    nombre2: string | null = null,
    telefono2: string | null = null,
    cedula: string | null = null,
    correo: string | null = null,
    cedula2: string | null = null,
    correo2: string | null = null,
  ): Promise<void> {
    const data: Record<string, string | null> = {
      coordinadorAdHocNombre: nombre,
      coordinadorAdHocTelefono: telefono,
    };
    // cedula/correo exist on Puesto and Comuna
    if (scopeType === ScopeType.PUESTO || scopeType === ScopeType.COMUNA) {
      data['coordinadorAdHocCedula'] = cedula;
      data['coordinadorAdHocCorreo'] = correo;
    }
    // tag, notas, and coord2 only exist on Puesto
    if (scopeType === ScopeType.PUESTO) {
      data['tag'] = tag;
      data['notas'] = notas;
      data['coordinadorAdHocNombre2'] = nombre2;
      data['coordinadorAdHocTelefono2'] = telefono2;
      data['coordinadorAdHocCedula2'] = cedula2;
      data['coordinadorAdHocCorreo2'] = correo2;
    }

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
      case ScopeType.SUBREGION:
        await this.prisma.subregion.update({ where: { id }, data });
        break;
      default:
        throw new NotFoundException(`scopeType ${scopeType} does not support ad-hoc coordinators`);
    }
  }
}
