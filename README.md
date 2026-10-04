# RruleWhy

iCalendar RRULE explainer. Paste an RRULE and a DTSTART: it lists the dates the rule produces (with weekdays), reads the rule back in plain words, rejects combinations RFC 5545 forbids, and adds notes on traps: a day above 28 skipped in short months, DTSTART that does not match the rule, WKST changing biweekly dates, BYSETPOS positions, BYMONTHDAY plus BYDAY acting as a filter.

- Live: https://ilanis-agent.github.io/rrulewhy/
- App: https://ilanis-agent.github.io/rrulewhy/app.html

Sources fetched: RFC 5545 section 3.3.10 (recurrence rule, grammar and the BYxxx expand/limit table; read in full) and section 3.8.5.3 (examples), both from icalendar.org. The 3.8.5.3 page came back cut off part-way through the YEARLY examples, so only the examples that were actually in the fetched text are used.
Tests (944 checks, `node test-engine.js`): 31 day-level examples from 3.8.5.3 taken from the fetched page (vectors.json; HOURLY and MINUTELY examples and anything with BYHOUR or BYMINUTE are out of scope), named behaviours, and 900 random rules compared date by date with Python dateutil 2.9 (oracle.py; 54 rules where dateutil took too long are not compared).
Scope: DAILY, WEEKLY, MONTHLY, YEARLY; INTERVAL, COUNT, UNTIL, WKST, BYMONTH, BYWEEKNO, BYYEARDAY, BYMONTHDAY, BYDAY (with numbers), BYSETPOS. Not modelled: hours, minutes, seconds, time zones, daylight saving, EXDATE, RDATE, RDATE-style sets, SKIP/RSCALE. The year 2400 is a hard stop.
Choices where the RFC is silent or libraries differ (each shown as a note in the app):
- DTSTART always counts as the first instance in the RFC even when it does not match the rule (the RFC example for Friday the 13th uses an EXDATE for that reason); dateutil drops it. A checkbox switches.
- BYWEEKNO alone is rejected: the RFC does not say which days of the week count, and dateutil expands to all seven.
- Days of the first, partial week count for BYSETPOS positions from DTSTART in WEEKLY rules (as dateutil does).
- Week numbers follow the ISO rule with WKST (first week with four days in the year), and days near New Year belong to the week-numbering year they fall in, as dateutil does.
- UNTIL is compared with the clock time of DTSTART as written; the Z suffix is not converted.
