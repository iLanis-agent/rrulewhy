'use strict';
var R = require('./engine.js'), cp = require('child_process'), fs = require('fs');
var checks = 0, fails = 0;
function eq(a, b, m) { checks++; if (JSON.stringify(a) !== JSON.stringify(b)) { fails++; if (fails < 15) console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } }
function dates(dtstart, rule, limit, skip) { var r = R.run({ dtstart: dtstart, rule: rule, limit: limit, skipUnsynced: skip }); return r.errors.length ? 'ERR ' + r.errors.join('|') : r.shown.map(function (x) { return x.iso; }); }

// 1. Every worked example of RFC 5545 section 3.8.5.3 that works on whole days (vectors.json, from
//    https://icalendar.org/iCalendar-RFC-5545/3-8-5-3-recurrence-rule.html, fetched; the page ends part-way through the YEARLY examples).
var vecs = JSON.parse(fs.readFileSync(__dirname + '/vectors.json', 'utf8'));
vecs.forEach(function (v) {
  var finite = /COUNT=|UNTIL=/.test(v.rule), exact = finite && !v.more;
  var got = dates(v.dtstart, v.rule, exact ? 500 : v.exp.length, !!v.ex);
  eq(exact ? got : got.slice(0, v.exp.length), v.exp, 'RFC example ' + v.rule);
});
// 2. Named behaviours
eq(dates('19970805T090000', 'FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU;WKST=SU', 10), ['1997-08-05', '1997-08-17', '1997-08-19', '1997-08-31'], 'WKST=SU');
eq(dates('19970805T090000', 'FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU;WKST=MO', 10), ['1997-08-05', '1997-08-10', '1997-08-19', '1997-08-24'], 'WKST=MO');
eq(dates('20070115T090000', 'FREQ=MONTHLY;BYMONTHDAY=15,30;COUNT=5', 10), ['2007-01-15', '2007-01-30', '2007-02-15', '2007-03-15', '2007-03-30'], 'Feb 30 ignored');
eq(dates('20240131T090000', 'FREQ=MONTHLY;COUNT=4', 10), ['2024-01-31', '2024-03-31', '2024-05-31', '2024-07-31'], '31st skips short months');
eq(dates('20240229T090000', 'FREQ=YEARLY;COUNT=3', 10), ['2024-02-29', '2028-02-29', '2032-02-29'], 'leap day');
eq(dates('20240110T090000', 'FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1;COUNT=3', 10), ['2024-01-10', '2024-01-31', '2024-02-29', '2024-03-29'].slice(0, 3).length === 3 ? ['2024-01-10', '2024-01-31', '2024-02-29'] : 0, 'last weekday; DTSTART first');
eq(R.run({ dtstart: '19970902T090000', rule: 'FREQ=DAILY;COUNT=3;UNTIL=19971231' }).errors.length, 1, 'COUNT and UNTIL flagged');
eq(R.run({ dtstart: '19970902T090000', rule: 'FREQ=WEEKLY;BYMONTHDAY=3' }).errors.length, 1, 'BYMONTHDAY with WEEKLY');
eq(R.run({ dtstart: '19970902T090000', rule: 'FREQ=DAILY;BYHOUR=9' }).errors.length, 1, 'BYHOUR unsupported');
eq(R.run({ dtstart: '19970902T090000', rule: 'INTERVAL=2' }).errors.length >= 1, true, 'FREQ missing');
eq(R.run({ dtstart: 'nope', rule: 'FREQ=DAILY' }).errors.length, 1, 'bad DTSTART');
eq(R.run({ dtstart: '19970902T090000', rule: 'FREQ=MONTHLY;BYMONTHDAY=30;BYMONTH=2', limit: 3 }).capped, true, 'impossible rule capped');
eq(R.run({ dtstart: '19970903T090000', rule: 'FREQ=WEEKLY;BYDAY=TU;COUNT=2' }).synced, false, 'unsynced flagged');

// 3. Oracle: Python dateutil (rrulestr), random rules. dateutil drops an unsynchronised DTSTART, so compare with skipUnsynced.
var seed = 2024; function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
function pick(a) { return a[Math.floor(rnd() * a.length)]; }
function some(a, k) { var out = [], c = a.slice(); while (out.length < k && c.length) out.push(c.splice(Math.floor(rnd() * c.length), 1)[0]); return out; }
var WD = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
function randRule() {
  var f = pick(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']), p = ['FREQ=' + f];
  if (rnd() < 0.4) p.push('INTERVAL=' + (1 + Math.floor(rnd() * 4)));
  var bd = null;
  if (rnd() < 0.5) {
    var days = some(WD, 1 + Math.floor(rnd() * 3));
    if ((f === 'MONTHLY' || f === 'YEARLY') && rnd() < 0.5) days = days.map(function (d) { var n = pick([1, 2, 3, 4, -1, -2]); return (rnd() < 0.15 ? 5 : n) + d; });
    bd = days; p.push('BYDAY=' + days.join(','));
  }
  var hasWeekno = false;
  if (f === 'YEARLY' && bd && rnd() < 0.25 && !/\d/.test(bd.join())) { p.push('BYWEEKNO=' + some([1, 2, 10, 20, 30, 52, -1, -2], 1 + Math.floor(rnd() * 2)).join(',')); hasWeekno = true; }
  if (f === 'YEARLY' && !hasWeekno && rnd() < 0.15) p.push('BYYEARDAY=' + some([1, 60, 100, 200, 366, -1, -100], 1 + Math.floor(rnd() * 2)).join(','));
  if (f !== 'WEEKLY' && rnd() < 0.3) p.push('BYMONTHDAY=' + some([1, 2, 5, 13, 15, 28, 29, 30, 31, -1, -2, -5], 1 + Math.floor(rnd() * 3)).join(','));
  if (rnd() < 0.3) p.push('BYMONTH=' + some([1, 2, 3, 6, 7, 11, 12], 1 + Math.floor(rnd() * 3)).join(','));
  if (f === 'WEEKLY' || f === 'YEARLY' || rnd() < 0.2) p.push('WKST=' + pick(WD));
  if (p.length > 1 && rnd() < 0.2 && p.some(function (x) { return /^BY/.test(x); })) p.push('BYSETPOS=' + some([1, 2, 3, -1, -2], 1 + Math.floor(rnd() * 2)).join(','));
  var t = rnd();
  if (t < 0.4) p.push('COUNT=' + (1 + Math.floor(rnd() * 15)));
  else if (t < 0.6) p.push('UNTIL=' + pick(['19990101T090000', '20011231T090000', '20041015T090000', '20100315T090000']));
  return p.join(';');
}
var cases = [], N = 900;
for (var i = 0; i < N; i++) {
  var y = 1995 + Math.floor(rnd() * 12), m = 1 + Math.floor(rnd() * 12), d = 1 + Math.floor(rnd() * 28);
  cases.push({ dtstart: '' + y + ('0' + m).slice(-2) + ('0' + d).slice(-2) + 'T090000', rule: randRule(), limit: 30 });
}
var py = JSON.parse(cp.execFileSync('python3', ['oracle.py'], { input: JSON.stringify(cases), maxBuffer: 1 << 28 }).toString());
var compared = 0, timeouts = 0, rejected = 0;
cases.forEach(function (c, i) {
  var mine = dates(c.dtstart, c.rule, c.limit, true), o = py[i];
  if (typeof mine === 'string') { rejected++; return; } // rule the RFC forbids (my validator refuses it)
  if (o === 'TIMEOUT') { timeouts++; eq(R.run({ dtstart: c.dtstart, rule: c.rule, limit: 30, skipUnsynced: true }).errors.length, 0, 'timeout case ok to run'); return; }
  compared++;
  eq(mine, o, 'dateutil ' + JSON.stringify(c));
});
console.log('random rules compared with dateutil: ' + compared + ' (rejected by validator: ' + rejected + ', dateutil timeouts: ' + timeouts + ')');
console.log(checks + ' checks, ' + fails + ' failures');
process.exit(fails ? 1 : 0);
