// src/menu/dto/menu-item.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsString, IsOptional, IsArray, ValidateNested, IsNotEmpty } from 'class-validator';

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
