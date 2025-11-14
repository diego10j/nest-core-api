-- Función mejorada con validación de fechas
CREATE OR REPLACE FUNCTION fn_tg_gen_persona_vendedor_hist()
RETURNS TRIGGER 
LANGUAGE plpgsql
AS $$
DECLARE
    v_motivo TEXT;
    v_usuario_audit VARCHAR(50);
    v_fecha_audit TIMESTAMP;
BEGIN
    -- Solo procesar si es cliente HIJO y el vendedor realmente cambió
    IF NEW.es_cliente_geper = true 
       AND NEW.nivel_geper = 'HIJO'
       AND NEW.ide_vgven IS DISTINCT FROM OLD.ide_vgven THEN
        
        -- Determinar el motivo basado en el cambio
        IF OLD.ide_vgven IS NULL THEN
            v_motivo := 'ASIGNACIÓN DE VENDEDOR INICIAL';
        ELSIF NEW.ide_vgven IS NULL THEN
            v_motivo := 'REMOCIÓN DE VENDEDOR';
        ELSE
            v_motivo := 'CAMBIO DE VENDEDOR';
        END IF;
        
        -- Validar fecha_actua: si es NULL o tiene más de 5 días de antigüedad
        IF NEW.fecha_actua IS NULL OR 
           (CURRENT_DATE - NEW.fecha_actua) > 5 OR
           NEW.hora_actua IS NULL THEN
            -- Usar fecha/hora del sistema y usuario "sa"
            v_usuario_audit := 'sa';
            v_fecha_audit := CURRENT_TIMESTAMP;
        ELSE
            -- Usar los valores proporcionados
            v_usuario_audit := COALESCE(NEW.usuario_actua, 'sa');
            v_fecha_audit := (NEW.fecha_actua + NEW.hora_actua)::TIMESTAMP;
            
            -- Validación adicional: si la fecha combinada es mayor a la fecha actual
            -- (futuro) o muy antigua (más de 5 días), usar fecha del sistema
            IF v_fecha_audit > CURRENT_TIMESTAMP OR 
               (CURRENT_TIMESTAMP - v_fecha_audit) > INTERVAL '5 days' THEN
                v_usuario_audit := 'sa';
                v_fecha_audit := CURRENT_TIMESTAMP;
            END IF;
        END IF;
        
        INSERT INTO gen_cliente_vendedor_his (
            ide_geper,
            ide_vgven_antes,
            ide_vgven,
            referencia_gepvh,
            motivo_gepvh,
            usuario_ingre,
            fecha_ingre
        ) VALUES (
            NEW.ide_geper,
            OLD.ide_vgven,
            NEW.ide_vgven,
            'ACTUALIZACIÓN_' || EXTRACT(EPOCH FROM CURRENT_TIMESTAMP), -- referencia única
            v_motivo,
            v_usuario_audit,
            v_fecha_audit
        );
    END IF;
    
    RETURN NEW;
END;
$$;

-- Recrear el trigger
DROP TRIGGER IF EXISTS tg_gen_persona_vendedor_hist ON gen_persona;

CREATE TRIGGER tg_gen_persona_vendedor_hist
    AFTER UPDATE ON gen_persona
    FOR EACH ROW
    WHEN (
        NEW.es_cliente_geper = true 
        AND NEW.nivel_geper = 'HIJO' 
        AND NEW.ide_vgven IS DISTINCT FROM OLD.ide_vgven
    )
    EXECUTE FUNCTION fn_tg_gen_persona_vendedor_hist();