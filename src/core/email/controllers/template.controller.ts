import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { CreateTemplateDto } from '../dto/create-template.dto';
import { UpdateTemplateDto } from '../dto/update-template.dto';
import { TemplateService } from '../services/template.service';

@ApiTags('Email-Plantillas')
@Controller('templates')
export class TemplateController {
  constructor(private readonly templateService: TemplateService) {}

  @Get()
  @ApiOperation({ summary: 'Listar plantillas de correo de la empresa' })
  async getTemplates(@Query('ideEmpr') ideEmpr: number) {
    return await this.templateService.getTemplates(ideEmpr);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener plantilla de correo por ID' })
  async getTemplate(@Param('id') id: number, @Query('ideEmpr') ideEmpr: number) {
    return await this.templateService.getTemplateById(id, ideEmpr);
  }

  @Post()
  @ApiOperation({ summary: 'Crear nueva plantilla de correo HTML' })
  async createTemplate(
    @Body() createTemplateDto: CreateTemplateDto,
    @Query('ideEmpr') ideEmpr: number,
    @Query('ideUsua') ideUsua: number,
    @Query('usuario') usuario: string,
  ) {
    return await this.templateService.createTemplate(createTemplateDto, ideEmpr, ideUsua, usuario);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Actualizar plantilla de correo por ID' })
  async updateTemplate(
    @Param('id') id: number,
    @Body() updateTemplateDto: UpdateTemplateDto,
    @Query('ideEmpr') ideEmpr: number,
    @Query('usuario') usuario: string,
  ) {
    return await this.templateService.updateTemplate(id, updateTemplateDto, ideEmpr, usuario);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar plantilla de correo por ID' })
  async deleteTemplate(@Param('id') id: number, @Query('ideEmpr') ideEmpr: number) {
    return await this.templateService.deleteTemplate(id, ideEmpr);
  }
}
