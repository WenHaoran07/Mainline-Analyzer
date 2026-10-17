/* ==========================================================================
   MODULE: MAINLINE LOADING TICKETS DAILY TREND MANAGER
   ========================================================================== */
const DailyTrendManager = (() => {
  // Fixed 9 Departure DCs
  const FIXED_DC_LIST = [
    { name: 'BatangasDC1', code: '430', aliases: ['batangasdc1', 'batangas dc1', 'batangas'] },
    { name: 'Cavite DC1', code: '460', aliases: ['cavite dc1', 'cavitedc1', 'cavite'] },
    { name: 'CORON DC', code: '481', aliases: ['coron dc', 'corondc', 'coron'] },
    { name: 'Laguna DC2', code: '492', aliases: ['laguna dc2', 'lagunadc2'] },
    { name: 'LagunaDC1', code: '490', aliases: ['lagunadc1', 'laguna dc1'] },
    { name: 'LUCENA NEW DC', code: '470', aliases: ['lucena new dc', 'lucenanewdc', 'lucena dc'] },
    { name: 'Mindoro CalapanDC2', code: '431', aliases: ['mindoro calapandc2', 'mindoro calapan dc2', 'calapan dc2', 'calapandc2'] },
    { name: 'Mindoro MamburaoDC1', code: '432', aliases: ['mindoro mamburaodc1', 'mindoro mamburao dc1', 'mamburao dc1', 'mamburaodc1'] },
    { name: 'PalawanDC1', code: '480', aliases: ['palawandc1', 'palawan dc1', 'palawan dc', 'palawan'] }
  ];

  function matchesAlias(branchText, aliases) {
    if (!branchText) return false;
    const clean = String(branchText).toLowerCase().replace(/[^a-z0-9]/g, '');
    return aliases.some(alias => {
      const cleanAlias = alias.toLowerCase().replace(/[^a-z0-9]/g, '');
      return clean === cleanAlias || clean.includes(cleanAlias) || cleanAlias.includes(clean);
    });
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

  function getHeatmapColor(value, min, max) {
    if (value === null || value === undefined || isNaN(value)) {
      return 'background-color: #F1F5F9; color: #94A3B8; text-align: center;';
    }
    if (min === max) return 'background-color: #FEF08A; color: #1E293B; text-align: right;';

    const ratio = Math.max(0, Math.min(1, (value - min) / (max - min)));
    let r, g, b;

    if (ratio < 0.5) {
      const subRatio = ratio * 2;
      r = 248;
      g = Math.round(113 + (110 * subRatio));
      b = 113;
    } else {
      const subRatio = (ratio - 0.5) * 2;
      r = Math.round(253 - (120 * subRatio));
      g = Math.round(224 - (30 * subRatio));
      b = 138;
    }

    return `background-color: rgb(${r}, ${g}, ${b}); color: #0F172A; text-align: right; font-weight: 600;`;
  }

  function computeMatrix(allRows, colMap) {
    const getLT = r => parseFloat(r[colMap.lt]) || 0;

    // Extract all unique dates available sorted
    const dates = [...new Set(allRows.map(r => String(r[colMap.date]).substring(0, 10)))]
      .filter(d => d && d !== 'null' && d !== 'undefined').sort();

    let globalMin = Infinity;
    let globalMax = -Infinity;

    const matrixRows = FIXED_DC_LIST.map(dc => {
      // Find all rows matching this DC (ignoring exact case/spaces)
      const rowsForBranch = allRows.filter(r => matchesAlias(r[colMap.branch], dc.aliases));
      
      const totalSum = rowsForBranch.reduce((s, r) => s + getLT(r), 0);
      const accumulated = rowsForBranch.length ? (totalSum / rowsForBranch.length) : 0;

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
          daily[d] = null; // #N/A
        }
      });

      return { branch: dc.name, dcCode: dc.code, accumulated, daily };
    });

    return { dates, rows: matrixRows, globalMin: globalMin === Infinity ? 0 : globalMin, globalMax: globalMax === -Infinity ? 0 : globalMax };
  }

  function render(allRows, colMap) {
    if (!allRows || !colMap) return;

    const { dates, rows, globalMin, globalMax } = computeMatrix(allRows, colMap);

    // Table Header
    let headHtml = `<tr>
      <th style="min-width: 160px;">Departure DC</th>
      <th style="min-width: 80px; text-align: center;">DC CODE</th>
      <th style="min-width: 110px; text-align: right;">Accumulated</th>`;
    
    dates.forEach(d => {
      headHtml += `<th style="min-width: 100px; text-align: center;">${d}</th>`;
    });
    headHtml += `</tr>`;
    document.getElementById('trendTableHead').innerHTML = headHtml;

    // Table Body
    let bodyHtml = '';
    rows.forEach(r => {
      const accumStr = r.accumulated > 0 ? Math.round(r.accumulated).toLocaleString() : '#N/A';
      bodyHtml += `<tr>
        <td><strong>${r.branch}</strong></td>
        <td style="text-align: center; color: var(--muted); font-weight: 600;">${r.dcCode}</td>
        <td style="text-align: right; font-weight: 700;">${accumStr}</td>`;
      
      dates.forEach(d => {
        const val = r.daily[d];
        const style = getHeatmapColor(val, globalMin, globalMax);
        const displayVal = (val !== null && val !== undefined && val > 0) ? Math.round(val).toLocaleString() : '#N/A';
        bodyHtml += `<td style="${style}">${displayVal}</td>`;
      });

      bodyHtml += `</tr>`;
    });

    document.getElementById('trendTableBody').innerHTML = bodyHtml || '<tr><td colspan="100%">No daily trend data available.</td></tr>';
  }

  return { render };
})();