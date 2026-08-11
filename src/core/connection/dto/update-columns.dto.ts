import { Type } from 'class-transformer';
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

  // `@Type(() => Object)` es obligatorio acá, no cosmético: sin un tipo explícito, con
  // `enableImplicitConversion: true` (ValidationPipe global) class-transformer cae al
  // `design:type` reflejado de `columns: Column[]` - que para una INTERFAZ (sin clase en
  // runtime) es simplemente el constructor `Array`. Al transformar cada item usando `Array`
  // como target, class-transformer detecta que `Array.prototype.filter` ya existe (no es un
  // setter) y SALTA silenciosamente la asignación de esa propiedad - `column.filter` queda
  // apuntando al método nativo heredado en vez del boolean del payload (bug real: reprodujo
  // "invalid input syntax for type boolean: function filter() {...}" en CoreService.updateColumns
  // para TODAS las columnas, siempre, porque `filter` es el único campo de Column que coincide
  // con un nombre de método de Array.prototype). Con `@Type(() => Object)`, class-transformer
  // usa `Object` (sin ese método) como target y copia todas las propiedades correctamente.
  @ArrayNotEmpty()
  @IsNotEmpty({ each: true })
  @IsArray()
  @Type(() => Object)
  columns: Column[];

  @IsInt()
  @IsOptional()
  ide_opci?: number;
}
