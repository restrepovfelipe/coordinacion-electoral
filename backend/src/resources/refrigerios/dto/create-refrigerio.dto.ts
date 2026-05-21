import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ScopeType } from '@prisma/client';

export class CreateRefrigerioDto {
  @IsEnum(ScopeType)
  scopeType!: ScopeType;

  @IsInt()
  scopeId!: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  count?: number;

  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
