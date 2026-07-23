import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { Auth } from 'src/core/auth';

import { QueryOptionsDto } from '../../../../common/dto/query-options.dto';

import { AdminService } from './admin.service';
import { GenerarOpcionesDto } from './dto/generar-opciones.dto';
import { HorarioDto } from './dto/horario.dto';
import { OpcionDto } from './dto/opcion.dto';
import { PerfilSistemaDto } from './dto/perfil-sistema.dto';
import { PerfilDto } from './dto/perfil.dto';
import { RucDto } from './dto/ruc.dto';

@ApiTags('Sistema-Admin')
@Controller('sistema/admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) { }

  // -------------------------------- EMPRESA ---------------------------- //

  @Get('getListDataEmpresa')
  @ApiOperation({ summary: 'Obtener listado de empresas para selector' })
  @Auth()
  getListDataEmpresa(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.adminService.getListDataEmpresa({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTableQueryEmpresa')
  @ApiOperation({ summary: 'Obtener tabla de empresas del sistema' })
  @Auth()
  getTableQueryEmpresa(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.adminService.getTableQueryEmpresa({
      ...headersParams,
      ...dtoIn,
    });
  }
  // -------------------------------- SUCURSAL ---------------------------- //

  @Get('getListDataSucursal')
  @ApiOperation({ summary: 'Obtener listado de sucursales para selector' })
  @Auth()
  getListDataSucursal(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.adminService.getListDataSucursal({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTableQuerySucursal')
  @ApiOperation({ summary: 'Obtener tabla de sucursales del sistema' })
  @Auth()
  getTableQuerySucursal(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.adminService.getTableQuerySucursal({
      ...headersParams,
      ...dtoIn,
    });
  }

  // -------------------------------- SISTEMAS ---------------------------- //
  @Get('getListDataSistema')
  @ApiOperation({ summary: 'Obtener listado de sistemas/módulos para selector' })
  @Auth()
  getListDataSistema(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.adminService.getListDataSistema({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTableQuerySistema')
  @ApiOperation({ summary: 'Obtener tabla de sistemas/módulos del ERP' })
  @Auth()
  getTableQuerySistema(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.adminService.getTableQuerySistema({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getEmpresaByRuc')
  @ApiOperation({ summary: 'Buscar empresa por número de RUC' })
  getEmpresaByRuc(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RucDto) {
    return this.adminService.getEmpresaByRuc({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getEmpresaSucursal')
  @ApiOperation({ summary: 'Obtener datos de empresa y sucursal según headers X-Ide-Empr y X-Ide-Sucu (0 = no filtrar)' })
  getEmpresaSucursal(@AppHeaders() h: HeaderParamsDto) {
    return this.adminService.getEmpresaSucursal(h);
  }

  // -------------------------------- OPCIONES ---------------------------- //

  @Get('getTableQueryOpcion')
  @ApiOperation({ summary: 'Obtener tabla de opciones/menú del sistema' })
  @Auth()
  getTableQueryOpcion(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: OpcionDto) {
    return this.adminService.getTableQueryOpcion({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTreeModelOpcion')
  @ApiOperation({ summary: 'Obtener árbol jerárquico de opciones/menú del sistema' })
  @Auth()
  getTreeModelOpcion(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: OpcionDto) {
    return this.adminService.getTreeModelOpcion({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('generarOpciones')
  @ApiOperation({ summary: 'Generar opciones de menú masivamente a partir de estructura JSON' })
  @Auth()
  generarConteoInventario(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: GenerarOpcionesDto) {
    return this.adminService.generarOpciones({
      ...headersParams,
      ...dtoIn,
    });
  }


  // -------------------------------- PERFILES ---------------------------- //

  @Get('getTableQueryPerfil')
  @ApiOperation({ summary: 'Obtener tabla de perfiles del sistema' })
  @Auth()
  getTableQueryPerfil(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: PerfilDto) {
    return this.adminService.getTableQueryPerfil({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getPerfilesSistema')
  @ApiOperation({ summary: 'Obtener perfiles disponibles de un sistema/módulo' })
  @Auth()
  getPerfilesSistema(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: PerfilDto) {
    return this.adminService.getPerfilesSistema({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getListDataPerfilesSistema')
  @ApiOperation({ summary: 'Obtener listado de perfiles de un sistema para selector' })
  @Auth()
  getListDataPerfilesSistema(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: PerfilDto) {
    return this.adminService.getListDataPerfilesSistema({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getListDataPeriodoClave')
  @ApiOperation({ summary: 'Obtener listado de períodos clave para selector' })
  @Auth()
  getListDataPeriodoClave(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.adminService.getListDataPeriodoClave({
      ...headersParams,
      ...dtoIn,
    });
  }


  @Get('getOpcionesPerfil')
  @ApiOperation({ summary: 'Obtener opciones del menú asignadas a un perfil' })
  @Auth()
  getOpcionesPerfil(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: PerfilSistemaDto) {
    return this.adminService.getOpcionesPerfil({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('saveOpcionesPerfil')
  @ApiOperation({ summary: 'Guardar opciones de menú asignadas a un perfil' })
  @Auth()
  saveOpcionesPerfil(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: PerfilSistemaDto) {
    return this.adminService.saveOpcionesPerfil({
      ...headersParams,
      ...dtoIn,
    });
  }

  // -------------------------------- HORARIOS ---------------------------- //

  @Get('getListDataTiposHorario')
  @ApiOperation({ summary: 'Obtener listado de tipos de horario para selector' })
  @Auth()
  getListDataTiposHorario(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.adminService.getListDataTiposHorario({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTableQueryTiposHorario')
  @ApiOperation({ summary: 'Obtener tabla de tipos de horario de login' })
  @Auth()
  getTableQueryTiposHorario(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.adminService.getTableQueryTiposHorario({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTableQueryHorario')
  @ApiOperation({ summary: 'Obtener tabla de horarios de login por tipo' })
  @Auth()
  getTableQueryHorario(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: HorarioDto) {
    return this.adminService.getTableQueryHorario({
      ...headersParams,
      ...dtoIn,
    });
  }
}
