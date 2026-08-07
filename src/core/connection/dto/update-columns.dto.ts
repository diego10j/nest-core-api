import { IsString, IsArray, ArrayNotEmpty, IsNotEmpty, Matches, IsInt, IsOptional } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

import { Column } from '../interfaces/column';

// Valores permitidos para Column.component al guardar personalización de tabla (POST
// updateColumns). Sólo incluye componentes de sólo-lectura que QueryCell.tsx puede renderizar
// sin configuración de código adicional (a diferencia de 'Label'/'Link'/'Render', que dependen
// de labelComponent/onClick/renderComponent definidos en la página, no editables por el usuario).
export const ALLOWED_PERSONALIZACION_COMPONENTS = [
  'Text',
  'Checkbox',
  'Money',
  'Percent',
  'Calendar',
  'CalendarTime',
  'Time',
  'Active',
  'Avatar',
  'Image',
];

export class UpdateColumnsDto extends QueryOptionsDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\S*$/, { message: 'queryName no debe contener espacios' })
  queryName: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\S*$/, { message: 'primaryKey no debe contener espacios' })
  primaryKey: string;

  @ArrayNotEmpty()
  @IsNotEmpty({ each: true })
  @IsArray()
  columns: Column[];

  @IsInt()
  @IsOptional()
  ide_opci?: number;
}
