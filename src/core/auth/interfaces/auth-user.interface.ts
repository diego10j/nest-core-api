export interface EmpresaAuth {
    ide_empr: number;
    nom_empr: string;
    logo_empr: string;
    identificacion_empr: string;
}

export interface PerfilAuth {
    ide_perf: number;
    nom_perf: string;
}

export interface SucursalAuth {
    ide_sucu: number;
    nom_sucu: string;
    logo_sucu: string;
}

export interface AuthUser {
    ide_usua: number;
    id: string; // uuid
    displayName: string;
    email: string;
    login: string;
    photoURL: string;
    isPublic: boolean;
    lastAccess?: Date | string;
    ip?: string;
    requireChange: boolean;
    isSuperUser: boolean;
    perfiles: PerfilAuth[];
    sucursales: SucursalAuth[];
    empresas: EmpresaAuth[];
    roles: string[];
}
