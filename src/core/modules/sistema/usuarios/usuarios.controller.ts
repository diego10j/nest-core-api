import { Query, Controller, Get, Post, Body } from '@nestjs/common';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { QueryOptionsDto } from '../../../../common/dto/query-options.dto';

import { ConfigPasswordDto } from './dto/config-password.dto';
import { PerfilUsuarioDto } from './dto/perfil-usuario.dto';
import { UsuarioDto } from './dto/usuario.dto';
import { UsuariosService } from './usuarios.service';

@Controller('sistema/usuarios')
export class UsuariosController {
  constructor(private readonly service: UsuariosService) { }

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


  @Get('getTableQueryPerfilesUsuario')
  // @Auth()
  getTableQueryPerfilesUsuario(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: PerfilUsuarioDto) {
    return this.service.getTableQueryPerfilesUsuario({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTableQuerySucursalesUsuario')
  // @Auth()
  getTableQuerySucursalesUsuario(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: PerfilUsuarioDto) {
    return this.service.getTableQuerySucursalesUsuario({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getConfigPassword')
  // @Auth()
  getConfigPassword(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: PerfilUsuarioDto) {
    return this.service.getConfigPassword({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('saveConfigPassword')
  // @Auth()
  saveConfigPassword(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: ConfigPasswordDto) {
    return this.service.saveConfigPassword({
      ...headersParams,
      ...dtoIn,
    });
  }


}
