import { Query, Controller, Get, Post, Body } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { QueryOptionsDto } from '../../../../common/dto/query-options.dto';

import { ConfigPasswordDto } from './dto/config-password.dto';
import { PerfilUsuarioDto } from './dto/perfil-usuario.dto';
import { UsuarioDto } from './dto/usuario.dto';
import { UsuariosService } from './usuarios.service';

@ApiTags('Sistema-Usuarios')
@Controller('sistema/usuarios')
export class UsuariosController {
  constructor(private readonly service: UsuariosService) { }

  @Get('getUsuarios')
  @ApiOperation({ summary: 'Listar usuarios del sistema' })
  // @Auth()
  getProductos(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.service.getUsuarios({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTableQueryUsuarioByUuid')
  @ApiOperation({ summary: 'Obtener datos de un usuario por UUID' })
  // @Auth()
  getTableQueryUsuarioByUuid(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: UsuarioDto) {
    return this.service.getTableQueryUsuarioByUuid({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getListDataUsuario')
  @ApiOperation({ summary: 'Obtener listado de usuarios para selector' })
  // @Auth()
  getListDataUsuario(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.service.getListDataUsuario({
      ...headersParams,
      ...dtoIn,
    });
  }


  @Get('getTableQueryPerfilesUsuario')
  @ApiOperation({ summary: 'Obtener perfiles asignados a un usuario' })
  // @Auth()
  getTableQueryPerfilesUsuario(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: PerfilUsuarioDto) {
    return this.service.getTableQueryPerfilesUsuario({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTableQuerySucursalesUsuario')
  @ApiOperation({ summary: 'Obtener sucursales asignadas a un usuario' })
  // @Auth()
  getTableQuerySucursalesUsuario(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: PerfilUsuarioDto) {
    return this.service.getTableQuerySucursalesUsuario({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getConfigPassword')
  @ApiOperation({ summary: 'Obtener configuración de política de contraseñas de un usuario' })
  // @Auth()
  getConfigPassword(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: PerfilUsuarioDto) {
    return this.service.getConfigPassword({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('saveConfigPassword')
  @ApiOperation({ summary: 'Guardar configuración de política de contraseñas para un usuario' })
  // @Auth()
  saveConfigPassword(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: ConfigPasswordDto) {
    return this.service.saveConfigPassword({
      ...headersParams,
      ...dtoIn,
    });
  }


}
