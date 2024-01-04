import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { DataSourceService } from '../connection/datasource.service';
import { ServiceDto } from 'src/common/dto/service.dto';
import { MensajeChatDto } from './dto/mensaje-chat.dto';
import { HttpService } from '@nestjs/axios';
import { AxiosRequestConfig } from 'axios';

@Injectable()
export class ChatbotService {

    private WHATSAPP_ID: string;
    private WHATSAPP_TOKEN: string;

    constructor(private readonly httpService: HttpService,
        private readonly dataSource: DataSourceService
    ) {
        // Recupera valores variables de entorno
        this.WHATSAPP_ID = process.env.WHATSAPP_API_ID;
        this.WHATSAPP_TOKEN = process.env.WHATSAPP_API_TOKEN;
    }

    /**
     * Envia mensaje de la plantilla activar mensajes
     * @param dtoIn 
     * @returns 
     */
    async activarNumero(dtoIn: MensajeChatDto) {
        const data = JSON.stringify(
            {
                "messaging_product": "whatsapp",
                "to": dtoIn.telefono,
                "type": "template",
                "template": {
                    "name": "activate_msg",
                    "language": {
                        "code": "en_US"
                    }
                }
            }
        );
        const resp = await this.sendMessageWhatsApp(data);
        return {
            mensaje: 'ok',
            data: resp
        }
    }

    /**
     * Envia un mensaje a un numero determinado
     * @param dtoIn 
     * @returns 
     */
    async enviarMensaje(dtoIn: MensajeChatDto) {

        const data = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": dtoIn.telefono,
            "type": "text",
            "text": {
                "preview_url": false,
                "body": dtoIn.mensaje  //"Mensaje de prueba enviado por *ProduBot*"
            }
        };
        const resp = await this.sendMessageWhatsApp(data);
        return {
            mensaje: 'ok',
            data: resp
        }
    }

    /**
    * Consume Api Whatsapp para enviar mensaje
    * @param data
    */
    async sendMessageWhatsApp(data: any) {

        const URL = `https://graph.facebook.com/v17.0/${this.WHATSAPP_ID}/messages`;

        const requestConfig: AxiosRequestConfig = {
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.WHATSAPP_TOKEN}`
            }
        };
        try {
            const resp = await this.httpService.axiosRef.post(URL, data, requestConfig);
            return resp.data;
        } catch (error) {
            throw new InternalServerErrorException(
                `[ERROR]: sendMessageWhatsApp ${error}`
            );
        }
    }

}
