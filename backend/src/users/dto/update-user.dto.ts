import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { Role } from '@prisma/client';

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  displayName?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsEnum(Role)
  @IsOptional()
  role?: Role;

  @IsBoolean()
  @IsOptional()
  active?: boolean;

  @IsBoolean()
  @IsOptional()
  mustChangePassword?: boolean;
}
