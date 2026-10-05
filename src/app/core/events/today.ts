import { madridLocal } from './models';

/** Local calendar day in Madrid, including 23/25-hour DST days. */
export function madridDayRange(now = new Date()) {
  const day = madridLocal(now.toISOString()).slice(0, 10);
  const midnight = Date.parse(day + 'T00:00:00Z');
  const boundary = (utc: number) => {
    const local = Date.parse(madridLocal(new Date(utc).toISOString()) + ':00Z');
    return new Date(utc - (local - utc)).toISOString();
  };
  return {
    day,
    from: boundary(midnight),
    until: boundary(midnight + 86400000),
  };
}
