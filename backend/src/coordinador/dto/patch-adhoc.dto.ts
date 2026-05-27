import { IsOptional, IsString, MaxLength } from 'class-validator';

export class PatchAdhocDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nombre?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  telefono?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  tag?: string | null;
}
