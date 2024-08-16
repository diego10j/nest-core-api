import { Module } from '@nestjs/common';
import { DataSourceService } from './connection/datasource.service';
import { AuditService } from './audit/audit.service';
import { AuditController } from './audit/audit.controller';
import { CoreController } from './core.controller';
import { CoreService } from './core.service';
import { ErrorsModule } from '../errors/errors.module';
import { ProductosModule } from './inventario/productos/productos.module';
import { ClientesModule } from './ventas/clientes/clientes.module';
import { ChatbotModule } from './chatbot/chatbot.module';
// import { UsuariosModule } from './sistema/usuarios/usuarios.module';
// import { CalendarioModule } from './sistema/calendario/calendario.module';
// import { AdminModule } from './sistema/admin/admin.module';
// import { GeneralModule } from './sistema/general/general.module';
// import { SistemaModule } from './sistema/sistema.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
@Module({
  //   imports: [ErrorsModule, ProductosModule, ClientesModule, ChatbotModule, UsuariosModule, GeneralModule, CalendarioModule, AdminModule, SistemaModule],
  imports: [AuthModule, ErrorsModule, ProductosModule, ClientesModule, ChatbotModule, AuditModule],
  providers: [DataSourceService, CoreService],
  exports: [DataSourceService],
  controllers: [CoreController],
})
export class CoreModule { }
