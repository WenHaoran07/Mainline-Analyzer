/* ==========================================================================
   MODULE: MTT DATA ANALYZER (metrics & comparisons)
   ========================================================================== */
const MttDataAnalyzer = (() => {
  const {
    stats, groupBy, applyRouteFilter, targetForFilter, labelForFilter,
    TARGET_LUZON, TARGET_VISMIN
  } = MttUtils;

  function buildCompareRows(prev, latest, keyFn) {
    const prevMap = groupBy(prev, keyFn);
    const latestMap = groupBy(latest, keyFn);
    const keys = new Set([...Object.keys(prevMap), ...Object.keys(latestMap)]);
    return [...keys].map(key => {
      const st = stats(latestMap[key] || []);
      const stPrev = stats(prevMap[key] || []);
      const sample = (latestMap[key] && latestMap[key][0]) || (prevMap[key] && prevMap[key][0]);
      return {
        key,
        total: st.total,
        yes: st.yes,
        no: st.no,
        rate: st.rate,
        prevRate: stPrev.rate,
        delta: (st.rate != null && stPrev.rate != null) ? st.rate - stPrev.rate : null,
        type: sample ? sample.routeType : 'OTHER',
        region: sample ? sample.region : '',
        target: sample && sample.routeType === 'VISMIN' ? TARGET_VISMIN : TARGET_LUZON
      };
    }).filter(r => r.total > 0).sort((a, b) => (b.no - a.no) || ((a.rate ?? 1) - (b.rate ?? 1)));
  }

  function compute(datePrev, dateLatest, routeFilter, storedRows, storedDates) {
    if (!routeFilter) routeFilter = 'ALL';
    const allRows = storedRows || [];
    const rows = applyRouteFilter(allRows, routeFilter);
    const prev = rows.filter(r => r.dateKey === datePrev);
    const latest = rows.filter(r => r.dateKey === dateLatest);
    const target = targetForFilter(routeFilter);
    const targetPct = Math.round(target * 100);
    const filterLabel = labelForFilter(routeFilter);

    const prevAll = allRows.filter(r => r.dateKey === datePrev);
    const latestAll = allRows.filter(r => r.dateKey === dateLatest);
    const overall = stats(latest);
    const overallPrev = stats(prev);
    const luzon = stats(latestAll.filter(r => r.routeType === 'LUZON'));
    const luzonPrev = stats(prevAll.filter(r => r.routeType === 'LUZON'));
    const vismin = stats(latestAll.filter(r => r.routeType === 'VISMIN'));
    const visminPrev = stats(prevAll.filter(r => r.routeType === 'VISMIN'));

    const rateDiff = (overall.rate != null && overallPrev.rate != null) ? overall.rate - overallPrev.rate : null;

    const lateTrips = latest.filter(r => r.onTime === 'NO');
    const lateByRegion = groupBy(lateTrips, r => r.region);
    const regionLateList = Object.entries(lateByRegion).map(([reg, list]) => {
      const st = stats(latest.filter(r => r.region === reg));
      return { region: reg, late: list.length, total: st.total, rate: st.rate };
    }).sort((a, b) => b.late - a.late);

    const lateByRoute = groupBy(lateTrips, r => r.route);
    const routeLateList = Object.entries(lateByRoute).map(([route, list]) => {
      const sample = list[0];
      const st = stats(latest.filter(r => r.route === route));
      return { route, late: list.length, total: st.total, rate: st.rate, region: sample.region, type: sample.routeType };
    }).sort((a, b) => b.late - a.late);

    const regRows = buildCompareRows(prev, latest, r => r.region);
    const dcRows = buildCompareRows(prev, latest, r => r.dcIntended);
    const tRows = buildCompareRows(prev, latest, r => r.trucker);
    const routeRows = buildCompareRows(prev, latest, r => r.route);

    const lateDetail = lateTrips.map(r => ({
      taskId: r.taskId || '',
      route: r.route,
      type: r.routeType,
      region: r.region,
      trucker: r.trucker,
      dc: r.dcIntended,
      actualTT: r.actualTT,
      planTT: r.planTT,
      overrun: Math.max(0, (r.actualTT || 0) - (r.planTT || 0))
    })).sort((a, b) => b.overrun - a.overrun);

    const histDates = (storedDates || []).slice(-14);
    const histRows = histDates.map(d => {
      const day = rows.filter(r => r.dateKey === d);
      const o = stats(day);
      return { date: d, total: o.total, rate: o.rate, late: o.no };
    });

    // Parallel history for Graphs tab (always Overall / Luzon / VisMin)
    function histFor(typeFilter) {
      return histDates.map(d => {
        let day = allRows.filter(r => r.dateKey === d);
        if (typeFilter === 'LUZON') day = day.filter(r => r.routeType === 'LUZON');
        if (typeFilter === 'VISMIN') day = day.filter(r => r.routeType === 'VISMIN');
        const o = stats(day);
        return { date: d, total: o.total, rate: o.rate, late: o.no };
      });
    }
    const histOverall = histFor('ALL');
    const histLuzon = histFor('LUZON');
    const histVismin = histFor('VISMIN');

    function forecastFrom(hist, targetVal) {
      const pts = hist.filter(h => h.rate != null && h.total > 0);
      if (pts.length < 2) {
        return { predictedRate: null, risk: 'unknown', trend: 'flat', sample: pts.length };
      }
      const use = pts.slice(-7);
      const n = use.length;
      let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
      use.forEach((p, i) => {
        sumX += i; sumY += p.rate; sumXY += i * p.rate; sumXX += i * i;
      });
      const denom = n * sumXX - sumX * sumX;
      const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
      const intercept = (sumY - slope * sumX) / n;
      const predicted = intercept + slope * n;
      const predictedRate = Math.max(0, Math.min(1, predicted));
      const recentAvg = use.reduce((s, p) => s + p.rate, 0) / n;
      let risk = 'low';
      if (predictedRate < targetVal - 0.05 || recentAvg < targetVal - 0.03) risk = 'high';
      else if (predictedRate < targetVal || recentAvg < targetVal) risk = 'medium';
      const trend = slope < -0.005 ? 'down' : slope > 0.005 ? 'up' : 'flat';
      return {
        predictedRate, recentAvg, slope, risk, trend, sample: n,
        lastRate: use[use.length - 1].rate,
        lastLate: use[use.length - 1].late
      };
    }

    const forecast = {
      overall: forecastFrom(histOverall, 0.96),
      luzon: forecastFrom(histLuzon, 0.97),
      vismin: forecastFrom(histVismin, 0.85),
      focusDate: dateLatest
    };

    return {
      datePrev, dateLatest, routeFilter, filterLabel, target, targetPct,
      overall, overallPrev, luzon, luzonPrev, vismin, visminPrev, rateDiff,
      regionLateList, routeLateList, regRows, dcRows, tRows, routeRows,
      lateDetail, histRows,
      histOverall, histLuzon, histVismin, forecast
    };
  }

  return { compute, buildCompareRows };
})();
