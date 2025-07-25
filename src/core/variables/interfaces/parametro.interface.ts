export interface Parametro {
    ide_modu: number;
    nom_para: string;
    descripcion_para: string;
    valor_para: string;
    tabla_para?: string;
    campo_codigo_para?: string;
    campo_nombre_para?: string;
    activo_para: boolean;
    es_empr_para: boolean;
  }


  export type ModuleID = number & { readonly __brand: unique symbol }; // Tipo nominativo para IDs

export interface ModuloDefinition {
    ID: ModuleID;
    SIGLAS: string;
    NOMBRE?: string; // Opcional para descripción legible
}