import {  Controller } from '@nestjs/common';
import { VariablesService } from './variables.service';



@Controller('sistema/variables')
export class VariablesController {
  constructor(private readonly service: VariablesService) { }

}