import { ModuleID, ModuloDefinition } from "./interfaces/parametro.interface";


export const MODULOS = {
    CONTABILIDAD: {
        ID: toModuleID(0),
        SIGLAS: 'con',
        NOMBRE: 'Contabilidad'
    },
    INVENTARIO: {
        ID: toModuleID(1),
        SIGLAS: 'inv',
        NOMBRE: 'Inventario'
    },
     CUENTAS_POR_PAGAR: {
         ID: toModuleID(2),
         SIGLAS: 'cxp',
         NOMBRE: 'Cuentas Por Pagar'
     },
     CUENTAS_POR_COBRAR: {
        ID: toModuleID(3),
        SIGLAS: 'cxc',
        NOMBRE: 'Cuentas Por Cobrar'
    },
    GENERAL: {
        ID: toModuleID(5),
        SIGLAS: 'gen',
        NOMBRE: 'General'
    }
} as const;

export const MODULOS_DEFINIDOS: ReadonlyMap<ModuleID, ModuloDefinition> = new Map(
    Object.values(MODULOS).map(modulo => [modulo.ID, modulo])
);

export function getModuloDefinition(id: ModuleID): ModuloDefinition {
    const modulo = MODULOS_DEFINIDOS.get(id);
    if (!modulo) throw new Error(`Módulo con ID ${id} no definido`);
    return modulo;
}


export function toModuleID(id: number): ModuleID {
    if (!Number.isInteger(id)) {
        throw new Error(`ModuleID debe ser un número entero`);
    }
    if (id < 0) {
        throw new Error(`ModuleID debe ser un número positivo`);
    }
    return id as ModuleID;
}

export function assertValidModuleID(id: number): asserts id is ModuleID {
    toModuleID(id); // Lanza error si no es válido
}