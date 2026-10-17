/* ==========================================================================
   MODULE: VSA DATA ANALYZER
   ========================================================================== */
const VsaDataAnalyzer = (() => {

  function filterByDate(rows, dateKey) {
    if (!dateKey) return rows;
    return rows.filter(r => r.dateKey === dateKey);
  }

  function filterByArea(rows, area) {
    if (!area || area === 'ALL') return rows;
    return rows.filter(r => (r.area || '').toUpperCase() === area.toUpperCase());
  }

  function summarize(rows) {
    const total = rows.length;
    const yes = rows.filter(r => r.same === 'YES' || r.isMatch).length;
    const no = rows.filter(r => r.same === 'NO' || !r.isMatch).length;
    // rate uses only decided rows (yes+no); blanks already excluded upstream
    const decided = yes + no;
    const rate = decided ? yes / decided : null;
    const mismatchRows = rows.filter(r => r.same === 'NO' || !r.isMatch);
    return { total, yes, no, rate, mismatchRows, decided };
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

  function byArea(rows) {
    return groupBy(rows, r => r.area || 'Unknown');
  }

  function byRoute(rows) {
    return groupBy(rows, r => r.route || '—');
  }

  function byBranch(rows) {
    return groupBy(rows, r => r.shippingBranch || '—');
  }

  function byCarrier(rows) {
    return groupBy(rows, r => r.carrier || '—');
  }

  function byDate(rows) {
    const groups = groupBy(rows, r => r.dateKey);
    groups.sort((a, b) => a.key.localeCompare(b.key));
    return groups;
  }

  /** Size mismatch patterns: Planned → Actual counts (mismatches only) */
  function sizePatterns(mismatchRows) {
    const map = new Map();
    for (const r of mismatchRows) {
      const planned = r.plannedSize || '(blank)';
      const actual = r.actualSize || '(blank)';
      const key = planned + ' → ' + actual;
      if (!map.has(key)) map.set(key, { planned, actual, count: 0, samples: [] });
      const e = map.get(key);
      e.count += 1;
      if (e.samples.length < 3) {
        e.samples.push({ route: r.route, plate: r.plate, dateKey: r.dateKey });
      }
    }
    const out = Array.from(map.values());
    out.sort((a, b) => b.count - a.count);
    return out;
  }

  /** Top mismatch routes (sorted by NO count) */
  function topMismatchRoutes(rows, limit = 15) {
    const byR = byRoute(rows);
    return byR
      .filter(d => d.no > 0)
      .sort((a, b) => b.no - a.no || a.rate - b.rate)
      .slice(0, limit);
  }

  /** Compare two days: current vs previous */
  function compareDays(allRows, datePrev, dateLatest, areaFilter) {
    let base = allRows;
    if (areaFilter && areaFilter !== 'ALL') {
      base = filterByArea(allRows, areaFilter);
    }

    const prevRows = filterByDate(base, datePrev);
    const latestRows = filterByDate(base, dateLatest);
    const prev = summarize(prevRows);
    const latest = summarize(latestRows);

    const areaLatest = byArea(latestRows);
    const areaPrevMap = new Map(byArea(prevRows).map(d => [d.key, d]));
    const areaCompare = areaLatest.map(d => {
      const p = areaPrevMap.get(d.key);
      return {
        ...d,
        prevRate: p ? p.rate : null,
        rateDiff: p && d.rate != null && p.rate != null ? d.rate - p.rate : null,
        prevTotal: p ? p.total : 0
      };
    });

    const routeLatest = byRoute(latestRows);
    const routePrevMap = new Map(byRoute(prevRows).map(d => [d.key, d]));
    const routeCompare = routeLatest.map(d => {
      const p = routePrevMap.get(d.key);
      return {
        ...d,
        prevRate: p ? p.rate : null,
        rateDiff: p && d.rate != null && p.rate != null ? d.rate - p.rate : null
      };
    });

    const branchLatest = byBranch(latestRows);
    const carrierLatest = byCarrier(latestRows);

    return {
      prev,
      latest,
      datePrev,
      dateLatest,
      areaCompare,
      routeCompare,
      routes: routeLatest,
      branches: branchLatest,
      carriers: carrierLatest,
      history: byDate(base),
      mismatchDetail: latest.mismatchRows,
      sizePatterns: sizePatterns(latest.mismatchRows),
      topMismatchRoutes: topMismatchRoutes(latestRows),
      areaFilter: areaFilter || 'ALL'
    };
  }

  function listAreas(rows) {
    return Array.from(new Set(rows.map(r => r.area).filter(Boolean))).sort();
  }

  return {
    filterByDate,
    filterByArea,
    summarize,
    groupBy,
    byArea,
    byRoute,
    byBranch,
    byCarrier,
    byDate,
    sizePatterns,
    topMismatchRoutes,
    compareDays,
    listAreas
  };
})();
