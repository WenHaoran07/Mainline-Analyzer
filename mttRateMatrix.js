/* ==========================================================================
   MODULE: MTT RATE MATRIX (Weekly / Monthly trend tables)
   SLU region only · layout matches TRAVEL TIME WEEKLY COMPARISON:
     MAINLINE TRAVEL TIME / OVERALL
     LUZON TO LUZON
     LUZON TO VISMIN
   Excel export uses xlsx-js-style (red headers + heat fills).
   ========================================================================== */
const MttRateMatrix = (() => {
  const TARGET = { ALL: 0.96, LUZON: 0.97, VISMIN: 0.85 };
  const REGION_FILTER = 'SLU';

  const SCOPES = [
    { id: 'ALL', title: 'OVERALL', subtitle: 'MAINLINE TRAVEL TIME', target: TARGET.ALL },
    { id: 'LUZON', title: 'LUZON TO LUZON', subtitle: 'LUZON TO LUZON', target: TARGET.LUZON },
    { id: 'VISMIN', title: 'LUZON TO VISMIN', subtitle: 'LUZON TO VISMIN', target: TARGET.VISMIN }
  ];

  let mode = 'weekly';

  function pad2(n) { return String(n).padStart(2, '0'); }

  /**
   * Excel WEEKNUM(date, 1) equivalent — matches Overall sheet formula:
   *   COUNTIFS(REGION, SLU, WEEKNUM(date), n, onTime, YES) / COUNTIFS(...)
   * Week starts Sunday; the week that contains Jan 1 is week 1.
   */
  function excelWeekNum(dateKey) {
    if (!dateKey) return null;
    const [y, m, d] = dateKey.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    const jan1 = new Date(Date.UTC(y, 0, 1));
    const dayOfYear = Math.floor((date - jan1) / 86400000) + 1; // 1..366
    const jan1Dow = jan1.getUTCDay(); // 0=Sun .. 6=Sat (Excel WEEKDAY default style)
    // Excel WEEKNUM return_type 1
    return Math.floor((dayOfYear + jan1Dow - 1) / 7) + 1;
  }

  function weekKey(dateKey) {
    if (!dateKey) return null;
    const [y] = dateKey.split('-').map(Number);
    const wn = excelWeekNum(dateKey);
    if (wn == null) return null;
    // year-Wnn so weeks from different years never mix
    return y + '-W' + pad2(wn);
  }

  function monthKey(dateKey) {
    return dateKey ? dateKey.slice(0, 7) : null;
  }

  function weekLabel(key) {
    const m = String(key).match(/W(\d+)/i);
    return m ? ('WK ' + parseInt(m[1], 10) + ' RATE') : key;
  }

  function monthLabel(key) {
    if (!key || key.length < 7) return key;
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
      'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const mi = parseInt(key.slice(5, 7), 10) - 1;
    return (months[mi] || key.slice(5)) + ' ' + key.slice(0, 4);
  }

  function periodLabel(key) {
    return mode === 'weekly' ? weekLabel(key) : monthLabel(key);
  }

  function getRows() {
    if (typeof MttFileProcessor === 'undefined') return [];
    const st = MttFileProcessor.getState();
    return (st.storedRows || [])
      .filter(r => String(r.region || '').trim().toUpperCase() === REGION_FILTER)
      .map(r => Object.assign({}, r, {
        week: r.dateKey ? weekKey(r.dateKey) : null,
        month: r.dateKey ? monthKey(r.dateKey) : null
      }));
  }

  /**
   * Same as Overall sheet Col R:
   *   YES count / total rows for (region + week)
   * Aggregates every day in that week (not a single day).
   */
  function stats(list) {
    if (!list || !list.length) return { total: 0, yes: 0, no: 0, rate: null };
    const yes = list.filter(r => String(r.onTime || '').toUpperCase() === 'YES').length;
    const total = list.length;
    return { total, yes, no: total - yes, rate: yes / total };
  }

  function filterScope(list, scope) {
    if (scope === 'LUZON') return list.filter(r => r.routeType === 'LUZON');
    if (scope === 'VISMIN') {
      return list.filter(r =>
        r.routeType === 'VISMIN' &&
        String(r.region || '').toUpperCase() !== 'TWO DROPS'
      );
    }
    return list;
  }

  function periodKeys(rows) {
    const set = new Set(
      rows.map(r => (mode === 'weekly' ? r.week : r.month)).filter(Boolean)
    );
    return [...set].sort();
  }

  function fmtPct(v) {
    if (v == null || isNaN(v)) return '—';
    return (v * 100).toFixed(2) + '%';
  }

  /** Heat palette aligned to sample (green / yellow / orange / red) */
  function rateColor(rate, target) {
    if (rate == null || isNaN(rate)) return { bg: 'ECEFF1', fg: '78909C', cssBg: '#ECEFF1', cssFg: '#78909C' };
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
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const span = max - min || 0.01;
    const pts = vals.map((v, i) => {
      const x = pad + (i / (vals.length - 1)) * (w - pad * 2);
      const y = h - pad - ((v - min) / span) * (h - pad * 2);
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
    const stroke = vals[vals.length - 1] >= vals[0] ? '#2E7D32' : '#E60012';
    return '<svg class="rm-spark" width="' + w + '" height="' + h + '" viewBox="0 0 ' +
      w + ' ' + h + '" aria-hidden="true">' +
      '<polyline fill="none" stroke="' + stroke + '" stroke-width="1.6" points="' + pts + '"/>' +
      '</svg>';
  }

  function buildMatrix(allRows, scopeId) {
    const scoped = filterScope(allRows, scopeId);
    const periods = periodKeys(scoped);
    const byPeriod = {};
    periods.forEach(pk => { byPeriod[pk] = []; });
    scoped.forEach(r => {
      const pk = mode === 'weekly' ? r.week : r.month;
      if (pk && byPeriod[pk]) byPeriod[pk].push(r);
    });
    const rates = {};
    periods.forEach(pk => {
      rates[pk] = stats(byPeriod[pk]).rate;
    });
    return { periods, rates, region: REGION_FILTER };
  }

  function renderBlock(scope, matrix) {
    const { periods, rates, region } = matrix;
    let h = '<div class="rm-block">';
    h += '<div class="rm-block-head">';
    h += '<div class="rm-block-title">' + scope.subtitle + '</div>';
    if (scope.id === 'ALL') {
      h += '<div class="rm-block-sub">' + scope.title +
        ' <span class="rm-target">Target ' + (scope.target * 100).toFixed(0) + '%</span></div>';
    } else {
      h += '<div class="rm-block-sub"><span class="rm-target">Target ' +
        (scope.target * 100).toFixed(0) + '%</span></div>';
    }
    h += '</div>';

    if (!periods.length) {
      h += '<p class="section-note">No SLU data for this scope.</p></div>';
      return h;
    }

    h += '<div class="rm-table-wrap"><table class="rm-table"><thead><tr>';
    h += '<th class="rm-th-region">REGION</th>';
    periods.forEach(pk => { h += '<th>' + periodLabel(pk) + '</th>'; });
    h += '<th class="rm-th-trend">' + (mode === 'weekly' ? 'Weekly' : 'Monthly') + ' Trend</th>';
    h += '</tr></thead><tbody><tr>';
    h += '<td class="rm-region">' + region + '</td>';
    const series = periods.map(pk => rates[pk]);
    periods.forEach(pk => {
      const rate = rates[pk];
      const c = rateColor(rate, scope.target);
      h += '<td class="rm-rate" style="background:' + c.cssBg + ';color:' + c.cssFg + '">' +
        fmtPct(rate) + '</td>';
    });
    h += '<td class="rm-trend">' + sparklineSvg(series) + '</td>';
    h += '</tr></tbody></table></div></div>';
    return h;
  }

  function render() {
    const el = document.getElementById('rmView');
    if (!el) return;
    const rows = getRows();
    if (!rows.length) {
      el.innerHTML = '<p class="section-note">No <strong>SLU</strong> rows found. Upload a Mainline workbook with REGION = SLU.</p>';
      return;
    }
    const periods = periodKeys(rows);
    let html = '<div class="rm-meta">';
    html += '<strong>SLU only</strong> · ' + (mode === 'weekly' ? 'Weekly' : 'Monthly') + ' rate matrix';
    html += ' · ' + periods.length + ' period(s)';
    html += ' · Excel WEEKNUM (Sun-start) · rate = YES ÷ all SLU trips that week · targets 96% / 97% / 85%';
    html += '</div>';
    SCOPES.forEach(scope => {
      html += renderBlock(scope, buildMatrix(rows, scope.id));
    });
    el.innerHTML = html;
  }

  /* ---------- Styled Excel (xlsx-js-style) ---------- */

  function styleHeader() {
    return {
      fill: { patternType: 'solid', fgColor: { rgb: 'E60012' } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 12, name: 'Calibri' },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: {
        top: { style: 'thin', color: { rgb: 'B8000E' } },
        bottom: { style: 'thin', color: { rgb: 'B8000E' } },
        left: { style: 'thin', color: { rgb: 'B8000E' } },
        right: { style: 'thin', color: { rgb: 'B8000E' } }
      }
    };
  }

  function styleColHead() {
    return {
      fill: { patternType: 'solid', fgColor: { rgb: 'C62828' } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10, name: 'Calibri' },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: {
        top: { style: 'thin', color: { rgb: 'B71C1C' } },
        bottom: { style: 'thin', color: { rgb: 'B71C1C' } },
        left: { style: 'thin', color: { rgb: 'B71C1C' } },
        right: { style: 'thin', color: { rgb: 'B71C1C' } }
      }
    };
  }

  function styleRegion() {
    return {
      font: { bold: true, sz: 11, name: 'Calibri', color: { rgb: '212121' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: {
        top: { style: 'thin', color: { rgb: 'BDBDBD' } },
        bottom: { style: 'thin', color: { rgb: 'BDBDBD' } },
        left: { style: 'thin', color: { rgb: 'BDBDBD' } },
        right: { style: 'thin', color: { rgb: 'BDBDBD' } }
      }
    };
  }

  function styleRate(rate, target) {
    const c = rateColor(rate, target);
    return {
      fill: { patternType: 'solid', fgColor: { rgb: c.bg } },
      font: { bold: true, sz: 10, name: 'Calibri', color: { rgb: c.fg } },
      alignment: { horizontal: 'center', vertical: 'center' },
      numFmt: '0.00%',
      border: {
        top: { style: 'thin', color: { rgb: 'BDBDBD' } },
        bottom: { style: 'thin', color: { rgb: 'BDBDBD' } },
        left: { style: 'thin', color: { rgb: 'BDBDBD' } },
        right: { style: 'thin', color: { rgb: 'BDBDBD' } }
      }
    };
  }

  function styleTrend() {
    return {
      alignment: { horizontal: 'center', vertical: 'center' },
      font: { sz: 12, bold: true, name: 'Calibri' },
      border: {
        top: { style: 'thin', color: { rgb: 'BDBDBD' } },
        bottom: { style: 'thin', color: { rgb: 'BDBDBD' } },
        left: { style: 'thin', color: { rgb: 'BDBDBD' } },
        right: { style: 'thin', color: { rgb: 'BDBDBD' } }
      }
    };
  }

  function cell(v, s) {
    const o = { v: v, t: typeof v === 'number' ? 'n' : 's' };
    if (s) o.s = s;
    if (typeof v === 'number' && s && s.numFmt) o.z = s.numFmt;
    return o;
  }

  function exportExcel() {
    if (typeof XLSX === 'undefined') {
      alert('XLSX library not loaded.');
      return;
    }
    const rows = getRows();
    if (!rows.length) {
      alert('No SLU data to export.');
      return;
    }

    const aoa = [];
    const merges = [];
    const styleMap = {}; // 'r_c' -> style object applied after sheet build

    function setStyle(r, c, s) {
      styleMap[r + '_' + c] = s;
    }

    SCOPES.forEach((scope, si) => {
      if (si > 0) {
        aoa.push([]);
        aoa.push([]);
      }
      const matrix = buildMatrix(rows, scope.id);
      const { periods, rates, region } = matrix;
      const colCount = Math.max(periods.length + 2, 3) - 1; // 0-based last col

      // Title (MAINLINE TRAVEL TIME / LUZON TO LUZON / LUZON TO VISMIN)
      const titleRow = aoa.length;
      const titleVals = [scope.subtitle];
      for (let i = 1; i <= colCount; i++) titleVals.push('');
      aoa.push(titleVals);
      merges.push({ s: { r: titleRow, c: 0 }, e: { r: titleRow, c: colCount } });
      for (let c = 0; c <= colCount; c++) setStyle(titleRow, c, styleHeader());

      // For OVERALL, add second red band with OVERALL
      if (scope.id === 'ALL') {
        const subRow = aoa.length;
        const subVals = [scope.title];
        for (let i = 1; i <= colCount; i++) subVals.push('');
        aoa.push(subVals);
        merges.push({ s: { r: subRow, c: 0 }, e: { r: subRow, c: colCount } });
        for (let c = 0; c <= colCount; c++) setStyle(subRow, c, styleHeader());
      }

      // Column headers
      const headRow = aoa.length;
      const head = ['REGION'].concat(periods.map(periodLabel));
      head.push(mode === 'weekly' ? 'Weekly Trend' : 'Monthly Trend');
      while (head.length < colCount + 1) head.push('');
      aoa.push(head);
      for (let c = 0; c < head.length; c++) setStyle(headRow, c, styleColHead());

      // SLU data row
      const dataRow = aoa.length;
      const series = periods.map(pk => rates[pk]);
      const rowVals = [region];
      periods.forEach(pk => {
        const rate = rates[pk];
        rowVals.push(rate == null ? null : rate);
      });
      const nums = series.filter(v => v != null);
      let trend = '';
      if (nums.length >= 2) {
        const d = nums[nums.length - 1] - nums[0];
        trend = d > 0.005 ? '↑' : d < -0.005 ? '↓' : '→';
      }
      rowVals.push(trend);
      aoa.push(rowVals);

      setStyle(dataRow, 0, styleRegion());
      periods.forEach((pk, i) => {
        setStyle(dataRow, i + 1, styleRate(rates[pk], scope.target));
      });
      setStyle(dataRow, periods.length + 1, styleTrend());
    });

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!merges'] = merges;
    ws['!cols'] = [{ wch: 12 }].concat(
      Array(Math.max(periodKeys(rows).length, 8)).fill({ wch: 12 })
    ).concat([{ wch: 14 }]);
    ws['!rows'] = aoa.map((_, i) => ({ hpt: i % 10 === 0 ? 22 : 18 }));

    // Apply styles to cells
    Object.keys(styleMap).forEach(key => {
      const [r, c] = key.split('_').map(Number);
      const addr = XLSX.utils.encode_cell({ r: r, c: c });
      if (!ws[addr]) ws[addr] = { t: 's', v: '' };
      ws[addr].s = styleMap[key];
      if (typeof ws[addr].v === 'number' && ws[addr].v <= 1 && ws[addr].v >= 0) {
        ws[addr].z = '0.00%';
        ws[addr].t = 'n';
      }
    });

    // Ensure percent format on rate numbers
    Object.keys(ws).forEach(addr => {
      if (addr[0] === '!') return;
      const cell = ws[addr];
      if (cell && typeof cell.v === 'number' && cell.v > 0 && cell.v <= 1) {
        cell.z = '0.00%';
        cell.t = 'n';
      }
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, mode === 'weekly' ? 'Weekly' : 'Monthly');
    const fname = mode === 'weekly'
      ? 'TRAVEL_TIME_WEEKLY_COMPARISON.xlsx'
      : 'TRAVEL_TIME_MONTHLY_COMPARISON.xlsx';
    XLSX.writeFile(wb, fname);
  }

  function setMode(next) {
    mode = next === 'monthly' ? 'monthly' : 'weekly';
    document.querySelectorAll('.rm-subtab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.rmMode === mode);
    });
    render();
  }

  function init() {
    document.querySelectorAll('.rm-subtab').forEach(btn => {
      btn.addEventListener('click', () => setMode(btn.dataset.rmMode));
    });
    const exp = document.getElementById('btnRmExport');
    if (exp) exp.addEventListener('click', exportExcel);
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        if (tab.dataset.tab === 'tabRateMatrix') setTimeout(render, 40);
      });
    });
  }

  function onDataReady() { render(); }

  return { init, render, onDataReady, exportExcel };
})();
