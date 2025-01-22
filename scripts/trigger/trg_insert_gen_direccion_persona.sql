CREATE OR REPLACE FUNCTION trg_insert_gen_direccion_persona()
RETURNS TRIGGER AS $$
DECLARE
    max_id INT;
BEGIN
    -- Obtener el máximo valor actual de ide_gedirp
    SELECT COALESCE(MAX(ide_gedirp), 0) INTO max_id FROM gen_direccion_persona;
    -- Insertar en la tabla gen_direccion_persona
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
    VALUES (
        max_id + 1,                      -- Incrementa dinámicamente el ID
        1,                               -- Tipo de dirección por defecto
        1,                               -- País por defecto
        NEW.ide_geprov,                  -- Provincia del nuevo registro
        NEW.ide_gecant,                  -- Cantón del nuevo registro
        NEW.ide_geper,                   -- Persona asociada
        'Contacto',                      -- Nombre fijo
        NEW.direccion_geper,             -- Dirección del nuevo registro
        NEW.telefono_geper,              -- Teléfono
        LEFT(NEW.movil_geper, 10),       -- Móvil truncado a 10 dígitos
        TRUE,                            -- Dirección activa
        TRUE,                            -- Dirección por defecto
        NEW.usuario_ingre,                            -- Usuario de ingreso
        NOW()                            -- Fecha y hora de ingreso
    );

    RETURN NEW; -- Permite que la inserción en gen_persona continúe
END;
$$ LANGUAGE plpgsql;
