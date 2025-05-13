import {  Injectable } from '@nestjs/common';
import { SaveDetallesCampaniaDto } from './dto/save-det-camp.dto';



@Injectable()
export class WhatsappCampaniaService {

    constructor() { }


    /**
     * Guarda el array de telefonos de una campaña
     * @param dto 
     * @returns 
     */
    async saveDetalleCampania(dto: SaveDetallesCampaniaDto) {
      

       return dto;
    }


    

    


}
