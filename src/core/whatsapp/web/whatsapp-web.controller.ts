import { Controller, Post, Body } from '@nestjs/common';
import { WhatsappWebService } from './whatsapp-web.service';
import {  ApiOperation, ApiTags } from '@nestjs/swagger';
import { ServiceDto } from 'src/common/dto/service.dto';
import { SendMenssageDto } from './dto/send-message.dto';
import { SendMediaDto } from './dto/send-media.dto';
import { GetMessagesWebDto } from './dto/get-messages-web.dto';
import { SendLocationDto } from './dto/send-location.dto';

@ApiTags('whatsapp-web')
@Controller('whatsapp-web')
export class WhatsappWebController {
    constructor(private readonly whatsappService: WhatsappWebService) { }

    @Post('getStatus')
    @ApiOperation({ summary: 'Post WhatsApp connection status' })
    getStatus(
        @Body() dtoIn: ServiceDto
    ) {
        return this.whatsappService.getStatus(dtoIn);
    }

    @Post('getQr')
    @ApiOperation({ summary: 'Post current QR code for authentication' })
    async getQr(
        @Body() dtoIn: ServiceDto
    ) {
        return await this.whatsappService.getQrCode(dtoIn);
    }

    @Post('sendMessage')
    @ApiOperation({ summary: 'Send a WhatsApp message' })
    async sendMessage(
        @Body() dtoIn: SendMenssageDto
    ) {
        return await this.whatsappService.sendMessage(dtoIn);
    }

    @Post('logout')
    @ApiOperation({ summary: 'Logout from WhatsApp' })
    async logout(
        @Body() dtoIn: ServiceDto
    ) {
        await this.whatsappService.logout(dtoIn);
        return { success: true };
    }

    @Post('sendMedia')
    @ApiOperation({ summary: 'sendMedia  message' })
    async sendMedia(@Body() dtoIn: SendMediaDto) {
        return await this.whatsappService.sendMedia(dtoIn);
    }

    @Post('sendLocation')
    @ApiOperation({ summary: 'Send location' })
    async sendLocation(@Body() locationMessage: SendLocationDto) {
        return await this.whatsappService.sendLocation(locationMessage);
    }


    @Post('getChats')
    @ApiOperation({ summary: 'Send getChats' })
    async getChats(@Body() dtoIn: ServiceDto) {
        return await this.whatsappService.getChats(dtoIn);
    }

    @Post('getMessages')
    @ApiOperation({ summary: 'Send getMessages' })
    async getMessages(@Body() dtoIn: GetMessagesWebDto) {
        return await this.whatsappService.getMessages(dtoIn);
    }



}