import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Role } from '@prisma/client';

export class ListUsersQueryDto {
  @IsEnum(Role)
  @IsOptional()
  role?: Role;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  active?: boolean;

  @IsInt()
  @Min(1)
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? parseInt(value, 10) : value))
  page?: number = 1;

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? parseInt(value, 10) : value))
  limit?: number = 20;
}
