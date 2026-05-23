import { NotFoundException } from '@nestjs/common';
import { AsignacionService } from './asignacion.service.js';

// ── Minimal stubs ─────────────────────────────────────────────────────────────

function makePrisma(puestoMesas: number, testigoIds: number[]) {
  const updates: { id: number; mesaInicial: number | null; mesaFinal: number | null }[] = [];

  return {
    puesto: {
      findUnique: jest.fn().mockResolvedValue({ mesas: puestoMesas, municipioId: 1 }),
    },
    testigo: {
      findMany: jest.fn().mockImplementation(({ select }: { select?: unknown }) => {
        if (select && 'mesaInicial' in (select as object)) {
          // recalcularPuesto post-compute query
          return Promise.resolve(
            updates
              .filter((u) => u.mesaInicial !== null)
              .map((u) => ({ mesaInicial: u.mesaInicial, mesaFinal: u.mesaFinal })),
          );
        }
        return Promise.resolve(testigoIds.map((id) => ({ id })));
      }),
      update: jest.fn().mockImplementation(({ where, data }: { where: { id: number }; data: { mesaInicial: number | null; mesaFinal: number | null } }) => {
        updates.push({ id: where.id, mesaInicial: data.mesaInicial, mesaFinal: data.mesaFinal });
        return Promise.resolve({});
      }),
    },
    $transaction: jest.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };
}

function makeRealtime() {
  return { notify: jest.fn().mockResolvedValue(undefined) };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AsignacionService.reassignPuesto', () => {
  it('throws NotFoundException when puesto does not exist', async () => {
    const prisma = makePrisma(5, []);
    (prisma.puesto.findUnique as jest.Mock).mockResolvedValue(null);
    const svc = new AsignacionService(prisma as never, makeRealtime() as never);
    await expect(svc.reassignPuesto(999)).rejects.toThrow(NotFoundException);
  });

  it('sets all testigos to null when puesto has 0 mesas', async () => {
    const prisma = makePrisma(0, [10, 20]);
    const svc = new AsignacionService(prisma as never, makeRealtime() as never);
    await svc.reassignPuesto(1);
    const calls = (prisma.testigo.update as jest.Mock).mock.calls;
    expect(calls).toHaveLength(2);
    for (const [arg] of calls) {
      expect(arg.data.mesaInicial).toBeNull();
      expect(arg.data.mesaFinal).toBeNull();
    }
  });

  it('assigns 1 testigo to all mesas when count <= 5', async () => {
    const prisma = makePrisma(3, [1]);
    const svc = new AsignacionService(prisma as never, makeRealtime() as never);
    await svc.reassignPuesto(1);
    const [arg] = (prisma.testigo.update as jest.Mock).mock.calls[0];
    expect(arg.data.mesaInicial).toBe(1);
    expect(arg.data.mesaFinal).toBe(3);
  });

  it('assigns exactly 5 mesas to first testigo when puesto has 5 mesas', async () => {
    const prisma = makePrisma(5, [1]);
    const svc = new AsignacionService(prisma as never, makeRealtime() as never);
    await svc.reassignPuesto(1);
    const [arg] = (prisma.testigo.update as jest.Mock).mock.calls[0];
    expect(arg.data.mesaInicial).toBe(1);
    expect(arg.data.mesaFinal).toBe(5);
  });

  it('splits 10 mesas evenly across 2 testigos', async () => {
    const prisma = makePrisma(10, [1, 2]);
    const svc = new AsignacionService(prisma as never, makeRealtime() as never);
    await svc.reassignPuesto(1);
    const calls = (prisma.testigo.update as jest.Mock).mock.calls;
    expect(calls[0][0].data).toMatchObject({ mesaInicial: 1, mesaFinal: 5 });
    expect(calls[1][0].data).toMatchObject({ mesaInicial: 6, mesaFinal: 10 });
  });

  it('caps last testigo at puesto.mesas (non-divisible)', async () => {
    // 7 mesas, 2 testigos → [1-5], [6-7]
    const prisma = makePrisma(7, [1, 2]);
    const svc = new AsignacionService(prisma as never, makeRealtime() as never);
    await svc.reassignPuesto(1);
    const calls = (prisma.testigo.update as jest.Mock).mock.calls;
    expect(calls[0][0].data).toMatchObject({ mesaInicial: 1, mesaFinal: 5 });
    expect(calls[1][0].data).toMatchObject({ mesaInicial: 6, mesaFinal: 7 });
  });

  it('marks over-capacity testigos as null', async () => {
    // 3 mesas, 2 testigos → testigo[0]=[1-3], testigo[1]=null
    const prisma = makePrisma(3, [1, 2]);
    const svc = new AsignacionService(prisma as never, makeRealtime() as never);
    await svc.reassignPuesto(1);
    const calls = (prisma.testigo.update as jest.Mock).mock.calls;
    expect(calls[0][0].data).toMatchObject({ mesaInicial: 1, mesaFinal: 3 });
    expect(calls[1][0].data).toMatchObject({ mesaInicial: null, mesaFinal: null });
  });

  it('handles an empty puesto (no testigos) without updates', async () => {
    const prisma = makePrisma(10, []);
    const svc = new AsignacionService(prisma as never, makeRealtime() as never);
    await svc.reassignPuesto(1);
    expect(prisma.testigo.update).not.toHaveBeenCalled();
  });
});
