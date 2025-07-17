
import { Module } from '@nestjs/common';


import { UsuariosModule } from './usuarios/usuarios.module';
import { CalendarioModule } from './calendario/calendario.module';
import { AdminModule } from './admin/admin.module';
import { GeneralModule } from './general/general.module';
import { FilesModule } from './files/files.module';

@Module({
    imports: [GeneralModule, CalendarioModule, UsuariosModule, AdminModule, FilesModule],
    providers: [],
    exports: [],
    controllers: [],
})
export class SistemaModule { }


