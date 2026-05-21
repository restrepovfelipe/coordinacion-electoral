import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateAbogadoDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
