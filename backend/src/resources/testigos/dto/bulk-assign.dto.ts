import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsInt, IsPositive } from 'class-validator';

export class BulkAssignDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @IsInt({ each: true })
  testigoIds!: number[];

  @IsInt()
  @IsPositive()
  puestoId!: number;
}
