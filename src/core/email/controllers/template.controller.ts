import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';

import { CreateTemplateDto } from '../dto/create-template.dto';
import { UpdateTemplateDto } from '../dto/update-template.dto';
import { TemplateService } from '../services/template.service';

@Controller('templates')
export class TemplateController {
  constructor(private readonly templateService: TemplateService) {}

  @Get()
  async getTemplates(@Query('ideEmpr') ideEmpr: number) {
    return await this.templateService.getTemplates(ideEmpr);
  }

  @Get(':id')
  async getTemplate(@Param('id') id: number, @Query('ideEmpr') ideEmpr: number) {
    return await this.templateService.getTemplateById(id, ideEmpr);
  }

  @Post()
  async createTemplate(
    @Body() createTemplateDto: CreateTemplateDto,
    @Query('ideEmpr') ideEmpr: number,
    @Query('ideUsua') ideUsua: number,
    @Query('usuario') usuario: string,
  ) {
    return await this.templateService.createTemplate(createTemplateDto, ideEmpr, ideUsua, usuario);
  }

  @Put(':id')
  async updateTemplate(
    @Param('id') id: number,
    @Body() updateTemplateDto: UpdateTemplateDto,
    @Query('ideEmpr') ideEmpr: number,
    @Query('usuario') usuario: string,
  ) {
    return await this.templateService.updateTemplate(id, updateTemplateDto, ideEmpr, usuario);
  }

  @Delete(':id')
  async deleteTemplate(@Param('id') id: number, @Query('ideEmpr') ideEmpr: number) {
    return await this.templateService.deleteTemplate(id, ideEmpr);
  }
}
