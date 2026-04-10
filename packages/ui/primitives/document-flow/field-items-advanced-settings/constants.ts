export const textFormatValues = [
  {
    label: 'SSN (xxx-xx-xxxx)',
    value: 'ssn',
    regex: /^\d{3}-\d{2}-\d{4}$/,
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
