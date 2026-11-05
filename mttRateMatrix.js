/* ==========================================================================
   MODULE: MTT RATE MATRIX
   Scope matrix: OVERALL / LUZON / VISMIN
   Route matrix: Luzon & VisMin · Region → Route · all weeks/months + trend
   Week labels include date range (e.g. WK 44 RATE · Oct 25–31)
   Truck Owner = SLU · Week = Excel WEEKNUM Sun–Sat (MttUtils)
   ========================================================================== */
const MttRateMatrix = (() => {
  const TARGET = { ALL: 0.96, LUZON: 0.97, VISMIN: 0.85 };
  const REGION_LABEL = 'SLU';
  const SCOPES = [
    { id: 'ALL', title: 'OVERALL', head: 'MAINLINE TRAVEL TIME', target: TARGET.ALL },
    { id: 'LUZON', title: 'LUZON ROUTE', head: 'LUZON ROUTE', target: TARGET.LUZON },
    { id: 'VISMIN', title: 'VISMIN ROUTE', head: 'VISMIN ROUTE', target: TARGET.VISMIN }
  ];

  let mode = 'weekly';
  let matrixView = 'scope'; // 'scope' | 'route'

  const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const MONTH_UP = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

  function weekKey(dateKey) {
    return (typeof MttUtils !== 'undefined' && MttUtils.weekKey) ? MttUtils.weekKey(dateKey) : null;
  }
  function monthKey(dateKey) {
    return dateKey ? String(dateKey).slice(0, 7) : null;
  }
  function fmtDay(dk) {
    if (!dk || String(dk).length < 10) return dk || '';
    const p = String(dk).split('-');
    return (MONTH_SHORT[parseInt(p[1], 10) - 1] || p[1]) + ' ' + parseInt(p[2], 10);
  }
  function weekDateRange(wk, rows) {
    if (!wk) return '';
    const dates = [...new Set(
      (rows || []).filter(r => r.period === wk || weekKey(r.dateKey) === wk)
        .map(r => r.dateKey).filter(Boolean)
    )].sort();
    if (!dates.length) return '';
    if (dates.length === 1) return fmtDay(dates[0]);
    return fmtDay(dates[0]) + '–' + fmtDay(dates[dates.length - 1]);
  }
  function labelFor(key, forMode, rows) {
    const m = forMode || mode;
    if (m === 'weekly') {
      const mm = String(key).match(/W(\d+)/i);
      let base = mm ? ('WK ' + parseInt(mm[1], 10) + ' RATE') : String(key);
      const range = weekDateRange(key, rows || getRows(m));
      if (range) base += ' · ' + range;
      return base;
    }
    if (!key || key.length < 7) return key;
    const mi = parseInt(key.slice(5, 7), 10) - 1;
    return (MONTH_UP[mi] || key.slice(5)) + ' ' + key.slice(0, 4);
  }
  function periodLabel(key, rows) {
    return labelFor(key, mode, rows);
  }

  function getRows(forMode) {
    const m = forMode || mode;
    if (typeof MttFileProcessor === 'undefined') return [];
    const st = MttFileProcessor.getState();
    const pkFn = m === 'weekly' ? weekKey : monthKey;
    return (st.storedRows || []).map(r => Object.assign({}, r, {
      period: r.dateKey ? pkFn(r.dateKey) : null
    }));
  }

  function stats(list) {
    if (!list || !list.length) return { total: 0, yes: 0, no: 0, rate: null };
    const yes = list.filter(r => String(r.onTime || '').toUpperCase() === 'YES').length;
    const total = list.length;
    return { total: total, yes: yes, no: total - yes, rate: total ? yes / total : null };
  }
  function filterScope(list, scope) {
    if (scope === 'LUZON') return list.filter(r => r.routeType === 'LUZON');
    if (scope === 'VISMIN') return list.filter(r => r.routeType === 'VISMIN');
    return list;
  }
  function periodKeys(rows) {
    return [...new Set(rows.map(r => r.period).filter(Boolean))].sort();
  }
  function fmtPct(v) {
    if (v == null || isNaN(v)) return '—';
    return (v * 100).toFixed(2) + '%';
  }
  function rateColor(rate, target) {
    if (rate == null || isNaN(rate)) {
      return { bg: 'ECEFF1', fg: '78909C', cssBg: '#ECEFF1', cssFg: '#78909C' };
    }
    const pct = rate * 100;
    const t = (target || 0.96) * 100;
    if (pct >= t) return { bg: 'A5D6A7', fg: '1B5E20', cssBg: '#A5D6A7', cssFg: '#1B5E20' };
    if (pct >= t - 2) return { bg: 'C5E1A5', fg: '33691E', cssBg: '#C5E1A5', cssFg: '#33691E' };
    if (pct >= t - 5) return { bg: 'FFF59D', fg: 'F57F17', cssBg: '#FFF59D', cssFg: '#F57F17' };
    if (pct >= t - 10) return { bg: 'FFCC80', fg: 'E65100', cssBg: '#FFCC80', cssFg: '#E65100' };
    return { bg: 'EF9A9A', fg: 'B71C1C', cssBg: '#EF9A9A', cssFg: '#B71C1C' };
  }
  function sparklineSvg(rates) {
    const vals = rates.filter(v => v != null && !isNaN(v));
    if (vals.length < 2) return '<span class="rm-spark-empty">—</span>';
    const w = 72, h = 22, pad = 2;
    const min = Math.min.apply(null, vals);
    const max = Math.max.apply(null, vals);
    const span = max - min || 0.01;
    const pts = vals.map(function (v, i) {
      const x = pad + (i / (vals.length - 1)) * (w - pad * 2);
      const y = h - pad - ((v - min) / span) * (h - pad * 2);
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
    const stroke = vals[vals.length - 1] >= vals[0] ? '#2E7D32' : '#E60012';
    return '<svg class="rm-spark" width="' + w + '" height="' + h +
      '" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true">' +
      '<polyline fill="none" stroke="' + stroke + '" stroke-width="1.6" points="' + pts + '"/>' +
      '</svg>';
  }
  function trendText(series) {
    const nums = series.filter(v => v != null && !isNaN(v));
    if (nums.length < 2) return '-';
    const d = nums[nums.length - 1] - nums[0];
    const pp = (d * 100).toFixed(2);
    if (d > 0.0005) return 'UP +' + pp + 'pp';
    if (d < -0.0005) return 'DOWN ' + pp + 'pp';
    return 'FLAT 0.00pp';
  }

  function buildMatrix(allRows, scopeId) {
    const scoped = filterScope(allRows, scopeId);
    const periods = periodKeys(scoped);
    const rates = {};
    periods.forEach(pk => {
      rates[pk] = stats(scoped.filter(r => r.period === pk)).rate;
    });
    return { periods: periods, rates: rates };
  }

  function buildRouteMatrix(allRows, scopeId) {
    const scoped = filterScope(allRows, scopeId);
    const periods = periodKeys(scoped);
    const byRegion = new Map();
    scoped.forEach(r => {
      const reg = (r.region || '(blank)').trim() || '(blank)';
      const route = (r.route || '(blank)').trim() || '(blank)';
      if (!byRegion.has(reg)) byRegion.set(reg, new Map());
      const byRoute = byRegion.get(reg);
      if (!byRoute.has(route)) byRoute.set(route, []);
      byRoute.get(route).push(r);
    });
    const regions = [...byRegion.keys()].sort(function (a, b) { return a.localeCompare(b); });
    const blocks = regions.map(function (reg) {
      const byRoute = byRegion.get(reg);
      const routes = [...byRoute.keys()].sort(function (a, b) { return a.localeCompare(b); });
      const regAll = [];
      byRoute.forEach(function (list) { list.forEach(function (x) { regAll.push(x); }); });
      const regionRates = {};
      periods.forEach(function (pk) {
        regionRates[pk] = stats(regAll.filter(function (r) { return r.period === pk; })).rate;
      });
      const routeRows = routes.map(function (route) {
        const list = byRoute.get(route);
        const rates = {};
        periods.forEach(function (pk) {
          rates[pk] = stats(list.filter(function (r) { return r.period === pk; })).rate;
        });
        return { route: route, rates: rates, series: periods.map(function (pk) { return rates[pk]; }) };
      });
      return {
        region: reg,
        regionRates: regionRates,
        regionSeries: periods.map(function (pk) { return regionRates[pk]; }),
        routes: routeRows
      };
    });
    return { periods: periods, blocks: blocks };
  }

  function renderBlock(scope, matrix, allRows) {
    const periods = matrix.periods;
    const rates = matrix.rates;
    let h = '<div class="rm-block">';
    h += '<div class="rm-block-head"><div class="rm-block-title">' + scope.head + '</div>';
    h += '<div class="rm-block-sub">' +
      (scope.id === 'ALL' ? (scope.title + ' · ') : '') +
      '<span class="rm-target">Target ' + Math.round(scope.target * 100) + '%</span></div></div>';
    if (!periods.length) {
      h += '<p class="section-note">No data for this scope.</p></div>';
      return h;
    }
    const trendLabelTxt = mode === 'weekly' ? 'Weekly Trend' : 'Monthly Trend';
    h += '<div class="rm-table-wrap"><table class="rm-table"><thead><tr>';
    h += '<th class="rm-th-region">REGION</th>';
    periods.forEach(function (pk) {
      h += '<th>' + periodLabel(pk, allRows) + '</th>';
    });
    h += '<th class="rm-th-trend">' + trendLabelTxt + '</th></tr></thead><tbody><tr>';
    h += '<td class="rm-region">' + REGION_LABEL + '</td>';
    const series = periods.map(function (pk) { return rates[pk]; });
    periods.forEach(function (pk) {
      const rate = rates[pk];
      const c = rateColor(rate, scope.target);
      h += '<td class="rm-rate" style="background:' + c.cssBg + ';color:' + c.cssFg + '">' +
        fmtPct(rate) + '</td>';
    });
    h += '<td class="rm-trend">' + sparklineSvg(series) +
      ' <span class="rm-trend-txt">' + trendText(series) + '</span></td>';
    h += '</tr></tbody></table></div></div>';
    return h;
  }

  function renderRouteBlock(scope, matrix, allRows) {
    const periods = matrix.periods;
    const blocks = matrix.blocks;
    let h = '<div class="rm-block rm-route-block">';
    h += '<div class="rm-block-head"><div class="rm-block-title">' + scope.head + ' · BY ROUTE</div>';
    h += '<div class="rm-block-sub">Region → Route · Target ' +
      Math.round(scope.target * 100) + '%</div></div>';
    if (!periods.length || !blocks.length) {
      h += '<p class="section-note">No trips for this scope.</p></div>';
      return h;
    }
    const trendLabelTxt = mode === 'weekly' ? 'Weekly Trend' : 'Monthly Trend';
    h += '<div class="rm-table-wrap"><table class="rm-table"><thead><tr>';
    h += '<th class="rm-th-region">REGION</th><th class="rm-th-route">ROUTE</th>';
    periods.forEach(function (pk) {
      h += '<th>' + periodLabel(pk, allRows) + '</th>';
    });
    h += '<th class="rm-th-trend">' + trendLabelTxt + '</th></tr></thead><tbody>';
    blocks.forEach(function (b) {
      h += '<tr class="rm-region-row">';
      h += '<td class="rm-region"><strong>' + b.region + '</strong></td>';
      h += '<td class="rm-muted">—</td>';
      periods.forEach(function (pk) {
        const rate = b.regionRates[pk];
        const c = rateColor(rate, scope.target);
        h += '<td class="rm-rate" style="background:' + c.cssBg + ';color:' + c.cssFg + '">' +
          fmtPct(rate) + '</td>';
      });
      h += '<td class="rm-trend">' + sparklineSvg(b.regionSeries) +
        ' <span class="rm-trend-txt">' + trendText(b.regionSeries) + '</span></td></tr>';
      b.routes.forEach(function (rr) {
        h += '<tr><td class="rm-muted"></td><td class="rm-route-name">' + rr.route + '</td>';
        periods.forEach(function (pk) {
          const rate = rr.rates[pk];
          const c = rateColor(rate, scope.target);
          h += '<td class="rm-rate" style="background:' + c.cssBg + ';color:' + c.cssFg + '">' +
            fmtPct(rate) + '</td>';
        });
        h += '<td class="rm-trend">' + sparklineSvg(rr.series) +
          ' <span class="rm-trend-txt">' + trendText(rr.series) + '</span></td></tr>';
      });
    });
    h += '</tbody></table></div></div>';
    return h;
  }

  function render() {
    const el = document.getElementById('rmView');
    if (!el) return;
    const rows = getRows();
    if (!rows.length) {
      el.innerHTML = '<p class="section-note">No SLU truck-owner rows found. Upload a Mainline workbook first.</p>';
      return;
    }
    const periods = periodKeys(rows);
    let html = '<div class="rm-meta">';
    html += '<strong>Truck Owner SLU</strong> · ' +
      (matrixView === 'route' ? 'Route matrix' : 'Scope matrix') + ' · ' +
      (mode === 'weekly' ? 'Weekly' : 'Monthly');
    html += ' · ' + periods.length + ' period(s)';
    if (mode === 'weekly') html += ' · headers show WK + date range';
    html += '</div>';

    if (matrixView === 'route') {
      [SCOPES[1], SCOPES[2]].forEach(function (scope) {
        html += renderRouteBlock(scope, buildRouteMatrix(rows, scope.id), rows);
      });
    } else {
      SCOPES.forEach(function (scope) {
        html += renderBlock(scope, buildMatrix(rows, scope.id), rows);
      });
    }
    el.innerHTML = html;
  }

  function buildSheetAoA(forMode) {
    const rows = getRows(forMode);
    const aoa = [];
    const merges = [];
    const styles = {};
    function setS(r, c, s) { styles[r + '_' + c] = s; }
    const titleStyle = {
      fill: { patternType: 'solid', fgColor: { rgb: 'E60012' } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 13, name: 'Calibri' },
      alignment: { horizontal: 'center', vertical: 'center' }
    };
    const headStyle = {
      fill: { patternType: 'solid', fgColor: { rgb: 'FFEBEE' } },
      font: { bold: true, color: { rgb: 'B8000E' }, sz: 9, name: 'Calibri' },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true }
    };
    const regionStyle = {
      font: { bold: true, sz: 11, name: 'Calibri' },
      alignment: { horizontal: 'center', vertical: 'center' },
      fill: { patternType: 'solid', fgColor: { rgb: 'FAFAFA' } }
    };

    SCOPES.forEach(function (scope, si) {
      if (si > 0) { aoa.push([]); aoa.push([]); }
      const scoped = filterScope(rows, scope.id);
      const periods = periodKeys(scoped);
      const rates = {};
      periods.forEach(function (pk) {
        rates[pk] = stats(scoped.filter(function (r) { return r.period === pk; })).rate;
      });
      const series = periods.map(function (pk) { return rates[pk]; });
      const colCount = Math.max(periods.length + 2, 3);

      const titleRow = aoa.length;
      const titleCells = [scope.head];
      for (let i = 1; i < colCount; i++) titleCells.push('');
      aoa.push(titleCells);
      merges.push({ s: { r: titleRow, c: 0 }, e: { r: titleRow, c: colCount - 1 } });
      for (let c = 0; c < colCount; c++) setS(titleRow, c, titleStyle);

      const subRow = aoa.length;
      const subText = (scope.id === 'ALL' ? (scope.title + '  ·  ') : '') +
        'Target ' + Math.round(scope.target * 100) + '%';
      const sub = [subText];
      for (let i = 1; i < colCount; i++) sub.push('');
      aoa.push(sub);
      merges.push({ s: { r: subRow, c: 0 }, e: { r: subRow, c: colCount - 1 } });
      for (let c = 0; c < colCount; c++) setS(subRow, c, titleStyle);

      const headRow = aoa.length;
      const head = ['REGION'].concat(periods.map(function (pk) {
        return labelFor(pk, forMode, rows);
      }));
      head.push(forMode === 'weekly' ? 'Weekly Trend' : 'Monthly Trend');
      while (head.length < colCount) head.push('');
      aoa.push(head);
      for (let c = 0; c < head.length; c++) setS(headRow, c, headStyle);

      const dataRow = aoa.length;
      const rowVals = [REGION_LABEL];
      periods.forEach(function (pk) {
        const rate = rates[pk];
        rowVals.push(rate == null ? null : rate);
      });
      rowVals.push(trendText(series));
      aoa.push(rowVals);
      setS(dataRow, 0, regionStyle);
      periods.forEach(function (pk, i) {
        const rate = rates[pk];
        const c = rateColor(rate, scope.target);
        setS(dataRow, i + 1, {
          fill: { patternType: 'solid', fgColor: { rgb: c.bg } },
          font: { bold: true, sz: 10, name: 'Calibri', color: { rgb: c.fg } },
          alignment: { horizontal: 'center', vertical: 'center' },
          numFmt: '0.00%'
        });
      });
      setS(dataRow, periods.length + 1, {
        font: { bold: true, sz: 10, name: 'Calibri' },
        alignment: { horizontal: 'center', vertical: 'center' }
      });
    });

    return { aoa: aoa, merges: merges, styles: styles, periods: periodKeys(rows) };
  }

  function buildRouteSheetAoA(forMode, scopeId) {
    const rows = getRows(forMode);
    const scope = SCOPES.find(function (s) { return s.id === scopeId; });
    const matrix = buildRouteMatrix(rows, scopeId);
    const aoa = [];
    const merges = [];
    const styles = {};
    function setS(r, c, s) { styles[r + '_' + c] = s; }
    const titleStyle = {
      fill: { patternType: 'solid', fgColor: { rgb: 'E60012' } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 13, name: 'Calibri' },
      alignment: { horizontal: 'center', vertical: 'center' }
    };
    const headStyle = {
      fill: { patternType: 'solid', fgColor: { rgb: 'FFEBEE' } },
      font: { bold: true, color: { rgb: 'B8000E' }, sz: 9, name: 'Calibri' },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true }
    };
    const colCount = Math.max(matrix.periods.length + 3, 4);
    const titleRow = 0;
    const titleCells = [scope.head + ' · BY ROUTE'];
    for (let i = 1; i < colCount; i++) titleCells.push('');
    aoa.push(titleCells);
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } });
    for (let c = 0; c < colCount; c++) setS(0, c, titleStyle);

    const sub = ['Target ' + Math.round(scope.target * 100) + '% · Region → Route'];
    for (let i = 1; i < colCount; i++) sub.push('');
    aoa.push(sub);
    merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } });
    for (let c = 0; c < colCount; c++) setS(1, c, titleStyle);

    const head = ['REGION', 'ROUTE'].concat(
      matrix.periods.map(function (pk) { return labelFor(pk, forMode, rows); })
    ).concat([forMode === 'weekly' ? 'Weekly Trend' : 'Monthly Trend']);
    aoa.push(head);
    head.forEach(function (_, c) { setS(2, c, headStyle); });

    let r = 3;
    matrix.blocks.forEach(function (b) {
      const regRow = [b.region, '—'].concat(
        matrix.periods.map(function (pk) {
          const v = b.regionRates[pk];
          return v == null ? null : v;
        })
      ).concat([trendText(b.regionSeries)]);
      aoa.push(regRow);
      setS(r, 0, {
        font: { bold: true, sz: 10, name: 'Calibri' },
        fill: { patternType: 'solid', fgColor: { rgb: 'F5F5F5' } }
      });
      matrix.periods.forEach(function (pk, i) {
        const v = b.regionRates[pk];
        const col = rateColor(v, scope.target);
        setS(r, 2 + i, {
          fill: { patternType: 'solid', fgColor: { rgb: col.bg } },
          font: { bold: true, sz: 10, name: 'Calibri', color: { rgb: col.fg } },
          alignment: { horizontal: 'center' },
          numFmt: '0.00%'
        });
      });
      r++;
      b.routes.forEach(function (rr) {
        const row = ['', rr.route].concat(
          matrix.periods.map(function (pk) {
            const v = rr.rates[pk];
            return v == null ? null : v;
          })
        ).concat([trendText(rr.series)]);
        aoa.push(row);
        matrix.periods.forEach(function (pk, i) {
          const v = rr.rates[pk];
          const col = rateColor(v, scope.target);
          setS(r, 2 + i, {
            fill: { patternType: 'solid', fgColor: { rgb: col.bg } },
            font: { bold: true, sz: 10, name: 'Calibri', color: { rgb: col.fg } },
            alignment: { horizontal: 'center' },
            numFmt: '0.00%'
          });
        });
        r++;
      });
    });
    return { aoa: aoa, merges: merges, styles: styles, periods: matrix.periods };
  }

  function applySheetStyles(ws, pack) {
    ws['!merges'] = pack.merges;
    const maxCols = Math.max(10, (pack.periods || []).length + 3);
    ws['!cols'] = [{ wch: 12 }, { wch: 14 }].concat(
      Array(maxCols).fill({ wch: 14 })
    ).concat([{ wch: 16 }]);
    Object.keys(pack.styles || {}).forEach(function (key) {
      const parts = key.split('_');
      const r = parseInt(parts[0], 10);
      const c = parseInt(parts[1], 10);
      const cellRef = XLSX.utils.encode_cell({ r: r, c: c });
      if (!ws[cellRef]) ws[cellRef] = { t: 's', v: '' };
      const st = pack.styles[key];
      ws[cellRef].s = st;
    });
  }

  function exportExcel() {
    const rows = getRows('weekly');
    if (!rows.length) {
      alert('No SLU data to export.');
      return;
    }
    const wb = XLSX.utils.book_new();

    const weeklyPack = buildSheetAoA('weekly');
    const wsW = XLSX.utils.aoa_to_sheet(weeklyPack.aoa);
    applySheetStyles(wsW, weeklyPack);
    XLSX.utils.book_append_sheet(wb, wsW, 'Weekly');

    const monthlyPack = buildSheetAoA('monthly');
    const wsM = XLSX.utils.aoa_to_sheet(monthlyPack.aoa);
    applySheetStyles(wsM, monthlyPack);
    XLSX.utils.book_append_sheet(wb, wsM, 'Monthly');

    ['LUZON', 'VISMIN'].forEach(function (sid) {
      const packW = buildRouteSheetAoA('weekly', sid);
      const wsRW = XLSX.utils.aoa_to_sheet(packW.aoa);
      applySheetStyles(wsRW, packW);
      XLSX.utils.book_append_sheet(wb, wsRW,
        (sid === 'LUZON' ? 'Luzon Routes Weekly' : 'VisMin Routes Weekly').slice(0, 31));

      const packM = buildRouteSheetAoA('monthly', sid);
      const wsRM = XLSX.utils.aoa_to_sheet(packM.aoa);
      applySheetStyles(wsRM, packM);
      XLSX.utils.book_append_sheet(wb, wsRM,
        (sid === 'LUZON' ? 'Luzon Routes Monthly' : 'VisMin Routes Monthly').slice(0, 31));
    });

    XLSX.writeFile(wb, 'TRAVEL_TIME_WEEKLY_MONTHLY_COMPARISON.xlsx');
  }

  function setMode(next) {
    mode = next === 'monthly' ? 'monthly' : 'weekly';
    document.querySelectorAll('.rm-subtab[data-rm-mode]').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.rmMode === mode);
    });
    render();
  }
  function setMatrixView(next) {
    matrixView = next === 'route' ? 'route' : 'scope';
    document.querySelectorAll('.rm-viewtab').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.rmView === matrixView);
    });
    render();
  }

  function init() {
    document.querySelectorAll('.rm-subtab[data-rm-mode]').forEach(function (btn) {
      btn.addEventListener('click', function () { setMode(btn.dataset.rmMode); });
    });
    document.querySelectorAll('.rm-viewtab').forEach(function (btn) {
      btn.addEventListener('click', function () { setMatrixView(btn.dataset.rmView); });
    });
    const exp = document.getElementById('btnRmExport');
    if (exp) exp.addEventListener('click', exportExcel);
    document.querySelectorAll('.tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        if (tab.dataset.tab === 'tabRateMatrix') setTimeout(render, 40);
      });
    });
  }

  function onDataReady() { render(); }

  return { init, render, onDataReady, exportExcel };
})();
