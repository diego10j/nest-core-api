import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AdminService } from './admin.service';
import { QueryOptionsDto } from '../../../common/dto/query-options.dto';
import { OpcionDto } from './dto/opcion.dto';
import { PerfilDto } from './dto/perfil.dto';
import { HorarioDto } from './dto/horario.dto';
import { RucDto } from './dto/ruc.dto';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

@Controller('sistema/admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) { }

  // -------------------------------- EMPRESA ---------------------------- //

  @Get('getListDataEmpresa')
  // @Auth()
  getListDataEmpresa(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: QueryOptionsDto
  ) {
    return this.adminService.getListDataEmpresa({
      ...headersParams,
      ...dtoIn
    });
  }

  @Get('getTableQueryEmpresa')
  // @Auth()
  getTableQueryEmpresa(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: QueryOptionsDto
  ) {
    return this.adminService.getTableQueryEmpresa({
      ...headersParams,
      ...dtoIn
    });
  }
  // -------------------------------- SUCURSAL ---------------------------- //

  @Get('getListDataSucursal')
  // @Auth()
  getListDataSucursal(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: QueryOptionsDto
  ) {
    return this.adminService.getListDataSucursal({
      ...headersParams,
      ...dtoIn
    });
  }

  @Get('getTableQuerySucursal')
  // @Auth()
  getTableQuerySucursal(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: QueryOptionsDto
  ) {
    return this.adminService.getTableQuerySucursal({
      ...headersParams,
      ...dtoIn
    });
  }


  // -------------------------------- SISTEMAS ---------------------------- //
  @Get('getListDataSistema')
  // @Auth()
  getListDataSistema(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: QueryOptionsDto
  ) {
    return this.adminService.getListDataSistema({
      ...headersParams,
      ...dtoIn
    });
  }

  @Get('getTableQuerySistema')
  // @Auth()
  getTableQuerySistema(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: QueryOptionsDto
  ) {
    return this.adminService.getTableQuerySistema({
      ...headersParams,
      ...dtoIn
    });
  }

  @Get('getEmpresaByRuc')
  getEmpresaByRuc(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: RucDto
  ) {
    return this.adminService.getEmpresaByRuc({
      ...headersParams,
      ...dtoIn
    });
  }

  // -------------------------------- OPCIONES ---------------------------- //

  @Get('getTableQueryOpcion')
  // @Auth()
  getTableQueryOpcion(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: OpcionDto
  ) {
    return this.adminService.getTableQueryOpcion({
      ...headersParams,
      ...dtoIn
    });
  }

  @Get('getTreeModelOpcion')
  // @Auth()
  getTreeModelOpcion(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: OpcionDto
  ) {
    return this.adminService.getTreeModelOpcion({
      ...headersParams,
      ...dtoIn
    });
  }

  // -------------------------------- PERFILES ---------------------------- //

  @Get('getTableQueryPerfil')
  // @Auth()
  getTableQueryPerfil(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: PerfilDto
  ) {
    return this.adminService.getTableQueryPerfil({
      ...headersParams,
      ...dtoIn
    });
  }

  @Get('getPerfilesSistema')
  // @Auth()
  getPerfilesSistema(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: PerfilDto
  ) {
    return this.adminService.getPerfilesSistema({
      ...headersParams,
      ...dtoIn
    });
  }

  // -------------------------------- HORARIOS ---------------------------- //

  @Get('getListDataTiposHorario')
  // @Auth()
  getListDataTiposHorario(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: QueryOptionsDto
  ) {
    return this.adminService.getListDataTiposHorario({
      ...headersParams,
      ...dtoIn
    });
  }

  @Get('getTableQueryTiposHorario')
  // @Auth()
  getTableQueryTiposHorario(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: QueryOptionsDto
  ) {
    return this.adminService.getTableQueryTiposHorario({
      ...headersParams,
      ...dtoIn
    });
  }


  @Get('getTableQueryHorario')
  // @Auth()
  getTableQueryHorario(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: HorarioDto
  ) {
    return this.adminService.getTableQueryHorario({
      ...headersParams,
      ...dtoIn
    });
  }


}
