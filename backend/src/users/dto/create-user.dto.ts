import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Role, ScopeType } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ScopeItemDto {
  @ApiProperty({ enum: ScopeType, description: 'Type of scope' })
  @IsEnum(ScopeType)
  scopeType!: ScopeType;

  @ApiProperty({ description: 'ID of the scoped entity', minimum: 1 })
  @IsInt()
  @Min(1)
  scopeId!: number;
}

export class CreateUserDto {
  @ApiProperty({ description: 'Unique username for login' })
  @IsString()
  @IsNotEmpty()
  username!: string;

  @ApiProperty({ description: 'Display name shown in the UI' })
  @IsString()
  @IsNotEmpty()
  displayName!: string;

  @ApiPropertyOptional({ description: 'Phone number' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ description: 'Additional notes about the user' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiProperty({ enum: Role, description: 'User role' })
  @IsEnum(Role)
  role!: Role;

  @ApiProperty({ description: 'Initial password for the user (minimum 8 characters)' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password!: string;

  @ApiPropertyOptional({ type: [ScopeItemDto], description: 'Initial scopes assigned to the user' })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ScopeItemDto)
  scopes?: ScopeItemDto[];
}
