-- Cliente seguidor en redes sociales (Instagram/TikTok/Facebook, campo único genérico)
-- Se activa una sola vez desde "Editar Cliente" y no se puede revertir (ver
-- ClientesSaveService.marcarSeguidorRedes: el UPDATE solo permite false -> true).
ALTER TABLE gen_persona ADD COLUMN es_seguidor_geper bool DEFAULT false;
ALTER TABLE gen_persona ADD COLUMN fecha_seguidor_geper timestamp;
ALTER TABLE gen_persona ADD COLUMN usuario_seguidor_geper varchar(80);

update gen_persona set es_seguidor_geper = false where es_seguidor_geper is null; --valores por defecto
