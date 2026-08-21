import { v4 as uuid } from 'uuid';

export const conocimientoFileNamer = (_req: Express.Request, file: Express.Multer.File, callback: Function) => {
  if (!file) return callback(new Error('File is empty'), false);
  const extension = getExtensionFile(file.originalname) || file.mimetype.split('/')[1]?.replace('jpeg', 'jpg') || 'bin';
  callback(null, `${uuid()}.${extension}`);
};

export const getExtensionFile = (fileName: string): string => {
  if (!fileName || typeof fileName !== 'string') return '';
  const lastDotIndex = fileName.lastIndexOf('.');
  if (lastDotIndex === -1) return '';
  return fileName.substring(lastDotIndex + 1).toLowerCase();
};

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];

export const isImageExtension = (extension: string): boolean => IMAGE_EXTENSIONS.includes(extension.toLowerCase());
