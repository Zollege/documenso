import { describe, expect, it } from 'vitest';

import { validateTextField } from './validate-text';

const SSN_ERROR = 'Enter a valid Social Security number or ITIN in the format xxx-xx-xxxx';

const validateSsn = (value: string) =>
  validateTextField(value, { type: 'text', textFormat: 'ssn' }, true);

describe('validateTextField with the ssn format', () => {
  it.each(['123-45-6789', '001-01-0001', '665-99-9999', '667-12-3456', '899-12-3456'])(
    'accepts the issuable SSN %s',
    (value) => {
      expect(validateSsn(value)).toEqual([]);
    },
  );

  it.each([
    '900-50-1234',
    '912-65-1234',
    '999-70-1234',
    '900-88-1234',
    '900-92-1234',
    '900-94-1234',
    '900-99-1234',
  ])('accepts the ITIN %s', (value) => {
    expect(validateSsn(value)).toEqual([]);
  });

  it.each([
    ['000-00-0000', 'all zeros'],
    ['000-12-3456', 'area 000'],
    ['666-12-3456', 'area 666'],
    ['123-00-4567', 'group 00'],
    ['123-45-0000', 'serial 0000'],
    ['078-05-1120', 'the voided wallet-card number'],
    ['219-09-9999', 'the voided advertisement number'],
    ['900-12-3456', 'area 9xx outside the ITIN groups'],
    ['900-66-1234', 'ITIN group 66'],
    ['900-89-1234', 'ITIN group 89'],
    ['900-93-1234', 'ITIN group 93'],
    ['900-00-1234', 'ITIN group 00'],
    ['123456789', 'no dashes'],
    ['123-45-678', 'too short'],
    ['123-45-67890', 'too long'],
    [' 123-45-6789', 'leading space'],
  ])('rejects %s (%s)', (value) => {
    expect(validateSsn(value)).toEqual([SSN_ERROR]);
  });

  it('files the error under the format in the signing dialog', () => {
    expect(SSN_ERROR).toContain('format');
  });

  it('leaves an empty value to the required check', () => {
    expect(validateSsn('')).toEqual([]);
  });
});

describe('validateTextField with other formats', () => {
  it('keeps the generic message', () => {
    expect(validateTextField('1234', { type: 'text', textFormat: 'zip' }, true)).toEqual([
      'Value does not match the required format (ZIP Code (xxxxx))',
    ]);
  });
});
