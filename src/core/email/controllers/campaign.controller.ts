import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { CreateCampaignDto } from '../dto/create-campaign.dto';
import { CampaignService } from '../services/campaign.service';

@ApiTags('Email-Campañas')
@Controller('campaigns')
export class CampaignController {
  constructor(private readonly campaignService: CampaignService) {}

  @Get()
  @ApiOperation({ summary: 'Listar campañas de correo de la empresa' })
  async getCampaigns(
    @AppHeaders() h: HeaderParamsDto,
    @Query('ideEmpr') ideEmpr: number,
  ) {
    return await this.campaignService.getCampaigns(ideEmpr ? ideEmpr : h.ideEmpr);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener campaña de correo por ID' })
  async getCampaign(
    @AppHeaders() h: HeaderParamsDto,
    @Param('id') id: number,
    @Query('ideEmpr') ideEmpr: number,
  ) {
    return await this.campaignService.getCampaignById(id, ideEmpr ? ideEmpr : h.ideEmpr);
  }

  @Post()
  @ApiOperation({ summary: 'Crear nueva campaña de correo masivo' })
  async createCampaign(
    @AppHeaders() h: HeaderParamsDto,
    @Body() createCampaignDto: CreateCampaignDto,
    @Query('ideEmpr') ideEmpr: number,
    @Query('ideUsua') ideUsua: number,
    @Query('usuario') usuario: string,
  ) {
    return await this.campaignService.createCampaign(
      createCampaignDto,
      ideEmpr ? ideEmpr : h.ideEmpr,
      ideUsua ? ideUsua : h.ideUsua,
      usuario || h.login,
    );
  }

  @Post(':id/process')
  @ApiOperation({ summary: 'Procesar y enviar una campaña de correo' })
  async processCampaign(
    @AppHeaders() h: HeaderParamsDto,
    @Param('id') id: number,
    @Query('ideEmpr') ideEmpr: number,
  ) {
    return await this.campaignService.processCampaign(id, ideEmpr ? ideEmpr : h.ideEmpr);
  }

  @Post('schedule')
  @ApiOperation({ summary: 'Programar envío automático de campañas pendientes' })
  async scheduleCampaigns(@AppHeaders() _h: HeaderParamsDto) {
    return await this.campaignService.scheduleCampaigns();
  }
}
