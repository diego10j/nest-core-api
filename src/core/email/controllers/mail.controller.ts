import { Get, Controller, Post, Body, Query } from '@nestjs/common';
import { MailService } from '../services/mail.service';
import { SendMailDto } from '../dto/send-mail.dto';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';
import { TestMailService } from '../services/test-mail.service';

@Controller('mail')
export class MailController {
    constructor(private readonly mailService: MailService,
        private readonly testService: TestMailService,
    ) { }


    @Post('send')
    // @Auth()
    async enviarMensajeTexto(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SendMailDto) {
        return await this.mailService.sendMail(dtoIn, headersParams.ideEmpr, headersParams.login);
    }

    @Post('process-queue')
    // @Auth()
    async processQueue(@AppHeaders() _headersParams: HeaderParamsDto) {
        return await this.mailService.processMailQueue();
    }


    @Get('getCuentaCorreo')
    // @Auth()
    async getCuentaCorreo(@AppHeaders() headersParams: HeaderParamsDto) {
        return await this.mailService.getCuentaCorreo(headersParams.ideEmpr);
    }



    @Get('getCuentasCorreo')
    // @Auth()
    getCuentasCorreo(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
        return this.mailService.getCuentasCorreo(headersParams);
    }



    @Post('sendTest')
    async sendTest() {
        // Usar el servicio que automaticamente pone en cola
        await this.mailService.sendMail({
            destinatario: 'diego10j.89@hotmail.com',
            asunto: 'Asunto del correo',
            contenido: '<h1>Contenido HTML</h1><p>Mensaje de prueba</p>',
            ide_corr: 1
        }, 0, 'sa');

        // await this.testService.testMail('diego10j.89@hotmail.com');
        // Forzar procesamiento de la cola
        await this.mailService.processMailQueue();
        return {
            message: 'Email agregado a la cola de envío',
            status: 'queued'
        };
    }
}