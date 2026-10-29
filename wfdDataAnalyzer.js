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
    // Expand dual supervisors so Cañon & Bongosia each appear (Sheet2)
    const map = new Map();
    for (const r of rows) {
      const names = (r.supervisors && r.supervisors.length)
        ? r.supervisors
        : [r.supervisor || 'Unassigned'];
      for (const name of names) {
        if (!map.has(name)) map.set(name, []);
        map.get(name).push(r);
      }
    }
    const out = [];
    for (const [key, list] of map.entries()) {
      out.push({ key, ...summarize(list) });
    }
    out.sort((a, b) => (b.total - a.total) || a.key.localeCompare(b.key));
    return out;
  }

  /**
   * Supervisor matrix (Excel Sheet2 style).
   * Cañon & Bongosia separate; shared trips counted for both.
   * dailyDetail holds total / onTime / late for hover tooltips.
   */
  function supervisorPerformanceMatrix(allRows, dates) {
    const dateList = (dates && dates.length) ? dates.slice() : byDate(allRows).map(d => d.key);
    dateList.sort();

    const stats = new Map(); // name -> { dateKey -> { total, onTime, late } }
    const ensure = (name) => {
      if (!stats.has(name)) stats.set(name, new Map());
      return stats.get(name);
    };

    for (const r of allRows) {
      const names = (r.supervisors && r.supervisors.length)
        ? r.supervisors
        : [r.supervisor || 'Unassigned'];
      for (const name of names) {
        const m = ensure(name);
        if (!m.has(r.dateKey)) m.set(r.dateKey, { total: 0, onTime: 0, late: 0 });
        const cell = m.get(r.dateKey);
        cell.total += 1;
        if (r.onTime) cell.onTime += 1;
        else cell.late += 1;
      }
    }

    const sluByDate = new Map();
    for (const r of allRows) {
      if (!sluByDate.has(r.dateKey)) sluByDate.set(r.dateKey, { total: 0, onTime: 0, late: 0 });
      const cell = sluByDate.get(r.dateKey);
      cell.total += 1;
      if (r.onTime) cell.onTime += 1;
      else cell.late += 1;
    }

    function buildRow(name, byDateMap) {
      const daily = {};
      const dailyDetail = {};
      let tot = 0, on = 0, late = 0;
      for (const d of dateList) {
        const c = byDateMap.get(d);
        if (c && c.total > 0) {
          daily[d] = c.onTime / c.total;
          dailyDetail[d] = { total: c.total, onTime: c.onTime, late: c.late };
          tot += c.total;
          on += c.onTime;
          late += c.late;
        } else {
          daily[d] = null;
          dailyDetail[d] = null;
        }
      }
      const accumulated = tot ? on / tot : null;
      const target = WfdUtils.supervisorTarget(name);
      const variance = accumulated != null ? accumulated - target : null;
      return {
        name, accumulated, target, variance, daily, dailyDetail,
        total: tot, onTime: on, late
      };
    }

    const named = Array.from(stats.keys()).filter(n => n !== 'Unassigned');
    const ordered = [];
    for (const n of WfdUtils.SUPERVISOR_ORDER) {
      if (n === 'SLU') continue;
      if (named.includes(n) || stats.has(n)) ordered.push(n);
    }
    for (const n of named.sort()) {
      if (!ordered.includes(n)) ordered.push(n);
    }

    const rows = ordered.map(n => buildRow(n, stats.get(n) || new Map()));
    rows.push(buildRow('SLU', sluByDate));
    return { dates: dateList, rows };
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
    supervisorPerformanceMatrix,
    listDcs,
    listSupervisors
  };
})();
