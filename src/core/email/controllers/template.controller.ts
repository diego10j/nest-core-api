import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { CreateTemplateDto } from '../dto/create-template.dto';
import { UpdateTemplateDto } from '../dto/update-template.dto';
import { TemplateService } from '../services/template.service';

@ApiTags('Email-Plantillas')
@Controller('templates')
export class TemplateController {
  constructor(private readonly templateService: TemplateService) {}

  @Get()
  @ApiOperation({ summary: 'Listar plantillas de correo de la empresa' })
  async getTemplates(
    @AppHeaders() h: HeaderParamsDto,
    @Query('ideEmpr') ideEmpr: number,
  ) {
    return await this.templateService.getTemplates(ideEmpr ? ideEmpr : h.ideEmpr);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener plantilla de correo por ID' })
  async getTemplate(
    @AppHeaders() h: HeaderParamsDto,
    @Param('id') id: number,
    @Query('ideEmpr') ideEmpr: number,
  ) {
    return await this.templateService.getTemplateById(id, ideEmpr ? ideEmpr : h.ideEmpr);
  }

  @Post()
  @ApiOperation({ summary: 'Crear nueva plantilla de correo HTML' })
  async createTemplate(
    @AppHeaders() h: HeaderParamsDto,
    @Body() createTemplateDto: CreateTemplateDto,
    @Query('ideEmpr') ideEmpr: number,
    @Query('ideUsua') ideUsua: number,
    @Query('usuario') usuario: string,
  ) {
    return await this.templateService.createTemplate(
      createTemplateDto,
      ideEmpr ? ideEmpr : h.ideEmpr,
      ideUsua ? ideUsua : h.ideUsua,
      usuario || h.login,
    );
  }

  @Put(':id')
  @ApiOperation({ summary: 'Actualizar plantilla de correo por ID' })
  async updateTemplate(
    @AppHeaders() h: HeaderParamsDto,
    @Param('id') id: number,
    @Body() updateTemplateDto: UpdateTemplateDto,
    @Query('ideEmpr') ideEmpr: number,
    @Query('usuario') usuario: string,
  ) {
    return await this.templateService.updateTemplate(
      id,
      updateTemplateDto,
      ideEmpr ? ideEmpr : h.ideEmpr,
      usuario || h.login,
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar plantilla de correo por ID' })
  async deleteTemplate(
    @AppHeaders() h: HeaderParamsDto,
    @Param('id') id: number,
    @Query('ideEmpr') ideEmpr: number,
  ) {
    return await this.templateService.deleteTemplate(id, ideEmpr ? ideEmpr : h.ideEmpr);
  }
}
