export interface AppEvent {
  type: string;
  puestoId?: number;
  municipioId?: number;
  scopeType?: string;
  scopeId?: number;
  payload: Record<string, unknown>;
}
