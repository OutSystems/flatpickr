# ADR-0001: Opt-in strict parsing and an invalid-input hook for typed text

## Status

Proposed

## Context

With `allowInput: true`, Flatpickr parses the text typed in the input when it loses focus or Enter is
pressed (`onBlur` and `onKeyDown` call `setDate(input.value, true, format)`). The default parser
(`createDateParser` in `src/utils/dates.ts`) is built to be forgiving, which is wrong for typed text:

- Every literal in the format becomes `.` in the regex, so `23/06/2024` matches `d-m-Y`.
- The regex is not anchored, and a token that does not match is skipped without an error.
- Values are applied with `Date` setters, which roll over: with `d-m-Y`, typing `23062024` reads day `23`,
  month `62` and no year, and becomes 23-02-2029. `31-02-2025` becomes 03-03-2025.
- A date that parses but is disabled or outside `minDate`/`maxDate` is filtered out by `setSelectedDate`
  (`isEnabled`), so the selection is cleared and nothing tells the caller why. In range mode, one bad side
  leaves a partial selection.

The caller cannot tell any of these cases apart from a valid entry. The only hook is a custom `parseDate`,
which is used for every parse (config values too), and cannot see the disabled case.

This fork is consumed by OutSystems UI (DatePicker, DatePickerRange, MonthPicker and TimePicker), where
end users type dates and the wrong date was saved without notice (ROU-11357, ROU-12031, RPM-5943).
Upstream Flatpickr has had no release since 4.6.13, and the lenient parsing is reported there
(flatpickr/flatpickr#2444).

## Decision Drivers

- A typed date is never turned into a different date.
- The caller learns when typed text is rejected, and why.
- Default behaviour of the library does not change; other consumers of the fork are not affected.
- Parsing of config values (`defaultDate`, `minDate`, `maxDate`, `disable`, `setDate` from code) does not
  change.
- A caller's own `parseDate` keeps working.
- Small, self-contained change, so it can be proposed upstream later.
- Correcting typed input must never guess: a correction that picks one of several readings would recreate
  the original problem.

## Considered Options

- Option 1 — Make the default parser strict
  - Pros: one code path; fixes every consumer.
  - Cons: changes parsing of config values and `setDate` calls for everyone; breaking for upstream-style
    usage that relies on the leniency (for example `parseDate` fallbacks, shorthand strings).
- Option 2 — Opt-in options that apply only to typed text, plus a hook
  - Pros: only the typing paths (blur, Enter, clicking outside the open calendar) change, and only when turned on. Knows both failure reasons.
    Range and multiple input are accepted or rejected as a whole.
  - Cons: a second parser to maintain next to `createDateParser`; more divergence from upstream.
- Option 3 — Leave the library as is; consumers pass a strict `parseDate`
  - Pros: no fork change.
  - Cons: each consumer has to tell typed text from config values, cannot see dates dropped as disabled,
    and has to restore the cleared text itself.
- Option 4 — Opt-in auto-correction of typed text before it is rejected (complement to Option 2)
  - Pros: dates typed without separators (`13122020`) or with other ones (`13/12/2020`) are accepted when
    they can only be read one way, so fewer users see an error at all.
  - Cons: one more rule set; it has to stay strict. A first version tried every split of the digits
    (1 or 2 digits per day/month/hour) and kept a split when it gave a single valid date. Over a matrix of
    formats this still produced surprising reads (`112020` as 1/1/2020), and with a time part it turned a
    date typed without its time into another date (`13122020` for `d/m/Y - H:i` as 1/3/1220 - 2:0). The
    rules were therefore narrowed to full-width values only.

## Decision Outcome

Chosen option: "Option 2", together with "Option 4". Option 2 is the only one that fixes typed input
without changing any other parsing, and lets the caller react to both failure reasons. Option 4 accepts the
most common mistyped form (digits without separators) without guessing.

- **`strictInputParsing`** (boolean, default `false`). Typed text is parsed with `parseStrictInput`
  (`src/utils/dates.ts`) instead of the default parser:
  - The regex is built from the format and anchored; literals must match exactly (escaped with `\`
    as in Flatpickr formats).
  - Every token must be present. Supported tokens: `d j m n Y y H G h i S s` (numbers) and `M F D l K`
    (names). Leading zeros are optional (`1-7-2025`). `Y` needs four digits, `y` two (read as 20yy).
  - Names (months, weekdays, AM/PM) come from the locale and are case-insensitive. Weekday names are not
    checked against the date.
  - Values out of range (day 32, month 13, hour 24, minute 60) are rejected, and so is a date that rolls
    over (`31-02`).
  - Missing parts default to January 1 of the current year at 00:00; with `noCalendar`, to today.
  - If the format has a token the strict parser does not support (`U`, `Z`, `W`…), or a custom
    `parseDate` is set, the parser in use is the one Flatpickr would use anyway. A custom `parseDate`
    always wins.
  - In range mode the text must contain exactly two dates.
- **`keepInvalidInput`** (boolean, default `false`). When typed text is rejected, the selection is cleared
  and `onChange` fires as before, but the text stays in the input so the user can correct it. Blurring
  again with the same rejected text does nothing (no repeated clear or hook call).
- **`autoCorrectInput`** (boolean, default `false`). Before typed text that does not match the format is
  rejected, `autoCorrectInput` (`src/utils/dates.ts`) tries to rebuild it with the format's separators:
  - Digits typed without separators: every token takes its full width (2 digits, 4 for `Y`), so the
    number of digits must match the format exactly and the split is fixed; single-digit days, months or
    hours are not accepted, so nothing is guessed. `13122020` becomes `13-12-2020` for `d-m-Y`;
    `1312020` is not corrected.
  - Digit groups with other separators (`13/12/2020`, `13.12.2020`, `1/7/2025` for `d-m-Y`): rebuilt when
    there is one group per token.
  - Only for full numeric dates (a day, a month and a year token, optionally with a time). Not for
    month/year-only formats (MonthPicker), time-only pickers (`noCalendar`), month/weekday names or AM/PM.
  - Only when the text does not already match strictly, and never with a custom `parseDate`. Text that still
    can't be read is rejected as before.
- **`onInvalidInput` hook.** Fires after `onChange` when typed text is rejected, with
  `{ value, reason }` as the fourth argument. `reason` is `"unparsable"` (does not match the format) or
  `"disabled"` (disabled or outside `minDate`/`maxDate`). Fires when any of the options is on.
- The options are in `boolOpts`, so they can be passed as `data-` attributes like the other boolean options.
- All three typing paths go through the same function (`setDateFromInput`): blur, Enter, and clicking outside
  the open calendar (`documentClick`). The last one was missed at first: it still used the lenient `setDate`,
  so with a date-and-time picker (whose calendar stays open while typing) `121220201520` was read as
  12-10-2016 00:00. After a rejection on that path, `updateTime` is skipped, since it would otherwise select
  today's date.
- With all three options off, the three paths call `setDate` exactly as before (`documentClick` without
  triggering change, as upstream).

How OutSystems UI uses them (its ADR-0022): a single low-code switch, `StrictInputValidation` (off by
default), turns on `strictInputParsing`, `keepInvalidInput` and `autoCorrectInput` together, for DatePicker and
DatePickerRange only. MonthPicker and TimePicker do not use the options. OutSystems UI shows the invalid
state and raises its own `OnInvalidInput` event from the hook.

Positive consequences:

- Typed text is either the date the user typed or rejected with a reason.
- No behaviour change for consumers that do not turn the options on.
- Dates typed without separators, or with other ones, are accepted when they can only be read one way.
- The parser and the correction are covered by unit tests (`__tests__/src/index.spec.ts`, "strict input
  parsing" and "auto-correct typed input").

Negative consequences:

- A second parser, and the correction, to keep in step with token support in `createDateParser`.
- The fork diverges further from upstream; this change is a candidate to propose upstream.
- A consumer that turns `keepInvalidInput` on must show the invalid state itself (the hook tells it when).

Decisions taken so far, to confirm before the status changes to Accepted:

- All new options are off by default; no behaviour change for consumers that don't turn them on.
- Only the typing paths (blur, Enter, clicking outside the open calendar) change; config values and `setDate`
  from code are parsed as before.
- A custom `parseDate` always wins over the strict parser and the correction.
- Range input is accepted or rejected as a whole (exactly two dates).
- Rejected text can be kept in the input (`keepInvalidInput`); the selection is still cleared and
  `onChange` still fires before `onInvalidInput`.
- Disabled and out-of-range typed dates are reported (`reason: "disabled"`), not dropped silently.
- Auto-correction: full-width values only (no single digits without separators), full numeric dates only,
  never with `noCalendar`, month/year-only formats, names or AM/PM.

## Links

- ROU-11357 (this decision), ROU-13210 (shared input mask provider, investigated separately), ROU-10854 (case-insensitive names, Enter key), ROU-12898 (change detection
  on blur), ROU-12031, RPM-5943
- OutSystems UI ADR-0022 (how OutSystems UI uses these options): https://github.com/OutSystems/outsystems-ui
- Upstream issue about lenient parsing: https://github.com/flatpickr/flatpickr/issues/2444

## Date

2026-11-12
