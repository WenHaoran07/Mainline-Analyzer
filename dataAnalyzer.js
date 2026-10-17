/* ==========================================================================
   MODULE: DATA ANALYZER & MATHEMATICAL ENGINE
   ========================================================================== */
const DataAnalyzer = (() => {
  function isTargetGroup(routeCode, filterType) {
    if (filterType === 'ALL') return true;
    const parts = String(routeCode || '').split('-');
    if (parts.length < 2) return true;
    
    const destCode = parseInt(parts[parts.length - 1], 10);
    if (isNaN(destCode)) return true;

    const isVisMin = (destCode >= 300 && destCode <= 399) ||
                     (destCode >= 500 && destCode <= 599) ||
                     (destCode >= 600 && destCode <= 699) ||
                     (destCode >= 800 && destCode <= 899);

    return filterType === 'VISMIN' ? isVisMin : !isVisMin;
  }

  function isTargetBranch(rowBranch, selectedBranchesArray) {
    if (!selectedBranchesArray || selectedBranchesArray.length === 0) return true;
    return selectedBranchesArray.includes(String(rowBranch || '').trim());
  }

  function groupBy(arr, keyFn) {
    const map = {};
    arr.forEach(r => {
      const k = keyFn(r) || '(blank)';
      if (!map[k]) map[k] = [];
      map[k].push(r);
    });
    return map;
  }

  function computeDailyTrend(slu, colMap, selectedBranchesArray = []) {
    const getLT = r => parseFloat(r[colMap.lt]) || 0;

    const filteredSlu = slu.filter(r => isTargetBranch(r[colMap.branch], selectedBranchesArray));

    const dates = [...new Set(slu.map(r => String(r[colMap.date]).substring(0, 10)))]
      .filter(d => d && d !== 'null' && d !== 'undefined').sort();

    const branchMap = groupBy(filteredSlu, r => r[colMap.branch]);
    const branchNames = Object.keys(branchMap).sort();

    const dcCodeMap = {};
    if (typeof dcMasterData !== 'undefined') {
      dcMasterData.forEach(item => {
        dcCodeMap[item["DC NAME"].toLowerCase().trim()] = item["DC CODE"];
        dcCodeMap[item["LOCATION / AREA"].toLowerCase().trim()] = item["DC CODE"];
      });
    }

    let globalMin = Infinity;
    let globalMax = -Infinity;

    const rows = branchNames.map(bName => {
      const rowsForBranch = branchMap[bName];
      const totalSum = rowsForBranch.reduce((s, r) => s + getLT(r), 0);
      const accumulated = rowsForBranch.length ? (totalSum / rowsForBranch.length) : 0;

      const cleanBranch = bName.toLowerCase().trim();
      const dcCode = dcCodeMap[cleanBranch] || '—';

      const dailyMapByDate = groupBy(rowsForBranch, r => String(r[colMap.date]).substring(0, 10));
      const daily = {};

      dates.forEach(d => {
        const dayRows = dailyMapByDate[d];
        if (dayRows && dayRows.length > 0) {
          const dayAvg = dayRows.reduce((s, r) => s + getLT(r), 0) / dayRows.length;
          daily[d] = dayAvg;

          if (dayAvg < globalMin) globalMin = dayAvg;
          if (dayAvg > globalMax) globalMax = dayAvg;
        } else {
          daily[d] = null;
        }
      });

      return { branch: bName, dcCode, accumulated, daily };
    });

    return { dates, rows, globalMin: globalMin === Infinity ? 0 : globalMin, globalMax: globalMax === -Infinity ? 0 : globalMax };
  }

  function computeMetrics(slu, colMap, datePrev, dateLatest, routeGroup = 'ALL', selectedBranchesArray = []) {
    const getLT = r => parseFloat(r[colMap.lt]) || 0;
    const getPkgs = r => parseFloat(r[colMap.pkgs]) || 0;

    const prev = slu.filter(r => 
      String(r[colMap.date]).startsWith(datePrev) && 
      isTargetGroup(r[colMap.route], routeGroup) &&
      isTargetBranch(r[colMap.branch], selectedBranchesArray)
    );

    const latest = slu.filter(r => 
      String(r[colMap.date]).startsWith(dateLatest) && 
      isTargetGroup(r[colMap.route], routeGroup) &&
      isTargetBranch(r[colMap.branch], selectedBranchesArray)
    );

    const prevTrips = prev.length;
    const latestTrips = latest.length;
    const prevPkgs = prev.reduce((s, r) => s + getPkgs(r), 0);
    const latestPkgs = latest.reduce((s, r) => s + getPkgs(r), 0);
    const prevAvg = prevTrips ? prev.reduce((s, r) => s + getLT(r), 0) / prevTrips : 0;
    const latestAvg = latestTrips ? latest.reduce((s, r) => s + getLT(r), 0) / latestTrips : 0;
    const avgDiff = latestAvg - prevAvg;

    const prevRoutes = groupBy(prev, r => r[colMap.route]);
    const latestRoutes = groupBy(latest, r => r[colMap.route]);
    const allRoutes = new Set([...Object.keys(prevRoutes), ...Object.keys(latestRoutes)]);
    const routeStats = [];

    allRoutes.forEach(route => {
      const p = prevRoutes[route] || [];
      const l = latestRoutes[route] || [];
      const pSum = p.reduce((s, r) => s + getLT(r), 0);
      const lSum = l.reduce((s, r) => s + getLT(r), 0);
      const pPkgs = p.reduce((s, r) => s + getPkgs(r), 0);
      const lPkgs = l.reduce((s, r) => s + getPkgs(r), 0);
      const contrib = (lSum / (latestTrips || 1)) - (pSum / (prevTrips || 1));
      routeStats.push({
        route, pTrips: p.length, lTrips: l.length,
        pAvg: p.length ? pSum / p.length : 0,
        lAvg: l.length ? lSum / l.length : 0,
        pkgsDiff: lPkgs - pPkgs, contrib
      });
    });

    const topNeg = routeStats.filter(r => r.contrib < -15).sort((a, b) => a.contrib - b.contrib).slice(0, 12);
    const topCulprit = topNeg.length ? topNeg[0] : null;

    // Positive contributors (routes that lifted the average)
    const topPos = routeStats.filter(r => r.contrib > 15).sort((a, b) => b.contrib - a.contrib).slice(0, 12);
    const topBooster = topPos.length ? topPos[0] : null;

    const prevBranches = groupBy(prev, r => r[colMap.branch]);
    const latestBranches = groupBy(latest, r => r[colMap.branch]);
    const allBranches = new Set([...Object.keys(prevBranches), ...Object.keys(latestBranches)]);
    const branchStats = [];

    allBranches.forEach(b => {
      const p = prevBranches[b] || [];
      const l = latestBranches[b] || [];
      const pSum = p.reduce((s, r) => s + getLT(r), 0);
      const lSum = l.reduce((s, r) => s + getLT(r), 0);
      const pPkgs = p.reduce((s, r) => s + getPkgs(r), 0);
      const lPkgs = l.reduce((s, r) => s + getPkgs(r), 0);
      const pAvg = p.length ? pSum / p.length : 0;
      const lAvg = l.length ? lSum / l.length : 0;
      const contrib = (lSum / (latestTrips || 1)) - (pSum / (prevTrips || 1));
      branchStats.push({ branch: b, pTrips: p.length, lTrips: l.length, pPkgs, lPkgs, pAvg, lAvg, contrib });
    });
    branchStats.sort((a, b) => a.contrib - b.contrib);

    const moreTrips = routeStats.filter(r => r.lTrips > r.pTrips).sort((a, b) => (b.lTrips - b.pTrips) - (a.lTrips - a.pTrips));

    const dailyTrendMatrix = computeDailyTrend(slu, colMap, selectedBranchesArray);

    return {
      datePrev, dateLatest, avgDiff, prevAvg, latestAvg,
      prevTrips, latestTrips, prevPkgs, latestPkgs,
      topCulprit, topNeg, topBooster, topPos, branchStats, moreTrips, dailyTrendMatrix
    };
  }

  // EXPORT BOTH FUNCTIONS
  return { computeMetrics, computeDailyTrend };
})();