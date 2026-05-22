import { IsOptional, IsString, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateSelfDto {
  @ApiPropertyOptional({ description: 'Display name shown in the UI' })
  @IsString()
  @IsOptional()
  displayName?: string;

  @ApiPropertyOptional({ description: 'Phone number' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ description: 'New password (min 8 chars)' })
  @IsString()
  @MinLength(8)
  @IsOptional()
  newPassword?: string;
}
