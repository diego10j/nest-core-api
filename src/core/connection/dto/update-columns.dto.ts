import { IsString, IsArray, ArrayNotEmpty, IsNotEmpty, Matches, IsInt, IsOptional } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

import { Column } from '../interfaces/column';

// Valores que el diálogo "Personalizar Tabla" ofrece para que el usuario elija manualmente
// (componentes de sólo-lectura que QueryCell.tsx puede renderizar sin configuración de código
// adicional).
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

// Valores "code-only": el usuario nunca los elige desde el diálogo, pero SÍ pueden llegar en el
// payload de guardado porque la página los define vía `customColumns` (labelComponent/onClick/
// renderComponent). `readCustomColumns` en el frontend los vuelve a aplicar en cada carga sin
// importar lo que diga la BD, así que persistirlos es inofensivo - se aceptan sin rechazar el
// guardado completo, a diferencia de un valor realmente desconocido/inválido.
export const CODE_ONLY_COMPONENTS = ['Render', 'Label', 'Link'];

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
