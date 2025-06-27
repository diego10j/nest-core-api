
import { Module } from '@nestjs/common';


import { UsuariosModule } from '../sistema/usuarios/usuarios.module';
import { CalendarioModule } from '../sistema/calendario/calendario.module';
import { AdminModule } from '../sistema/admin/admin.module';
import { GeneralModule } from '../sistema/general/general.module';
import { FilesModule } from './files/files.module';
import { VariablesModule } from './variables/variables.module';

@Module({
    imports: [GeneralModule, CalendarioModule, UsuariosModule, AdminModule, FilesModule, VariablesModule],
    providers: [],
    exports: [],
    controllers: [],
})
export class SistemaModule { }
