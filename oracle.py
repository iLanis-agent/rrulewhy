import json, sys, signal
from datetime import datetime
from dateutil.rrule import rrulestr
class TO(Exception): pass
def h(*a): raise TO()
signal.signal(signal.SIGALRM, h)
cases = json.load(sys.stdin)
out = []
for c in cases:
    ds = c['dtstart']
    start = datetime(int(ds[0:4]), int(ds[4:6]), int(ds[6:8]), int(ds[9:11]), int(ds[11:13]), int(ds[13:15]))
    try:
        signal.setitimer(signal.ITIMER_REAL, 0.3)
        r = rrulestr('RRULE:' + c['rule'], dtstart=start)
        res = []
        for d in r:
            if d.year > 2400 or len(res) >= c['limit']:
                break
            res.append(d.strftime('%Y-%m-%d'))
        signal.setitimer(signal.ITIMER_REAL, 0)
        out.append(res)
    except TO:
        out.append('TIMEOUT')
    except Exception as e:
        signal.setitimer(signal.ITIMER_REAL, 0)
        out.append('ERR ' + str(e))
json.dump(out, sys.stdout)
