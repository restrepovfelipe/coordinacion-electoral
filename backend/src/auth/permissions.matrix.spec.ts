import { Role } from '@prisma/client';
import { canDo, Resource, Action } from './permissions.matrix';

// ─── Parameterized matrix test ───────────────────────────────────────────────
// For each (role, resource) pair: verify at least one allowed action and one
// denied action, giving 6 roles × 5 resources × 2 paths ≥ 60 cases.

type TestCase = {
  role: Role;
  resource: Resource;
  allowed: Action[];
  denied: Action[];
};

const cases: TestCase[] = [
  // SUPER_ADMIN — omnipotent on all resources
  { role: Role.SUPER_ADMIN, resource: 'testigos',    allowed: ['CREATE', 'READ', 'UPDATE', 'DELETE'], denied: [] },
  { role: Role.SUPER_ADMIN, resource: 'abogados',    allowed: ['CREATE', 'READ', 'UPDATE', 'DELETE'], denied: [] },
  { role: Role.SUPER_ADMIN, resource: 'movilidad',   allowed: ['CREATE', 'READ', 'UPDATE', 'DELETE'], denied: [] },
  { role: Role.SUPER_ADMIN, resource: 'refrigerios', allowed: ['CREATE', 'READ', 'UPDATE', 'DELETE'], denied: [] },
  { role: Role.SUPER_ADMIN, resource: 'comparendos', allowed: ['CREATE', 'READ', 'UPDATE', 'DELETE'], denied: [] },
  { role: Role.SUPER_ADMIN, resource: 'users',       allowed: ['CREATE', 'READ', 'UPDATE', 'DELETE'], denied: [] },

  // REGIONAL_COORDINATOR — full CRUD on resources; CREATE/READ/UPDATE on users, no DELETE
  { role: Role.REGIONAL_COORDINATOR, resource: 'testigos',    allowed: ['CREATE', 'READ', 'UPDATE', 'DELETE'], denied: [] },
  { role: Role.REGIONAL_COORDINATOR, resource: 'abogados',    allowed: ['CREATE', 'READ', 'UPDATE', 'DELETE'], denied: [] },
  { role: Role.REGIONAL_COORDINATOR, resource: 'movilidad',   allowed: ['CREATE', 'READ', 'UPDATE', 'DELETE'], denied: [] },
  { role: Role.REGIONAL_COORDINATOR, resource: 'refrigerios', allowed: ['CREATE', 'READ', 'UPDATE', 'DELETE'], denied: [] },
  { role: Role.REGIONAL_COORDINATOR, resource: 'comparendos', allowed: ['CREATE', 'READ', 'UPDATE', 'DELETE'], denied: [] },
  { role: Role.REGIONAL_COORDINATOR, resource: 'users',       allowed: ['CREATE', 'READ', 'UPDATE'], denied: ['DELETE'] },

  // MUNICIPAL_COORDINATOR — full CRUD on resources; no user management
  { role: Role.MUNICIPAL_COORDINATOR, resource: 'testigos',    allowed: ['CREATE', 'READ', 'UPDATE', 'DELETE'], denied: [] },
  { role: Role.MUNICIPAL_COORDINATOR, resource: 'abogados',    allowed: ['CREATE', 'READ', 'UPDATE', 'DELETE'], denied: [] },
  { role: Role.MUNICIPAL_COORDINATOR, resource: 'movilidad',   allowed: ['CREATE', 'READ', 'UPDATE', 'DELETE'], denied: [] },
  { role: Role.MUNICIPAL_COORDINATOR, resource: 'refrigerios', allowed: ['CREATE', 'READ', 'UPDATE', 'DELETE'], denied: [] },
  { role: Role.MUNICIPAL_COORDINATOR, resource: 'comparendos', allowed: ['CREATE', 'READ', 'UPDATE', 'DELETE'], denied: [] },
  { role: Role.MUNICIPAL_COORDINATOR, resource: 'users',       allowed: [], denied: ['CREATE', 'READ', 'UPDATE', 'DELETE'] },

  // ZONE_COORDINATOR — full CRUD on resources; no user management
  { role: Role.ZONE_COORDINATOR, resource: 'testigos',    allowed: ['CREATE', 'READ', 'UPDATE', 'DELETE'], denied: [] },
  { role: Role.ZONE_COORDINATOR, resource: 'abogados',    allowed: ['CREATE', 'READ', 'UPDATE', 'DELETE'], denied: [] },
  { role: Role.ZONE_COORDINATOR, resource: 'movilidad',   allowed: ['CREATE', 'READ', 'UPDATE', 'DELETE'], denied: [] },
  { role: Role.ZONE_COORDINATOR, resource: 'refrigerios', allowed: ['CREATE', 'READ', 'UPDATE', 'DELETE'], denied: [] },
  { role: Role.ZONE_COORDINATOR, resource: 'comparendos', allowed: ['CREATE', 'READ', 'UPDATE', 'DELETE'], denied: [] },
  { role: Role.ZONE_COORDINATOR, resource: 'users',       allowed: [], denied: ['CREATE', 'READ', 'UPDATE', 'DELETE'] },

  // COMUNA_COORDINATOR — full CRUD on resources; no user management
  { role: Role.COMUNA_COORDINATOR, resource: 'testigos',    allowed: ['CREATE', 'READ', 'UPDATE', 'DELETE'], denied: [] },
  { role: Role.COMUNA_COORDINATOR, resource: 'abogados',    allowed: ['CREATE', 'READ', 'UPDATE', 'DELETE'], denied: [] },
  { role: Role.COMUNA_COORDINATOR, resource: 'movilidad',   allowed: ['CREATE', 'READ', 'UPDATE', 'DELETE'], denied: [] },
  { role: Role.COMUNA_COORDINATOR, resource: 'refrigerios', allowed: ['CREATE', 'READ', 'UPDATE', 'DELETE'], denied: [] },
  { role: Role.COMUNA_COORDINATOR, resource: 'comparendos', allowed: ['CREATE', 'READ', 'UPDATE', 'DELETE'], denied: [] },
  { role: Role.COMUNA_COORDINATOR, resource: 'users',       allowed: [], denied: ['CREATE', 'READ', 'UPDATE', 'DELETE'] },

  // PUESTO_COORDINATOR — limited: READ+UPDATE on testigos; READ-only on others
  { role: Role.PUESTO_COORDINATOR, resource: 'testigos',    allowed: ['READ', 'UPDATE'], denied: ['CREATE', 'DELETE'] },
  { role: Role.PUESTO_COORDINATOR, resource: 'abogados',    allowed: ['READ'], denied: ['CREATE', 'UPDATE', 'DELETE'] },
  { role: Role.PUESTO_COORDINATOR, resource: 'movilidad',   allowed: ['READ'], denied: ['CREATE', 'UPDATE', 'DELETE'] },
  { role: Role.PUESTO_COORDINATOR, resource: 'refrigerios', allowed: ['READ'], denied: ['CREATE', 'UPDATE', 'DELETE'] },
  { role: Role.PUESTO_COORDINATOR, resource: 'comparendos', allowed: ['READ'], denied: ['CREATE', 'UPDATE', 'DELETE'] },
  { role: Role.PUESTO_COORDINATOR, resource: 'users',       allowed: [], denied: ['CREATE', 'READ', 'UPDATE', 'DELETE'] },
];

describe('canDo() — permissions matrix', () => {
  for (const { role, resource, allowed, denied } of cases) {
    describe(`${role} on ${resource}`, () => {
      for (const action of allowed) {
        it(`allows ${action}`, () => {
          expect(canDo(role, resource, action)).toBe(true);
        });
      }
      for (const action of denied) {
        it(`denies ${action}`, () => {
          expect(canDo(role, resource, action)).toBe(false);
        });
      }
      // Ensure at least one allow OR one deny exists per case (no empty tests)
      if (allowed.length === 0 && denied.length === 0) {
        it('has no actions (vacuous — all actions denied)', () => {
          const allActions: Action[] = ['CREATE', 'READ', 'UPDATE', 'DELETE'];
          for (const a of allActions) {
            expect(canDo(role, resource, a)).toBe(false);
          }
        });
      }
    });
  }
});

// ─── Explicit critical invariants ────────────────────────────────────────────
describe('permissions matrix — critical invariants', () => {
  it('PUESTO_COORDINATOR cannot CREATE testigos', () => {
    expect(canDo(Role.PUESTO_COORDINATOR, 'testigos', 'CREATE')).toBe(false);
  });

  it('PUESTO_COORDINATOR cannot DELETE testigos', () => {
    expect(canDo(Role.PUESTO_COORDINATOR, 'testigos', 'DELETE')).toBe(false);
  });

  it('PUESTO_COORDINATOR can UPDATE testigos', () => {
    expect(canDo(Role.PUESTO_COORDINATOR, 'testigos', 'UPDATE')).toBe(true);
  });

  it('REGIONAL cannot DELETE users', () => {
    expect(canDo(Role.REGIONAL_COORDINATOR, 'users', 'DELETE')).toBe(false);
  });

  it('REGIONAL can CREATE users', () => {
    expect(canDo(Role.REGIONAL_COORDINATOR, 'users', 'CREATE')).toBe(true);
  });

  it('MUNICIPAL cannot CREATE users', () => {
    expect(canDo(Role.MUNICIPAL_COORDINATOR, 'users', 'CREATE')).toBe(false);
  });

  it('SUPER_ADMIN can do everything on users', () => {
    const actions: Action[] = ['CREATE', 'READ', 'UPDATE', 'DELETE'];
    for (const a of actions) {
      expect(canDo(Role.SUPER_ADMIN, 'users', a)).toBe(true);
    }
  });

  it('PUESTO cannot manage users at all', () => {
    const actions: Action[] = ['CREATE', 'READ', 'UPDATE', 'DELETE'];
    for (const a of actions) {
      expect(canDo(Role.PUESTO_COORDINATOR, 'users', a)).toBe(false);
    }
  });
});
