import { Injectable } from '@nestjs/common';
import { Content } from 'pdfmake/interfaces';

import { HeaderOptions } from '../interfaces/reportes';
import { HeaderSection } from '../sections/header.section';

import { EmpresaRepService } from './empresa-rep.service';

@Injectable()
export class SectionsService {
  constructor(private readonly empresaRepService: EmpresaRepService) {}

  /**
   * Crea un header completo para reportes con título integrado
   */
  async createReportHeader(options: HeaderOptions): Promise<Content> {
    const { title, ideEmpr } = options;

    // 1. Obtener datos de la empresa desde el servicio
    const empresa = await this.empresaRepService.getEmpresaById(ideEmpr);

    // 2. Crear header usando solo el diseño (sin inyección de dependencias)
    const header = HeaderSection.createHeader(empresa, options);

    return {
      stack: [
        header,
        {
          text: title,
          style: {
            fontSize: 16,
            bold: true,
            color: '#2d3748',
            alignment: 'center' as const,
            margin: [0, 0, 0, 0] as [number, number, number, number],
          },
        },
      ],
    };
  }
}
