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

export type ReplaceTemplatePdfResult = {
  template: Awaited<ReturnType<typeof getTemplateById>>;
  oldPageCount: number;
  newPageCount: number;
  deletedFieldsCount: number;
};

/**
 * Replace the PDF of a template with a new one.
 *
 * Behavior:
 * - If new PDF has more pages: New pages will have no fields
 * - If new PDF has fewer pages: Fields on removed pages will be deleted
 * - If same page count: No field changes
 */
export const replaceTemplatePdf = async ({
  id,
  userId,
  teamId,
  newDocumentDataId,
  requestMetadata,
}: ReplaceTemplatePdfOptions): Promise<ReplaceTemplatePdfResult> => {
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

  let deletedFieldsCount = 0;

  // If new PDF has fewer pages, delete fields that are on removed pages
  if (newPageCount < oldPageCount) {
    const fieldsToDelete = await prisma.field.findMany({
      where: {
        envelopeId: template.envelopeId,
        page: {
          gt: newPageCount,
        },
      },
      select: {
        id: true,
        page: true,
        type: true,
      },
    });

    if (fieldsToDelete.length > 0) {
      const deleteResult = await prisma.field.deleteMany({
        where: {
          id: {
            in: fieldsToDelete.map((f) => f.id),
          },
        },
      });

      deletedFieldsCount = deleteResult.count;

      console.log(
        `Deleted ${deletedFieldsCount} fields from pages ${newPageCount + 1}-${oldPageCount}`,
      );
    }
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

  // Return the updated template with operation details
  const updatedTemplate = await getTemplateById({
    id,
    userId,
    teamId,
  });

  return {
    template: updatedTemplate,
    oldPageCount,
    newPageCount,
    deletedFieldsCount,
  };
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
