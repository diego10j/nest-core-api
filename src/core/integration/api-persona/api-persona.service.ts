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
   * El servicio del Registro Civil (SECAP) devuelve el error de negocio (ej. "CEDULA INVALIDA")
   * a veces con un status HTTP de error y a veces con 200 OK — en ambos casos el cuerpo trae
   * `mensaje`/`error`/`codigoError`. Se extrae el texto limpio para no propagar un blob JSON
   * genérico envuelto en un 500 (el frontend lo mostraba tal cual, confundiendo al usuario).
   */
  private extraerMensajeError(payload: any): string | undefined {
    if (!payload) return undefined;
    const mensaje = payload.mensaje || payload.error;
    if (!mensaje) return undefined;
    // Los mensajes vienen con prefijo tipo "04:CEDULA INVALIDA" — se quita el código.
    return String(mensaje).replace(/^\d+:\s*/, '');
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

      // El Registro Civil a veces responde 200 OK con el error de negocio embebido en el body
      // (ej. cédula inválida) en vez de un status HTTP de error.
      const mensajeNegocio = this.extraerMensajeError(resp.data);
      if (mensajeNegocio) {
        throw new BadRequestException(mensajeNegocio);
      }
      // Defensa adicional: si no vino un error explícito pero tampoco vino el dato esperado
      // (ej. el servicio respondió un shape inesperado), no se devuelve un objeto a medias —
      // eso rompía el frontend con "Cannot read properties of undefined" en vez de mostrar un
      // mensaje claro.
      if (!resp.data || typeof resp.data !== 'object' || !resp.data.nombre) {
        throw new BadRequestException('No se encontraron datos para la cédula ingresada.');
      }

      return resp.data;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      const mensaje = this.extraerMensajeError(error.response?.data);
      console.error('❌ Error en consultaCedula:', error.response?.data || error.message);
      if (mensaje) throw new BadRequestException(mensaje);
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

      const mensajeNegocio = this.extraerMensajeError(resp.data);
      if (mensajeNegocio) {
        throw new BadRequestException(mensajeNegocio);
      }
      if (!resp.data || typeof resp.data !== 'object' || !resp.data.razonSocial) {
        throw new BadRequestException('No se encontraron datos para el RUC ingresado.');
      }

      return resp.data;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      const mensaje = this.extraerMensajeError(error.response?.data);
      console.error('❌ Error en consultaRUC:', error.response?.data || error.message);
      if (mensaje) throw new BadRequestException(mensaje);
      throw new InternalServerErrorException('No se pudo consultar el RUC. Intente nuevamente.');
    }
  }
}
