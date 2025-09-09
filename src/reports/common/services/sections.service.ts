import { Injectable } from '@nestjs/common';

import { Content } from 'pdfmake/interfaces';
import { EmpresaRepService } from './empresa-rep.service';
import { HeaderSection } from '../sections/header.section';



@Injectable()
export class SectionsService {

  constructor(
    private readonly empresaRepService: EmpresaRepService
  ) { }


  /**
   * Crea un header completo para reportes con título integrado
   */
  async createReportHeader(options: HeaderOptions): Promise<Content> {
    const { title, ideEmpr, ...headerOptions } = options;

    // 1. Obtener datos de la empresa desde el servicio
    const empresa = await this.empresaRepService.getEmpresaById(ideEmpr);

    // 2. Crear header usando solo el diseño (sin inyección de dependencias)
    const header = HeaderSection.createHeader(empresa, headerOptions);

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
            margin: [0, 10, 0, 15] as [number, number, number, number]
          }
        }
      ]
    };
  }
}

export interface HeaderOptions {
  ideEmpr: number;
  title?: string;
  subTitle?: string;
  showLogo?: boolean;
  showDate?: boolean;
}