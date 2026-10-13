import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';

import { addBusinessDays, getDateFieldValue, getFederalHolidays } from './date-field-value';

const CHICAGO = 'America/Chicago';

const at = (iso: string) => DateTime.fromISO(iso, { zone: 'utc' });

describe('getDateFieldValue', () => {
  it('stamps the signing moment when there is no offset', () => {
    expect(
      getDateFieldValue({
        fieldMeta: { type: 'date' },
        timezone: CHICAGO,
        dateFormat: 'MM/dd/yyyy hh:mm a',
        now: at('2026-10-13T18:32:25Z'),
      }),
    ).toBe('10/13/2026 01:32 PM');
  });

  it('ignores an offset on a field that is not a date', () => {
    expect(
      getDateFieldValue({
        fieldMeta: { type: 'text', businessDaysOffset: 3 },
        timezone: CHICAGO,
        dateFormat: 'MM/dd/yyyy',
        now: at('2026-10-13T18:32:25Z'),
      }),
    ).toBe('10/13/2026');
  });

  it('adds business days and drops the time of day', () => {
    // Tuesday 10/13 -> Wed, Thu, Fri.
    expect(
      getDateFieldValue({
        fieldMeta: { type: 'date', businessDaysOffset: 3 },
        timezone: CHICAGO,
        dateFormat: 'MM/dd/yyyy hh:mm a',
        now: at('2026-10-13T18:32:25Z'),
      }),
    ).toBe('10/16/2026');
  });

  it('counts from the signing date in the document timezone, not UTC', () => {
    // 9:30 PM Thursday in Chicago is already Friday in UTC.
    expect(
      getDateFieldValue({
        fieldMeta: { type: 'date', businessDaysOffset: 3 },
        timezone: CHICAGO,
        dateFormat: 'MM/dd/yyyy',
        now: at('2026-10-16T02:30:00Z'),
      }),
    ).toBe('10/20/2026');
  });

  it('skips the weekend', () => {
    // Friday 10/16 -> Mon, Tue, Wed.
    expect(
      getDateFieldValue({
        fieldMeta: { type: 'date', businessDaysOffset: 3 },
        timezone: CHICAGO,
        dateFormat: 'MM/dd/yyyy',
        now: at('2026-10-16T18:00:00Z'),
      }),
    ).toBe('10/21/2026');
  });

  it('treats an offset of zero, or garbage, as no offset', () => {
    for (const businessDaysOffset of [0, -2, 1.5, 'abc', null]) {
      expect(
        getDateFieldValue({
          fieldMeta: { type: 'date', businessDaysOffset },
          timezone: CHICAGO,
          dateFormat: 'MM/dd/yyyy',
          now: at('2026-10-13T18:00:00Z'),
        }),
      ).toBe('10/13/2026');
    }
  });

  it('keeps date-only formats intact', () => {
    const value = (dateFormat: string) =>
      getDateFieldValue({
        fieldMeta: { type: 'date', businessDaysOffset: 1 },
        timezone: CHICAGO,
        dateFormat,
        now: at('2026-10-13T18:00:00Z'),
      });

    expect(value('EEEE, MMMM dd, yyyy hh:mm a')).toBe('Wednesday, October 14, 2026');
    expect(value("yyyy-MM-dd'T'HH:mm:ss.SSSXXX")).toBe('2026-10-14');
    expect(value('dd.MM.yyyy HH:mm')).toBe('14.10.2026');
    expect(value('MMMM dd, yyyy')).toBe('October 14, 2026');
  });
});

describe('addBusinessDays', () => {
  const add = (iso: string, days: number) =>
    addBusinessDays(DateTime.fromISO(iso, { zone: CHICAGO }), days).toISODate();

  it('skips Thanksgiving', () => {
    // Tue 11/24/2026 -> Wed 25, (Thu 26 Thanksgiving), Fri 27, (weekend), Mon 30.
    expect(add('2026-11-24', 3)).toBe('2026-11-30');
  });

  it('skips Christmas and New Year observed dates', () => {
    // Christmas 2027 is a Saturday, observed Fri 12/24. New Year 2028 is a
    // Saturday, observed Fri 12/31/2027.
    expect(add('2027-12-22', 3)).toBe('2027-12-28');
    expect(add('2027-12-29', 2)).toBe('2028-01-03');
  });

  it('starts counting the day after signing on a weekend', () => {
    // Saturday 10/17 -> Mon, Tue, Wed.
    expect(add('2026-10-17', 3)).toBe('2026-10-21');
  });
});

describe('getFederalHolidays', () => {
  it('matches the OPM 2026 schedule', () => {
    expect([...getFederalHolidays(2026)].sort()).toEqual([
      '2026-01-01',
      '2026-01-19',
      '2026-02-16',
      '2026-05-25',
      '2026-06-19',
      '2026-07-03',
      '2026-09-07',
      '2026-10-12',
      '2026-11-11',
      '2026-11-26',
      '2026-12-25',
    ]);
  });

  it('includes New Year observed on December 31 of the year before', () => {
    expect(getFederalHolidays(2027).has('2027-12-31')).toBe(true);
    expect(getFederalHolidays(2028).has('2028-01-01')).toBe(false);
  });
});
