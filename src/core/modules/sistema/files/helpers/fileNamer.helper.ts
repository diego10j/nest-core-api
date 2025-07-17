import { envs } from 'src/config/envs';
import { v4 as uuid } from 'uuid'

export const PATH_DRIVE = (): string => envs.pathDrive;

const mimeTypeMap: { [key: string]: string } = {
  'text/plain': 'txt',
  'application/zip': 'zip',
  'audio/mpeg': 'audio',
  'audio/ogg': 'audio',
  'audio/wav': 'audio',
  'audio/webm': 'audio',
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  'image/heic': 'image',
  'video/mp4': 'video',
  'video/webm': 'video',
  'application/msword': 'word',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'word',
  'application/vnd.ms-excel': 'excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'excel',
  'application/vnd.ms-powerpoint': 'powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'powerpoint',
  'application/pdf': 'pdf',
  'image/vnd.adobe.photoshop': 'photoshop',
  'application/vnd.adobe.photoshop': 'photoshop',
  'application/vnd.adobe.illustrator': 'illustrator',
};

export const fileNamer = (req: Express.Request, file: Express.Multer.File, callback: Function) => {
  // console.log({ file })
  if (!file) return callback(new Error('File is empty'), false);
  const fileExtension = file.mimetype.split('/')[1].replace('jpeg', 'jpg');
  const fileName = `${uuid()}.${fileExtension}`;
  callback(null, fileName);
}

export const fileOriginalNamer = (req: Express.Request, file: Express.Multer.File, callback: Function) => {
  if (!file) return callback(new Error('File is empty'), false);
  // Reemplazamos 'jpeg' por 'jpg' en la extensión
  const fileExtension = file.mimetype.split('/')[1].replace('jpeg', 'jpg');
  // Tomamos el nombre sin la extensión original y le agregamos la nueva extensión
  const originalName = file.originalname.split('.')[0];
  const fileName = `${originalName}.${fileExtension}`;
  callback(null, fileName);
}


export const getUuidNameFile = (fileName: string): string => {
  const lastDotIndex = fileName.indexOf('.');
  // Si no hay un punto en el nombre del archivo, devolver el nombre completo como nombre
  if (lastDotIndex === -1) {
    return fileName;
  }
  return fileName.substring(0, lastDotIndex);
}

export const getExtensionFile = (fileName: string): string => {
  const lastDotIndex = fileName.lastIndexOf('.');
  // Si no hay un punto en el nombre del archivo, devolver una cadena vacía como extensión
  if (lastDotIndex === -1) {
    return '';
  }
  return fileName.substring(lastDotIndex).replace('.', '');
}

export const getFileType = (mimetype: string): string => {
  return mimeTypeMap[mimetype] || 'file';
};