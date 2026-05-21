import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Role, ScopeType } from '@prisma/client';

export class ScopeItemDto {
  @IsEnum(ScopeType)
  scopeType!: ScopeType;

  @IsInt()
  @Min(1)
  scopeId!: number;
}

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsString()
  @IsNotEmpty()
  displayName!: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsEnum(Role)
  role!: Role;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ScopeItemDto)
  scopes?: ScopeItemDto[];
}
