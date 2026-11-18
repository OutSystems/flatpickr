import { Locale } from "../types/locale";
import {
  tokenRegex,
  RevFormatFn,
  token,
  revFormat,
  formats,
} from "./formatting";
import { defaults, ParsedOptions } from "../types/options";
import { english } from "../l10n/default";

export interface FormatterArgs {
  config?: ParsedOptions;
  l10n?: Locale;
  isMobile?: boolean;
}

export const createDateFormatter = ({
  config = defaults,
  l10n = english,
  isMobile = false,
}: FormatterArgs) => (
  dateObj: Date,
  frmt: string,
  overrideLocale?: Locale
): string => {
  const locale = overrideLocale || l10n;

  if (config.formatDate !== undefined && !isMobile) {
    return config.formatDate(dateObj, frmt, locale);
  }

  return frmt
    .split("")
    .map((c, i, arr) =>
      formats[c as token] && arr[i - 1] !== "\\"
        ? formats[c as token](dateObj, locale, config)
        : c !== "\\"
        ? c
        : ""
    )
    .join("");
};

export const createDateParser = ({ config = defaults, l10n = english }) => (
  date: Date | string | number,
  givenFormat?: string,
  timeless?: boolean,
  customLocale?: Locale
): Date | undefined => {
  if (date !== 0 && !date) return undefined;

  const locale = customLocale || l10n;

  let parsedDate: Date | undefined;
  const dateOrig = date;

  if (date instanceof Date) parsedDate = new Date(date.getTime());
  else if (
    typeof date !== "string" &&
    date.toFixed !== undefined // timestamp
  )
    // create a copy

    parsedDate = new Date(date);
  else if (typeof date === "string") {
    // date string
    const format = givenFormat || (config || defaults).dateFormat;
    const datestr = String(date).trim();

    if (datestr === "today") {
      parsedDate = new Date();
      timeless = true;
    } else if (config && config.parseDate) {
      parsedDate = config.parseDate(date, format);
    } else if (
      /Z$/.test(datestr) ||
      /GMT$/.test(datestr) // datestrings w/ timezone
    ) {
      parsedDate = new Date(date);
    } else {
      let matched,
        ops: { fn: RevFormatFn; val: string }[] = [];

      for (let i = 0, matchIndex = 0, regexStr = ""; i < format.length; i++) {
        const token = format[i] as token;
        const isBackSlash = (token as string) === "\\";
        const escaped = format[i - 1] === "\\" || isBackSlash;

        if (tokenRegex[token] && !escaped) {
          regexStr += tokenRegex[token].toLowerCase();
          const match = new RegExp(regexStr).exec(date.toLowerCase());
          if (match && (matched = true)) {
            ops[token !== "Y" ? "push" : "unshift"]({
              fn: revFormat[token],
              val: match[++matchIndex],
            });
          }
        } else if (!isBackSlash) regexStr += "."; // don't really care
      }

      parsedDate =
        !config || !config.noCalendar
          ? new Date(new Date().getFullYear(), 0, 1, 0, 0, 0, 0)
          : (new Date(new Date().setHours(0, 0, 0, 0)) as Date);

      ops.forEach(
        ({ fn, val }) =>
          (parsedDate = fn(parsedDate as Date, val, locale) || parsedDate)
      );

      parsedDate = matched ? parsedDate : undefined;
    }
  }

  /* istanbul ignore next */
  if (!(parsedDate instanceof Date && !isNaN(parsedDate.getTime()))) {
    config.errorHandler(new Error(`Invalid date provided: ${dateOrig}`));
    return undefined;
  }

  if (timeless === true) parsedDate.setHours(0, 0, 0, 0);

  return parsedDate;
};

const strictNumberTokens: Record<string, string> = {
  d: "(\\d{1,2})",
  j: "(\\d{1,2})",
  m: "(\\d{1,2})",
  n: "(\\d{1,2})",
  Y: "(\\d{4})",
  y: "(\\d{2})",
  H: "(\\d{1,2})",
  G: "(\\d{1,2})",
  h: "(\\d{1,2})",
  i: "(\\d{1,2})",
  S: "(\\d{1,2})",
  s: "(\\d{1,2})",
};

const strictNameTokens = ["M", "F", "D", "l", "K"];

const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const namesRegex = (names: string[]) => `(${names.map(escapeRegex).join("|")})`;

const indexOfName = (names: string[], value: string) =>
  names.map((name) => name.toLowerCase()).indexOf(value.toLowerCase());

/**
 * Whether every token of the given format is supported by parseStrictInput
 */
export const isStrictFormatSupported = (format: string): boolean => {
  for (let i = 0; i < format.length; i++) {
    if (format[i] === "\\") {
      i++;
      continue;
    }

    const isToken =
      (tokenRegex as Record<string, string>)[format[i]] !== undefined;
    if (
      isToken &&
      strictNumberTokens[format[i]] === undefined &&
      strictNameTokens.indexOf(format[i]) === -1
    )
      return false;
  }

  return true;
};

/**
 * Parse text typed by the user strictly against the given format.
 * Unlike the default parser, the whole text must match (literals included), every token must be present,
 * values must be in range and dates that would roll over (e.g. 31-02) are rejected.
 * Month, weekday and AM/PM names are case-insensitive. Weekday names are not checked against the date.
 * Returns undefined when the text is not a valid date for the format.
 */
export const parseStrictInput = (
  input: string,
  format: string,
  locale: Locale,
  noCalendar = false
): Date | undefined => {
  const groups: token[] = [];
  let regexStr = "";

  for (let i = 0; i < format.length; i++) {
    const char = format[i];

    if (char === "\\") {
      if (i + 1 < format.length) regexStr += escapeRegex(format[++i]);
      continue;
    }

    if (strictNumberTokens[char] !== undefined) {
      regexStr += strictNumberTokens[char];
      groups.push(char as token);
    } else if (char === "M") {
      regexStr += namesRegex(locale.months.shorthand);
      groups.push(char);
    } else if (char === "F") {
      regexStr += namesRegex(locale.months.longhand);
      groups.push(char);
    } else if (char === "D") {
      regexStr += namesRegex(locale.weekdays.shorthand);
      groups.push(char);
    } else if (char === "l") {
      regexStr += namesRegex(locale.weekdays.longhand);
      groups.push(char);
    } else if (char === "K") {
      regexStr += namesRegex(locale.amPM);
      groups.push(char);
    } else if ((tokenRegex as Record<string, string>)[char] !== undefined) {
      // Token not supported by the strict parser (e.g. U, Z, W)
      return undefined;
    } else {
      regexStr += escapeRegex(char);
    }
  }

  const match = new RegExp(`^${regexStr}$`, "i").exec(input.trim());
  if (match === null) return undefined;

  const base = noCalendar
    ? new Date(new Date().setHours(0, 0, 0, 0))
    : new Date(new Date().getFullYear(), 0, 1, 0, 0, 0, 0);

  let year = base.getFullYear(),
    month = base.getMonth(),
    day = base.getDate(),
    hours = 0,
    minutes = 0,
    seconds = 0,
    hours12: number | undefined,
    isPM: boolean | undefined;

  for (let g = 0; g < groups.length; g++) {
    const value = match[g + 1];
    const num = parseInt(value, 10);

    switch (groups[g]) {
      case "d":
      case "j":
        if (num < 1 || num > 31) return undefined;
        day = num;
        break;
      case "m":
      case "n":
        if (num < 1 || num > 12) return undefined;
        month = num - 1;
        break;
      case "M":
        month = indexOfName(locale.months.shorthand, value);
        break;
      case "F":
        month = indexOfName(locale.months.longhand, value);
        break;
      case "Y":
        year = num;
        break;
      case "y":
        year = 2000 + num;
        break;
      case "H":
      case "G":
        if (num > 23) return undefined;
        hours = num;
        break;
      case "h":
        if (num < 1 || num > 12) return undefined;
        hours12 = num;
        break;
      case "i":
        if (num > 59) return undefined;
        minutes = num;
        break;
      case "S":
      case "s":
        if (num > 59) return undefined;
        seconds = num;
        break;
      case "K":
        isPM = indexOfName(locale.amPM, value) === 1;
        break;
    }
  }

  if (hours12 !== undefined) hours = (hours12 % 12) + (isPM ? 12 : 0);
  else if (isPM !== undefined && hours < 12 && isPM) hours += 12;

  const parsedDate = new Date(2000, month, day, hours, minutes, seconds, 0);
  parsedDate.setFullYear(year, month, day);

  // Reject dates that rolled over (e.g. 31-02 becomes 03-03)
  if (
    parsedDate.getFullYear() !== year ||
    parsedDate.getMonth() !== month ||
    parsedDate.getDate() !== day
  )
    return undefined;

  return parsedDate;
};

// Number of digits each numeric token takes when a date is typed without separators.
// Always the full width, never a single digit: the digits are then split in exactly one way, nothing is guessed.
const autoCorrectTokenWidths: Record<string, number> = {
  d: 2,
  j: 2,
  m: 2,
  n: 2,
  H: 2,
  G: 2,
  h: 2,
  i: 2,
  S: 2,
  s: 2,
  Y: 4,
  y: 2,
};

type FormatSegment = { token?: string; literal?: string };

// Split a format into tokens and literals; undefined when a token can't be typed as digits
const splitNumericFormat = (format: string): FormatSegment[] | undefined => {
  const segments: FormatSegment[] = [];

  for (let i = 0; i < format.length; i++) {
    const char = format[i];

    if (char === "\\") {
      if (i + 1 < format.length) segments.push({ literal: format[++i] });
      continue;
    }

    if (autoCorrectTokenWidths[char] !== undefined)
      segments.push({ token: char });
    else if ((tokenRegex as Record<string, string>)[char] !== undefined)
      return undefined;
    else segments.push({ literal: char });
  }

  return segments;
};

// Rebuild the text from one value per token, with the format's own literals
const joinWithLiterals = (segments: FormatSegment[], values: string[]) => {
  let index = 0;
  return segments
    .map((segment) =>
      segment.token !== undefined ? values[index++] : segment.literal
    )
    .join("");
};

// Whether the format is a full calendar date: a day, a month and a year (a time part is allowed)
const isFullDateFormat = (tokens: string[]) =>
  tokens.some((token) => token === "d" || token === "j") &&
  tokens.some((token) => token === "m" || token === "n") &&
  tokens.some((token) => token === "Y" || token === "y");

/**
 * Try to turn a date typed without the format's separators, or with other ones, into text that matches the
 * format. The text is read as groups of digits split by any other characters, matched to the format's tokens
 * from left to right. Each group either:
 * - holds one token, with 1 digit up to the token's full width (e.g. "13/12/2020", "13.12.2020" or "1/7/2025"
 *   for "d-m-Y"), or
 * - holds several consecutive tokens, each at its full width (2 digits, 4 for Y), so the group's length must be
 *   exactly their summed widths (e.g. "13122020" for "d-m-Y", or "12122020 15:20" and "12-12-2020 1520" for
 *   "d-m-Y - H:i"). Single-digit values are only accepted when the user typed the separators around them, so
 *   "1312020" is not corrected.
 * There is only ever one way to match the groups, so nothing is guessed. Leftover digits or tokens, or a value
 * that is not a valid date, mean the text is not corrected.
 * Only for full dates (a day, a month and a year token, optionally with a time) made of numeric tokens, and
 * never for time-only pickers (noCalendar): month/year-only formats, times, month/weekday names and AM/PM are
 * not corrected.
 * Returns undefined when the text can't be corrected into a valid date.
 */
export const autoCorrectInput = (
  input: string,
  format: string,
  locale: Locale,
  noCalendar = false
): string | undefined => {
  if (noCalendar) return undefined;

  const segments = splitNumericFormat(format);
  if (segments === undefined) return undefined;

  const tokens = segments
    .filter((segment) => segment.token !== undefined)
    .map((segment) => segment.token as string);
  if (!isFullDateFormat(tokens)) return undefined;

  const text = input.trim();

  // Only digits, in groups split by any characters other than letters
  if (!/^\d+(?:[^\dA-Za-z]+\d+)*$/.test(text)) return undefined;

  const values: string[] = [];
  let tokenIndex = 0;

  for (const group of text.split(/[^\d]+/)) {
    if (tokenIndex >= tokens.length) return undefined;

    // A group that fits the next token holds just that token
    if (group.length <= autoCorrectTokenWidths[tokens[tokenIndex]]) {
      values.push(group);
      tokenIndex++;
      continue;
    }

    // A longer group holds consecutive tokens, each at its full width
    let offset = 0;
    while (offset < group.length) {
      if (tokenIndex >= tokens.length) return undefined;

      const width = autoCorrectTokenWidths[tokens[tokenIndex]];
      if (offset + width > group.length) return undefined;

      values.push(group.substr(offset, width));
      offset += width;
      tokenIndex++;
    }
  }

  if (tokenIndex !== tokens.length) return undefined;

  const candidate = joinWithLiterals(segments, values);
  return parseStrictInput(candidate, format, locale) !== undefined
    ? candidate
    : undefined;
};

/**
 * Compute the difference in dates, measured in ms
 */
export function compareDates(date1: Date, date2: Date, timeless = true) {
  if (timeless !== false) {
    return (
      new Date(date1.getTime()).setHours(0, 0, 0, 0) -
      new Date(date2.getTime()).setHours(0, 0, 0, 0)
    );
  }

  return date1.getTime() - date2.getTime();
}

/**
 * Compute the difference in times, measured in ms
 */
export function compareTimes(date1: Date, date2: Date) {
  return (
    3600 * (date1.getHours() - date2.getHours()) +
    60 * (date1.getMinutes() - date2.getMinutes()) +
    date1.getSeconds() -
    date2.getSeconds()
  );
}

export const isBetween = (ts: number, ts1: number, ts2: number) => {
  return ts > Math.min(ts1, ts2) && ts < Math.max(ts1, ts2);
};

export const calculateSecondsSinceMidnight = (
  hours: number,
  minutes: number,
  seconds: number
) => {
  return hours * 3600 + minutes * 60 + seconds;
};

export const parseSeconds = (secondsSinceMidnight: number) => {
  const hours = Math.floor(secondsSinceMidnight / 3600),
    minutes = (secondsSinceMidnight - hours * 3600) / 60;
  return [hours, minutes, secondsSinceMidnight - hours * 3600 - minutes * 60];
};

export const duration = {
  DAY: 86400000,
};

export function getDefaultHours(config: ParsedOptions) {
  let hours = config.defaultHour;
  let minutes = config.defaultMinute;
  let seconds = config.defaultSeconds;

  if (config.minDate !== undefined) {
    const minHour = config.minDate.getHours();
    const minMinutes = config.minDate.getMinutes();
    const minSeconds = config.minDate.getSeconds();

    if (hours < minHour) {
      hours = minHour;
    }

    if (hours === minHour && minutes < minMinutes) {
      minutes = minMinutes;
    }

    if (hours === minHour && minutes === minMinutes && seconds < minSeconds)
      seconds = config.minDate.getSeconds();
  }

  if (config.maxDate !== undefined) {
    const maxHr = config.maxDate.getHours();
    const maxMinutes = config.maxDate.getMinutes();
    hours = Math.min(hours, maxHr);

    if (hours === maxHr) minutes = Math.min(maxMinutes, minutes);
    if (hours === maxHr && minutes === maxMinutes)
      seconds = config.maxDate.getSeconds();
  }

  return { hours, minutes, seconds };
}
