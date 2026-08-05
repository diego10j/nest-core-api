export interface HeaderOptions {
  ideEmpr: number;
  title?: string;
  subTitle?: string;
  showLogo?: boolean;
  /** Muestra la columna de metadatos (fecha de impresión y, si se indica, usuario) a la derecha. */
  showDate?: boolean;
  /** Nombre/login del usuario que generó el reporte; se muestra junto a la fecha de impresión (requiere showDate). */
  usuario?: string;
}
