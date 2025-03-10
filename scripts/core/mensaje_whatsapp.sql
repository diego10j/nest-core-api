CREATE OR REPLACE FUNCTION mensaje_whatsapp(json_data JSONB)
RETURNS VARCHAR(30) AS $$
DECLARE
    v_wa_id_whcha VARCHAR(30);
    v_name_whcha VARCHAR(80);
    v_phone_number_id VARCHAR(20);
    v_phone_number VARCHAR(20);
    v_ide_whcha INT8;
    v_id_whcha VARCHAR(80);

    v_id_whmem VARCHAR(80);
    v_wa_id_whmem VARCHAR(80);
    v_wa_id_context_whmem VARCHAR(80);
    v_body_whmem TEXT;
    v_fecha_whmem TIMESTAMP;
    v_content_type_whmem VARCHAR(80);
    v_direction_whmem CHAR(1);
    v_attachment_id_whmem VARCHAR(100);
    v_attachment_type_whmem VARCHAR(150);
    v_attachment_name_whmem VARCHAR(200);
    v_caption_whmem TEXT;
    v_timestamp_whmem VARCHAR(20);
BEGIN
    -- Extraer datos del contacto  
        
    SELECT 
        trim(both '"' from jsonb_path_query_first(json_data, '$.entry[0].changes[0].value.contacts[0].wa_id')::TEXT),
        trim(both '"' from jsonb_path_query_first(json_data, '$.entry[0].changes[0].value.contacts[0].profile.name')::TEXT),
        trim(both '"' from jsonb_path_query_first(json_data, '$.entry[0].changes[0].value.metadata.phone_number_id')::TEXT),
        trim(both '"' from jsonb_path_query_first(json_data, '$.entry[0].changes[0].value.metadata.display_phone_number')::TEXT),
        trim(both '"' from jsonb_path_query_first(json_data, '$.entry[0].changes[0].value.messages[0].id')::TEXT)
    INTO v_wa_id_whcha, v_name_whcha, v_phone_number_id, v_phone_number, v_id_whcha;

    -- Insertar o actualizar el contacto en wha_chat
    INSERT INTO wha_chat (
        wa_id_whcha, nombre_whcha, name_whcha, phone_number_id_whcha, 
        phone_number_whcha, fecha_msg_whcha, id_whcha,leido_whcha
    ) VALUES (
        v_wa_id_whcha, v_phone_number_id, v_name_whcha, v_phone_number_id, 
        v_phone_number, NOW(), v_id_whcha, false
    )
    ON CONFLICT (wa_id_whcha) DO UPDATE 
    SET fecha_msg_whcha = EXCLUDED.fecha_msg_whcha,
        id_whcha = EXCLUDED.id_whcha,
        leido_whcha =  false,
        no_leidos_whcha = COALESCE(wha_chat.no_leidos_whcha, 0) + 1
    RETURNING ide_whcha INTO v_ide_whcha;  -- Obtener el ID del chat

    -- Procesar todos los mensajes
    FOR v_id_whmem, v_wa_id_whmem, v_wa_id_context_whmem, v_body_whmem, 
        v_fecha_whmem, v_timestamp_whmem,v_content_type_whmem, v_direction_whmem,
        v_attachment_id_whmem, v_attachment_type_whmem, v_caption_whmem, v_attachment_name_whmem
    IN 
        SELECT 
            trim(both '"' from msg ->> 'id'),
            trim(both '"' from msg ->> 'from'),
            trim(both '"' from msg #>> '{context,id}'), -- Puede ser NULL si no hay contexto
            trim(both '"' from msg #>> '{text,body}'),  -- Solo para texto, NULL si es imagen
            to_timestamp((trim(both '"' from msg ->> 'timestamp'))::BIGINT) AT TIME ZONE 'America/Guayaquil',
            trim(both '"' from msg ->> 'timestamp'),
            trim(both '"' from msg ->> 'type'),
            CASE WHEN trim(both '"' from msg ->> 'from') = v_wa_id_whcha THEN '0' ELSE '1' END,
            -- Extraer ID del archivo adjunto si es imagen o audio
            CASE 
                WHEN msg ->> 'type' = 'image' THEN trim(both '"' from msg #>> '{image,id}')
                WHEN msg ->> 'type' = 'sticker' THEN trim(both '"' from msg #>> '{sticker,id}')
                WHEN msg ->> 'type' = 'audio' THEN trim(both '"' from msg #>> '{audio,id}')
                WHEN msg ->> 'type' = 'video' THEN trim(both '"' from msg #>> '{video,id}')
                WHEN msg ->> 'type' = 'document' THEN trim(both '"' from msg #>> '{document,id}')
                ELSE NULL 
            END,
            -- Extraer MIME type si es imagen, audio o video
            CASE 
                WHEN msg ->> 'type' = 'image' THEN trim(both '"' from msg #>> '{image,mime_type}')
                WHEN msg ->> 'type' = 'sticker' THEN trim(both '"' from msg #>> '{sticker,mime_type}')
                WHEN msg ->> 'type' = 'audio' THEN trim(both '"' from msg #>> '{audio,mime_type}')
                WHEN msg ->> 'type' = 'video' THEN trim(both '"' from msg #>> '{video,mime_type}')
                 WHEN msg ->> 'type' = 'document' THEN trim(both '"' from msg #>> '{document,mime_type}')
                ELSE NULL 
            END,
             CASE 
                WHEN msg ->> 'type' = 'image' THEN trim(both '"' from msg #>> '{image,caption}')
                WHEN msg ->> 'type' = 'sticker' THEN trim(both '"' from msg #>> '{sticker,caption}')
                WHEN msg ->> 'type' = 'audio' THEN trim(both '"' from msg #>> '{audio,caption}')
                WHEN msg ->> 'type' = 'video' THEN trim(both '"' from msg #>> '{video,caption}')
                 WHEN msg ->> 'type' = 'document' THEN trim(both '"' from msg #>> '{document,caption}')
                ELSE NULL 
            END,
              CASE 
                 WHEN msg ->> 'type' = 'document' THEN trim(both '"' from msg #>> '{document,filename}')
                ELSE NULL 
            END
        FROM jsonb_array_elements(json_data #> '{entry,0,changes,0,value,messages}') AS msg
    LOOP
        -- Insertar cada mensaje en wha_mensaje
        INSERT INTO wha_mensaje (
            ide_whcha, phone_number_id_whmem, phone_number_whmem, 
            id_whmem, wa_id_whmem, wa_id_context_whmem, body_whmem, 
            fecha_whmem, timestamp_whmem, content_type_whmem, direction_whmem, 
            attachment_id_whmem, attachment_type_whmem, caption_whmem,leido_whmem, attachment_name_whmem
        ) VALUES (
            v_ide_whcha, v_phone_number_id, v_phone_number, 
            v_id_whmem, v_wa_id_whmem, v_wa_id_context_whmem, v_body_whmem, 
            v_fecha_whmem, v_timestamp_whmem,v_content_type_whmem, v_direction_whmem, 
            v_attachment_id_whmem, v_attachment_type_whmem, v_caption_whmem,false,v_attachment_name_whmem
        );
    END LOOP;

    -- Retornar el valor de v_wa_id_whcha
    RETURN v_wa_id_whcha;
END;
$$ LANGUAGE plpgsql;




---Test 
/*
SELECT mensaje_whatsapp(
    '{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "191953740675035",
      "changes": [
        {
          "value": {
            "messaging_product": "whatsapp",
            "metadata": {
              "display_phone_number": "593962931842",
              "phone_number_id": "158416817366298"
            },
            "contacts": [
              {
                "profile": {
                  "name": "DI€GO"
                },
                "wa_id": "593983113543"
              }
            ],
            "messages": [
              {
                "context": {
                  "from": "593983113543",
                  "id": "wamid.HBgMNTkzOTgzMTEzNTQzFQIAEhgUM0E1RDY4REZCNkZFOUEwMUU2RDMA"
                },
                "from": "593983113543",
                "id": "wamid.HBgMNTkzOTgzMTEzNTQzFQIAEhgUM0E5NzRBREUzODFCQjYwQjkwRDUA",
                "timestamp": "1738675299",
                "text": {
                  "body": "Primer mensaje de hoy"
                },
                "type": "text"
              }
            ]
          },
          "field": "messages"
        }
      ]
    }
  ]
}'::jsonb
)AS msg;
*/