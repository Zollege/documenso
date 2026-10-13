import { DateTime } from 'luxon';
import { z } from 'zod';

import { DEFAULT_DOCUMENT_DATE_FORMAT } from '../constants/date-formats';
import { DEFAULT_DOCUMENT_TIME_ZONE } from '../constants/time-zones';

export type GetDateFieldValueOptions = {
  fieldMeta: unknown;
  timezone?: string | null;
  dateFormat?: string | null;
  now?: DateTime;
};

/**
 * The text a DATE field is stamped with when it is signed or auto-signed.
 *
 * Normally that is the signing moment. A date field whose meta carries
 * `businessDaysOffset` is instead stamped with the date that many business days
 * after signing - a statutory cancellation deadline, say, which has to be
 * computed from the moment the signer actually signs and so cannot be prefilled
 * when the document is sent.
 *
 * Every code path that stamps a DATE field goes through here, so the offset
 * cannot be lost depending on how the field happens to be filled (signed
 * directly, auto-inserted at completion, or auto-signed for another recipient).
 */
export const getDateFieldValue = ({
  fieldMeta,
  timezone,
  dateFormat,
  now = DateTime.now(),
}: GetDateFieldValueOptions) => {
  const zonedNow = now.setZone(timezone ?? DEFAULT_DOCUMENT_TIME_ZONE);
  const format = dateFormat ?? DEFAULT_DOCUMENT_DATE_FORMAT;
  const offset = getBusinessDaysOffset(fieldMeta);

  if (!offset) {
    return zonedNow.toFormat(format);
  }

  // A deadline is a day, not a moment, so the time portion of the document's
  // format is dropped rather than printing the signing time on a future date.
  return addBusinessDays(zonedNow.startOf('day'), offset).toFormat(stripTimeFromFormat(format));
};

const ZBusinessDaysOffsetMeta = z.object({
  type: z.literal('date'),
  businessDaysOffset: z.number().int().positive(),
});

const getBusinessDaysOffset = (fieldMeta: unknown) => {
  const parsed = ZBusinessDaysOffsetMeta.safeParse(fieldMeta);

  return parsed.success ? parsed.data.businessDaysOffset : 0;
};

export const stripTimeFromFormat = (format: string) => {
  const dateOnly = format.replace(/(\s+|'T')(hh|HH):mm.*$/, '');

  return dateOnly || format;
};

/**
 * Counts forward `days` business days, skipping Saturdays, Sundays and US
 * federal holidays (on their observed dates). The signing day itself is never
 * counted: signed on a Monday, three business days is Thursday.
 */
export const addBusinessDays = (start: DateTime, days: number) => {
  let date = start;
  let remaining = days;

  while (remaining > 0) {
    date = date.plus({ days: 1 });

    if (isBusinessDay(date)) {
      remaining--;
    }
  }

  return date;
};

export const isBusinessDay = (date: DateTime) => {
  // Luxon weekdays: 1 = Monday ... 7 = Sunday.
  if (date.weekday >= 6) {
    return false;
  }

  return !getFederalHolidays(date.year).has(date.toISODate() ?? '');
};

const holidayCache = new Map<number, Set<string>>();

/**
 * Observed US federal holidays falling in `year`. Includes the following year's
 * New Year's Day, which is observed on December 31 when January 1 is a Saturday.
 */
export const getFederalHolidays = (year: number) => {
  const cached = holidayCache.get(year);

  if (cached) {
    return cached;
  }

  const holidays = new Set<string>();

  for (const holidayYear of [year, year + 1]) {
    for (const holiday of federalHolidaysOf(holidayYear)) {
      if (holiday.year === year) {
        holidays.add(holiday.toISODate() ?? '');
      }
    }
  }

  holidayCache.set(year, holidays);

  return holidays;
};

const federalHolidaysOf = (year: number) => [
  observed(DateTime.utc(year, 1, 1)), // New Year's Day
  nthWeekday(year, 1, 1, 3), // Birthday of Martin Luther King, Jr. - third Monday of January
  nthWeekday(year, 2, 1, 3), // Washington's Birthday - third Monday of February
  lastWeekday(year, 5, 1), // Memorial Day - last Monday of May
  observed(DateTime.utc(year, 6, 19)), // Juneteenth
  observed(DateTime.utc(year, 7, 4)), // Independence Day
  nthWeekday(year, 9, 1, 1), // Labor Day - first Monday of September
  nthWeekday(year, 10, 1, 2), // Columbus Day - second Monday of October
  observed(DateTime.utc(year, 11, 11)), // Veterans Day
  nthWeekday(year, 11, 4, 4), // Thanksgiving - fourth Thursday of November
  observed(DateTime.utc(year, 12, 25)), // Christmas Day
];

// A fixed-date holiday on a Saturday is observed the Friday before, on a Sunday
// the Monday after.
const observed = (date: DateTime) => {
  if (date.weekday === 6) {
    return date.minus({ days: 1 });
  }

  if (date.weekday === 7) {
    return date.plus({ days: 1 });
  }

  return date;
};

const nthWeekday = (year: number, month: number, weekday: number, n: number) => {
  const first = DateTime.utc(year, month, 1);
  const shift = (weekday - first.weekday + 7) % 7;

  return first.plus({ days: shift + (n - 1) * 7 });
};

const lastWeekday = (year: number, month: number, weekday: number) => {
  const last = DateTime.utc(year, month, 1).endOf('month').startOf('day');
  const shift = (last.weekday - weekday + 7) % 7;

  return last.minus({ days: shift });
};
