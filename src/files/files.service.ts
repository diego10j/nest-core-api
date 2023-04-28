import { existsSync } from 'fs';
import { join } from 'path';

import { Injectable, BadRequestException } from '@nestjs/common';


@Injectable()
export class FilesService {

    getStaticImage(imageName: string) {
        let path = join(__dirname, '../../static/images', imageName);
        if (!existsSync(path))
            path = join(__dirname, '../../public/assets/images', 'no-image.png');
        if (!existsSync(path))
            throw new BadRequestException(`No image found with  ${imageName}`);
        return path;
    }

}
