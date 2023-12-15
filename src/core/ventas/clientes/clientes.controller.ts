import { Body, Controller, Post } from '@nestjs/common';
import { ClientesService } from './clientes.service';
import { ServiceDto } from '../../../common/dto/service.dto';

@Controller('clientes')
export class ClientesController {
  constructor(private readonly service: ClientesService) {}

  
  @Post('getClientes')
  // @Auth()
  getClientes(
    @Body() dtoIn: ServiceDto
  ) {
    return this.service.getClientes();
  }
}
