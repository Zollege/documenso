import { PDFDocument } from '@cantoo/pdf-lib';
import { DocumentDataType } from '@prisma/client';

import { prisma } from '@documenso/prisma';

import { AppError, AppErrorCode } from '../../errors/app-error';
import { getFileServerSide } from '../../universal/upload/get-file.server';
import type { ApiRequestMetadata } from '../../universal/extract-request-metadata';
import type { EnvelopeIdOptions } from '../../utils/envelope';
import { getTemplateById } from './get-template-by-id';

export type ReplaceTemplatePdfOptions = {
  id: EnvelopeIdOptions;
  userId: number;
  teamId: number;
  newDocumentDataId: string;
  requestMetadata: ApiRequestMetadata;
};

/**
 * Replace the PDF of a template with a new one.
 * Validates that the new PDF has the same number of pages as the old one
 * to ensure all fields remain on the correct pages.
 */
export const replaceTemplatePdf = async ({
  id,
  userId,
  teamId,
  newDocumentDataId,
  requestMetadata,
}: ReplaceTemplatePdfOptions) => {
  // Get the template and verify access
  const template = await getTemplateById({
    id,
    userId,
    teamId,
  });

  // Get the new document data
  const newDocumentData = await prisma.documentData.findUnique({
    where: {
      id: newDocumentDataId,
    },
  });

  if (!newDocumentData) {
    throw new AppError(AppErrorCode.NOT_FOUND, {
      message: 'New document data not found',
    });
  }

  // Get the old document data
  const oldDocumentData = template.templateDocumentData;

  // Load both PDFs to validate page counts
  const [oldPdfBuffer, newPdfBuffer] = await Promise.all([
    getDocumentDataBuffer(oldDocumentData),
    getDocumentDataBuffer(newDocumentData),
  ]);

  const [oldPdf, newPdf] = await Promise.all([
    PDFDocument.load(oldPdfBuffer).catch((e) => {
      console.error(`Old PDF load error: ${e.message}`);
      throw new AppError(AppErrorCode.INVALID_REQUEST, {
        message: 'Failed to load old PDF',
      });
    }),
    PDFDocument.load(newPdfBuffer).catch((e) => {
      console.error(`New PDF load error: ${e.message}`);
      throw new AppError(AppErrorCode.INVALID_REQUEST, {
        message: 'Failed to load new PDF',
      });
    }),
  ]);

  const oldPageCount = oldPdf.getPageCount();
  const newPageCount = newPdf.getPageCount();

  if (oldPageCount !== newPageCount) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: `Page count mismatch: old PDF has ${oldPageCount} pages, new PDF has ${newPageCount} pages. The new PDF must have the same number of pages to keep fields on the correct pages.`,
    });
  }

  // Update the envelope item to point to the new document data
  await prisma.envelopeItem.update({
    where: {
      id: template.templateDocumentData.envelopeItemId,
    },
    data: {
      documentDataId: newDocumentDataId,
    },
  });

  // Return the updated template
  return await getTemplateById({
    id,
    userId,
    teamId,
  });
};

/**
 * Helper function to get document data as a buffer
 */
async function getDocumentDataBuffer(documentData: {
  type: DocumentDataType;
  data: string;
}): Promise<Buffer> {
  const fileData = await getFileServerSide(documentData);
  return Buffer.from(fileData);
}
