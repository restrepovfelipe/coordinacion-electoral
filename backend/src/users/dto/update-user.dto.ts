import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { Role, ScopeType } from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ScopeDto {
  @ApiPropertyOptional({ enum: ScopeType })
  @IsEnum(ScopeType)
  type!: ScopeType;

  @ApiPropertyOptional()
  @IsInt()
  @Min(1)
  id!: number;
}

export class UpdateUserDto {
  @ApiPropertyOptional({ description: 'Display name shown in the UI' })
  @IsString()
  @IsOptional()
  displayName?: string;

  @ApiPropertyOptional({ description: 'Phone number' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ description: 'Additional notes about the user' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ enum: Role, description: 'User role' })
  @IsEnum(Role)
  @IsOptional()
  role?: Role;

  @ApiPropertyOptional({ description: 'Whether the user account is active' })
  @IsBoolean()
  @IsOptional()
  active?: boolean;

  @ApiPropertyOptional({ description: 'Force user to change password on next login' })
  @IsBoolean()
  @IsOptional()
  mustChangePassword?: boolean;

  @ApiPropertyOptional({ description: 'New password to set for this user (admin-initiated reset)' })
  @IsString()
  @IsOptional()
  @MinLength(8)
  newPassword?: string;

  @ApiPropertyOptional({ description: 'Scope to assign; null to clear all scopes', type: ScopeDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => ScopeDto)
  scope?: ScopeDto | null;
}
