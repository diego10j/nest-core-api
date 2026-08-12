import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { AxiosRequestConfig } from 'axios';
import { RucDto } from 'src/core/modules/sistema/admin/dto/ruc.dto';
import { CedulaDto } from 'src/core/modules/sistema/general/dto/cedula.dto';

import { BaseService } from '../../../common/base-service';

@Injectable()
export class ApiPersonaService extends BaseService {
  constructor(private readonly httpService: HttpService) {
    super();
  }

  /**
   * El endpoint de SECAP a veces responde con Content-Type que no es application/json (ej.
   * text/html) aunque el body sea JSON válido — axios en ese caso NO lo parsea y entrega el
   * string crudo en resp.data. Sin esto, `payload.mensaje` fallaba silenciosamente sobre un
   * string (nunca hay excepción, simplemente da `undefined`) y el error real ("CEDULA
   * INVALIDA") se perdía, cayendo en el mensaje genérico de "no se encontraron datos".
   */
  private parsearRespuesta(data: any): any {
    if (typeof data === 'string') {
      try {
        return JSON.parse(data);
      } catch {
        return data;
      }
    }
    return data;
  }

  /**
   * El servicio del Registro Civil (SECAP) devuelve el error de negocio (ej. "04:CEDULA
   * INVALIDA") a veces con un status HTTP de error y a veces con 200 OK — en ambos casos el
   * cuerpo trae `mensaje`/`error`/`codigoError`. Se devuelve tal cual (sin recortar el código),
   * para que el usuario vea el mensaje completo que realmente respondió el servicio.
   *
   * OJO: `error`/`mensaje` vienen poblados TAMBIÉN en una consulta exitosa — probado en vivo con
   * una cédula válida, la respuesta trae `"error":"CONSULTA REALIZADA","respuesta":1` junto con
   * los datos de la persona. El campo que realmente distingue éxito/fallo es `respuesta`
   * (1 = éxito, 0 = falló) — o `codigoError` poblado (solo aparece en fallos, ej. "04").
   */
  private extraerMensajeError(payload: any): string | undefined {
    const item = this.parsearRespuesta(payload);
    if (!item || typeof item !== 'object') return undefined;

    const fallo = Number(item.respuesta) === 0 || !!item.codigoError;
    if (!fallo) return undefined;

    const mensaje = item.mensaje || item.error;
    return mensaje ? String(mensaje) : undefined;
  }

  async consultaCedula(dtoIn: CedulaDto) {
    try {
      const URL = `https://si.secap.gob.ec/sisecap/logeo_web/json/busca_persona_registro_civil.php`;

      const requestConfig: AxiosRequestConfig = {
        timeout: 30000, // 30 segundos
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: 'https://si.secap.gob.ec',
          Referer: 'https://si.secap.gob.ec/sisecap/logeo_web/usuario_nuevo.php',
          Host: 'si.secap.gob.ec',
          Cookie:
            '_ga_Y03VNXB8DL=GS1.1.1738356390.1.1.1738357032.0.0.0; _ga=GA1.3.666650771.1738356390; PHPSESSID=hfqg3dndo3bv4dhlv9ke5p9vo3',
          'X-Requested-With': 'XMLHttpRequest',
        },
      };

      const data = {
        documento: dtoIn.cedula,
        tipo: 1,
      };

      const resp = await this.httpService.axiosRef.post(URL, data, requestConfig);
      const parsed = this.parsearRespuesta(resp.data);

      // El Registro Civil a veces responde 200 OK con el error de negocio embebido en el body
      // (ej. cédula inválida) en vez de un status HTTP de error.
      const mensajeNegocio = this.extraerMensajeError(parsed);
      if (mensajeNegocio) {
        throw new BadRequestException(`No se encontraron datos para la cédula ingresada: ${mensajeNegocio}`);
      }
      // Defensa adicional: si no vino un error explícito pero tampoco vino el dato esperado
      // (ej. el servicio respondió un shape inesperado), no se devuelve un objeto a medias —
      // eso rompía el frontend con "Cannot read properties of undefined" en vez de mostrar un
      // mensaje claro.
      if (!parsed || typeof parsed !== 'object' || !parsed.nombre) {
        throw new BadRequestException('No se encontraron datos para la cédula ingresada.');
      }

      return parsed;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      const mensaje = this.extraerMensajeError(error.response?.data);
      console.error('❌ Error en consultaCedula:', error.response?.data || error.message);
      if (mensaje) {
        throw new BadRequestException(`No se encontraron datos para la cédula ingresada: ${mensaje}`);
      }
      throw new InternalServerErrorException('No se pudo consultar la cédula. Intente nuevamente.');
    }
  }

  async consultaRUC(dtoIn: RucDto) {
    try {
      const URL = `https://si.secap.gob.ec/sisecap/ServicioConsultaDatosRUC.php?ruc=${dtoIn.ruc}`;
      const requestConfig: AxiosRequestConfig = {
        timeout: 30000, // 30 segundos
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: 'https://si.secap.gob.ec',
          Referer: 'https://si.secap.gob.ec/sisecap/logeo_web/usuario_nuevo.php',
          Host: 'si.secap.gob.ec',
          Cookie:
            '_ga_Y03VNXB8DL=GS1.1.1738356390.1.1.1738357032.0.0.0; _ga=GA1.3.666650771.1738356390; PHPSESSID=hfqg3dndo3bv4dhlv9ke5p9vo3',
          'X-Requested-With': 'XMLHttpRequest',
        },
      };
      const resp = await this.httpService.axiosRef.get(URL, requestConfig);
      const parsed = this.parsearRespuesta(resp.data);

      const mensajeNegocio = this.extraerMensajeError(parsed);
      if (mensajeNegocio) {
        throw new BadRequestException(`No se encontraron datos para el RUC ingresado: ${mensajeNegocio}`);
      }
      if (!parsed || typeof parsed !== 'object' || !parsed.razonSocial) {
        throw new BadRequestException('No se encontraron datos para el RUC ingresado.');
      }

      return parsed;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      const mensaje = this.extraerMensajeError(error.response?.data);
      console.error('❌ Error en consultaRUC:', error.response?.data || error.message);
      if (mensaje) {
        throw new BadRequestException(`No se encontraron datos para el RUC ingresado: ${mensaje}`);
      }
      throw new InternalServerErrorException('No se pudo consultar el RUC. Intente nuevamente.');
    }
  }
}
