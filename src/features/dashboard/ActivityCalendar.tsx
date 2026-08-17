import { useMemo, useState } from 'react';
import { heatmapWeeks, heatLevel } from '../../lib/stats';

const WEEKDAY = ['', 'Mon', '', 'Wed', '', 'Fri', ''];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * A dated activity calendar — a contribution grid that actually tells you the
 * date. Month labels sit above the week each month begins, weekday labels run
 * down the side, every cell names its real date and count on hover, and today
 * carries a ring. Columns are weeks (Sun→Sat), oldest on the left.
 */
export default function ActivityCalendar({
  activity,
  weeks = 26,
}: {
  activity: Record<string, number>;
  weeks?: number;
}) {
  const cols = useMemo(() => heatmapWeeks(activity, weeks), [activity, weeks]);
  const todayKey = new Date().toISOString().slice(0, 10);
  const [hover, setHover] = useState<{ text: string; x: number; y: number } | null>(null);

  // a month label sits over the first column whose first day is in a new month
  const monthLabels = cols.map((col, i) => {
    const first = col[0]?.date;
    if (!first) return '';
    const prev = cols[i - 1]?.[0]?.date;
    if (i === 0 || (prev && prev.getMonth() !== first.getMonth())) return MONTHS[first.getMonth()];
    return '';
  });

  const total = useMemo(
    () => Object.values(activity).reduce((a, b) => a + b, 0),
    [activity]
  );
  const activeDays = useMemo(() => Object.values(activity).filter((v) => v > 0).length, [activity]);

  return (
    <div className="acal">
      <div className="acal-scroll">
        <div className="acal-grid" style={{ gridTemplateColumns: `28px repeat(${cols.length}, 1fr)` }}>
          {/* month header row */}
          <div className="acal-corner" />
          {monthLabels.map((m, i) => (
            <div className="acal-month" key={i}>
              {m}
            </div>
          ))}

          {/* seven weekday rows */}
          {WEEKDAY.map((label, row) => (
            <div className="acal-week-row" key={row} style={{ display: 'contents' }}>
              <div className="acal-wd">{label}</div>
              {cols.map((col, ci) => {
                const cell = col[row];
                if (!cell) return <div key={ci} className="acal-cell empty" />;
                const lvl = heatLevel(cell.count);
                const isToday = cell.key === todayKey;
                const isFuture = cell.date.getTime() > Date.now();
                const dateText = cell.date.toLocaleDateString('en-GB', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                });
                return (
                  <div
                    key={ci}
                    className={`acal-cell lvl-${lvl}${isToday ? ' today' : ''}${isFuture ? ' future' : ''}`}
                    onMouseEnter={(e) => {
                      const r = (e.target as HTMLElement).getBoundingClientRect();
                      const host = (e.currentTarget.closest('.acal') as HTMLElement).getBoundingClientRect();
                      setHover({
                        text: isFuture
                          ? dateText
                          : `${dateText} · ${cell.count} review${cell.count === 1 ? '' : 's'}`,
                        x: r.left - host.left + r.width / 2,
                        y: r.top - host.top,
                      });
                    }}
                    onMouseLeave={() => setHover(null)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {hover && (
        <div className="acal-tip" style={{ left: hover.x, top: hover.y }}>
          {hover.text}
        </div>
      )}

      <div className="acal-foot">
        <span>
          {total.toLocaleString('en-GB')} reviews · {activeDays} active {activeDays === 1 ? 'day' : 'days'}
        </span>
        <span className="acal-legend">
          Less
          {[0, 1, 2, 3, 4].map((l) => (
            <i className={`acal-cell lvl-${l}`} key={l} />
          ))}
          More
        </span>
      </div>
    </div>
  );
}
