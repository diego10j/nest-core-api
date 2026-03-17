import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { getStaticImage } from 'src/util/helpers/file-utils';

type PdfBackground = NonNullable<TDocumentDefinitions['background']>;

export interface LogoWatermarkOptions {
    size?: number;
    opacity?: number;
}

const DEFAULT_WATERMARK_SIZE = 210;
const DEFAULT_WATERMARK_OPACITY = 0.03;

export const logoWatermarkSection = (
    imageName?: string,
    options: LogoWatermarkOptions = {},
): PdfBackground => {
    const logoPath = getStaticImage(imageName || 'no-image');
    const size = options.size ?? DEFAULT_WATERMARK_SIZE;
    const opacity = options.opacity ?? DEFAULT_WATERMARK_OPACITY;

    return (_currentPage: number, pageSize: { width: number; height: number }): Content => ({
        image: logoPath,
        fit: [size, size],
        opacity,
        absolutePosition: {
            x: (pageSize.width - size) / 2,
            y: (pageSize.height - size) / 2,
        },
    });
};
