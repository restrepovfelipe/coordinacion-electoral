import { IsEnum } from 'class-validator';

export enum ConfirmAction {
  ACEPTADO          = 'aceptado',
  ACREDITADO        = 'acreditado',
  EN_PUESTO         = 'enPuesto',
  UNDO_ACEPTADO     = 'undo-aceptado',
  UNDO_ACREDITADO   = 'undo-acreditado',
  UNDO_EN_PUESTO    = 'undo-enPuesto',
}

export class ConfirmActionDto {
  @IsEnum(ConfirmAction)
  action: ConfirmAction;
}
