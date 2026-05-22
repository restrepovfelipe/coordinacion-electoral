import { Role } from '@prisma/client';

export type Resource =
  | 'testigos'
  | 'abogados'
  | 'movilidad'
  | 'refrigerios'
  | 'comparendos'
  | 'users';

export type Action = 'CREATE' | 'READ' | 'UPDATE' | 'DELETE';

/**
 * Declarative permission matrix.
 * All actions are scoped to the user's assigned scope — never global for
 * non-SUPER_ADMIN roles. Scope enforcement is handled by PermissionsService.
 */
export const PERMISSIONS: Record<Role, Record<Resource, readonly Action[]>> = {
  [Role.SUPER_ADMIN]: {
    testigos:    ['CREATE', 'READ', 'UPDATE', 'DELETE'],
    abogados:    ['CREATE', 'READ', 'UPDATE', 'DELETE'],
    movilidad:   ['CREATE', 'READ', 'UPDATE', 'DELETE'],
    refrigerios: ['CREATE', 'READ', 'UPDATE', 'DELETE'],
    comparendos: ['CREATE', 'READ', 'UPDATE', 'DELETE'],
    users:       ['CREATE', 'READ', 'UPDATE', 'DELETE'],
  },
  [Role.REGIONAL_COORDINATOR]: {
    testigos:    ['CREATE', 'READ', 'UPDATE', 'DELETE'],
    abogados:    ['CREATE', 'READ', 'UPDATE', 'DELETE'],
    movilidad:   ['CREATE', 'READ', 'UPDATE', 'DELETE'],
    refrigerios: ['CREATE', 'READ', 'UPDATE', 'DELETE'],
    comparendos: ['CREATE', 'READ', 'UPDATE', 'DELETE'],
    // Can create/edit users (roles up to MUNICIPAL), but cannot delete users
    users:       ['CREATE', 'READ', 'UPDATE'],
  },
  [Role.MUNICIPAL_COORDINATOR]: {
    testigos:    ['CREATE', 'READ', 'UPDATE', 'DELETE'],
    abogados:    ['CREATE', 'READ', 'UPDATE', 'DELETE'],
    movilidad:   ['CREATE', 'READ', 'UPDATE', 'DELETE'],
    refrigerios: ['CREATE', 'READ', 'UPDATE', 'DELETE'],
    comparendos: ['CREATE', 'READ', 'UPDATE', 'DELETE'],
    users:       [],
  },
  [Role.ZONE_COORDINATOR]: {
    testigos:    ['CREATE', 'READ', 'UPDATE', 'DELETE'],
    abogados:    ['CREATE', 'READ', 'UPDATE', 'DELETE'],
    movilidad:   ['CREATE', 'READ', 'UPDATE', 'DELETE'],
    refrigerios: ['CREATE', 'READ', 'UPDATE', 'DELETE'],
    comparendos: ['CREATE', 'READ', 'UPDATE', 'DELETE'],
    users:       [],
  },
  [Role.COMUNA_COORDINATOR]: {
    testigos:    ['CREATE', 'READ', 'UPDATE', 'DELETE'],
    abogados:    ['CREATE', 'READ', 'UPDATE', 'DELETE'],
    movilidad:   ['CREATE', 'READ', 'UPDATE', 'DELETE'],
    refrigerios: ['CREATE', 'READ', 'UPDATE', 'DELETE'],
    comparendos: ['CREATE', 'READ', 'UPDATE', 'DELETE'],
    users:       [],
  },
  [Role.PUESTO_COORDINATOR]: {
    // Can only update testigos in their own puesto, no create/delete
    testigos:    ['READ', 'UPDATE'],
    // Read-only for all other resources
    abogados:    ['READ'],
    movilidad:   ['READ'],
    refrigerios: ['READ'],
    comparendos: ['READ'],
    users:       [],
  },
} as const;

/**
 * Check if a given role is allowed to perform an action on a resource.
 * Does NOT perform scope checking — that remains in PermissionsService.
 */
export function canDo(role: Role, resource: Resource, action: Action): boolean {
  return (PERMISSIONS[role][resource] as readonly string[]).includes(action);
}
