/**
 * A number the SSA could have issued, or an ITIN.
 *
 * The SSA never issues area 000, 666 or 900-999, group 00 or serial 0000, and
 * voided 078-05-1120 and 219-09-9999 after they were printed on sample cards.
 * Area 9xx belongs to the IRS's ITINs, whose group is 50-65, 70-88, 90-92 or
 * 94-99.
 */
const SSN_OR_ITIN_REGEX =
  /^(?!078-05-1120$|219-09-9999$)(?:(?!000|666|9)\d{3}-(?!00)\d{2}-(?!0000)\d{4}|9\d{2}-(?:5\d|6[0-5]|7\d|8[0-8]|9[0-24-9])-\d{4})$/;

export const textFormatValues: {
  label: string;
  value: string;
  regex: RegExp;
  // The signing dialog files an error under the format by looking for "format" in it.
  errorMessage?: string;
}[] = [
  {
    label: 'SSN (xxx-xx-xxxx)',
    value: 'ssn',
    regex: SSN_OR_ITIN_REGEX,
    errorMessage: 'Enter a valid Social Security number or ITIN in the format xxx-xx-xxxx',
  },
  {
    label: 'US Phone ((xxx) xxx-xxxx)',
    value: 'us-phone',
    regex: /^\(\d{3}\) \d{3}-\d{4}$/,
  },
  {
    label: 'Phone (xxx-xxx-xxxx)',
    value: 'phone-dashes',
    regex: /^\d{3}-\d{3}-\d{4}$/,
  },
  {
    label: 'ZIP Code (xxxxx)',
    value: 'zip',
    regex: /^\d{5}$/,
  },
  {
    label: 'ZIP+4 (xxxxx-xxxx)',
    value: 'zip4',
    regex: /^\d{5}-\d{4}$/,
  },
  {
    label: 'Date (MM/DD/YYYY)',
    value: 'date-us',
    regex: /^\d{2}\/\d{2}\/\d{4}$/,
  },
];

export const numberFormatValues = [
  {
    label: '123,456,789.00',
    value: '123,456,789.00',
    regex: /^(?:\d{1,3}(?:,\d{3})*|\d+)(?:\.\d{1,2})?$/,
  },
  {
    label: '123.456.789,00',
    value: '123.456.789,00',
    regex: /^(?:\d{1,3}(?:\.\d{3})*|\d+)(?:,\d{1,2})?$/,
  },
  {
    label: '123456,789.00',
    value: '123456,789.00',
    regex: /^(?:\d+)(?:,\d{1,3}(?:\.\d{1,2})?)?$/,
  },
];

export enum CheckboxValidationRules {
  SELECT_AT_LEAST = 'Select at least',
  SELECT_EXACTLY = 'Select exactly',
  SELECT_AT_MOST = 'Select at most',
}

export const checkboxValidationRules = ['Select at least', 'Select exactly', 'Select at most'];
export const checkboxValidationLength = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
export const checkboxValidationSigns = [
  {
    label: 'Select at least',
    value: '>=',
  },
  {
    label: 'Select exactly',
    value: '=',
  },
  {
    label: 'Select at most',
    value: '<=',
  },
] as const;
