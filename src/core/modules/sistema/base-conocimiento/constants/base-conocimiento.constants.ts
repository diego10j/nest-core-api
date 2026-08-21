import path from 'path';

import { envs } from 'src/config/envs';

export const CONOCIMIENTO_STORAGE = {
  BASE_PATH: path.join(envs.pathDrive, 'conocimiento'),
  MAX_FILE_SIZE: 25 * 1024 * 1024, // 25MB por adjunto
} as const;
