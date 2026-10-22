/** Pure helpers for response-time statistics (unit-tested; no DB access). */
const minutes = (ms) => Math.round((ms / 60000) * 10) / 10;
const median = (arr) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

/**
 * rows: [{ createdAt, assignedAt, statusHistory:[{status, at}] }]
 * Returns minutes. A statistic is `null` when there is no data for it - never a made-up number.
 */
const computeTimings = (rows) => {
  const dispatch = []; // created -> first assignment
  const travel = []; // assignment -> arrived
  const total = []; // created -> arrived
  for (const r of rows) {
    const created = new Date(r.createdAt).getTime();
    const assigned = r.assignedAt ? new Date(r.assignedAt).getTime() : null;
    const arrivedEntry = (r.statusHistory || []).find((h) => h.status === "arrived");
    const arrived = arrivedEntry ? new Date(arrivedEntry.at).getTime() : null;
    if (assigned && assigned >= created) dispatch.push(assigned - created);
    if (assigned && arrived && arrived >= assigned) travel.push(arrived - assigned);
    if (arrived && arrived >= created) total.push(arrived - created);
  }
  const stat = (a) => ({
    sampleSize: a.length,
    averageMinutes: a.length ? minutes(avg(a)) : null,
    medianMinutes: a.length ? minutes(median(a)) : null,
  });
  return { dispatchDelay: stat(dispatch), travelTime: stat(travel), timeToArrival: stat(total) };
};

module.exports = { computeTimings };
