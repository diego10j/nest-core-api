import { Module } from '@nestjs/common';
import { InventarioModule } from 'src/core/modules/inventario/inventario.module';
import { InventarioReportsModule } from './modules/inventario/inventario-reports.module';

@Module({
    imports: [        
        InventarioReportsModule
    ],
    providers: [],
    controllers: [],
})
export class ReportsModule { }