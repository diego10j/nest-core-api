"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fileFilter = void 0;
const fileFilter = (req, file, callback) => {
    if (!file)
        return callback(new Error('File is empty'), false);
    const fileExptension = file.mimetype.split('/')[1];
    const validExtensions = ['jpg', 'jpeg', 'png', 'gif'];
    if (validExtensions.includes(fileExptension)) {
        return callback(null, true);
    }
    callback(null, false);
};
exports.fileFilter = fileFilter;
//# sourceMappingURL=fileFilter.helper.js.map