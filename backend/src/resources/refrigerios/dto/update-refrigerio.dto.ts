import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateRefrigerioDto {
  @IsInt()
  @Min(0)
  @IsOptional()
  count?: number;

  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
