import * as fs from 'fs';
import * as path from 'path';

import { FILE_STORAGE_CONSTANTS } from 'src/core/modules/sistema/files/file-temp.service';
import { MessageAck, MessageMedia } from 'whatsapp-web.js';

import { MediaFile } from '../../api/interface/whatsapp';
import { UploadMediaDto } from '../../dto/upload-media.dto';

// types/mime-types.const.ts
export const MIME_TYPES = {
  IMAGES: {
    JPEG: 'image/jpeg',
    PNG: 'image/png',
    WEBP: 'image/webp',
    GIF: 'image/gif',
    SVG: 'image/svg+xml',
    BMP: 'image/bmp',
    TIFF: 'image/tiff',
  },
  VIDEOS: {
    MP4: 'video/mp4',
    QUICKTIME: 'video/quicktime',
    AVI: 'video/x-msvideo',
    WEBM: 'video/webm',
    OGG: 'video/ogg',
    MPEG: 'video/mpeg',
  },
  AUDIO: {
    MPEG: 'audio/mpeg',
    OGG: 'audio/ogg',
    WAV: 'audio/wav',
    AAC: 'audio/aac',
  },
  DOCUMENTS: {
    PDF: 'application/pdf',
    WORD: 'application/msword',
    WORDX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    EXCEL: 'application/vnd.ms-excel',
    EXCELX: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    POWERPOINT: 'application/vnd.ms-powerpoint',
    POWERPOINTX: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    TEXT: 'text/plain',
    CSV: 'text/csv',
    XML: 'application/xml',
    JSON: 'application/json',
    RTF: 'application/rtf',
    ODT: 'application/vnd.oasis.opendocument.text',
  },
  COMPRESSED: {
    ZIP: 'application/zip',
    RAR: 'application/vnd.rar',
  },
  STICKERS: {
    WEBP: 'image/webp',
  },
} as const;

export const EXTENSION_TO_MIME: Record<string, string> = {
  // Imágenes
  jpg: MIME_TYPES.IMAGES.JPEG,
  jpeg: MIME_TYPES.IMAGES.JPEG,
  png: MIME_TYPES.IMAGES.PNG,
  gif: MIME_TYPES.IMAGES.GIF,
  svg: MIME_TYPES.IMAGES.SVG,
  bmp: MIME_TYPES.IMAGES.BMP,
  tiff: MIME_TYPES.IMAGES.TIFF,

  // Videos
  mp4: MIME_TYPES.VIDEOS.MP4,
  mov: MIME_TYPES.VIDEOS.QUICKTIME,
  avi: MIME_TYPES.VIDEOS.AVI,
  webm: MIME_TYPES.VIDEOS.WEBM,

  // Audio
  mp3: MIME_TYPES.AUDIO.MPEG,
  ogg: MIME_TYPES.AUDIO.OGG,
  wav: MIME_TYPES.AUDIO.WAV,
  aac: MIME_TYPES.AUDIO.AAC,

  // Documentos
  pdf: MIME_TYPES.DOCUMENTS.PDF,
  doc: MIME_TYPES.DOCUMENTS.WORD,
  docx: MIME_TYPES.DOCUMENTS.WORDX,
  xls: MIME_TYPES.DOCUMENTS.EXCEL,
  xlsx: MIME_TYPES.DOCUMENTS.EXCELX,
  ppt: MIME_TYPES.DOCUMENTS.POWERPOINT,
  pptx: MIME_TYPES.DOCUMENTS.POWERPOINTX,
  txt: MIME_TYPES.DOCUMENTS.TEXT,
  csv: MIME_TYPES.DOCUMENTS.CSV,
  xml: MIME_TYPES.DOCUMENTS.XML,
  json: MIME_TYPES.DOCUMENTS.JSON,
  rtf: MIME_TYPES.DOCUMENTS.RTF,
  odt: MIME_TYPES.DOCUMENTS.ODT,

  // Comprimidos
  zip: MIME_TYPES.COMPRESSED.ZIP,
  rar: MIME_TYPES.COMPRESSED.RAR,

  // Stickers
  webp: MIME_TYPES.STICKERS.WEBP,
};

export const ALLOWED_TYPES: Record<string, string[]> = {
  image: Object.values(MIME_TYPES.IMAGES),
  video: Object.values(MIME_TYPES.VIDEOS),
  audio: Object.values(MIME_TYPES.AUDIO),
  document: [...Object.values(MIME_TYPES.DOCUMENTS), ...Object.values(MIME_TYPES.COMPRESSED)],
  sticker: Object.values(MIME_TYPES.STICKERS),
};

export function getStatusMessage(status: MessageAck): string {
  switch (status) {
    case MessageAck.ACK_ERROR:
      return 'error';
    case MessageAck.ACK_PENDING:
      return 'pending';
    case MessageAck.ACK_SERVER:
      return 'server';
    case MessageAck.ACK_DEVICE:
      return 'device';
    case MessageAck.ACK_READ:
      return 'read';
    case MessageAck.ACK_PLAYED:
      return 'played';
    default:
      return 'unknown';
  }
}

export function getMediaOptions(mediaMessage: UploadMediaDto): any {
  const options: any = {};

  if (mediaMessage.caption) {
    options.caption = mediaMessage.caption;
  }

  switch (mediaMessage.type) {
    case 'sticker':
      options.sendMediaAsSticker = true;
      break;
    case 'document':
      options.sendMediaAsDocument = true;
      break;
    case 'image':
      options.sendMediaAsPhoto = true;
      break;
    case 'video':
      options.sendMediaAsVideo = true;
      break;
    case 'audio':
      options.sendMediaAsAudio = true;
      break;
  }

  return options;
}

// --- Utility Methods --- //
export function formatPhoneNumber(
  phoneNumber: string,
  defaultCountryCode: string = '593', // Código predeterminado (Ecuador)
): string {
  try {
    // Elimina todo excepto dígitos y "+"
    const cleaned = phoneNumber.replace(/[^\d+]/g, '');

    // Validación básica de longitud
    if (cleaned.length < 7 || cleaned.length > 15) {
      throw new Error('Longitud de número inválida (debe tener entre 7 y 15 dígitos)');
    }

    // Si empieza con + (número internacional)
    if (cleaned.startsWith('+')) {
      const countryCode = cleaned.substring(1);
      if (!/^\d+$/.test(countryCode)) {
        throw new Error('Formato internacional inválido');
      }
      return `${countryCode}@c.us`;
    }
    // Si empieza con 00 (formato internacional alternativo)
    else if (cleaned.startsWith('00')) {
      const countryCode = cleaned.substring(2);
      if (!/^\d+$/.test(countryCode)) {
        throw new Error('Formato internacional inválido');
      }
      return `${countryCode}@c.us`;
    }
    // Si es un número con código de país incluido (sin + o 00)
    else if (/^[1-9]\d{4,14}$/.test(cleaned)) {
      return `${cleaned}@c.us`;
    }
    // Si es un número local (sin código de país), aplicamos el código predeterminado
    else if (/^\d{7,10}$/.test(cleaned)) {
      // Elimina el 0 inicial si es un número de 10 dígitos (ej: 0987654321 → 987654321)
      const localNumber = cleaned.length === 10 ? cleaned.substring(1) : cleaned;
      return `${defaultCountryCode}${localNumber}@c.us`;
    }

    throw new Error('Formato de número no soportado');
  } catch (error) {
    console.error('Error formatting phone number:', error);
    throw new Error(`Invalid phone number format: ${phoneNumber}`);
  }
}

export function validateCoordinates(latitude: number, longitude: number): void {
  if (isNaN(latitude) || isNaN(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new Error('Invalid coordinates');
  }
}

export function validateMediaType(mimeType: string, mediaType: string): void {
  if (!ALLOWED_TYPES[mediaType]?.includes(mimeType)) {
    throw new Error(`Invalid mime type ${mimeType} for media type ${mediaType}`);
  }
}

export function createMediaInstance(mediaMessage: UploadMediaDto, file: Express.Multer.File): MessageMedia {
  // 1. Validación del objeto file
  if (!file) {
    throw new Error('No se proporcionó ningún archivo');
  }

  // 2. Obtener el contenido del archivo
  let fileContent: Buffer;
  try {
    if (file.buffer) {
      // Caso 1: Archivo en memoria (configuración con memoryStorage)
      fileContent = file.buffer;
    } else if (file.path && fs.existsSync(file.path)) {
      // Caso 2: Archivo en disco (configuración con diskStorage)
      fileContent = fs.readFileSync(file.path);
    } else {
      throw new Error('El objeto de archivo no contiene un buffer válido ni una ruta accesible');
    }

    // 3. Validar el contenido del archivo
    if (!fileContent || fileContent.length === 0) {
      throw new Error('El archivo está vacío');
    }

    // 4. Determinar el tipo MIME
    const mimeType = file.mimetype || detectMimeType(file.originalname) || getDefaultMimeType(mediaMessage.type);

    // 5. Validar el tipo MIME
    if (!isValidMimeType(mimeType, mediaMessage.type)) {
      throw new Error(`Tipo MIME '${mimeType}' no es válido para el tipo de medio '${mediaMessage.type}'`);
    }

    // 6. Generar nombre de archivo si no se proporcionó
    const fileName = mediaMessage.fileName || generateFileName(mediaMessage.type, mimeType, file.originalname);

    return new MessageMedia(mimeType, fileContent.toString('base64'), fileName);
  } catch (error) {
    // Limpieza: Eliminar archivo temporal si existe
    if (file.path && fs.existsSync(file.path)) {
      try {
        fs.unlinkSync(file.path);
      } catch (cleanupError) {
        console.error('Error al limpiar archivo temporal:', cleanupError);
      }
    }
    throw new Error(`Error al crear instancia de media: ${error.message}`);
  }
}

// Crea un File existente en la carpeta de temporales
export async function createFileInstanceFromPath(fileName: string): Promise<Express.Multer.File> {
  const directoryPath = FILE_STORAGE_CONSTANTS.TEMP_DIR;
  const fullPath = path.join(directoryPath, fileName);

  // console.log('Nombre de archivo:', fileName);
  // console.log('Ruta completa:', fullPath);

  // 1. Validaciones de entrada
  if (!directoryPath || typeof directoryPath !== 'string') {
    throw new Error('No se proporcionó un directorio válido');
  }
  if (!fileName || typeof fileName !== 'string') {
    throw new Error('No se proporcionó un nombre de archivo válido');
  }

  try {
    // 2. Normalizar rutas para seguridad
    const normalizedPath = path.normalize(fullPath);

    // 3. Verificar existencia del archivo
    if (!fs.existsSync(normalizedPath)) {
      throw new Error(`El archivo no existe en la ruta: ${normalizedPath}`);
    }

    // 4. Obtener estadísticas y contenido del archivo
    const stats = fs.statSync(normalizedPath);
    if (!stats.isFile()) {
      throw new Error('La ruta proporcionada no es un archivo válido');
    }

    const fileContent = fs.readFileSync(normalizedPath);
    if (fileContent.length === 0) {
      throw new Error('El archivo está vacío');
    }

    // 5. Determinar el tipo MIME
    const mimeType = detectMimeType(fileName) || getDefaultMimeTypeFromExtension(fileName);

    // 6. Crear objeto Multer.File
    const multerFile: Express.Multer.File = {
      fieldname: 'file',
      originalname: fileName,
      encoding: '7bit',
      mimetype: mimeType,
      size: stats.size,
      destination: directoryPath,
      filename: path.basename(fileName),
      path: normalizedPath,
      buffer: fileContent,
      stream: fs.createReadStream(normalizedPath),
    };

    return multerFile;
  } catch (error) {
    // Mejor manejo de errores
    if (error instanceof Error) {
      throw new Error(`Error al crear instancia de media: ${error.message}`);
    }
    throw new Error('Error desconocido al crear instancia de media');
  }
}

// Función auxiliar para detectar MIME type desde el nombre del archivo
export function detectMimeType(filename: string): string | undefined {
  const extension = filename?.split('.').pop()?.toLowerCase();
  return extension ? EXTENSION_TO_MIME[extension] : undefined;
}

// Función para validar que el MIME type coincida con el tipo de medio
function isValidMimeType(mimeType: string, mediaType: string): boolean {
  return ALLOWED_TYPES[mediaType]?.includes(mimeType) ?? false;
}

// Función mejorada para generar nombres de archivo
function generateFileName(mediaType: string, mimeType: string, originalName?: string): string {
  const timestamp = Date.now();
  const extension = mimeType.split('/')[1] || originalName?.split('.').pop() || 'bin';

  if (originalName) {
    const nameWithoutExt = originalName.split('.').slice(0, -1).join('.');
    return `${nameWithoutExt}-${timestamp}.${extension}`;
  }

  return `${mediaType}-${timestamp}.${extension}`;
}

// Función para obtener MIME type por defecto
function getDefaultMimeType(mediaType: string): string {
  const defaults: Record<string, string> = {
    image: 'image/jpeg',
    video: 'video/mp4',
    audio: 'audio/mpeg',
    document: 'application/octet-stream',
    sticker: 'image/webp',
  };
  return defaults[mediaType] || 'application/octet-stream';
}

/**
 * Obtiene la extensión de archivo adecuada basada en el MIME type o nombre de archivo
 * @param mimeType El tipo MIME del archivo
 * @param originalName El nombre original del archivo (opcional)
 * @returns La extensión de archivo adecuada
 */
export function getFileExtension(mimeType: string, originalName?: string): string {
  // Primero intentamos obtener la extensión del nombre de archivo si está disponible y es válida
  if (originalName) {
    const extFromName = originalName.split('.').pop()?.toLowerCase();
    if (extFromName && EXTENSION_TO_MIME[extFromName] === mimeType) {
      return extFromName;
    }
  }

  // Buscar en el mapeo de extensiones a MIME types
  for (const [ext, mt] of Object.entries(EXTENSION_TO_MIME)) {
    if (mt === mimeType) {
      return ext;
    }
  }

  // Si no encontramos en el mapeo, extraer del MIME type
  const extFromMime = mimeType.split('/').pop();
  if (extFromMime && /^[a-z0-9]+$/.test(extFromMime)) {
    return extFromMime;
  }

  // Default para tipos desconocidos
  return 'dat';
}

// Función adicional para determinar el MIME type por extensión
export function getDefaultMimeTypeFromExtension(filename: string): string {
  const extension = filename.split('.').pop()?.toLowerCase();
  if (!extension) return 'application/octet-stream';

  return EXTENSION_TO_MIME[extension] || 'application/octet-stream';
}

/**
 * Obtiene el tipo de medio (image, video, audio, document, sticker) a partir de un MIME type
 * @param mimeType El MIME type a evaluar
 * @returns El tipo de medio como string o undefined si no coincide con ningún tipo conocido
 */
export function getMediaTypeFromMime(mimeType: string): string {
  // Buscar en cada categoría
  for (const [type, mimes] of Object.entries(ALLOWED_TYPES)) {
    if (mimes.includes(mimeType)) {
      return type;
    }
  }
  return 'document'; // Si no encuentra coincidencia
}

export function isVideoFile(mimeType: string): boolean {
  return Object.values(MIME_TYPES.VIDEOS).some((mt) => mt === mimeType);
}

export function getContentDisposition(fileInfo: MediaFile): string {
  const isInline =
    Object.values(MIME_TYPES.IMAGES).some((mt) => mt === fileInfo.mimeType) ||
    Object.values(MIME_TYPES.VIDEOS).some((mt) => mt === fileInfo.mimeType) ||
    Object.values(MIME_TYPES.STICKERS).some((mt) => mt === fileInfo.mimeType);

  return isInline
    ? `inline; filename="${encodeURIComponent(fileInfo.fileName)}"`
    : `attachment; filename="${encodeURIComponent(fileInfo.fileName)}"`;
}
