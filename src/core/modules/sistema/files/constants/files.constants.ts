import path from "path";

import { PATH_DRIVE } from "../helpers/fileNamer.helper";

export const FILE_STORAGE_CONSTANTS = {
    BASE_PATH: PATH_DRIVE(),
    TEMP_DIR: path.join(PATH_DRIVE(), 'temp_media'),
    MAX_FILE_SIZE: 200 * 1024 * 1024, // 200MB
    LARGE_FILE_THRESHOLD: 50 * 1024 * 1024, // 50MB
} as const;