import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListTestigosQueryDto {
  @IsInt()
  @Min(1)
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? parseInt(value, 10) : value))
  page?: number = 1;

  @IsInt()
  @Min(1)
  @Max(200)
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? parseInt(value, 10) : value))
  limit?: number = 50;

  @IsString()
  @IsOptional()
  search?: string;

  @IsInt()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? parseInt(value, 10) : value))
  municipioId?: number;

  @IsInt()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? parseInt(value, 10) : value))
  puestoId?: number;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  sinPuesto?: boolean;
}
