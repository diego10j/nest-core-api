import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { CampaignService } from '../services/campaign.service';
import { CreateCampaignDto } from '../dto/create-campaign.dto';

@Controller('campaigns')
export class CampaignController {
    constructor(private readonly campaignService: CampaignService) { }

    @Get()
    async getCampaigns(@Query('ideEmpr') ideEmpr: number) {
        return await this.campaignService.getCampaigns(ideEmpr);
    }

    @Get(':id')
    async getCampaign(@Param('id') id: number, @Query('ideEmpr') ideEmpr: number) {
        return await this.campaignService.getCampaignById(id, ideEmpr);
    }

    @Post()
    async createCampaign(
        @Body() createCampaignDto: CreateCampaignDto,
        @Query('ideEmpr') ideEmpr: number,
        @Query('ideUsua') ideUsua: number,
        @Query('usuario') usuario: string
    ) {
        return await this.campaignService.createCampaign(createCampaignDto, ideEmpr, ideUsua, usuario);
    }

    @Post(':id/process')
    async processCampaign(@Param('id') id: number, @Query('ideEmpr') ideEmpr: number) {
        return await this.campaignService.processCampaign(id, ideEmpr);
    }

    @Post('schedule')
    async scheduleCampaigns() {
        return await this.campaignService.scheduleCampaigns();
    }
}