import { Body, Controller, Post } from '@nestjs/common';
import { UsuariosService } from './usuarios.service';
import { ServiceDto } from '../../../common/dto/service.dto';
import { UsuarioDto } from './dto/usuario.dto';

@Controller('sistema/usuarios')
export class UsuariosController {
  constructor(private readonly service: UsuariosService) {
  }

  @Post('getUsuarios')
  // @Auth()
  getProductos(
    @Body() dtoIn: ServiceDto
  ) {
    return this.service.getUsuarios(dtoIn);
  }

  @Post('getTableQueryUsuarioByUuid')
  // @Auth()
  getTableQueryUsuarioByUuid(
    @Body() dtoIn: UsuarioDto
  ) {
    return this.service.getTableQueryUsuarioByUuid(dtoIn);
  }

  @Post('getListDataUsuario')
  // @Auth()
  getListDataUsuario(
    @Body() dtoIn: ServiceDto
  ) {
    return this.service.getListDataUsuario(dtoIn);
  }

}
