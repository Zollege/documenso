import { textFormatValues } from '@documenso/ui/primitives/document-flow/field-items-advanced-settings/constants';

import type { TTextFieldMeta as TextFieldMeta } from '../types/field-meta';

export const validateTextField = (
  value: string,
  fieldMeta: TextFieldMeta,
  isSigningPage: boolean = false,
): string[] => {
  const errors = [];

  const { characterLimit, readOnly, required, fontSize, textFormat } = fieldMeta;

  if (required && !value && isSigningPage) {
    errors.push('Value is required');
  }

  if (characterLimit !== undefined && characterLimit > 0 && value.length > characterLimit) {
    errors.push(`Value length (${value.length}) exceeds the character limit (${characterLimit})`);
  }

  if (textFormat && value.length > 0) {
    const foundFormat = textFormatValues.find((item) => item.value === textFormat);

    if (!foundFormat) {
      errors.push(`Invalid text format - ${textFormat}`);
    } else if (!foundFormat.regex.test(value)) {
      errors.push(`Value does not match the required format (${foundFormat.label})`);
    }
  }

  if (readOnly && value.length < 1) {
    errors.push('A read-only field must have text');
  }

  if (readOnly && required) {
    errors.push('A field cannot be both read-only and required');
  }

  if (fontSize && (fontSize < 8 || fontSize > 96)) {
    errors.push('Font size must be between 8 and 96.');
  }

  return errors;
};
