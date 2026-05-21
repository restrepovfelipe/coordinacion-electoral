import { IsEnum, IsInt, Min } from 'class-validator';
import { ScopeType } from '@prisma/client';

export class AddScopeDto {
  @IsEnum(ScopeType)
  scopeType!: ScopeType;

  @IsInt()
  @Min(1)
  scopeId!: number;
}
