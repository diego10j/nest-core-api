import { Injectable } from '@nestjs/common';
import { DataSourceService } from '../connection/datasource.service';
import * as https from 'https';
import { ServiceDto } from 'src/common/dto/service.dto';
import { ActivarNumeroDto } from './dto/activar-numbero.dto';

@Injectable()
export class ChatbotService {

    private WHATSAPP_ID: string;
    private WHATSAPP_TOKEN: string;

    constructor(private readonly dataSource: DataSourceService
    ) {
        // Recupera valores variables de entorno
        this.WHATSAPP_ID = process.env.WHATSAPP_API_ID;
        this.WHATSAPP_TOKEN = process.env.WHATSAPP_API_TOKEN;
    }


    activarNumero(dtoIn: ActivarNumeroDto) {
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

        this.sendMessageWhatsApp(data);

        return {
            ok: true
        }
    }

    sendTextMessage(dtoIn: ServiceDto) {
        const data = JSON.stringify({
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": "593983113543",
            "type": "text",
            "text": {
                "preview_url": false,
                "body": "Mensaje de prueba enviado por *ProduBot*"
            }
        });


        this.sendMessageWhatsApp(data);

        return {
            ok: true
        }
    }

    /**
    * Consume Api Whatsapp para enviar mensaje
    * @param data
    */
    sendMessageWhatsApp(data: any) {
        const options = {
            host: "graph.facebook.com",
            path: `/v17.0/${this.WHATSAPP_ID}/messages`,
            method: "POST",
            body: data,
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.WHATSAPP_TOKEN}`
            }
        };
        const req = https.request(options, res => {
            res.on("data", d => {
                process.stdout.write(d);
            });
        });

        req.on("error", error => {
            console.error(error);
        });

        req.write(data);
        req.end();
    }

}
