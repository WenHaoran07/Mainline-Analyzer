/* ==========================================================================
   MODULE: BT DATA ANALYZER
   ========================================================================== */
const BtDataAnalyzer = (() => {

  function filterRows(rows, filters) {
    if (!rows) return [];
    let out = rows;
    if (filters.month && filters.month !== 'ALL') {
      out = out.filter(r => r.month === filters.month);
    }
    if (filters.trucker && filters.trucker !== 'ALL') {
      out = out.filter(r => r.trucker === filters.trucker);
    }
    if (filters.reasonGroup && filters.reasonGroup !== 'ALL') {
      out = out.filter(r => r.reasonGroup === filters.reasonGroup);
    }
    if (filters.status && filters.status !== 'ALL') {
      out = out.filter(r => r.status === filters.status);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      out = out.filter(r =>
        (r.plate || '').toLowerCase().includes(q) ||
        (r.trucker || '').toLowerCase().includes(q) ||
        (r.taskPlan || '').toLowerCase().includes(q) ||
        (r.destination || '').toLowerCase().includes(q) ||
        (r.location || '').toLowerCase().includes(q) ||
        (r.reason || '').toLowerCase().includes(q) ||
        (r.rescue || '').toLowerCase().includes(q)
      );
    }
    // Backload filter: ALL | FORWARD | BACKLOAD (also accepts legacy excludeBackload / backloadOnly)
    const bl = filters.backload || (filters.backloadOnly ? 'BACKLOAD' : (filters.excludeBackload ? 'FORWARD' : 'ALL'));
    if (bl === 'BACKLOAD') {
      out = out.filter(r => r.isBackload);
    } else if (bl === 'FORWARD') {
      out = out.filter(r => !r.isBackload);
    }
    return out;
  }

  function summarize(rows) {
    const total = rows.length;
    const withDt = rows.filter(r => r.downtimeHrs != null && !isNaN(r.downtimeHrs));
    const totalHours = withDt.reduce((s, r) => s + r.downtimeHrs, 0);
    const avgHours = withDt.length ? totalHours / withDt.length : null;
    const transfers = rows.filter(r => /transfer/i.test(r.status)).length;
    const repairs = rows.filter(r => /repair/i.test(r.status)).length;
    const accidents = rows.filter(r => r.reasonGroup === 'Accident').length;
    return { total, totalHours, avgHours, transfers, repairs, accidents, withDtCount: withDt.length };
  }

  function byMonth(rows) {
    const map = new Map();
    for (const r of rows) {
      const m = r.month || 'Unknown';
      if (!map.has(m)) map.set(m, []);
      map.get(m).push(r);
    }
    const out = [];
    for (const m of BtUtils.MONTH_ORDER) {
      if (map.has(m)) {
        const list = map.get(m);
        out.push({ key: m, ...summarize(list), rows: list });
      }
    }
    // any extra months
    for (const [m, list] of map) {
      if (!BtUtils.MONTH_ORDER.includes(m)) {
        out.push({ key: m, ...summarize(list), rows: list });
      }
    }
    return out;
  }

  function groupBy(rows, keyFn, limit) {
    const map = new Map();
    for (const r of rows) {
      const k = keyFn(r) || 'Unknown';
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    }
    let out = [];
    for (const [key, list] of map.entries()) {
      out.push({ key, ...summarize(list), rows: list });
    }
    out.sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
    if (limit && out.length > limit) {
      const top = out.slice(0, limit);
      const rest = out.slice(limit);
      const otherRows = rest.flatMap(x => x.rows);
      top.push({ key: 'Other', ...summarize(otherRows), rows: otherRows });
      out = top;
    }
    return out;
  }

  function uniqueValues(rows, key) {
    const set = new Set();
    rows.forEach(r => {
      const v = r[key];
      if (v) set.add(v);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }

  function buildOverview(rows) {
    const overall = summarize(rows);
    const monthly = byMonth(rows);
    const byTrucker = groupBy(rows, r => r.trucker, 12);
    const byReason = groupBy(rows, r => r.reasonGroup, 10);
    const byStatus = groupBy(rows, r => r.status);
    const truckers = uniqueValues(rows, 'trucker');
    const reasons = uniqueValues(rows, 'reasonGroup');
    const statuses = uniqueValues(rows, 'status');
    return { overall, monthly, byTrucker, byReason, byStatus, truckers, reasons, statuses };
  }

  /**
   * Plates that broke at least minTimes (default 2).
   * Returns array sorted by count desc.
   */
  function repeatOffenders(rows, minTimes) {
    const min = Math.max(2, parseInt(minTimes, 10) || 2);
    const map = new Map();
    for (const r of rows) {
      const plate = (r.plate || '').toString().trim().toUpperCase();
      if (!plate || plate === '—' || plate === 'N/A') continue;
      if (!map.has(plate)) map.set(plate, []);
      map.get(plate).push(r);
    }
    const out = [];
    for (const [plate, list] of map.entries()) {
      if (list.length < min) continue;
      const truckers = Array.from(new Set(list.map(r => r.trucker).filter(Boolean)));
      const months = [];
      const monthSet = new Set();
      for (const m of BtUtils.MONTH_ORDER) {
        if (list.some(r => r.month === m)) {
          months.push(m.slice(0, 3));
          monthSet.add(m);
        }
      }
      list.forEach(r => {
        if (r.month && !monthSet.has(r.month) && !BtUtils.MONTH_ORDER.includes(r.month)) {
          months.push(r.month.slice(0, 3));
          monthSet.add(r.month);
        }
      });
      const reasonMap = new Map();
      list.forEach(r => {
        const k = r.reasonGroup || r.reason || 'Unknown';
        reasonMap.set(k, (reasonMap.get(k) || 0) + 1);
      });
      let topReason = '—';
      let topN = 0;
      reasonMap.forEach((n, k) => {
        if (n > topN) { topN = n; topReason = k; }
      });
      const sorted = list.slice().sort((a, b) => {
        const da = a.dateKey || '';
        const db = b.dateKey || '';
        return db.localeCompare(da);
      });
      const last = sorted[0];
      const withDt = list.filter(r => r.downtimeHrs != null && !isNaN(r.downtimeHrs));
      const totalHours = withDt.reduce((s, r) => s + r.downtimeHrs, 0);
      const avgHours = withDt.length ? totalHours / withDt.length : null;
      out.push({
        plate,
        times: list.length,
        truckers,
        truckerLabel: truckers.join(', ') || '—',
        months,
        monthLabel: months.join(', ') || '—',
        totalHours,
        avgHours,
        topReason,
        lastDate: last ? (last.dateKey || '—') : '—',
        lastReason: last ? (last.reason || last.reasonGroup || '—') : '—',
        rows: list
      });
    }
    out.sort((a, b) => b.times - a.times || a.plate.localeCompare(b.plate));
    return out;
  }

  return {
    filterRows, summarize, byMonth, groupBy, uniqueValues, buildOverview, repeatOffenders
  };
})();
