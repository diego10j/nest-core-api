import { existsSync } from 'fs';
import { join } from 'path';

import { BadRequestException } from '@nestjs/common';
import { FILE_STORAGE_CONSTANTS } from 'src/core/modules/sistema/files/file-temp.service';

export function detectMimeType(filename?: string): string | undefined {
  if (!filename) return undefined;

  const extension = filename.split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    txt: 'text/plain',
    csv: 'text/csv',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    avi: 'video/x-msvideo',
    zip: 'application/zip',
    rar: 'application/x-rar-compressed',
  };

  return extension ? mimeTypes[extension] : undefined;
}

export function getDefaultMimeType(type?: string): string {
  const defaults: Record<string, string> = {
    image: 'image/jpeg',
    audio: 'audio/mpeg',
    video: 'video/mp4',
    document: 'application/pdf',
    sticker: 'image/webp',
  };

  return (type && defaults[type]) || 'application/octet-stream';
}

export function generateFilename(type?: string): string {
  const extensions: Record<string, string> = {
    image: 'jpg',
    audio: 'mp3',
    video: 'mp4',
    document: 'pdf',
    sticker: 'webp',
  };

  const ext = (type && extensions[type]) || 'bin';
  return `file-${Date.now()}.${ext}`;
}

/**
 * Retorna el path de una imagen que se subio mediante el files.service
 */
export function getStaticImage(imageName: string): string {
  let path = join(FILE_STORAGE_CONSTANTS.BASE_PATH, imageName);
  if (!existsSync(path)) path = join(FILE_STORAGE_CONSTANTS.BASE_PATH, 'no-image.png'); // path = join(__dirname, '../../../../public/assets/images', 'no-image.png');
  if (!existsSync(path)) throw new BadRequestException(`No image found with  ${path}`);
  return path;
}

/**
 * Retorna el path de un archivo subido desde file-temp.service
 */
export function getTmpFile(fileName: string): string {
  let path = join(FILE_STORAGE_CONSTANTS.TEMP_DIR, fileName);
  if (!existsSync(path)) throw new BadRequestException(`No file found with  ${path}`);
  return path;
}
