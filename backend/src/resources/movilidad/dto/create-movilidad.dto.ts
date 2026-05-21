import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ScopeType } from '@prisma/client';

export class CreateMovilidadDto {
  @IsEnum(ScopeType)
  scopeType!: ScopeType;

  @IsInt()
  scopeId!: number;

  @IsString()
  @IsNotEmpty()
  vehicleType!: string;

  @IsString()
  @IsNotEmpty()
  plate!: string;

  @IsString()
  @IsNotEmpty()
  driverName!: string;

  @IsString()
  @IsOptional()
  driverPhone?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
