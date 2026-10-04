(function (root) {
  'use strict';
  var DAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
  var DAYNAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  var MONTHNAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var YEAR_CAP = 2400;

  // day numbers: days since 1970-01-01 (UTC arithmetic, no time zones)
  function dn(y, m, d) { return Math.round(Date.UTC(y, m - 1, d) / 86400000); }
  function ymd(n) { var t = new Date(n * 86400000); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }; }
  function dow(n) { return (((n + 3) % 7) + 7) % 7; } // 0=MO ... 6=SU (1970-01-01 was a Thursday)
  function leap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
  function dim(y, m) { return [31, leap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]; }
  function pad(x, k) { x = String(x); while (x.length < (k || 2)) x = '0' + x; return x; }
  function fmt(n) { var p = ymd(n); return p.y + '-' + pad(p.m) + '-' + pad(p.d); }

  function parseStart(s) {
    var m = /^\s*(\d{4})-?(\d{2})-?(\d{2})(?:[T ](\d{2}):?(\d{2})(?::?(\d{2}))?)?\s*$/.exec(s);
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > dim(y, mo)) return null;
    var hh = m[4] === undefined ? null : +m[4], mi = m[5] === undefined ? 0 : +m[5], ss = m[6] === undefined ? 0 : +m[6];
    if (hh !== null && (hh > 23 || mi > 59 || ss > 60)) return null;
    return { day: dn(y, mo, d), hh: hh, mi: mi, ss: ss, hasTime: hh !== null };
  }

  function parseRule(text) {
    var errors = [], warnings = [], r = { by: {} };
    var s = String(text).replace(/\r?\n[ \t]/g, '').replace(/^\s*RRULE[^:]*:/i, '').trim();
    if (!s) { errors.push('The rule is empty.'); return { errors: errors, warnings: warnings }; }
    var seen = {};
    s.split(';').forEach(function (part) {
      if (!part) return;
      var i = part.indexOf('=');
      if (i < 1) { errors.push('"' + part + '" is not NAME=VALUE.'); return; }
      var k = part.slice(0, i).toUpperCase(), v = part.slice(i + 1).toUpperCase();
      if (seen[k]) errors.push(k + ' appears twice. RFC 5545: each rule part MUST be specified only once.');
      seen[k] = true;
      function ints(lo, hi, name, allowNeg) {
        var out = [];
        v.split(',').forEach(function (x) {
          if (!/^[+-]?\d+$/.test(x)) { errors.push(name + ': "' + x + '" is not an integer.'); return; }
          var n = parseInt(x, 10);
          if (n === 0 || n < (allowNeg ? -hi : lo) || n > hi) errors.push(name + ': ' + x + ' is out of range (' + (allowNeg ? '-' + hi + '..-1 or ' : '') + lo + '..' + hi + ').');
          else out.push(n);
        });
        return out;
      }
      if (k === 'FREQ') {
        if (['SECONDLY', 'MINUTELY', 'HOURLY'].indexOf(v) >= 0) errors.push('FREQ=' + v + ' is not supported here: this tool works on whole days.');
        else if (['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].indexOf(v) < 0) errors.push('FREQ=' + v + ' is not a valid frequency.');
        else r.freq = v;
      } else if (k === 'INTERVAL') { if (!/^\d+$/.test(v) || +v < 1) errors.push('INTERVAL must be a positive integer.'); else r.interval = +v; }
      else if (k === 'COUNT') { if (!/^\d+$/.test(v) || +v < 1) errors.push('COUNT must be a positive integer.'); else r.count = +v; }
      else if (k === 'UNTIL') { var u = parseStart(v.replace(/Z$/, '')); if (!u) errors.push('UNTIL "' + v + '" is not a DATE or DATE-TIME like 19971224 or 19971224T000000Z.'); else { r.until = u; r.untilZ = /Z$/.test(v); } }
      else if (k === 'WKST') { var wi = DAYS.indexOf(v); if (wi < 0) errors.push('WKST=' + v + ' is not a weekday.'); else r.wkst = wi; }
      else if (k === 'BYMONTH') r.by.month = ints(1, 12, 'BYMONTH', false);
      else if (k === 'BYMONTHDAY') r.by.monthday = ints(1, 31, 'BYMONTHDAY', true);
      else if (k === 'BYYEARDAY') r.by.yearday = ints(1, 366, 'BYYEARDAY', true);
      else if (k === 'BYWEEKNO') r.by.weekno = ints(1, 53, 'BYWEEKNO', true);
      else if (k === 'BYSETPOS') r.by.setpos = ints(1, 366, 'BYSETPOS', true);
      else if (k === 'BYDAY') {
        r.by.day = [];
        v.split(',').forEach(function (x) {
          var m = /^([+-]?\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)$/.exec(x);
          if (!m) { errors.push('BYDAY: "' + x + '" is not a weekday like MO or 2TU or -1FR.'); return; }
          var n = m[1] ? parseInt(m[1], 10) : 0;
          if (m[1] && (n === 0 || n < -53 || n > 53)) { errors.push('BYDAY: ordinal ' + m[1] + ' is out of range (1..53 or -53..-1).'); return; }
          r.by.day.push({ n: n, d: DAYS.indexOf(m[2]) });
        });
      } else if (['BYHOUR', 'BYMINUTE', 'BYSECOND'].indexOf(k) >= 0) errors.push(k + ' is not supported here: this tool works on whole days, with the time of day taken from DTSTART.');
      else errors.push('Unknown rule part ' + k + '.');
    });
    if (!r.freq && !errors.length) errors.push('FREQ is required.');
    if (!seen.FREQ && errors.length) errors.unshift('FREQ is required.');
    if (r.count && r.until) errors.push('COUNT and UNTIL are both present. RFC 5545: they SHOULD NOT both be used, and results differ between apps.');
    var f = r.freq, b = r.by;
    if (b.monthday && f === 'WEEKLY') errors.push('BYMONTHDAY MUST NOT be used with FREQ=WEEKLY (RFC 5545 section 3.3.10).');
    if (b.yearday && f !== 'YEARLY') errors.push('BYYEARDAY MUST NOT be used with FREQ=' + f + '.');
    if (b.weekno && f !== 'YEARLY') errors.push('BYWEEKNO MUST NOT be used with FREQ=' + f + '.');
    if (b.day && f !== 'MONTHLY' && f !== 'YEARLY' && b.day.some(function (x) { return x.n; })) errors.push('A numbered BYDAY (like 2TU) is only allowed with FREQ=MONTHLY or FREQ=YEARLY.');
    if (b.day && f === 'YEARLY' && b.weekno && b.day.some(function (x) { return x.n; })) errors.push('A numbered BYDAY MUST NOT be used together with BYWEEKNO.');
    if (b.weekno && !b.day && !b.monthday && !b.yearday) errors.push('BYWEEKNO needs BYDAY (or BYMONTHDAY) here: with BYWEEKNO alone the RFC does not say which days of the week count, and libraries disagree.');
    if (b.setpos && !(b.month || b.weekno || b.yearday || b.monthday || b.day)) errors.push('BYSETPOS MUST be used with another BYxxx rule part.');
    r.interval = r.interval || 1; r.wkst = r.wkst === undefined ? 0 : r.wkst;
    return { rule: r, errors: errors, warnings: warnings };
  }

  function week1Start(y, wkst) {
    var j = dn(y, 1, 1), off = (dow(j) - wkst + 7) % 7; // days from week start to Jan 1
    var s = j - off;
    return (7 - off) >= 4 ? s : s + 7;
  }

  // opts.skipUnsynced: drop DTSTART when it does not match the rule (dateutil style)
  function expand(rule, start, limit, opts) {
    opts = opts || {};
    var by = rule.by, f = rule.freq, I = rule.interval, out = [], capped = false;
    var sp = ymd(start.day), startDow = dow(start.day);
    var tnum = function (day) { return day * 1000000 + (start.hasTime ? (start.hh * 10000 + start.mi * 100 + start.ss) : 0); };
    var untilNum = rule.until ? rule.until.day * 1000000 + (rule.until.hasTime ? (rule.until.hh * 10000 + rule.until.mi * 100 + rule.until.ss) : 235959) : null;
    if (rule.until && !rule.until.hasTime) untilNum = rule.until.day * 1000000 + 999999;
    var hasDayPart = !!(by.monthday || by.day || by.yearday || by.weekno);
    // defaults taken from DTSTART
    var dMonth = by.month, dMonthday = by.monthday, dDay = by.day;
    if (f === 'YEARLY' && !by.month && !by.weekno && !by.yearday && !by.monthday && !by.day) { dMonth = [sp.m]; dMonthday = [sp.d]; }
    else if (f === 'YEARLY' && by.month && !by.weekno && !by.yearday && !by.monthday && !by.day) { dMonthday = [sp.d]; }
    else if (f === 'MONTHLY' && !by.monthday && !by.day) { dMonthday = [sp.d]; }
    else if (f === 'WEEKLY' && !by.day) { dDay = [{ n: 0, d: startDow }]; }

    function matches(n, scopeMonthForDay) {
      var p = ymd(n), md = dim(p.y, p.m);
      if (dMonth && dMonth.indexOf(p.m) < 0) return false;
      if (dMonthday) {
        var ok = dMonthday.some(function (x) { return x > 0 ? x === p.d : (md + x + 1) === p.d; });
        if (!ok) return false;
      }
      if (by.yearday) {
        var yd = n - dn(p.y, 1, 1) + 1, ylen = leap(p.y) ? 366 : 365;
        if (!by.yearday.some(function (x) { return x > 0 ? x === yd : (ylen + x + 1) === yd; })) return false;
      }
      if (by.weekno) {
        var iy = p.y;
        if (n < week1Start(p.y, rule.wkst)) iy = p.y - 1; else if (n >= week1Start(p.y + 1, rule.wkst)) iy = p.y + 1;
        var w1 = week1Start(iy, rule.wkst), nextW1 = week1Start(iy + 1, rule.wkst);
        var wn = Math.floor((n - w1) / 7) + 1, nw = Math.floor((nextW1 - w1) / 7);
        if (!by.weekno.some(function (x) { return x > 0 ? x === wn : (nw + x + 1) === wn; })) return false;
      }
      if (dDay) {
        var wd = dow(n);
        var inMonthScope = f === 'MONTHLY' || (f === 'YEARLY' && !!by.month);
        var ok2 = dDay.some(function (x) {
          if (x.d !== wd) return false;
          if (!x.n) return true;
          if (inMonthScope) { var k = Math.floor((p.d - 1) / 7) + 1, kr = -(Math.floor((md - p.d) / 7) + 1); return x.n === k || x.n === kr; }
          var yd2 = n - dn(p.y, 1, 1), ylen2 = leap(p.y) ? 366 : 365;
          var k2 = Math.floor(yd2 / 7) + 1, kr2 = -(Math.floor((ylen2 - 1 - yd2) / 7) + 1);
          return x.n === k2 || x.n === kr2;
        });
        if (!ok2) return false;
      }
      return true;
    }

    function periodDays(k) {
      var days = [], y, m, i;
      if (f === 'YEARLY') { y = sp.y + k * I; if (y > YEAR_CAP) return null; var a = dn(y, 1, 1), b = dn(y + 1, 1, 1); for (i = a; i < b; i++) days.push(i); }
      else if (f === 'MONTHLY') { var idx = sp.y * 12 + (sp.m - 1) + k * I; y = Math.floor(idx / 12); m = idx % 12 + 1; if (y > YEAR_CAP) return null; for (i = 1; i <= dim(y, m); i++) days.push(dn(y, m, i)); }
      else if (f === 'WEEKLY') { var ws = start.day - ((startDow - rule.wkst + 7) % 7) + 7 * I * k; if (ymd(ws).y > YEAR_CAP) return null; for (i = 0; i < 7; i++) { if (k === 0 && ws + i < start.day) continue; days.push(ws + i); } }
      else { var d0 = start.day + k * I; if (ymd(d0).y > YEAR_CAP) return null; days.push(d0); }
      return days;
    }

    var count = 0, k = 0, emptyRun = 0, first = true, startMatched = false;
    var needFirst = !opts.skipUnsynced; // RFC: DTSTART is always the first instance
    if (needFirst) { out.push(start.day); count = 1; }
    outer:
    for (k = 0; ; k++) {
      var days = periodDays(k);
      if (days === null) { capped = true; break; }
      var hits = days.filter(function (n) { return matches(n); });
      if (by.setpos) {
        var sel = [];
        by.setpos.forEach(function (x) { var i = x > 0 ? x - 1 : hits.length + x; if (i >= 0 && i < hits.length) sel.push(hits[i]); });
        sel.sort(function (a, b) { return a - b; });
        hits = sel.filter(function (v, i) { return sel.indexOf(v) === i; });
      }
      for (var h = 0; h < hits.length; h++) {
        var n = hits[h];
        if (n < start.day) continue;
        if (n === start.day && needFirst) { startMatched = true; continue; } // already added
        if (untilNum !== null && tnum(n) > untilNum) { break outer; }
        out.push(n); count++;
        if (rule.count && count >= rule.count) break outer;
        if (out.length >= limit) { break outer; }
      }
      if (untilNum !== null) { var lastDay = days[days.length - 1]; if (tnum(lastDay) > untilNum && !days.some(function (x) { return x >= start.day; })) { } }
      if (out.length >= limit) break;
      // stop once the period lies wholly after UNTIL
      if (untilNum !== null && tnum(days[0]) > untilNum) break;
    }
    // with RFC-style DTSTART, honour COUNT/UNTIL for the first item
    if (needFirst && rule.until && tnum(start.day) > untilNum) out = [];
    out.sort(function (a, b) { return a - b; });
    var uniq = out.filter(function (v, i) { return out.indexOf(v) === i; });
    if (rule.count) uniq = uniq.slice(0, rule.count);
    // synchronisation: does DTSTART itself match the rule?
    var synced = (function () {
      var ds = periodDaysFor0();
      return ds;
      function periodDaysFor0() { var days0 = periodDays(0); var hs = days0.filter(function (x) { return matches(x); }); if (by.setpos) { var sel = []; by.setpos.forEach(function (x) { var i = x > 0 ? x - 1 : hs.length + x; if (i >= 0 && i < hs.length) sel.push(hs[i]); }); hs = sel; } return hs.indexOf(start.day) >= 0; }
    })();
    return { days: uniq, capped: capped && uniq.length < limit && !rule.count && untilNum === null ? true : (capped && uniq.length < (rule.count || limit)), synced: synced };
  }

  function listJoin(a) { return a.length < 3 ? a.join(' and ') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
  function ord(n) { var s = ['th', 'st', 'nd', 'rd'], v = Math.abs(n) % 100; var o = n + (s[(v - 20) % 10] || s[v] || s[0]); return n < 0 ? (n === -1 ? 'last' : (-n) + (s[(Math.abs(n) - 20) % 10] || s[Math.abs(n)] || s[0]) + ' to last') : o; }
  function describe(rule, start) {
    var f = rule.freq, I = rule.interval, by = rule.by, parts = [];
    var unit = { DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month', YEARLY: 'year' }[f];
    parts.push(I === 1 ? 'Every ' + unit : 'Every ' + I + ' ' + unit + 's');
    if (by.setpos) parts.push('taking the ' + listJoin(by.setpos.map(ord)) + ' match in each ' + unit);
    if (by.day) parts.push('on ' + listJoin(by.day.map(function (x) { return (x.n ? ord(x.n) + ' ' : '') + DAYNAMES[x.d]; })));
    if (by.monthday) parts.push('on the ' + listJoin(by.monthday.map(function (x) { return x === -1 ? 'last day' : ord(x) + (x < 0 ? ' day' : ''); })) + ' of the month');
    if (by.yearday) parts.push('on year day ' + by.yearday.join(', '));
    if (by.weekno) parts.push('in week ' + by.weekno.join(', ') + ' of the year (weeks start on ' + DAYNAMES[rule.wkst] + ')');
    if (by.month) parts.push('in ' + listJoin(by.month.map(function (m) { return MONTHNAMES[m - 1]; })));
    if (f === 'WEEKLY' && !by.day) parts.push('on ' + DAYNAMES[dow(start.day)] + ' (from DTSTART)');
    if (f === 'MONTHLY' && !by.day && !by.monthday) parts.push('on day ' + ymd(start.day).d + ' of the month (from DTSTART)');
    if (f === 'YEARLY' && !by.month && !by.day && !by.monthday && !by.yearday && !by.weekno) parts.push('on ' + MONTHNAMES[ymd(start.day).m - 1] + ' ' + ymd(start.day).d + ' (from DTSTART)');
    if (rule.count) parts.push('for ' + rule.count + ' occurrence' + (rule.count > 1 ? 's' : ''));
    if (rule.until) parts.push('until ' + fmt(rule.until.day));
    return parts.join(', ');
  }

  function notes(rule, start, res, skipUnsynced) {
    var out = [], by = rule.by, f = rule.freq, sp = ymd(start.day);
    if (!res.synced) out.push('DTSTART (' + fmt(start.day) + ') does not match this rule. RFC 5545 still counts DTSTART as the first instance; some libraries (Python dateutil) drop it. This tool ' + (skipUnsynced ? 'is skipping it (library style).' : 'includes it (RFC style).'));
    var md = (by.monthday || []).concat(f === 'MONTHLY' && !by.day && !by.monthday ? [sp.d] : []);
    if ((f === 'MONTHLY' || (f === 'YEARLY' && by.month)) && md.some(function (x) { return x > 28; })) out.push('A day number above 28 is skipped in shorter months (RFC 5545: invalid dates are ignored, not moved to the last day). For "last day of the month" use BYMONTHDAY=-1.');
    if (f === 'YEARLY' && !by.month && !by.day && !by.monthday && !by.yearday && !by.weekno && sp.m === 2 && sp.d === 29) out.push('Starting on February 29 means the event happens only in leap years.');
    if (f === 'WEEKLY' && rule.interval > 1 && by.day && by.day.length > 1) out.push('With INTERVAL above 1 and several BYDAY days, WKST decides which days share a week; the RFC has an example where changing WKST moves the dates. WKST here is ' + DAYS[rule.wkst] + (rule.wkst === 0 ? ' (the default).' : '.'));
    if (by.setpos && f === 'WEEKLY') out.push('In the first, partial week, BYSETPOS positions count from DTSTART (Python dateutil does this; the RFC does not say).');
    if (by.setpos) out.push('BYSETPOS picks from the matches inside each ' + { DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month', YEARLY: 'year' }[f] + ', after the other BYxxx parts have been applied.');
    if (by.monthday && by.day && f === 'MONTHLY') out.push('Both BYMONTHDAY and BYDAY are present, so they are combined as a filter (both must hold), for example the 13th that is also a Friday. Without BYMONTHDAY, BYDAY would expand to all those weekdays.');
    if (rule.count && rule.until) out.push('COUNT and UNTIL together: apps differ on which one wins.');
    if (res.capped) out.push('Stopped at the year ' + YEAR_CAP + ' limit: this rule yields fewer dates than requested, possibly none (for example a day that never exists, such as February 30).');
    out.push('Time zones and daylight saving are not modelled: every occurrence keeps the same clock time as DTSTART.');
    return out;
  }

  function run(input) {
    var start = parseStart(input.dtstart || '');
    var pr = parseRule(input.rule || '');
    var errs = pr.errors.slice();
    if (!start) errs.unshift('DTSTART must look like 19970902T090000, 19970902 or 1997-09-02.');
    if (errs.length) return { errors: errs };
    var rule = pr.rule;
    if (rule.until && start.hasTime !== rule.until.hasTime) pr.warnings.push('UNTIL and DTSTART should have the same value type (both dates or both date-times); the comparison below uses the clock time as written.');
    var limit = Math.min(Math.max(input.limit || 20, 1), 500);
    var res = expand(rule, start, limit, { skipUnsynced: !!input.skipUnsynced });
    var time = start.hasTime ? ' ' + pad(start.hh) + ':' + pad(start.mi) + (start.ss ? ':' + pad(start.ss) : '') : '';
    return {
      errors: [], description: describe(rule, start), rule: rule, start: start,
      dates: res.days, shown: res.days.map(function (n) { var p = ymd(n); return { iso: fmt(n), weekday: DAYNAMES[dow(n)], text: DAYNAMES[dow(n)].slice(0, 3) + ' ' + p.d + ' ' + MONTHNAMES[p.m - 1].slice(0, 3) + ' ' + p.y + time }; }),
      notes: notes(rule, start, res, !!input.skipUnsynced).concat(pr.warnings), synced: res.synced, capped: res.capped,
      moreMayExist: !rule.count && !rule.until && res.days.length >= limit
    };
  }
  var api = { run: run, parseRule: parseRule, parseStart: parseStart, expand: expand, fmt: fmt, dn: dn, ymd: ymd, dow: dow, week1Start: week1Start };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RruleWhy = api;
})(typeof window !== 'undefined' ? window : this);
