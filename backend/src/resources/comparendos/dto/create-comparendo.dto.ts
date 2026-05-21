import { IsDateString, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ScopeType } from '@prisma/client';

export class CreateComparendoDto {
  @IsEnum(ScopeType)
  scopeType!: ScopeType;

  @IsInt()
  scopeId!: number;

  @IsDateString()
  date!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
