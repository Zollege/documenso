import { useEffect } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { Trans } from '@lingui/react/macro';
import { useForm, useWatch } from 'react-hook-form';
import type { z } from 'zod';

import { DEFAULT_SIGNATURE_TEXT_FONT_SIZE } from '@documenso/lib/constants/pdf';
import { type TSignatureFieldMeta, ZSignatureFieldMeta } from '@documenso/lib/types/field-meta';
import { Checkbox } from '@documenso/ui/primitives/checkbox';
import { Form } from '@documenso/ui/primitives/form/form';
import { Label } from '@documenso/ui/primitives/label';

import { EditorGenericFontSizeField } from './editor-field-generic-field-forms';

const ZSignatureFieldFormSchema = ZSignatureFieldMeta.pick({
  fontSize: true,
});

type TSignatureFieldFormSchema = z.infer<typeof ZSignatureFieldFormSchema>;

type EditorFieldSignatureFormProps = {
  value: TSignatureFieldMeta | undefined;
  onValueChange: (value: TSignatureFieldMeta) => void;
  autosign?: boolean;
  onAutosignChange?: (value: boolean) => void;
};

export const EditorFieldSignatureForm = ({
  value = {
    type: 'signature',
  },
  onValueChange,
  autosign = false,
  onAutosignChange,
}: EditorFieldSignatureFormProps) => {
  const form = useForm<TSignatureFieldFormSchema>({
    resolver: zodResolver(ZSignatureFieldFormSchema),
    mode: 'onChange',
    defaultValues: {
      fontSize: value.fontSize || DEFAULT_SIGNATURE_TEXT_FONT_SIZE,
    },
  });

  const { control } = form;

  const formValues = useWatch({
    control,
  });

  // Dupecode/Inefficient: Done because native isValid won't work for our usecase.
  useEffect(() => {
    const validatedFormValues = ZSignatureFieldFormSchema.safeParse(formValues);

    if (validatedFormValues.success) {
      onValueChange({
        type: 'signature',
        ...validatedFormValues.data,
      });
    }
  }, [formValues]);

  return (
    <Form {...form}>
      <form>
        <fieldset className="flex flex-col gap-2">
          <div>
            <EditorGenericFontSizeField formControl={form.control} />
            <p className="mt-0.5 text-xs text-muted-foreground">
              <Trans>The typed signature font size</Trans>
            </p>
          </div>

          {onAutosignChange && (
            <div className="mt-1">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="autosign"
                  checked={autosign}
                  onCheckedChange={(checked) => onAutosignChange(checked === true)}
                />
                <Label htmlFor="autosign" className="cursor-pointer text-xs text-foreground/70">
                  <Trans>Automatically sign this field</Trans>
                </Label>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                <Trans>
                  When enabled, this signature field will be automatically signed when the document
                  is sent to the recipient.
                </Trans>
              </p>
            </div>
          )}
        </fieldset>
      </form>
    </Form>
  );
};
