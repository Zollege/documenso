import { exec } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

/**
 * PDF compression quality settings for Ghostscript.
 * Lower quality = smaller file size.
 */
export type PdfCompressionQuality = 'screen' | 'ebook' | 'printer' | 'prepress';

/**
 * Default size threshold in bytes (5MB) - only compress PDFs larger than this.
 */
const DEFAULT_SIZE_THRESHOLD = 5 * 1024 * 1024;

/**
 * Environment variable to enable/disable PDF compression.
 */
const PDF_COMPRESSION_ENABLED = process.env.NEXT_PRIVATE_PDF_COMPRESSION_ENABLED !== 'false';

/**
 * Environment variable to set compression quality.
 * Options: screen (lowest), ebook (medium), printer (high), prepress (highest)
 */
const PDF_COMPRESSION_QUALITY: PdfCompressionQuality =
  (process.env.NEXT_PRIVATE_PDF_COMPRESSION_QUALITY as PdfCompressionQuality) || 'ebook';

/**
 * Environment variable to set size threshold in bytes for compression.
 * PDFs smaller than this won't be compressed.
 */
const PDF_COMPRESSION_THRESHOLD = parseInt(
  process.env.NEXT_PRIVATE_PDF_COMPRESSION_THRESHOLD || String(DEFAULT_SIZE_THRESHOLD),
  10,
);

type CompressPdfOptions = {
  /**
   * The PDF buffer to compress.
   */
  pdf: Buffer;

  /**
   * Compression quality setting.
   * - screen: lowest quality, smallest size (72 dpi)
   * - ebook: medium quality, good for viewing (150 dpi)
   * - printer: high quality, good for printing (300 dpi)
   * - prepress: highest quality, preserves color (300 dpi, color preserving)
   */
  quality?: PdfCompressionQuality;

  /**
   * Force compression even if the PDF is below the size threshold.
   */
  force?: boolean;
};

/**
 * Compresses a PDF using Ghostscript.
 *
 * @param options - Compression options
 * @returns The compressed PDF buffer, or the original if compression is disabled/failed
 */
export const compressPdf = async ({
  pdf,
  quality = PDF_COMPRESSION_QUALITY,
  force = false,
}: CompressPdfOptions): Promise<Buffer> => {
  // Skip compression if disabled via environment variable
  if (!PDF_COMPRESSION_ENABLED) {
    return pdf;
  }

  // Skip compression if PDF is below threshold and not forced
  if (!force && pdf.length < PDF_COMPRESSION_THRESHOLD) {
    return pdf;
  }

  const tempDir = os.tmpdir();
  const inputPath = path.join(tempDir, `input-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
  const outputPath = path.join(tempDir, `output-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);

  try {
    // Write input PDF to temp file
    await fs.promises.writeFile(inputPath, pdf);

    // Run Ghostscript compression
    const gsCommand = [
      'gs',
      '-sDEVICE=pdfwrite',
      '-dCompatibilityLevel=1.4',
      `-dPDFSETTINGS=/${quality}`,
      '-dNOPAUSE',
      '-dQUIET',
      '-dBATCH',
      '-dColorImageDownsampleType=/Bicubic',
      '-dGrayImageDownsampleType=/Bicubic',
      '-dMonoImageDownsampleType=/Bicubic',
      `-sOutputFile=${outputPath}`,
      inputPath,
    ].join(' ');

    await execAsync(gsCommand, { timeout: 120000 }); // 2 minute timeout

    // Read compressed PDF
    const compressedPdf = await fs.promises.readFile(outputPath);

    // Only use compressed version if it's actually smaller
    if (compressedPdf.length < pdf.length) {
      console.log(
        `[PDF Compression] Reduced PDF size from ${(pdf.length / 1024 / 1024).toFixed(2)}MB to ${(compressedPdf.length / 1024 / 1024).toFixed(2)}MB (${((1 - compressedPdf.length / pdf.length) * 100).toFixed(1)}% reduction)`,
      );
      return compressedPdf;
    }

    // Return original if compression didn't help
    console.log('[PDF Compression] Compressed version not smaller, using original');
    return pdf;
  } catch (error) {
    // Log error but don't fail - return original PDF
    console.error('[PDF Compression] Failed to compress PDF:', error);
    return pdf;
  } finally {
    // Cleanup temp files
    try {
      await fs.promises.unlink(inputPath).catch(() => {});
      await fs.promises.unlink(outputPath).catch(() => {});
    } catch {
      // Ignore cleanup errors
    }
  }
};
