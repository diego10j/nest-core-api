import * as fs from 'fs';
import * as path from 'path';

import { FILE_STORAGE_CONSTANTS } from 'src/core/modules/sistema/files/constants/files.constants';

import { MediaFile } from '../api/interface/whatsapp';

// ─── MIME Types ──────────────────────────────────────────────────────────────

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
    webp: MIME_TYPES.IMAGES.WEBP,
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
};

/** Tipos de media permitidos en WhatsApp Cloud API */
export const ALLOWED_TYPES: Record<string, string[]> = {
    image: [MIME_TYPES.IMAGES.JPEG, MIME_TYPES.IMAGES.PNG, MIME_TYPES.IMAGES.WEBP, MIME_TYPES.IMAGES.GIF],
    video: [MIME_TYPES.VIDEOS.MP4, MIME_TYPES.VIDEOS.QUICKTIME, MIME_TYPES.VIDEOS.AVI],
    audio: [MIME_TYPES.AUDIO.MPEG, MIME_TYPES.AUDIO.OGG, MIME_TYPES.AUDIO.WAV, MIME_TYPES.AUDIO.AAC],
    document: [
        MIME_TYPES.DOCUMENTS.PDF,
        MIME_TYPES.DOCUMENTS.WORD,
        MIME_TYPES.DOCUMENTS.WORDX,
        MIME_TYPES.DOCUMENTS.EXCEL,
        MIME_TYPES.DOCUMENTS.EXCELX,
        MIME_TYPES.DOCUMENTS.TEXT,
        MIME_TYPES.DOCUMENTS.CSV,
        MIME_TYPES.COMPRESSED.ZIP,
    ],
    sticker: [MIME_TYPES.STICKERS.WEBP],
};

// ─── Funciones de utilidad ────────────────────────────────────────────────────

/** Detecta el MIME type a partir del nombre del archivo */
export function detectMimeType(filename: string): string | undefined {
    const extension = filename?.split('.').pop()?.toLowerCase();
    return extension ? EXTENSION_TO_MIME[extension] : undefined;
}

/** Obtiene MIME type por defecto a partir de extensión */
export function getDefaultMimeTypeFromExtension(filename: string): string {
    const extension = filename.split('.').pop()?.toLowerCase();
    if (!extension) return 'application/octet-stream';
    return EXTENSION_TO_MIME[extension] || 'application/octet-stream';
}

/**
 * Obtiene la extensión de archivo adecuada basada en MIME type o nombre original
 */
export function getFileExtension(mimeType: string, originalName?: string): string {
    if (originalName) {
        const extFromName = originalName.split('.').pop()?.toLowerCase();
        if (extFromName && EXTENSION_TO_MIME[extFromName] === mimeType) {
            return extFromName;
        }
    }
    for (const [ext, mt] of Object.entries(EXTENSION_TO_MIME)) {
        if (mt === mimeType) {
            return ext;
        }
    }
    const extFromMime = mimeType.split('/').pop();
    if (extFromMime && /^[a-z0-9]+$/.test(extFromMime)) {
        return extFromMime;
    }
    return 'dat';
}

/**
 * Obtiene el tipo de media (image, video, audio, document, sticker) desde un MIME type
 */
export function getMediaTypeFromMime(mimeType: string): string {
    for (const [type, mimes] of Object.entries(ALLOWED_TYPES)) {
        if (mimes.includes(mimeType)) {
            return type;
        }
    }
    return 'document';
}

/**
 * Content-Disposition header para descarga de archivos
 */
export function getContentDisposition(fileInfo: MediaFile): string {
    const isInline =
        Object.values(MIME_TYPES.IMAGES).includes(fileInfo.mimeType as any) ||
        Object.values(MIME_TYPES.VIDEOS).includes(fileInfo.mimeType as any) ||
        Object.values(MIME_TYPES.STICKERS).includes(fileInfo.mimeType as any);

    return isInline
        ? `inline; filename="${encodeURIComponent(fileInfo.fileName)}"`
        : `attachment; filename="${encodeURIComponent(fileInfo.fileName)}"`;
}

/** Verifica si el MIME type corresponde a un video */
export function isVideoFile(mimeType: string): boolean {
    return Object.values(MIME_TYPES.VIDEOS).some((mt) => mt === mimeType);
}

/**
 * Lee un archivo desde la carpeta de temporales y lo convierte en un objeto Multer.File.
 * Usado para campañas con media (Cloud API).
 */
export async function createFileFromTempPath(fileName: string): Promise<Express.Multer.File> {
    const directoryPath = FILE_STORAGE_CONSTANTS.TEMP_DIR;
    const fullPath = path.join(directoryPath, fileName);
    const normalizedPath = path.normalize(fullPath);

    if (!fs.existsSync(normalizedPath)) {
        throw new Error(`El archivo no existe en la ruta: ${normalizedPath}`);
    }

    const stats = fs.statSync(normalizedPath);
    if (!stats.isFile()) {
        throw new Error('La ruta proporcionada no es un archivo válido');
    }

    const fileContent = fs.readFileSync(normalizedPath);
    if (fileContent.length === 0) {
        throw new Error('El archivo está vacío');
    }

    const mimeType = detectMimeType(fileName) || getDefaultMimeTypeFromExtension(fileName);

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
}
