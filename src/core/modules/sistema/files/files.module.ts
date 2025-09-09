import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { FileTempService } from './file-temp.service';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

@Module({
  controllers: [FilesController],
  providers: [FilesService, FileTempService],
  exports: [FileTempService],
  imports: [ConfigModule],
})
export class FilesModule {}
