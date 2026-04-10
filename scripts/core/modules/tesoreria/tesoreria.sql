ALTER TABLE "public"."tes_banco"
ADD COLUMN "foto_teban" varchar(200),
ADD COLUMN "color_teban" varchar(50);

ALTER TABLE tes_banco ADD COLUMN usuario_ingre varchar(50); 
ALTER TABLE tes_banco ADD COLUMN hora_ingre TIMESTAMP default now();
ALTER TABLE tes_banco ADD COLUMN usuario_actua varchar(50); 
ALTER TABLE tes_banco ADD COLUMN hora_actua TIMESTAMP;


ALTER TABLE "public"."tes_cuenta_banco"
ADD COLUMN "hace_pagos_tecba" boolean DEFAULT false,
ADD COLUMN "hace_cheque_tecba" boolean DEFAULT false,
ADD COLUMN "activo_tecba" bool DEFAULT 'true';

ALTER TABLE tes_cuenta_banco ADD COLUMN usuario_ingre varchar(50); 
ALTER TABLE tes_cuenta_banco ADD COLUMN hora_ingre TIMESTAMP default now();
ALTER TABLE tes_cuenta_banco ADD COLUMN usuario_actua varchar(50); 
ALTER TABLE tes_cuenta_banco ADD COLUMN hora_actua TIMESTAMP;