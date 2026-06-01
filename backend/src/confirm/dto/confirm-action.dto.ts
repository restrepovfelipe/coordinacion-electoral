import { IsEnum } from 'class-validator';

export enum ConfirmAction {
  ACEPTADO   = 'aceptado',
  ACREDITADO = 'acreditado',
  EN_PUESTO  = 'enPuesto',
}

export class ConfirmActionDto {
  @IsEnum(ConfirmAction)
  action: ConfirmAction;
}
