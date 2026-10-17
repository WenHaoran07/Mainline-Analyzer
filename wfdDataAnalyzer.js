/* ==========================================================================
   MODULE: WFD DATA ANALYZER
   ========================================================================== */
const WfdDataAnalyzer = (() => {

  function filterByDate(rows, dateKey) {
    if (!dateKey) return rows;
    return rows.filter(r => r.dateKey === dateKey);
  }

  function filterByDc(rows, dc) {
    if (!dc || dc === 'ALL') return rows;
    return rows.filter(r => r.dcName === dc);
  }

  function summarize(rows) {
    const total = rows.length;
    const onTime = rows.filter(r => r.onTime).length;
    const late = total - onTime;
    const rate = total ? onTime / total : null;
    const intervals = rows.map(r => r.interval).filter(x => x != null && !isNaN(x));
    const avgWait = WfdUtils.avg(intervals);
    const lateRows = rows.filter(r => !r.onTime);
    return { total, onTime, late, rate, avgWait, lateRows };
  }

  function groupBy(rows, keyFn) {
    const map = new Map();
    for (const r of rows) {
      const k = keyFn(r) || 'Unknown';
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    }
    const out = [];
    for (const [key, list] of map.entries()) {
      const s = summarize(list);
      out.push({ key, ...s });
    }
    out.sort((a, b) => (b.total - a.total) || a.key.localeCompare(b.key));
    return out;
  }

  function byDc(rows) {
    return groupBy(rows, r => r.dcName);
  }

  function bySupervisor(rows) {
    return groupBy(rows, r => r.supervisor);
  }

  function byRoute(rows) {
    return groupBy(rows, r => r.routeName || '—');
  }

  function byCarrier(rows) {
    return groupBy(rows, r => r.carrier || '—');
  }

  function byDate(rows) {
    const groups = groupBy(rows, r => r.dateKey);
    groups.sort((a, b) => a.key.localeCompare(b.key));
    return groups;
  }

  /** Compare two days: current vs previous */
  function compareDays(allRows, datePrev, dateLatest) {
    const prevRows = filterByDate(allRows, datePrev);
    const latestRows = filterByDate(allRows, dateLatest);
    const prev = summarize(prevRows);
    const latest = summarize(latestRows);

    const dcLatest = byDc(latestRows);
    const dcPrevMap = new Map(byDc(prevRows).map(d => [d.key, d]));
    const dcCompare = dcLatest.map(d => {
      const p = dcPrevMap.get(d.key);
      return {
        ...d,
        prevRate: p ? p.rate : null,
        rateDiff: p && d.rate != null && p.rate != null ? d.rate - p.rate : null,
        prevTotal: p ? p.total : 0
      };
    });

    const supLatest = bySupervisor(latestRows);
    const supPrevMap = new Map(bySupervisor(prevRows).map(d => [d.key, d]));
    const supCompare = supLatest.map(d => {
      const p = supPrevMap.get(d.key);
      return {
        ...d,
        prevRate: p ? p.rate : null,
        rateDiff: p && d.rate != null && p.rate != null ? d.rate - p.rate : null
      };
    });

    return {
      prev,
      latest,
      datePrev,
      dateLatest,
      dcCompare,
      supCompare,
      routes: byRoute(latestRows),
      carriers: byCarrier(latestRows),
      history: byDate(allRows),
      lateDetail: latest.lateRows
    };
  }

  function listDcs(rows) {
    return Array.from(new Set(rows.map(r => r.dcName).filter(Boolean))).sort();
  }

  function listSupervisors(rows) {
    return Array.from(new Set(rows.map(r => r.supervisor).filter(Boolean))).sort();
  }

  return {
    filterByDate,
    filterByDc,
    summarize,
    groupBy,
    byDc,
    bySupervisor,
    byRoute,
    byCarrier,
    byDate,
    compareDays,
    listDcs,
    listSupervisors
  };
})();
