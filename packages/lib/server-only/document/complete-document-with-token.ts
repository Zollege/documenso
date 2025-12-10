import {
  DocumentSigningOrder,
  DocumentStatus,
  EnvelopeType,
  RecipientRole,
  SendStatus,
  SigningStatus,
  WebhookTriggerEvents,
} from '@prisma/client';

import {
  DOCUMENT_AUDIT_LOG_TYPE,
  RECIPIENT_DIFF_TYPE,
} from '@documenso/lib/types/document-audit-logs';
import type { RequestMetadata } from '@documenso/lib/universal/extract-request-metadata';
import { fieldsContainUnsignedRequiredField } from '@documenso/lib/utils/advanced-fields-helpers';
import { createDocumentAuditLogData } from '@documenso/lib/utils/document-audit-logs';
import { prisma } from '@documenso/prisma';

import { AppError, AppErrorCode } from '../../errors/app-error';
import { jobs } from '../../jobs/client';
import type { TRecipientAccessAuth, TRecipientActionAuth } from '../../types/document-auth';
import { DocumentAuth } from '../../types/document-auth';
import {
  ZWebhookDocumentSchema,
  mapEnvelopeToWebhookDocumentPayload,
} from '../../types/webhook-payload';
import { extractDocumentAuthMethods } from '../../utils/document-auth';
import type { EnvelopeIdOptions } from '../../utils/envelope';
import { mapSecondaryIdToDocumentId, unsafeBuildEnvelopeIdQuery } from '../../utils/envelope';
import { getIsRecipientsTurnToSign } from '../recipient/get-is-recipient-turn';
import { triggerWebhook } from '../webhooks/trigger/trigger-webhook';
import { isRecipientAuthorized } from './is-recipient-authorized';
import { sendPendingEmail } from './send-pending-email';

export type CompleteDocumentWithTokenOptions = {
  token: string;
  id: EnvelopeIdOptions;
  userId?: number;
  authOptions?: TRecipientActionAuth;
  accessAuthOptions?: TRecipientAccessAuth;
  requestMetadata?: RequestMetadata;
  nextSigner?: {
    email: string;
    name: string;
  };
};

export const completeDocumentWithToken = async ({
  token,
  id,
  userId,
  accessAuthOptions,
  requestMetadata,
  nextSigner,
}: CompleteDocumentWithTokenOptions) => {
  const envelope = await prisma.envelope.findFirstOrThrow({
    where: {
      ...unsafeBuildEnvelopeIdQuery(id, EnvelopeType.DOCUMENT),
      recipients: {
        some: {
          token,
        },
      },
    },
    include: {
      documentMeta: true,
      recipients: {
        where: {
          token,
        },
      },
    },
  });

  const legacyDocumentId = mapSecondaryIdToDocumentId(envelope.secondaryId);

  if (envelope.status !== DocumentStatus.PENDING) {
    throw new Error(`Document ${envelope.id} must be pending`);
  }

  if (envelope.recipients.length === 0) {
    throw new Error(`Document ${envelope.id} has no recipient with token ${token}`);
  }

  const [recipient] = envelope.recipients;

  if (recipient.signingStatus === SigningStatus.SIGNED) {
    throw new Error(`Recipient ${recipient.id} has already signed`);
  }

  if (recipient.signingStatus === SigningStatus.REJECTED) {
    throw new AppError(AppErrorCode.UNKNOWN_ERROR, {
      message: 'Recipient has already rejected the document',
      statusCode: 400,
    });
  }

  if (envelope.documentMeta?.signingOrder === DocumentSigningOrder.SEQUENTIAL) {
    const isRecipientsTurn = await getIsRecipientsTurnToSign({ token: recipient.token });

    if (!isRecipientsTurn) {
      throw new Error(
        `Recipient ${recipient.id} attempted to complete the document before it was their turn`,
      );
    }
  }

  const fields = await prisma.field.findMany({
    where: {
      envelopeId: envelope.id,
      recipientId: recipient.id,
    },
  });

  if (fieldsContainUnsignedRequiredField(fields)) {
    throw new Error(`Recipient ${recipient.id} has unsigned fields`);
  }

  // Check ACCESS AUTH 2FA validation during document completion
  const { derivedRecipientAccessAuth } = extractDocumentAuthMethods({
    documentAuth: envelope.authOptions,
    recipientAuth: recipient.authOptions,
  });

  if (derivedRecipientAccessAuth.includes(DocumentAuth.TWO_FACTOR_AUTH)) {
    if (!accessAuthOptions) {
      throw new AppError(AppErrorCode.UNAUTHORIZED, {
        message: 'Access authentication required',
      });
    }

    const isValid = await isRecipientAuthorized({
      type: 'ACCESS_2FA',
      documentAuthOptions: envelope.authOptions,
      recipient: recipient,
      userId, // Can be undefined for non-account recipients
      authOptions: accessAuthOptions,
    });

    if (!isValid) {
      await prisma.documentAuditLog.create({
        data: createDocumentAuditLogData({
          type: DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_ACCESS_AUTH_2FA_FAILED,
          envelopeId: envelope.id,
          data: {
            recipientId: recipient.id,
            recipientName: recipient.name,
            recipientEmail: recipient.email,
          },
        }),
      });

      throw new AppError(AppErrorCode.TWO_FACTOR_AUTH_FAILED, {
        message: 'Invalid 2FA authentication',
      });
    }

    await prisma.documentAuditLog.create({
      data: createDocumentAuditLogData({
        type: DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_ACCESS_AUTH_2FA_VALIDATED,
        envelopeId: envelope.id,
        data: {
          recipientId: recipient.id,
          recipientName: recipient.name,
          recipientEmail: recipient.email,
        },
      }),
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.recipient.update({
      where: {
        id: recipient.id,
      },
      data: {
        signingStatus: SigningStatus.SIGNED,
        signedAt: new Date(),
      },
    });

    const authOptions = extractDocumentAuthMethods({
      documentAuth: envelope.authOptions,
      recipientAuth: recipient.authOptions,
    });

    await tx.documentAuditLog.create({
      data: createDocumentAuditLogData({
        type: DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_RECIPIENT_COMPLETED,
        envelopeId: envelope.id,
        user: {
          name: recipient.name,
          email: recipient.email,
        },
        requestMetadata,
        data: {
          recipientEmail: recipient.email,
          recipientName: recipient.name,
          recipientId: recipient.id,
          recipientRole: recipient.role,
          actionAuth: authOptions.derivedRecipientActionAuth,
        },
      }),
    });

    // Check if all non-autosign fields are now complete
    const allFields = await tx.field.findMany({
      where: {
        envelopeId: envelope.id,
      },
    });

    const nonAutoSignFields = allFields.filter((f) => !f.autosign);
    const allNonAutoSignFieldsComplete = !fieldsContainUnsignedRequiredField(nonAutoSignFields);

    console.log('[DEBUG] Auto-sign check:', {
      totalFields: allFields.length,
      nonAutoSignFields: nonAutoSignFields.length,
      allNonAutoSignFieldsComplete,
    });

    // If all non-autosign fields are complete, auto-sign the remaining autosign fields
    if (allNonAutoSignFieldsComplete) {
      const autoSignFields = await tx.field.findMany({
        where: {
          envelopeId: envelope.id,
          autosign: true,
          inserted: false,
        },
        include: {
          recipient: true,
        },
      });

      console.log('[DEBUG] Auto-signing fields:', {
        count: autoSignFields.length,
        fields: autoSignFields.map((f) => ({
          id: f.id,
          type: f.type,
          recipientEmail: f.recipient.email,
        })),
      });

      // Track which recipients had fields auto-signed
      const recipientsWithAutoSignedFields = new Set<number>();

      for (const field of autoSignFields) {
        recipientsWithAutoSignedFields.add(field.recipientId);

        // For signature fields, create a signature entry
        if (field.type === 'SIGNATURE' || field.type === 'FREE_SIGNATURE') {
          await tx.signature.create({
            data: {
              fieldId: field.id,
              recipientId: field.recipientId,
              typedSignature: field.recipient.name || field.recipient.email,
            },
          });
        }

        // Mark field as inserted
        await tx.field.update({
          where: { id: field.id },
          data: { inserted: true },
        });

        // Create audit log for auto-signed field (without IP address)
        await tx.documentAuditLog.create({
          data: createDocumentAuditLogData({
            type: DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_FIELD_INSERTED,
            envelopeId: envelope.id,
            metadata: {
              ...requestMetadata,
              requestMetadata: {
                ...requestMetadata?.requestMetadata,
                ipAddress: undefined, // No IP for auto-signed fields
              },
            },
            data: {
              recipientEmail: field.recipient.email,
              recipientId: field.recipientId,
              recipientName: field.recipient.name || '',
              recipientRole: field.recipient.role,
              fieldId: field.secondaryId,
              field: {
                type: field.type,
                data: field.recipient.name || field.recipient.email,
              },
            },
          }),
        });
      }

      // Mark recipients as SIGNED if all their fields are now complete
      for (const recipientId of recipientsWithAutoSignedFields) {
        const recipientToCheck = await tx.recipient.findUnique({
          where: { id: recipientId },
        });

        if (!recipientToCheck || recipientToCheck.signingStatus === SigningStatus.SIGNED) {
          continue;
        }

        const recipientFields = await tx.field.findMany({
          where: {
            envelopeId: envelope.id,
            recipientId: recipientId,
          },
        });

        const hasUnsignedRequiredFields = fieldsContainUnsignedRequiredField(recipientFields);

        if (!hasUnsignedRequiredFields) {
          await tx.recipient.update({
            where: { id: recipientId },
            data: {
              signingStatus: SigningStatus.SIGNED,
              signedAt: new Date(),
            },
          });

          // Create audit log for recipient completion
          await tx.documentAuditLog.create({
            data: createDocumentAuditLogData({
              type: DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_RECIPIENT_COMPLETED,
              envelopeId: envelope.id,
              user: {
                name: recipientToCheck.name,
                email: recipientToCheck.email,
              },
              metadata: {
                ...requestMetadata,
                requestMetadata: {
                  ...requestMetadata?.requestMetadata,
                  ipAddress: undefined, // No IP for auto-signed recipients
                },
              },
              data: {
                recipientEmail: recipientToCheck.email,
                recipientName: recipientToCheck.name,
                recipientId: recipientToCheck.id,
                recipientRole: recipientToCheck.role,
                actionAuth: [], // Auto-signed, no action auth required
              },
            }),
          });

          console.log('[DEBUG] Marked auto-signed recipient as SIGNED:', recipientId);
        }
      }
    }
  });

  await jobs.triggerJob({
    name: 'send.recipient.signed.email',
    payload: {
      documentId: legacyDocumentId,
      recipientId: recipient.id,
    },
  });

  const pendingRecipients = await prisma.recipient.findMany({
    select: {
      id: true,
      signingOrder: true,
      name: true,
      email: true,
      role: true,
    },
    where: {
      envelopeId: envelope.id,
      signingStatus: {
        not: SigningStatus.SIGNED,
      },
      role: {
        not: RecipientRole.CC,
      },
    },
    // Composite sort so our next recipient is always the one with the lowest signing order or id
    // if there is a tie.
    orderBy: [{ signingOrder: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
  });

  if (pendingRecipients.length > 0) {
    await sendPendingEmail({ id, recipientId: recipient.id });

    if (envelope.documentMeta?.signingOrder === DocumentSigningOrder.SEQUENTIAL) {
      const [nextRecipient] = pendingRecipients;

      await prisma.$transaction(async (tx) => {
        if (nextSigner && envelope.documentMeta?.allowDictateNextSigner) {
          await tx.documentAuditLog.create({
            data: createDocumentAuditLogData({
              type: DOCUMENT_AUDIT_LOG_TYPE.RECIPIENT_UPDATED,
              envelopeId: envelope.id,
              user: {
                name: recipient.name,
                email: recipient.email,
              },
              requestMetadata,
              data: {
                recipientEmail: nextRecipient.email,
                recipientName: nextRecipient.name,
                recipientId: nextRecipient.id,
                recipientRole: nextRecipient.role,
                changes: [
                  {
                    type: RECIPIENT_DIFF_TYPE.NAME,
                    from: nextRecipient.name,
                    to: nextSigner.name,
                  },
                  {
                    type: RECIPIENT_DIFF_TYPE.EMAIL,
                    from: nextRecipient.email,
                    to: nextSigner.email,
                  },
                ],
              },
            }),
          });
        }

        await tx.recipient.update({
          where: { id: nextRecipient.id },
          data: {
            sendStatus: SendStatus.SENT,
            ...(nextSigner && envelope.documentMeta?.allowDictateNextSigner
              ? {
                  name: nextSigner.name,
                  email: nextSigner.email,
                }
              : {}),
          },
        });

        await jobs.triggerJob({
          name: 'send.signing.requested.email',
          payload: {
            userId: envelope.userId,
            documentId: legacyDocumentId,
            recipientId: nextRecipient.id,
            requestMetadata,
          },
        });
      });
    }
  }

  const haveAllRecipientsSigned = await prisma.envelope.findFirst({
    where: {
      id: envelope.id,
      recipients: {
        every: {
          OR: [{ signingStatus: SigningStatus.SIGNED }, { role: RecipientRole.CC }],
        },
      },
    },
  });

  if (haveAllRecipientsSigned) {
    await jobs.triggerJob({
      name: 'internal.seal-document',
      payload: {
        documentId: legacyDocumentId,
        requestMetadata,
      },
    });
  }

  const updatedDocument = await prisma.envelope.findFirstOrThrow({
    where: {
      id: envelope.id,
      type: EnvelopeType.DOCUMENT,
    },
    include: {
      documentMeta: true,
      recipients: true,
    },
  });

  await triggerWebhook({
    event: WebhookTriggerEvents.DOCUMENT_SIGNED,
    data: ZWebhookDocumentSchema.parse(mapEnvelopeToWebhookDocumentPayload(updatedDocument)),
    userId: updatedDocument.userId,
    teamId: updatedDocument.teamId ?? undefined,
  });
};
