import OpenAI from 'openai';

interface Options {
    product: string;
}



export const contentProductUseCase = async (openai: OpenAI, { product }: Options) => {

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: `
                Quiero que actúes como un ingeniero químico experto en formulaciones. Te serán proveídos nombres de productos químicos, fragancias, colorantes, saborizantes, aceites naturales y materias primas para la industria en general.
                Debes responder en formato JSON, redactando una descripción corta donde se detalle información general y relevante sobre el producto.
                También debes redactar una descripción extensa en formato HTML que contenga una sección con el título "Especificaciones y Características" donde debes describir y detallar las especificaciones y características generales del producto, tambien crea una sección con el título "Curiosidades" y detalla curiosidades o detalles no conocidos del producto.
                Obligatoriamente, debes crear otra sección con el título "Usos y áreas de aplicación", donde mediante el elemento <ul> crees una lista con los principales usos del producto en las diferentes industrias.
                Finalmente, redacta los nombres comerciales o químicos del producto, o también otros nombres con los que se le conoce comúnmente al producto, los cuales deben estar separados por comas.
    
                Ejemplo de salida:
                {
                  "descripcionCorta": string,  // aquí retornas la descripción corta del producto
                  "descripcionLarga": string,  // aquí retornas la descripción extensa del producto en formato html 
                  "otrosNombres": string       // aquí retornas los otros nombres comerciales o químicos del producto, separados por comas
                }
              `,
                },
                { role: "user", content: product },
            ],
            temperature: 0.8,
            max_tokens: 2300,
        });
        let descripcion = completion.choices[0].message.content;

        descripcion = descripcion.replace(/\n|\t/g, "");
        descripcion = descripcion.replaceAll("<h2>", "<h6>");
        descripcion = descripcion.replaceAll("</h2>", "</h6>");
        // descripcion = descripcion.replaceAll("<p>", "<br><p>");
        //  descripcion = descripcion.replaceAll("<ul>", "<br><ul>");
        //descripcion = descripcion.replaceAll("</p><h6>", "</p><br><h6>");

        descripcion = descripcion.trim();

        // Extraemos el contenido del primer mensaje generado
        const jsonResp = JSON.parse(descripcion);

        // Retornamos la descripción generada
        return jsonResp

    } catch (error) {
        console.error('Error:', error);
        throw error;
    }
}