import { Query, Controller, Get } from '@nestjs/common';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { QueryOptionsDto } from '../../../../common/dto/query-options.dto';

import { UsuarioDto } from './dto/usuario.dto';
import { UsuariosService } from './usuarios.service';

@Controller('sistema/usuarios')
export class UsuariosController {
  constructor(private readonly service: UsuariosService) {}

  @Get('getUsuarios')
  // @Auth()
  getProductos(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.service.getUsuarios({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTableQueryUsuarioByUuid')
  // @Auth()
  getTableQueryUsuarioByUuid(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: UsuarioDto) {
    return this.service.getTableQueryUsuarioByUuid({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getListDataUsuario')
  // @Auth()
  getListDataUsuario(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.service.getListDataUsuario({
      ...headersParams,
      ...dtoIn,
    });
  }
}
