import { Controller } from '@nestjs/common';
import { GeneralService } from './general.service';

@Controller('general')
export class GeneralController {
  constructor(private readonly generalService: GeneralService) {}
}
