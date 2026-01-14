import { HttpService } from '@nestjs/axios';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { AxiosRequestConfig } from 'axios';
import { RucDto } from 'src/core/modules/sistema/admin/dto/ruc.dto';
import { CedulaDto } from 'src/core/modules/sistema/general/dto/cedula.dto';

import { BaseService } from '../../../common/base-service';

@Injectable()
export class ApiPersonaService extends BaseService {
  constructor(private readonly httpService: HttpService) {
    super();
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
      return resp.data;
    } catch (error) {
      console.error('❌ Error en consultaCedula:', error.response?.data || error.message);
      throw new InternalServerErrorException(
        `[ERROR]: consultaCedula ${JSON.stringify(error.response?.data || error.message)}`,
      );
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
      return resp.data;
    } catch (error) {
      console.error('❌ Error en consultaRUC:', error.response?.data || error.message);
      throw new InternalServerErrorException(
        `[ERROR]: consultaRUC ${JSON.stringify(error.response?.data || error.message)}`,
      );
    }
  }
}
