import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSourceService } from '../../../connection/datasource.service';

import { BaseService } from '../../../../common/base-service';
import { SelectQuery } from 'src/core/connection/helpers';
import { ClaveAccesoDto } from './dto/clave-acceso.dto';
import { ComprobanteDto } from './dto/comprobante.dto';
import { ClienteDto } from './dto/cliente.dto';
import { TipoComprobanteEnum } from './enum/tipo-comprobante.enum';
import { DetalleComprobanteDto } from './dto/detalle-comprobante.dto';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

@Injectable()
export class ComprobantesElecService extends BaseService {


    constructor(private readonly dataSource: DataSourceService
    ) {
        super();
    }

    async getComprobantePorClaveAcceso(dtoIn: ClaveAccesoDto  & HeaderParamsDto) {
        const query = new SelectQuery(`
        SELECT 
            a.*,
            b.identicicacion_sucu, 
            b.telefonos_sucu, 
            b.correo_sucu, 
            b.agente_ret_sucu,
            c.identificac_geper,
            c.nom_geper,
            c.direccion_geper,
            c.telefono_geper,
            c.movil_geper,
            c.correo_geper,
            d.alterno2_getid
        FROM 
            sri_comprobante a
        INNER JOIN 
            sis_sucursal b ON a.ide_sucu = b.ide_sucu
        INNER JOIN 
            gen_persona c on a.ide_geper = c.ide_geper
        INNER JOIN 
            gen_tipo_identifi d on c.ide_getid=d.ide_getid
        WHERE 1 = 1
            AND a.claveacceso_srcom = $1
        `, dtoIn);
        query.addStringParam(1, dtoIn.claveAcceso);
        const data = await this.dataSource.createSingleQuery(query);
        if (data) {
            const comprobante = await this.dataToComprobante(data);
            return comprobante;
        }
        else {
            throw new BadRequestException(`No existe el comprobante ${dtoIn.claveAcceso}`);
        }

    }


    private async dataToComprobante(data: any): Promise<ComprobanteDto> {
        const comprobante = new ComprobanteDto();
        // Asignación de propiedades al DTO
        comprobante.codigocomprobante = data.ide_srcom;
        comprobante.tipoemision = data.tipoemision_srcom;
        comprobante.claveacceso = data.claveacceso_srcom;
        comprobante.coddoc = data.coddoc_srcom;
        comprobante.estab = data.estab_srcom;
        comprobante.ptoemi = data.ptoemi_srcom;
        comprobante.secuencial = data.secuencial_srcom;
        comprobante.fechaemision = data.fechaemision_srcom;
        comprobante.guiaremision = data.num_guia_srcom;
        comprobante.totalsinimpuestos = data.subtotal_srcom || 0;
        comprobante.totaldescuento = data.descuento_srcom || 0;
        comprobante.propina = 0;  // Se asigna un valor fijo de 0 
        comprobante.importetotal = data.total_srcom;
        comprobante.moneda = 'DOLAR';  // Valor fijo
        comprobante.periodofiscal = data.periodo_fiscal_srcom;
        comprobante.coddocmodificado = data.codigo_docu_mod_srcom;
        comprobante.numdocmodificado = data.num_doc_mod_srcom;
        comprobante.fechaemisiondocsustento = data.fecha_emision_mod_srcom;
        comprobante.valormodificacion = data.valor_mod_srcom;
        comprobante.numAutorizacion = data.autorizacion_srcomn;
        comprobante.correo = data.correo_srcom;
        comprobante.diasCredito = data.dias_credito_srcom;
        comprobante.numOrdenCompra = data.orden_compra_srcom;
        comprobante.infoAdicional1 = data.infoadicional1_srcom;
        comprobante.infoAdicional2 = data.infoadicional2_srcom;
        comprobante.infoAdicional3 = data.infoadicional3_srcom;
        comprobante.agenteRetencion = data.agente_ret_sucu;
        comprobante.rucEmpresa = data.identicicacion_sucu;
        comprobante.telefonos = data.telefonos_sucu;
        comprobante.oficina = data.ide_sucu;  // Usando el valor de oficina
        comprobante.fechaautoriza = data.fechaautoriza_srcom;
        comprobante.fechaIniTransporte = data.fecha_ini_trans_srcom;
        comprobante.fechaFinTransporte = data.fecha_fin_trans_srcom;
        comprobante.dirPartida = data.direcion_partida_srcom;

        const cliente = new ClienteDto();
        cliente.identificacion = data.identificac_geper?.trim();
        cliente.tipoIdentificacion = data.alterno2_getid?.trim();
        cliente.nombreCliente = data.nom_geper?.trim();
        cliente.direccion = data.direccion_geper;
        cliente.telefono = data.telefono_geper;
        cliente.celular = data.movil_geper;
        cliente.correo = data.correo_geper;
        // Para Factura / Guia toma  direccion, telefono 
        if (comprobante.coddoc === TipoComprobanteEnum.FACTURA.codigo || comprobante.coddoc === TipoComprobanteEnum.GUIA_DE_REMISION.codigo) {
            const query = new SelectQuery(`
                SELECT 
                    telefono_cccfa,direccion_cccfa 
                FROM cxc_cabece_factura
                WHERE ide_srcom= ${comprobante.codigocomprobante}
            `);

            const res = await this.dataSource.createSingleQuery(query);
            if (res) {
                cliente.direccion = res.direccion_cccfa;
                cliente.telefono = res.telefono_cccfa;
            }
        }
        comprobante.cliente = cliente;
        let detalle: DetalleComprobanteDto[] = [];
        // FACTURA
        if (comprobante.coddoc === TipoComprobanteEnum.FACTURA.codigo) {
            //Busca los detalles del Comprobante
            const query = new SelectQuery(`
            select f.ide_inarti,codigo_inarti,COALESCE(nombre_inuni,'') ||' '|| observacion_ccdfa as nombre_inarti,cantidad_ccdfa
            ,precio_ccdfa,iva_inarti_ccdfa,total_ccdfa,nombre_inuni, tarifa_iva_cccfa 
            from cxc_cabece_factura  a
            inner join cxc_deta_factura c on a.ide_cccfa=c.ide_cccfa
            inner join  inv_articulo f on c.ide_inarti =f.ide_inarti
            left join  inv_unidad g on c.ide_inuni =g.ide_inuni
            where a.ide_srcom=${comprobante.codigocomprobante} order by observacion_ccdfa
            `);
            const res = await this.dataSource.createSelectQuery(query);
            detalle = res.map(function (obj) {
                return {
                    codigoprincipal: obj.codigo_inarti,
                    codigoauxiliar: obj.ide_inarti,
                    cantidad: obj.cantidad_ccdfa,
                    descripciondet: obj.nombre_inarti?.trim(),
                    preciounitario: obj.precio_ccdfa,
                    descuento: 0,
                    preciototalsinimpuesto: obj.total_ccdfa,
                    porcentajeiva: obj.iva_inarti_ccdfa === 1 ? obj.tarifa_iva_cccfa : 0
                } as DetalleComprobanteDto;
            });
        }
        comprobante.detalle = detalle;


        return comprobante;
    }


}