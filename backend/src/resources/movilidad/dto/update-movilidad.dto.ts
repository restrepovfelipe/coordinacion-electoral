import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { ScopeType } from '@prisma/client';

export class UpdateMovilidadDto {
  @IsEnum(ScopeType)
  @IsOptional()
  scopeType?: ScopeType;

  @IsInt()
  @IsOptional()
  scopeId?: number;

  @IsString()
  @IsOptional()
  vehicleType?: string;

  @IsString()
  @IsOptional()
  plate?: string;

  @IsString()
  @IsOptional()
  driverName?: string;

  @IsString()
  @IsOptional()
  driverPhone?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
