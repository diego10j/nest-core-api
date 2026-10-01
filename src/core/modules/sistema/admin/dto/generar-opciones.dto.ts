// src/menu/dto/menu-item.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';

export class MenuItemDto {
  @ApiPropertyOptional({ description: 'Título de la opción de menú' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'Subtítulo o encabezado de sección' })
  @IsOptional()
  @IsString()
  subheader?: string;

  @ApiPropertyOptional({ description: 'Ruta de navegación' })
  @IsOptional()
  @IsString()
  path?: string;

  @ApiPropertyOptional({ description: 'Icono de la opción' })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional({
    description: 'Opciones hijas',
    type: () => [MenuItemDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuItemDto)
  children?: MenuItemDto[];

  @ApiPropertyOptional({
    description: 'Items de la sección (para subheaders)',
    type: () => [MenuItemDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuItemDto)
  items?: MenuItemDto[];
}

export class GenerarOpcionesDto {
  @ApiProperty({
    description: 'Array de opciones de menú en formato JSON',
    type: [MenuItemDto],
    example: [
      {
        subheader: 'Overview',
        items: [
          {
            title: 'Inicio',
            path: '/dashboard',
            icon: 'flat-color-icons:home',
          },
        ],
      },
      {
        subheader: 'Management',
        items: [
          {
            title: 'Administración',
            path: '/dashboard/sistema/root',
            icon: 'fluent-color:building-people-24',
            children: [
              {
                title: 'Empresa',
                path: '/dashboard/sistema/empresa',
              },
            ],
          },
        ],
      },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuItemDto)
  @IsNotEmpty()
  json: MenuItemDto[];
}

/** Confirma la eliminación de las rutas obsoletas: se recalculan en el servidor con el mismo archivo de menú. */
export class EliminarRutasObsoletasDto extends GenerarOpcionesDto {
  @ApiProperty({ description: 'ide_opci de las rutas obsoletas a eliminar (las mostradas en el diálogo)', type: [Number] })
  @IsArray()
  @ArrayMaxSize(500)
  @IsInt({ each: true })
  @IsNotEmpty()
  ide_opci: number[];
}
