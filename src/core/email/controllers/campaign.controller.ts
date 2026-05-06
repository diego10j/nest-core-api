import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { CreateCampaignDto } from '../dto/create-campaign.dto';
import { CampaignService } from '../services/campaign.service';

@ApiTags('Email-Campañas')
@Controller('campaigns')
export class CampaignController {
  constructor(private readonly campaignService: CampaignService) {}

  @Get()
  @ApiOperation({ summary: 'Listar campañas de correo de la empresa' })
  async getCampaigns(@Query('ideEmpr') ideEmpr: number) {
    return await this.campaignService.getCampaigns(ideEmpr);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener campaña de correo por ID' })
  async getCampaign(@Param('id') id: number, @Query('ideEmpr') ideEmpr: number) {
    return await this.campaignService.getCampaignById(id, ideEmpr);
  }

  @Post()
  @ApiOperation({ summary: 'Crear nueva campaña de correo masivo' })
  async createCampaign(
    @Body() createCampaignDto: CreateCampaignDto,
    @Query('ideEmpr') ideEmpr: number,
    @Query('ideUsua') ideUsua: number,
    @Query('usuario') usuario: string,
  ) {
    return await this.campaignService.createCampaign(createCampaignDto, ideEmpr, ideUsua, usuario);
  }

  @Post(':id/process')
  @ApiOperation({ summary: 'Procesar y enviar una campaña de correo' })
  async processCampaign(@Param('id') id: number, @Query('ideEmpr') ideEmpr: number) {
    return await this.campaignService.processCampaign(id, ideEmpr);
  }

  @Post('schedule')
  @ApiOperation({ summary: 'Programar envío automático de campañas pendientes' })
  async scheduleCampaigns() {
    return await this.campaignService.scheduleCampaigns();
  }
}
