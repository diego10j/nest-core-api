import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, MinLength } from 'class-validator';

export class HeaderParamsDto {
  @ApiProperty({ description: 'ID del usuario', example: 1 })
  @IsNumber({}, { message: 'x-ide-usua must be a valid number' })
  ideUsua: number;

  @ApiProperty({ description: 'ID de la empresa', example: 1 })
  @IsNumber({}, { message: 'x-ide-empr must be a valid number' })
  ideEmpr: number;

  @ApiProperty({ description: 'ID de la sucursal', example: 1 })
  @IsNumber({}, { message: 'x-ide-sucu must be a valid number' })
  ideSucu: number;

  @ApiProperty({ description: 'ID del perfil/rol', example: 1 })
  @IsNumber({}, { message: 'x-ide-perf must be a valid number' })
  idePerf: number;

  @ApiProperty({ description: 'Login del usuario', example: 'admin' })
  @IsString()
  login: string;

  @ApiPropertyOptional({ description: 'IP del cliente', example: '192.168.1.1', default: '127.0.0.1' })
  @IsString()
  @MinLength(2)
  @IsOptional()
  ip?: string = '127.0.0.1';

  @ApiPropertyOptional({ description: 'Identificador del terminal', example: 'PC-001', default: 'PC' })
  @IsString()
  @MinLength(2)
  @IsOptional()
  device?: string = 'PC';
}
