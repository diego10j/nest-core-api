import { readFileSync } from 'fs';
import path from 'path';

import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { signDocumentXml } from 'ec-sri-invoice-signer/dist/src/signature/signature';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';
import { envs } from 'src/config/envs';

import { FirmaService } from '../cel/firma.service';

/** Directorio donde se guardan los .p12 cuando ruta_srfid no es una ruta absoluta (paridad con "/firmas" del legacy). */
const FIRMAS_SUBDIR = 'sri/firmas';

/** Nombre de la etiqueta raíz del XML que exige ec-sri-invoice-signer, por tipo de comprobante SRI (coddoc). */
const ROOT_TAG_BY_CODDOC: Record<string, string> = {
  '01': 'factura',
  '04': 'notaCredito',
  '07': 'comprobanteRetencion',
  '06': 'guiaRemision',
  '03': 'liquidacionCompra',
};

@Injectable()
export class FirmaXmlService {
  constructor(private readonly firmaService: FirmaService) { }

  /** Firma el XML del comprobante con la firma electrónica vigente de la sucursal (XAdES-BES). */
  async firmarXml(xml: string, coddoc: string, dtoIn: QueryOptionsDto & HeaderParamsDto): Promise<string> {
    const rootTagName = ROOT_TAG_BY_CODDOC[coddoc];
    if (!rootTagName) {
      throw new BadRequestException(`Tipo de comprobante no soportado para firma: ${coddoc}`);
    }

    const firma = await this.firmaService.getFirma(dtoIn);
    const p12Path = this.resolveRutaFirma(firma.rutaFirma);
    let p12Data: Buffer;
    try {
      p12Data = readFileSync(p12Path);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new InternalServerErrorException(`No se pudo leer el archivo de firma electrónica (${p12Path}): ${msg}`);
    }

    try {
      return signDocumentXml(xml, p12Data, rootTagName, { pkcs12Password: firma.claveFirma });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new InternalServerErrorException(`Error al firmar el comprobante: ${msg}`);
    }
  }

  /** Misma resolución que el legacy: ruta absoluta si empieza con "/", si no relativa a PATH_DRIVE/sri/firmas. */
  private resolveRutaFirma(rutaFirma: string | undefined): string {
    if (!rutaFirma) {
      throw new BadRequestException('La firma electrónica configurada no tiene ruta de archivo (ruta_srfid)');
    }
    if (rutaFirma.startsWith('/')) {
      return rutaFirma;
    }
    return path.join(envs.pathDrive, FIRMAS_SUBDIR, rutaFirma);
  }
}
