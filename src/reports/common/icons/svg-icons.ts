// SVG icons en formato compatible con pdfmake
export const SVG_Icons = {
  CHECK: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <path d="m9.55 17.308l-4.97-4.97l.714-.713l4.256 4.256l9.156-9.156l.713.714z"/>
            </svg>`,
  PENDING: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" 
                stroke="black" stroke-width="2" fill="none"/>
              <path d="M12 6v6l4 2" 
                stroke="black" stroke-width="2" fill="none" 
                stroke-linecap="round" stroke-linejoin="round"/>
            </svg>`,

  AUTOMATIC: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" 
                  stroke="black" stroke-width="2" fill="none"/>
                <path d="M8 12h8M12 8v8" 
                  stroke="black" stroke-width="2" fill="none" 
                  stroke-linecap="round"/>
              </svg>`,

  MANUAL: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
              <rect x="4" y="4" width="16" height="16" rx="2" 
                stroke="black" stroke-width="2" fill="none"/>
              <path d="M8 8h8v8H8z" 
                stroke="black" stroke-width="2" fill="none"/>
            </svg>`,

  VERIFIED: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
               <circle cx="12" cy="12" r="10" 
                 stroke="black" stroke-width="2" fill="none"/>
               <polyline points="9 12 12 15 17 10" 
                 stroke="black" stroke-width="2" fill="none" 
                 stroke-linecap="round" stroke-linejoin="round"/>
             </svg>`,
};

// Si quieres seguir usando íconos de Iconify/Lucide/Material, puedes:

// Buscar el <svg>

// Reemplazar todas las apariciones de stroke="currentColor" → stroke="black" (o el color que quieras).

// Asegurarte de que tengan viewBox (ya lo traen casi siempre).

// Quitar width="..." y height="..." si prefieres controlarlos desde pdfmake.
