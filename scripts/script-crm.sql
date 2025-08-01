-- 15 Ago 2024 

CREATE TABLE gen_pais (
    "ide_gepais" int4,
    "nombre_gepais" varchar(100), 
    "abreviatura_gepais" varchar(10),   
    "codigo_gepais" varchar(10),   
    "nacionalidad_gepais" varchar(100), 
    "continente_gepais" varchar(10),      
    "alterno_gepais" varchar(10),  
    "cod_movil_gepais" varchar(10),  
    "activo_gepais" bool,   
    "usuario_ingre" varchar(50),
    "hora_ingre" TIMESTAMP,
    "usuario_actua" varchar(50),
    "hora_actua" TIMESTAMP,
	CONSTRAINT "pk_gen_pais" PRIMARY KEY(ide_gepais)
);

INSERT INTO "public"."gen_pais" (
    "ide_gepais", "nombre_gepais", "abreviatura_gepais", "codigo_gepais", 
    "nacionalidad_gepais", "continente_gepais", "cod_movil_gepais", 
    "activo_gepais", "usuario_ingre", "hora_ingre"
) VALUES
(1, 'Ecuador', 'ECU', 'EC', 'Ecuatoriana', 'AME', '+593', true, 'sa', CURRENT_TIMESTAMP),
(2, 'Colombia', 'COL', 'CO', 'Colombiana', 'AME', '+57', true, 'sa', CURRENT_TIMESTAMP),
(3, 'Perú', 'PER', 'PE', 'Peruana', 'AME', '+51', true, 'sa', CURRENT_TIMESTAMP),
(4, 'Chile', 'CHL', 'CL', 'Chilena', 'AME', '+56', true, 'sa', CURRENT_TIMESTAMP),
(5, 'Argentina', 'ARG', 'AR', 'Argentina', 'AME', '+54', true, 'sa', CURRENT_TIMESTAMP),
(6, 'Brasil', 'BRA', 'BR', 'Brasileña', 'AME', '+55', true, 'sa', CURRENT_TIMESTAMP),
(7, 'México', 'MEX', 'MX', 'Mexicana', 'AME', '+52', true, 'sa', CURRENT_TIMESTAMP),
(8, 'Estados Unidos', 'USA', 'US', 'Estadounidense', 'AME', '+1', true, 'sa', CURRENT_TIMESTAMP),
(9, 'España', 'ESP', 'ES', 'Española', 'EUR', '+34', true, 'sa', CURRENT_TIMESTAMP),
(10, 'Alemania', 'DEU', 'DE', 'Alemana', 'EUR', '+49', true, 'sa', CURRENT_TIMESTAMP),
(11, 'Francia', 'FRA', 'FR', 'Francesa', 'EUR', '+33', true, 'sa', CURRENT_TIMESTAMP),
(12, 'Italia', 'ITA', 'IT', 'Italiana', 'EUR', '+39', true, 'sa', CURRENT_TIMESTAMP),
(13, 'Reino Unido', 'GBR', 'GB', 'Británica', 'EUR', '+44', true, 'sa', CURRENT_TIMESTAMP),
(14, 'China', 'CHN', 'CN', 'China', 'ASI', '+86', true, 'sa', CURRENT_TIMESTAMP),
(15, 'Japón', 'JPN', 'JP', 'Japonesa', 'ASI', '+81', true, 'sa', CURRENT_TIMESTAMP),
(16, 'India', 'IND', 'IN', 'India', 'ASI', '+91', true, 'sa', CURRENT_TIMESTAMP),
(17, 'Australia', 'AUS', 'AU', 'Australiana', 'OCE', '+61', true, 'sa', CURRENT_TIMESTAMP),
(18, 'Canadá', 'CAN', 'CA', 'Canadiense', 'AME', '+1', true, 'sa', CURRENT_TIMESTAMP);



CREATE TABLE gen_provincia (
    "ide_geprov" int4,
    "ide_gepais" int4,
    "nombre_geprov" varchar(100), 
    "region_nat_geprov" varchar(1), 
    "codigo_geprov" varchar(10),   
    "alterno_geprov" varchar(10),   
    "activo_geprov" bool,   
    "usuario_ingre" varchar(50),
    "hora_ingre" TIMESTAMP,
    "usuario_actua" varchar(50),
    "hora_actua" TIMESTAMP,    
	CONSTRAINT "pk_gen_provincia" PRIMARY KEY(ide_geprov),
    CONSTRAINT "gen_provincia_ide_gepais_fkey" FOREIGN KEY ("ide_gepais") REFERENCES "public"."gen_pais"("ide_gepais") ON DELETE CASCADE ON UPDATE CASCADE
);


insert into gen_provincia (ide_geprov ,ide_gepais ,nombre_geprov, region_nat_geprov, activo_geprov,usuario_ingre,hora_ingre) values (1,1,'AZUAY','S',true,'sa',CURRENT_TIMESTAMP);
insert into gen_provincia (ide_geprov ,ide_gepais ,nombre_geprov, region_nat_geprov, activo_geprov,usuario_ingre,hora_ingre) values (2,1,'BOLIVAR','S',true,'sa',CURRENT_TIMESTAMP);
insert into gen_provincia (ide_geprov ,ide_gepais ,nombre_geprov, region_nat_geprov, activo_geprov,usuario_ingre,hora_ingre) values (3,1,'CAÑAR','S',true,'sa',CURRENT_TIMESTAMP);
insert into gen_provincia (ide_geprov ,ide_gepais ,nombre_geprov, region_nat_geprov, activo_geprov,usuario_ingre,hora_ingre) values (4,1,'CARCHI','S',true,'sa',CURRENT_TIMESTAMP);
insert into gen_provincia (ide_geprov ,ide_gepais ,nombre_geprov, region_nat_geprov, activo_geprov,usuario_ingre,hora_ingre) values (5,1,'COTOPAXI','S',true,'sa',CURRENT_TIMESTAMP);
insert into gen_provincia (ide_geprov ,ide_gepais ,nombre_geprov, region_nat_geprov, activo_geprov,usuario_ingre,hora_ingre) values (6,1,'CHIMBORAZO','S',true,'sa',CURRENT_TIMESTAMP);
insert into gen_provincia (ide_geprov ,ide_gepais ,nombre_geprov, region_nat_geprov, activo_geprov,usuario_ingre,hora_ingre) values (7,1,'EL ORO','C ',true,'sa',CURRENT_TIMESTAMP);
insert into gen_provincia (ide_geprov ,ide_gepais ,nombre_geprov, region_nat_geprov, activo_geprov,usuario_ingre,hora_ingre) values (8,1,'ESMERALDAS','C ',true,'sa',CURRENT_TIMESTAMP);
insert into gen_provincia (ide_geprov ,ide_gepais ,nombre_geprov, region_nat_geprov, activo_geprov,usuario_ingre,hora_ingre) values (9,1,'GUAYAS','C ',true,'sa',CURRENT_TIMESTAMP);
insert into gen_provincia (ide_geprov ,ide_gepais ,nombre_geprov, region_nat_geprov, activo_geprov,usuario_ingre,hora_ingre) values (10,1,'IMBABURA','S',true,'sa',CURRENT_TIMESTAMP);
insert into gen_provincia (ide_geprov ,ide_gepais ,nombre_geprov, region_nat_geprov, activo_geprov,usuario_ingre,hora_ingre) values (11,1,'LOJA','S',true,'sa',CURRENT_TIMESTAMP);
insert into gen_provincia (ide_geprov ,ide_gepais ,nombre_geprov, region_nat_geprov, activo_geprov,usuario_ingre,hora_ingre) values (12,1,'LOS RIOS','C ',true,'sa',CURRENT_TIMESTAMP);
insert into gen_provincia (ide_geprov ,ide_gepais ,nombre_geprov, region_nat_geprov, activo_geprov,usuario_ingre,hora_ingre) values (13,1,'MANABI','C ',true,'sa',CURRENT_TIMESTAMP);
insert into gen_provincia (ide_geprov ,ide_gepais ,nombre_geprov, region_nat_geprov, activo_geprov,usuario_ingre,hora_ingre) values (14,1,'MORONA SANTIAGO','O ',true,'sa',CURRENT_TIMESTAMP);
insert into gen_provincia (ide_geprov ,ide_gepais ,nombre_geprov, region_nat_geprov, activo_geprov,usuario_ingre,hora_ingre) values (15,1,'NAPO','O ',true,'sa',CURRENT_TIMESTAMP);
insert into gen_provincia (ide_geprov ,ide_gepais ,nombre_geprov, region_nat_geprov, activo_geprov,usuario_ingre,hora_ingre) values (16,1,'PASTAZA','O ',true,'sa',CURRENT_TIMESTAMP);
insert into gen_provincia (ide_geprov ,ide_gepais ,nombre_geprov, region_nat_geprov, activo_geprov,usuario_ingre,hora_ingre) values (17,1,'PICHINCHA','S',true,'sa',CURRENT_TIMESTAMP);
insert into gen_provincia (ide_geprov ,ide_gepais ,nombre_geprov, region_nat_geprov, activo_geprov,usuario_ingre,hora_ingre) values (18,1,'TUNGURAHUA','S',true,'sa',CURRENT_TIMESTAMP);
insert into gen_provincia (ide_geprov ,ide_gepais ,nombre_geprov, region_nat_geprov, activo_geprov,usuario_ingre,hora_ingre) values (19,1,'ZAMORA CHINCHIPE','O ',true,'sa',CURRENT_TIMESTAMP);
insert into gen_provincia (ide_geprov ,ide_gepais ,nombre_geprov, region_nat_geprov, activo_geprov,usuario_ingre,hora_ingre) values (20,1,'GALAPAGOS','I ',true,'sa',CURRENT_TIMESTAMP);
insert into gen_provincia (ide_geprov ,ide_gepais ,nombre_geprov, region_nat_geprov, activo_geprov,usuario_ingre,hora_ingre) values (21,1,'SUCUMBIOS','O ',true,'sa',CURRENT_TIMESTAMP);
insert into gen_provincia (ide_geprov ,ide_gepais ,nombre_geprov, region_nat_geprov, activo_geprov,usuario_ingre,hora_ingre) values (22,1,'ORELLANA','O ',true,'sa',CURRENT_TIMESTAMP);
insert into gen_provincia (ide_geprov ,ide_gepais ,nombre_geprov, region_nat_geprov, activo_geprov,usuario_ingre,hora_ingre) values (23,1,'SANTO DOMINGO DE LOS TSACHILAS','S',true,'sa',CURRENT_TIMESTAMP);
insert into gen_provincia (ide_geprov ,ide_gepais ,nombre_geprov, region_nat_geprov, activo_geprov,usuario_ingre,hora_ingre) values (24,1,'SANTA ELENA','C ',true,'sa',CURRENT_TIMESTAMP);

CREATE TABLE gen_canton (
    "ide_gecant" int4,
    "ide_geprov" int4,
    "ide_gepais" int4,
    "nombre_gecan" varchar(100), 
    "codigo_gecan" varchar(10),   
    "alterno_gecan" varchar(10),   
    "activo_gecan" bool,   
    "usuario_ingre" varchar(50),
    "hora_ingre" TIMESTAMP,
    "usuario_actua" varchar(50),
    "hora_actua" TIMESTAMP,    
	CONSTRAINT "pk_gen_canton" PRIMARY KEY(ide_gecant),
    CONSTRAINT "gen_canton_ide_gepais_fkey" FOREIGN KEY ("ide_gepais") REFERENCES "public"."gen_pais"("ide_gepais") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "gen_canton_ide_geprov_fkey" FOREIGN KEY ("ide_geprov") REFERENCES "public"."gen_provincia"("ide_geprov") ON DELETE CASCADE ON UPDATE CASCADE
);

 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (101,1,1,'CUENCA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (102,1,1,'GIRON',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (103,1,1,'GUALACEO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (104,1,1,'NABON',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (105,1,1,'PAUTE',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (106,1,1,'PUCARA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (107,1,1,'SAN FERNANDO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (108,1,1,'SANTA ISABEL',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (109,1,1,'SIGSIG',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (110,1,1,'OÑA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (111,1,1,'CHORDELEG',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (112,1,1,'EL PAN',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (113,1,1,'SEVILLA DE ORO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (114,1,1,'GUACHAPALA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (115,1,1,'CAMILO PONCE ENRIQUEZ',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (201,2,1,'GUARANDA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (202,2,1,'CHILLANES',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (203,2,1,'CHIMBO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (204,2,1,'ECHEANDIA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (205,2,1,'SAN MIGUEL',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (206,2,1,'CALUMA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (207,2,1,'LAS NAVES',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (301,3,1,'AZOGUES',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (302,3,1,'BIBLIAN',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (303,3,1,'CAÑAR',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (304,3,1,'LA TRONCAL',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (305,3,1,'EL TAMBO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (306,3,1,'DELEG',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (307,3,1,'SUSCAL',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (401,4,1,'TULCAN',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (402,4,1,'BOLIVAR',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (403,4,1,'ESPEJO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (404,4,1,'MIRA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (405,4,1,'MONTUFAR',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (406,4,1,'SAN PEDRO DE HUACA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (501,5,1,'LATACUNGA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (502,5,1,'LA MANA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (503,5,1,'PANGUA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (504,5,1,'PUJILI',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (505,5,1,'SALCEDO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (506,5,1,'SAQUISILI',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (507,5,1,'SIGCHOS',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (601,6,1,'RIOBAMBA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (602,6,1,'ALAUSI',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (603,6,1,'COLTA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (604,6,1,'CHAMBO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (605,6,1,'CHUNCHI',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (606,6,1,'GUAMOTE',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (607,6,1,'GUANO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (608,6,1,'PALLATANGA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (609,6,1,'PENIPE',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (610,6,1,'CUMANDA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (701,7,1,'MACHALA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (702,7,1,'ARENILLAS',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (703,7,1,'ATAHUALPA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (704,7,1,'BALSAS',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (705,7,1,'CHILLA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (706,7,1,'EL GUABO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (707,7,1,'HUAQUILLAS',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (708,7,1,'MARCABELI',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (709,7,1,'PASAJE',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (710,7,1,'PIÑAS',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (711,7,1,'PORTOVELO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (712,7,1,'SANTA ROSA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (713,7,1,'ZARUMA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (714,7,1,'LAS LAJAS',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (801,8,1,'ESMERALDAS',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (802,8,1,'ELOY ALFARO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (803,8,1,'MUISNE',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (804,8,1,'QUININDE',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (805,8,1,'SAN LORENZO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (806,8,1,'ATACAMES',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (807,8,1,'RIO VERDE',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (901,9,1,'GUAYAQUIL',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (902,9,1,'ALFREDO BAQUERIZO MORENO (JUJAN)',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (903,9,1,'BALAO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (904,9,1,'BALZAR',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (905,9,1,'COLIMES',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (906,9,1,'DAULE',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (907,9,1,'DURAN',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (908,9,1,'EMPALME',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (909,9,1,'EL TRIUNFO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (910,9,1,'MILAGRO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (911,9,1,'NARANJAL',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (912,9,1,'NARANJITO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (913,9,1,'PALESTINA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (914,9,1,'PEDRO CARBO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (916,9,1,'SAMBORONDON',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (918,9,1,'SANTA LUCIA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (919,9,1,'SALITRE (URBINA JADO)',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (920,9,1,'SAN JACINTO DE YAGUACHI',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (921,9,1,'PLAYAS',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (922,9,1,'SIMON BOLIVAR',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (923,9,1,'CORONEL MARCELINO MARIDUEÑA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (924,9,1,'LOMAS DE SARGENTILLO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (925,9,1,'NOBOL',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (927,9,1,'GENERAL ANTONIO ELIZALDE (BUCAY)',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (928,9,1,'ISIDRO AYORA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1001,10,1,'IBARRA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1002,10,1,'ANTONIO ANTE',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1003,10,1,'COTACACHI',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1004,10,1,'OTAVALO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1005,10,1,'PIMAMPIRO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1006,10,1,'SAN MIGUEL DE URCUQUI',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1101,11,1,'LOJA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1102,11,1,'CALVAS',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1103,11,1,'CATAMAYO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1104,11,1,'CELICA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1105,11,1,'CHAGUARPAMBA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1106,11,1,'ESPINDOLA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1107,11,1,'GONZANAMA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1108,11,1,'MACARA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1109,11,1,'PALTAS',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1110,11,1,'PUYANGO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1111,11,1,'SARAGURO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1112,11,1,'SOZORANGA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1113,11,1,'ZAPOTILLO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1114,11,1,'PINDAL',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1115,11,1,'QUILANGA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1116,11,1,'OLMEDO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1201,12,1,'BABAHOYO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1202,12,1,'BABA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1203,12,1,'MONTALVO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1204,12,1,'PUEBLOVIEJO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1205,12,1,'QUEVEDO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1206,12,1,'URDANETA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1207,12,1,'VENTANAS',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1208,12,1,'VINCES',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1209,12,1,'PALENQUE',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1210,12,1,'BUENA FE',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1211,12,1,'VALENCIA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1212,12,1,'MOCACHE',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1213,12,1,'QUINSALOMA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1301,13,1,'PORTOVIEJO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1302,13,1,'BOLIVAR',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1303,13,1,'CHONE',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1304,13,1,'EL CARMEN',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1305,13,1,'FLAVIO ALFARO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1306,13,1,'JIPIJAPA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1307,13,1,'JUNIN',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1308,13,1,'MANTA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1309,13,1,'MONTECRISTI',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1310,13,1,'PAJAN',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1311,13,1,'PICHINCHA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1312,13,1,'ROCAFUERTE',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1313,13,1,'SANTA ANA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1314,13,1,'SUCRE',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1315,13,1,'TOSAGUA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1316,13,1,'24 DE MAYO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1317,13,1,'PEDERNALES',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1318,13,1,'OLMEDO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1319,13,1,'PUERTO LOPEZ',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1320,13,1,'JAMA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1321,13,1,'JARAMIJO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1322,13,1,'SAN VICENTE',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1401,14,1,'MORONA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1402,14,1,'GUALAQUIZA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1403,14,1,'LIMON INDANZA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1404,14,1,'PALORA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1405,14,1,'SANTIAGO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1406,14,1,'SUCUA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1407,14,1,'HUAMBOYA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1408,14,1,'SAN JUAN BOSCO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1409,14,1,'TAISHA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1410,14,1,'LOGROÑO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1411,14,1,'PABLO SEXTO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1412,14,1,'TIWINTZA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1501,15,1,'TENA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1503,15,1,'ARCHIDONA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1504,15,1,'EL CHACO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1507,15,1,'QUIJOS',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1509,15,1,'CARLOS JULIO AROSEMENA TOLA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1601,16,1,'PASTAZA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1602,16,1,'MERA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1603,16,1,'SANTA CLARA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1604,16,1,'ARAJUNO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1701,17,1,'QUITO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1702,17,1,'CAYAMBE',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1703,17,1,'MEJIA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1704,17,1,'PEDRO MONCAYO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1705,17,1,'RUMIÑAHUI',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1707,17,1,'SAN MIGUEL DE LOS BANCOS',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1708,17,1,'PEDRO VICENTE MALDONADO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1709,17,1,'PUERTO QUITO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1801,18,1,'AMBATO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1802,18,1,'BAÑOS DE AGUA SANTA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1803,18,1,'CEVALLOS',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1804,18,1,'MOCHA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1805,18,1,'PATATE',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1806,18,1,'QUERO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1807,18,1,'SAN PEDRO DE PELILEO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1808,18,1,'SANTIAGO DE PILLARO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1809,18,1,'TISALEO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1901,19,1,'ZAMORA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1902,19,1,'CHINCHIPE',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1903,19,1,'NANGARITZA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1904,19,1,'YACUAMBI',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1905,19,1,'YANTZAZA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1906,19,1,'EL PANGUI',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1907,19,1,'CENTINELA DEL CONDOR',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1908,19,1,'PALANDA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (1909,19,1,'PAQUISHA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (2001,20,1,'SAN CRISTOBAL',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (2002,20,1,'ISABELA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (2003,20,1,'SANTA CRUZ',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (2101,21,1,'LAGO AGRIO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (2102,21,1,'GONZALO PIZARRO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (2103,21,1,'PUTUMAYO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (2104,21,1,'SHUSHUFINDI',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (2105,21,1,'SUCUMBIOS',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (2106,21,1,'CASCALES',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (2107,21,1,'CUYABENO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (2201,22,1,'ORELLANA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (2202,22,1,'AGUARICO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (2203,22,1,'LA JOYA DE LOS SACHAS',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (2204,22,1,'LORETO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (2301,23,1,'SANTO DOMINGO',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (2302,23,1,'LA CONCORDIA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (2401,24,1,'SANTA ELENA',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (2402,24,1,'LA LIBERTAD',true,'sa',CURRENT_TIMESTAMP);
 insert into gen_canton (ide_gecant, ide_geprov,ide_gepais ,nombre_gecan, activo_gecan,usuario_ingre,hora_ingre) values (2403,24,1,'SALINAS',true,'sa',CURRENT_TIMESTAMP);


CREATE TABLE gen_tipo_direccion (
    "ide_getidi" int4,
    "nombre_getidi" varchar(100),
    "descripcion_getidi" text,
    "icono_getidi" varchar(80),
    "activo_getidi" bool,   
    "usuario_ingre" varchar(50),
    "hora_ingre" TIMESTAMP,
    "usuario_actua" varchar(50),
    "hora_actua" TIMESTAMP,
	CONSTRAINT pk_gen_tipo_direccion PRIMARY KEY(ide_getidi)
);


insert into gen_tipo_direccion values(1, 'Contacto','Utiliza esta opción para organizar los detalles de contacto de los empleados de una empresa, créalos según su departamento, como ventas, contabilidad, entre otros.',null,true, 'sa',CURRENT_TIMESTAMP,null,null);
insert into gen_tipo_direccion values(2, 'Dirección de factura','La dirección preferida para todas las facturas. Se selecciona de forma predeterminada cuando factura una orden que pertenece a esta empresa.',null,true, 'sa',CURRENT_TIMESTAMP,null,null);
insert into gen_tipo_direccion values(3, 'Dirección de entrega','La dirección preferida para todas las entregas. Se selecciona de forma predeterminada al entregar una orden que pertenece a esta empresa.',null,true, 'sa',CURRENT_TIMESTAMP,null,null);
insert into gen_tipo_direccion values(4, 'Otra Dirección','Otras direcciones para la empresa (por ejemplo, sucursales...)',null,true, 'sa',CURRENT_TIMESTAMP,null,null);


CREATE TABLE gen_titulo_persona (
    "ide_getitp" int4,
    "nombre_getitp" varchar(100),
    "abreviatura_getitp" text,
    "activo_getitp" bool,   
    "usuario_ingre" varchar(50),
    "hora_ingre" TIMESTAMP,
    "usuario_actua" varchar(50),
    "hora_actua" TIMESTAMP,
	CONSTRAINT pk_gen_titulo_persona PRIMARY KEY(ide_getitp)
);

insert into gen_titulo_persona values(1, 'Señor','Sr.',true, 'sa',CURRENT_TIMESTAMP,null,null);
insert into gen_titulo_persona values(2, 'Señora','Sra.',true, 'sa',CURRENT_TIMESTAMP,null,null);
insert into gen_titulo_persona values(3, 'Señorita','Srita.',true, 'sa',CURRENT_TIMESTAMP,null,null);
insert into gen_titulo_persona values(4, 'Doctor','Dr.',true, 'sa',CURRENT_TIMESTAMP,null,null);
insert into gen_titulo_persona values(5, 'Ingeniero','Ing.',true, 'sa',CURRENT_TIMESTAMP,null,null);
insert into gen_titulo_persona values(6, 'Licenciado','Lic.',true, 'sa',CURRENT_TIMESTAMP,null,null);
insert into gen_titulo_persona values(7, 'Magister','Mag.',true, 'sa',CURRENT_TIMESTAMP,null,null);
insert into gen_titulo_persona values(8, 'Químico','Quím.',true, 'sa',CURRENT_TIMESTAMP,null,null);

-- titulo persona 
ALTER TABLE gen_persona ADD COLUMN ide_getitp int4;     
ALTER TABLE gen_persona ADD COLUMN es_contacto_geper bool;    
ALTER TABLE gen_persona ADD COLUMN cargo_con_geper varchar(80); 
ALTER TABLE gen_persona ADD COLUMN notas_gecodi text; 
ALTER TABLE gen_persona ADD COLUMN requiere_actua_geper bool;    

ALTER TABLE public.gen_persona
	ADD CONSTRAINT gen_persona_ide_getitp_fkey
	FOREIGN KEY(ide_getitp)
	REFERENCES public.gen_titulo_persona(ide_getitp)
	ON DELETE RESTRICT 
	ON UPDATE RESTRICT;
update gen_persona set es_contacto_geper = true, requiere_actua_geper = true; --valores por defecto

INSERT INTO "public"."gen_tipo_persona" ("ide_getip", "detalle_getip", "activo_getip") VALUES
(1, 'PERSONA', 'TRUE');

INSERT INTO "public"."gen_tipo_persona" ("ide_getip", "detalle_getip", "activo_getip") VALUES
(2, 'EMPRESA', 'TRUE');

ALTER TABLE gen_persona ADD COLUMN ide_getip int4;  
 ALTER TABLE public.gen_persona
	ADD CONSTRAINT gen_persona_ide_getip_fkey
	FOREIGN KEY(ide_getip)
	REFERENCES public.gen_tipo_persona(ide_getip)
	ON DELETE RESTRICT 
	ON UPDATE RESTRICT;

update gen_persona set ide_getip = 1 ;  -- por defecto todos tipo persona
update gen_persona
set ide_getip = 2   -- tipo empresa
WHERE nom_geper ILIKE ANY(ARRAY[
      '%LTDA.',
      '%LTDA',
      '%S.A',
      '%S.A.',
      '%S.A.S.',
      '%S.A.S',
      '%C.A',
      '%C.A.'
  ]);
  
-----------------------------------------------
ALTER TABLE gen_persona ADD COLUMN ide_geprov int4;
-- Direccion de persona
CREATE TABLE "public"."gen_direccion_persona" (
    "ide_gedirp" int4,
    "ide_getidi" int4,
    "ide_gepais" int4,
    "ide_geprov" int4,
    "ide_gecant" int4,
    "ide_geper" int4,
    "nombre_dir_gedirp" varchar(100),
    "correo_gedirp" varchar(80),
    "direccion_gedirp" varchar(200),
    "referencia_gedirp" varchar(200),
    "longitud_gedirp" varchar(25),
    "latitud_gedirp" varchar(25),
    "telefono_gedirp" varchar(60),
    "movil_gedirp" varchar(10),
    "activo_gedirp" bool,
    "usuario_ingre" varchar(50),
    "hora_ingre" TIMESTAMP,
    "usuario_actua" varchar(50),
    "hora_actua" TIMESTAMP,
	CONSTRAINT "pk_gen_direccion_contacto" PRIMARY KEY("ide_gedirp"),
    CONSTRAINT "gen_direccion_contacto_ide_geper_fkey" FOREIGN KEY ("ide_geper") REFERENCES "public"."gen_persona"("ide_geper") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "gen_direccion_contacto_ide_gepais_fkey" FOREIGN KEY ("ide_gepais") REFERENCES "public"."gen_pais"("ide_gepais") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "gen_direccion_contacto_ide_geprov_fkey" FOREIGN KEY ("ide_geprov") REFERENCES "public"."gen_provincia"("ide_geprov") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "gen_direccion_contacto_ide_getidi_fkey" FOREIGN KEY ("ide_getidi") REFERENCES "public"."gen_tipo_direccion"("ide_getidi") ON DELETE RESTRICT ON UPDATE RESTRICT
);


-------------Log Actividades

-- Esta tabla almacenará los tipos de actividades posibles, como "cambio de datos", "envío de factura", "cotización", "programación de llamada", "creación", etc.

CREATE TABLE sis_actividad_tipo (
    ide_actti int4 PRIMARY KEY,
    nom_actti VARCHAR(100) NOT NULL, 
    icono_actti VARCHAR(50), 
    activo_gedirp bool,
    usuario_ingre varchar(50),
    hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actua varchar(50),
    hora_actua TIMESTAMP
);

insert into sis_actividad_tipo values(1, 'Registro creado',null,true, 'sa',CURRENT_TIMESTAMP,null,null);
insert into sis_actividad_tipo values(2, 'Registro modificado',null,true, 'sa',CURRENT_TIMESTAMP,null,null);
insert into sis_actividad_tipo values(3, 'Registro Eliminado',null,true, 'sa',CURRENT_TIMESTAMP,null,null);
insert into sis_actividad_tipo values(4, 'Otra Actividad',null,true, 'sa',CURRENT_TIMESTAMP,null,null);


-- Esta tabla almacenará los posibles estados de una actividad, como "pendiente", "hecho", "cancelado", etc.
CREATE TABLE sis_actividad_estado (
    ide_actes int4 PRIMARY KEY,
    nom_actes VARCHAR(50) NOT NULL,
    activo_actes bool,
    usuario_ingre varchar(50),
    hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actua varchar(50),
    hora_actua TIMESTAMP
);

insert into sis_actividad_estado values(1, 'Pendiente',true, 'sa',CURRENT_TIMESTAMP,null,null);
insert into sis_actividad_estado values(2, 'Realizado',true, 'sa',CURRENT_TIMESTAMP,null,null);
insert into sis_actividad_estado values(3, 'En proceso',true, 'sa',CURRENT_TIMESTAMP,null,null);
insert into sis_actividad_estado values(4, 'Cancelado',true, 'sa',CURRENT_TIMESTAMP,null,null);


-- Esta tabla almacenará las actividades relacionadas con las personas. Cada actividad estará vinculada a un tipo de actividad, un estado, y a una persona específica.
--- ejemplo historial_acti
-- [
--     {
--         "campo_modificado": "estado_actividad",
--         "label_campo": "Estado Actividad",
--         "valor_anterior": "pendiente",
--         "valor_nuevo": "completado",
--         "fecha_cambio": "2024-08-16T14:30:00Z",
--         "usuario_actua": "sa"
--     },
--     {
--         "campo_modificado": "descripcion",
--         "label_campo": "Descripción",
--         "valor_anterior": "Reunión inicial con cliente",
--         "valor_nuevo": "Reunión finalizada",
--         "fecha_cambio": "2024-08-16T15:00:00Z",
--         "usuario_actua": "sa"
--     }
-- ]


CREATE TABLE sis_actividad (
    ide_acti SERIAL PRIMARY KEY,
    tabla_acti VARCHAR(50) NOT NULL,
    valor_pk_acti INT8 NOT NULL,
    nom_acti VARCHAR(80) NOT NULL,
    ide_usua INT REFERENCES sis_usuario(ide_usua) ON DELETE SET NULL, -- Usuario crea actividad
    sis_ide_usua INT REFERENCES sis_usuario(ide_usua) ON DELETE SET NULL, -- Usuario asignado a la actividad
    ide_actti INT REFERENCES sis_actividad_tipo(ide_actti) ON DELETE SET NULL,
    ide_actes INT REFERENCES sis_actividad_estado(ide_actes) ON DELETE SET NULL,
    descripcion_acti TEXT, -- Descripción de la actividad
    fecha_actividad_acti TIMESTAMP NOT NULL, -- Fecha y hora de la actividad programada
    fecha_creacion_acti TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Fecha de creación de la actividad
    fecha_completada_acti TIMESTAMP, -- Fecha en que la actividad fue marcada como hecha
    historial_acti JSONB DEFAULT '[]'::jsonb, -- Historial de cambios campos en formato JSON
    activo_acti bool,
    usuario_ingre varchar(50),
    hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actua varchar(50),
    hora_actua TIMESTAMP
);
CREATE INDEX idx_actividad_tabla ON sis_actividad(tabla_acti,valor_pk_acti);
CREATE INDEX idx_actividad_tabla_fecha ON sis_actividad(tabla_acti,fecha_actividad_acti);

CREATE TABLE sis_actividad_comentario (
    ide_actco SERIAL PRIMARY KEY,
    ide_acti INT REFERENCES sis_actividad(ide_acti) ON DELETE CASCADE,
    ide_usua INT REFERENCES sis_usuario(ide_usua) ON DELETE SET NULL, -- Usuario crea comentario
    comentario_actco TEXT NOT NULL, -- El comentario realizado
    fecha_comentario_actco TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Fecha y hora en que se hizo el comentario
    activo_actco bool,
    usuario_ingre varchar(50),
    hora_ingre TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actua varchar(50),
    hora_actua TIMESTAMP
);

-- gen_persona
ALTER TABLE gen_persona ADD COLUMN ide_geprov int4;
ALTER TABLE gen_persona ADD COLUMN ide_gecant int4;

ALTER TABLE public.gen_persona
	ADD CONSTRAINT gen_persona_ide_geprov_fkey
	FOREIGN KEY(ide_geprov)
	REFERENCES public.gen_provincia(ide_geprov)
	ON DELETE RESTRICT 
	ON UPDATE RESTRICT;

ALTER TABLE public.gen_persona
	ADD CONSTRAINT gen_persona_ide_gecant_fkey
	FOREIGN KEY(ide_gecant)
	REFERENCES public.gen_canton(ide_gecant)
	ON DELETE RESTRICT 
	ON UPDATE RESTRICT;

-- 07/09/2024
ALTER TABLE gen_direccion_persona ADD COLUMN defecto_gedirp boolean default false;
ALTER TABLE gen_direccion_persona ADD COLUMN ide_gegen int;


--  insertar direcciones exiistentes de gen_persona


WITH max_id AS (
    SELECT COALESCE(MAX(ide_gedirp), 0) AS max_ide FROM gen_direccion_persona
)
INSERT INTO gen_direccion_persona (
    ide_gedirp,
    ide_getidi,
    ide_gepais,
    ide_geprov,
    ide_gecant,
    ide_geper,
    nombre_dir_gedirp,
    direccion_gedirp,
    telefono_gedirp,
    movil_gedirp,
    activo_gedirp,
    defecto_gedirp,
    usuario_ingre,
    hora_ingre
)
SELECT
    max_id.max_ide + ROW_NUMBER() OVER () AS ide_gedirp, -- Incrementa dinámicamente
    1 AS ide_getidi,            -- Tipo de dirección, valor nulo
    1 AS ide_gepais,               -- País por defecto
    gp.ide_geprov,                 -- Provincia
    gp.ide_gecant,                 -- Cantón
    gp.ide_geper,
    'Direccion Principal' as   nombre_dir_gedirp,                -- Persona
    gp.direccion_geper,    
    gp.telefono_geper,
    LEFT(gp.movil_geper, 10) AS movil_gedirp, -- Móvil truncado a 10 dígitos     -- Dirección
    TRUE AS activo_gedirp,  
    TRUE AS defecto_gedirp,         -- Activo
    'sa' AS usuario_ingre,     -- Usuario de ingreso
    NOW() AS hora_ingre            -- Fecha y hora de ingreso
FROM
    gen_persona gp,
    max_id
WHERE
    gp.direccion_geper IS NOT NULL;



-- inserta contactos 

WITH max_id AS (
    SELECT COALESCE(MAX(ide_gedirp), 0) AS max_ide FROM gen_direccion_persona
)
INSERT INTO gen_direccion_persona (
    ide_gedirp,
    ide_geper,
    nombre_dir_gedirp,
    telefono_gedirp,
    movil_gedirp,
    correo_gedirp,
    activo_gedirp,
    usuario_ingre,
    hora_ingre
)
SELECT
    max_id.max_ide + ROW_NUMBER() OVER () AS ide_gedirp, -- Incrementa dinámicamente         -- Tipo de dirección, valor nulo               -- Cantón
    gp.ide_geper,
    gp.contacto_geper as   nombre_dir_gedirp,                -- Persona  
    gp.telefono_geper,
    LEFT(gp.movil_geper, 10) AS movil_gedirp, 
    gp.correo_geper, -- Móvil truncado a 10 dígitos     -- Dirección
    TRUE AS activo_gedirp,          -- Activo
    'sa' AS usuario_ingre,     -- Usuario de ingreso
    NOW() AS hora_ingre            -- Fecha y hora de ingreso
FROM
    gen_persona gp,
    max_id
WHERE
    gp.contacto_geper is not null



