import { Body, Controller, Post } from '@nestjs/common';
import { AdminService } from './admin.service';
import { ServiceDto } from '../../../common/dto/service.dto';
import { OpcionDto } from './dto/opcion.dto';
import { PerfilDto } from './dto/perfil.dto';
import { HorarioDto } from './dto/horario.dto';

@Controller('sistema/admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) { }

  // -------------------------------- EMPRESA ---------------------------- //

  @Post('getListDataEmpresa')
  // @Auth()
  getListDataEmpresa(
    @Body() dtoIn: ServiceDto
  ) {
    return this.adminService.getListDataEmpresa(dtoIn);
  }

  @Post('getTableQueryEmpresa')
  // @Auth()
  getTableQueryEmpresa(
    @Body() dtoIn: ServiceDto
  ) {
    return this.adminService.getTableQueryEmpresa(dtoIn);
  }
  // -------------------------------- SUCURSAL ---------------------------- //

  @Post('getListDataSucursal')
  // @Auth()
  getListDataSucursal(
    @Body() dtoIn: ServiceDto
  ) {
    return this.adminService.getListDataSucursal(dtoIn);
  }

  @Post('getTableQuerySucursal')
  // @Auth()
  getTableQuerySucursal(
    @Body() dtoIn: ServiceDto
  ) {
    return this.adminService.getTableQuerySucursal(dtoIn);
  }


  // -------------------------------- SISTEMAS ---------------------------- //
  @Post('getListDataSistema')
  // @Auth()
  getListDataSistema(
    @Body() dtoIn: ServiceDto
  ) {
    return this.adminService.getListDataSistema(dtoIn);
  }

  @Post('getTableQuerySistema')
  // @Auth()
  getTableQuerySistema(
    @Body() dtoIn: ServiceDto
  ) {
    return this.adminService.getTableQuerySistema(dtoIn);
  }

  // -------------------------------- OPCIONES ---------------------------- //

  @Post('getTableQueryOpcion')
  // @Auth()
  getTableQueryOpcion(
    @Body() dtoIn: OpcionDto
  ) {
    return this.adminService.getTableQueryOpcion(dtoIn);
  }

  @Post('getTreeModelOpcion')
  // @Auth()
  getTreeModelOpcion(
    @Body() dtoIn: OpcionDto
  ) {
    return this.adminService.getTreeModelOpcion(dtoIn);
  }

  // -------------------------------- PERFILES ---------------------------- //

  @Post('getTableQueryPerfil')
  // @Auth()
  getTableQueryPerfil(
    @Body() dtoIn: PerfilDto
  ) {
    return this.adminService.getTableQueryPerfil(dtoIn);
  }

  @Post('getPerfilesSistema')
  // @Auth()
  getPerfilesSistema(
    @Body() dtoIn: PerfilDto
  ) {
    return this.adminService.getPerfilesSistema(dtoIn);
  }

  // -------------------------------- HORARIOS ---------------------------- //

  @Post('getListDataTiposHorario')
  // @Auth()
  getListDataTiposHorario(
    @Body() dtoIn: ServiceDto
  ) {
    return this.adminService.getListDataTiposHorario(dtoIn);
  }

  @Post('getTableQueryTiposHorario')
  // @Auth()
  getTableQueryTiposHorario(
    @Body() dtoIn: ServiceDto
  ) {
    return this.adminService.getTableQueryTiposHorario(dtoIn);
  }


  @Post('getTableQueryHorario')
  // @Auth()
  getTableQueryHorario(
    @Body() dtoIn: HorarioDto
  ) {
    return this.adminService.getTableQueryHorario(dtoIn);
  }


}
