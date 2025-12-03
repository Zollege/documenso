import { useState } from 'react';

import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Trans } from '@lingui/react/macro';
import { FileUp, Loader } from 'lucide-react';

import { trpc } from '@documenso/trpc/react';

import { Button } from '../button';
import { useToast } from '../use-toast';

export type ReplaceTemplatePdfProps = {
  templateId: number;
  onSuccess?: () => void;
};

export const ReplaceTemplatePdf = ({ templateId, onSuccess }: ReplaceTemplatePdfProps) => {
  const { _ } = useLingui();
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);

  const { mutateAsync: replacePdf } = trpc.template.replacePdf.useMutation();

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.name.endsWith('.pdf')) {
      toast({
        title: _(msg`Error`),
        description: _(msg`Please select a PDF file.`),
        variant: 'destructive',
      });
      return;
    }

    setIsUploading(true);

    try {
      // Step 1: Upload the PDF file to get document data ID
      const formData = new FormData();
      formData.append('file', file);

      const uploadResponse = await fetch('/api/files/upload-pdf', {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload PDF');
      }

      const uploadResult = await uploadResponse.json();
      const newDocumentDataId = uploadResult.id;

      // Step 2: Call the replacePdf mutation
      const result = await replacePdf({
        templateId,
        newDocumentDataId,
      });

      // Build success message based on what happened
      let description = '';
      if (result.newPageCount > result.oldPageCount) {
        const addedPages = result.newPageCount - result.oldPageCount;
        description = _(
          msg`PDF replaced successfully. Added ${addedPages} page(s). New pages have no fields.`,
        );
      } else if (result.newPageCount < result.oldPageCount) {
        const removedPages = result.oldPageCount - result.newPageCount;
        if (result.deletedFieldsCount > 0) {
          description = _(
            msg`PDF replaced successfully. Removed ${removedPages} page(s) and deleted ${result.deletedFieldsCount} field(s) that were on those pages.`,
          );
        } else {
          description = _(
            msg`PDF replaced successfully. Removed ${removedPages} page(s). No fields were affected.`,
          );
        }
      } else {
        description = _(msg`PDF replaced successfully. All fields remain on the same pages.`);
      }

      toast({
        title: _(msg`PDF replaced successfully`),
        description,
        duration: 5000,
      });

      // Reset the file input
      event.target.value = '';

      // Call onSuccess callback to refresh the template data
      onSuccess?.();
    } catch (error) {
      console.error('Error replacing PDF:', error);

      const errorMessage =
        error instanceof Error ? error.message : 'An error occurred while replacing the PDF.';

      toast({
        title: _(msg`Error`),
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="border-border bg-muted/50 flex flex-col gap-2 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium">
            <Trans>Replace PDF</Trans>
          </h3>
          <p className="text-muted-foreground text-xs">
            <Trans>
              Upload a new PDF to replace the current one. If the new PDF has fewer pages, fields
              on removed pages will be deleted.
            </Trans>
          </p>
        </div>

        <div className="relative">
          <input
            type="file"
            accept=".pdf,application/pdf"
            onChange={handleFileChange}
            disabled={isUploading}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            id="replace-pdf-input"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isUploading}
            className="relative"
            asChild
          >
            <label htmlFor="replace-pdf-input" className="cursor-pointer">
              {isUploading ? (
                <>
                  <Loader className="mr-2 h-4 w-4 animate-spin" />
                  <Trans>Replacing...</Trans>
                </>
              ) : (
                <>
                  <FileUp className="mr-2 h-4 w-4" />
                  <Trans>Replace PDF</Trans>
                </>
              )}
            </label>
          </Button>
        </div>
      </div>
    </div>
  );
};
