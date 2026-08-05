import { Injectable } from '@nestjs/common';
import { Content, TDocumentDefinitions } from 'pdfmake/interfaces';

import { HeaderOptions } from '../interfaces/reportes';
import { HeaderSection } from '../sections/header.section';
import { logoWatermarkSection } from '../sections/logo-watermark.section';

import { EmpresaRepService } from './empresa-rep.service';

@Injectable()
export class SectionsService {
  constructor(private readonly empresaRepService: EmpresaRepService) { }

  /**
   * Crea un header completo para reportes con título integrado.
   *
   * El título (si `options.title` viene definido) ya lo renderiza internamente
   * `HeaderSection.createReportHeader` (bloque integrado al resto del header, mismo
   * espaciado/estilo) — no se debe volver a agregar un bloque de título aparte acá,
   * eso duplicaba el título en pantalla. Por eso casi ningún caller pasa `title`
   * hoy (ver `resumen-diario-facturas`, que lo dejaba comentado a propósito).
   */
  async createReportHeader(options: HeaderOptions): Promise<Content> {
    const { ideEmpr } = options;

    // 1. Obtener datos de la empresa desde el servicio
    const empresa = await this.empresaRepService.getEmpresaById(ideEmpr);

    // 2. Crear header usando solo el diseño (sin inyección de dependencias)
    return HeaderSection.createHeader(empresa, options);
  }

  async createLogoWatermark(ideEmpr: number): Promise<NonNullable<TDocumentDefinitions['background']>> {
    const empresa = await this.empresaRepService.getEmpresaById(ideEmpr);
    return logoWatermarkSection(empresa?.logotipo_empr);
  }
}
