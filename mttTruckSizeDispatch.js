/* ==========================================================================
   MODULE: MTT TRUCK SIZE DISPATCH
   How many trucks of each size are dispatched on each route per day.
   Date range · scope · region · route filters · detail view · Excel export
   ========================================================================== */
const MttTruckSizeDispatch = (() => {
  let dateFrom = null;
  let dateTo = null;
  let scope = 'ALL';
  let regionFilter = 'ALL';
  let routeFilter = 'ALL';
  let sizeFilter = 'ALL';
  let selectedRoute = null;
  let selectedSize = null;
  let selectedDay = null;
  let chartMix = null;
  let chartDaily = null;
  let lastMatrix = null; // for export

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function allRows() {
    if (typeof MttFileProcessor === 'undefined') return [];
    return (MttFileProcessor.getState().storedRows || []).slice();
  }

  function allDates() {
    if (typeof MttFileProcessor === 'undefined') return [];
    return (MttFileProcessor.getState().storedDates || []).slice().sort();
  }

  function sizeOf(r) {
    // Prefer Vehicle Type, then actualSize (may already hold Vehicle Type from parser), then planned
    const vt = String(r.vehicleType || '').trim();
    if (vt) return vt;
    const a = String(r.actualSize || '').trim();
    if (a) return a;
    const p = String(r.plannedSize || '').trim();
    if (p) return p;
    return '(unknown)';
  }

  function baseFilter(rows) {
    let out = rows.slice();
    if (scope === 'LUZON') out = out.filter(r => r.routeType === 'LUZON');
    else if (scope === 'VISMIN') out = out.filter(r => r.routeType === 'VISMIN');
    if (regionFilter && regionFilter !== 'ALL') {
      out = out.filter(r => String(r.region || '').trim() === regionFilter);
    }
    if (routeFilter && routeFilter !== 'ALL') {
      out = out.filter(r => String(r.route || '').trim() === routeFilter);
    }
    if (sizeFilter && sizeFilter !== 'ALL') {
      out = out.filter(r => sizeOf(r) === sizeFilter);
    }
    if (dateFrom && dateTo) {
      const a = dateFrom <= dateTo ? dateFrom : dateTo;
      const b = dateFrom <= dateTo ? dateTo : dateFrom;
      out = out.filter(r => r.dateKey >= a && r.dateKey <= b);
    } else if (dateFrom) {
      out = out.filter(r => r.dateKey === dateFrom);
    }
    return out;
  }

  function uniqueSorted(arr) {
    return [...new Set(arr.filter(Boolean))].sort((a, b) => {
      // size-ish: try numeric first
      const na = parseFloat(String(a).replace(/[^0-9.]/g, ''));
      const nb = parseFloat(String(b).replace(/[^0-9.]/g, ''));
      if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
      return String(a).localeCompare(String(b));
    });
  }

  function populateSelectors() {
    const rows = allRows();
    const dates = allDates();
    const regions = uniqueSorted(rows.map(r => String(r.region || '').trim() || '(blank)'));
    const routes = uniqueSorted(rows.map(r => String(r.route || '').trim()).filter(Boolean));
    const sizes = uniqueSorted(rows.map(sizeOf));

    function fill(id, items, allLabel, current) {
      const sel = document.getElementById(id);
      if (!sel) return;
      const prev = current || sel.value;
      sel.innerHTML = '<option value="ALL">' + allLabel + '</option>' +
        items.map(v => '<option value="' + escapeHtml(v) + '">' + escapeHtml(v) + '</option>').join('');
      if (prev && (prev === 'ALL' || items.indexOf(prev) >= 0)) sel.value = prev;
      else sel.value = 'ALL';
    }
    fill('tsdRegion', regions, 'All regions', regionFilter);
    fill('tsdRoute', routes, 'All routes', routeFilter);
    fill('tsdSize', sizes, 'All sizes', sizeFilter);

    function fillDate(id, cur, fallback) {
      const sel = document.getElementById(id);
      if (!sel) return;
      const prev = cur || sel.value;
      sel.innerHTML = dates.map(d => '<option value="' + d + '">' + d + '</option>').join('');
      if (prev && dates.indexOf(prev) >= 0) sel.value = prev;
      else if (fallback && dates.indexOf(fallback) >= 0) sel.value = fallback;
      else if (dates.length) sel.value = dates[dates.length - 1];
    }
    const defFrom = dates.length ? dates[0] : null;
    const defTo = dates.length ? dates[dates.length - 1] : null;
    fillDate('tsdDateFrom', dateFrom, defFrom);
    fillDate('tsdDateTo', dateTo, defTo);
    dateFrom = (document.getElementById('tsdDateFrom') || {}).value || dateFrom;
    dateTo = (document.getElementById('tsdDateTo') || {}).value || dateTo;
  }

  /* ---------- aggregation ---------- */
  function buildMatrix(rows) {
    // route → size → count, and route → size → unique plates
    const byRoute = new Map();
    const sizeSet = new Set();
    const daySet = new Set();
    const plateSet = new Set();
    const sizeTotals = new Map();
    const daySize = new Map(); // date → size → count

    rows.forEach(r => {
      const route = (r.route || '(blank)').trim() || '(blank)';
      const size = sizeOf(r);
      const day = r.dateKey;
      sizeSet.add(size);
      if (day) daySet.add(day);
      if (r.plate) plateSet.add(String(r.plate).toUpperCase());

      if (!byRoute.has(route)) {
        byRoute.set(route, {
          route,
          region: r.region || '',
          type: r.routeType || '',
          sizes: new Map(),
          plates: new Map(), // size → Set(plate)
          total: 0,
          uniquePlates: new Set()
        });
      }
      const rec = byRoute.get(route);
      rec.total += 1;
      rec.sizes.set(size, (rec.sizes.get(size) || 0) + 1);
      if (!rec.plates.has(size)) rec.plates.set(size, new Set());
      if (r.plate) {
        rec.plates.get(size).add(String(r.plate).toUpperCase());
        rec.uniquePlates.add(String(r.plate).toUpperCase());
      }
      sizeTotals.set(size, (sizeTotals.get(size) || 0) + 1);

      if (day) {
        if (!daySize.has(day)) daySize.set(day, new Map());
        const m = daySize.get(day);
        m.set(size, (m.get(size) || 0) + 1);
      }
    });

    const sizes = uniqueSorted([...sizeSet]);
    const days = [...daySet].sort();
    const routes = [...byRoute.values()].sort((a, b) => b.total - a.total || a.route.localeCompare(b.route));

    return {
      sizes,
      days,
      routes,
      sizeTotals,
      daySize,
      totalTrips: rows.length,
      uniquePlates: plateSet.size,
      hasSizeData: sizes.some(s => s !== '(unknown)')
    };
  }

  function metricCard(label, value, sub, tone) {
    return '<div class="tsd-metric' + (tone ? ' tsd-m-' + tone : '') + '">' +
      '<div class="tsd-m-label">' + label + '</div>' +
      '<div class="tsd-m-value">' + value + '</div>' +
      (sub ? '<div class="tsd-m-sub">' + sub + '</div>' : '') +
      '</div>';
  }

  function renderMetrics(mx) {
    const el = document.getElementById('tsdMetrics');
    if (!el) return;
    const topSize = mx.sizes.length
      ? mx.sizes.slice().sort((a, b) => (mx.sizeTotals.get(b) || 0) - (mx.sizeTotals.get(a) || 0))[0]
      : '—';
    const topN = topSize !== '—' ? (mx.sizeTotals.get(topSize) || 0) : 0;
    el.innerHTML =
      metricCard('Dispatches', mx.totalTrips.toLocaleString(), 'trips in range', 'neutral') +
      metricCard('Unique plates', mx.uniquePlates.toLocaleString(), 'distinct trucks', 'ok') +
      metricCard('Routes', mx.routes.length.toLocaleString(), 'with trips', 'neutral') +
      metricCard('Size types', mx.sizes.length.toLocaleString(),
        mx.hasSizeData ? 'from Vehicle Type' : 'size col missing → (unknown)', mx.hasSizeData ? 'ok' : 'warn') +
      metricCard('Top size', escapeHtml(topSize), topN ? (topN + ' trips') : '', 'neutral') +
      metricCard('Days', mx.days.length.toLocaleString(),
        (dateFrom || '—') + ' → ' + (dateTo || '—'), 'neutral');
  }

  function renderSizeChips(mx) {
    const el = document.getElementById('tsdSizeChips');
    if (!el) return;
    if (!mx.sizes.length) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML = mx.sizes.map(s => {
      const n = mx.sizeTotals.get(s) || 0;
      const pct = mx.totalTrips ? ((n / mx.totalTrips) * 100).toFixed(1) : '0';
      const active = sizeFilter === s ? ' active' : '';
      return '<button type="button" class="tsd-size-chip' + active + '" data-tsd-size="' +
        escapeHtml(s) + '"><strong>' + escapeHtml(s) + '</strong>' +
        '<span>' + n + ' · ' + pct + '%</span></button>';
    }).join('');
    el.querySelectorAll('[data-tsd-size]').forEach(btn => {
      btn.addEventListener('click', () => {
        const s = btn.getAttribute('data-tsd-size');
        sizeFilter = sizeFilter === s ? 'ALL' : s;
        const sel = document.getElementById('tsdSize');
        if (sel) sel.value = sizeFilter;
        selectedSize = sizeFilter === 'ALL' ? null : sizeFilter;
        run();
      });
    });
  }

  function renderMatrix(mx) {
    const head = document.getElementById('tsdMatrixHead');
    const body = document.getElementById('tsdMatrixBody');
    if (!head || !body) return;

    if (!mx.routes.length) {
      head.innerHTML = '<tr><th>Route</th></tr>';
      body.innerHTML = '<tr><td>No dispatches in the selected range / filters.</td></tr>';
      return;
    }

    const sizes = mx.sizes;
    head.innerHTML = '<tr>' +
      '<th>Route</th><th>Region</th><th>Type</th><th>Total</th><th>Plates</th>' +
      sizes.map(s => '<th class="tsd-size-col">' + escapeHtml(s) + '</th>').join('') +
      '</tr>';

    body.innerHTML = mx.routes.map(rec => {
      const active = selectedRoute === rec.route ? ' class="tsd-row-active"' : '';
      return '<tr data-tsd-route="' + escapeHtml(rec.route) + '"' + active + '>' +
        '<td><strong>' + escapeHtml(rec.route) + '</strong></td>' +
        '<td>' + escapeHtml(rec.region || '—') + '</td>' +
        '<td>' + escapeHtml(rec.type || '—') + '</td>' +
        '<td><strong>' + rec.total + '</strong></td>' +
        '<td>' + rec.uniquePlates.size + '</td>' +
        sizes.map(s => {
          const n = rec.sizes.get(s) || 0;
          const up = (rec.plates.get(s) || new Set()).size;
          if (!n) return '<td class="tsd-empty">—</td>';
          return '<td class="tsd-cell-click" data-tsd-route="' + escapeHtml(rec.route) +
            '" data-tsd-size="' + escapeHtml(s) + '" title="Click for detail">' +
            '<strong>' + n + '</strong>' +
            (up ? '<span class="tsd-cell-sub">' + up + ' plate' + (up > 1 ? 's' : '') + '</span>' : '') +
            '</td>';
        }).join('') +
        '</tr>';
    }).join('');

    // totals row
    body.innerHTML += '<tr class="tsd-total-row">' +
      '<td colspan="3"><strong>TOTAL</strong></td>' +
      '<td><strong>' + mx.totalTrips + '</strong></td>' +
      '<td>' + mx.uniquePlates + '</td>' +
      sizes.map(s => '<td><strong>' + (mx.sizeTotals.get(s) || 0) + '</strong></td>').join('') +
      '</tr>';

    body.querySelectorAll('[data-tsd-route]').forEach(el => {
      el.addEventListener('click', (e) => {
        const tr = e.currentTarget.closest('tr') || e.currentTarget;
        const route = tr.getAttribute('data-tsd-route') || el.getAttribute('data-tsd-route');
        const size = el.getAttribute('data-tsd-size') || null;
        selectedRoute = route;
        selectedSize = size;
        selectedDay = null;
        renderDetail();
        // highlight
        body.querySelectorAll('tr').forEach(r => r.classList.remove('tsd-row-active'));
        const row = body.querySelector('tr[data-tsd-route="' + CSS.escape(route) + '"]');
        if (row) row.classList.add('tsd-row-active');
      });
    });
  }

  function renderDailyTable(mx) {
    const head = document.getElementById('tsdDailyHead');
    const body = document.getElementById('tsdDailyBody');
    if (!head || !body) return;
    if (!mx.days.length) {
      head.innerHTML = '<tr><th>Date</th></tr>';
      body.innerHTML = '<tr><td>—</td></tr>';
      return;
    }
    const sizes = mx.sizes;
    head.innerHTML = '<tr><th>Date</th><th>Total</th>' +
      sizes.map(s => '<th>' + escapeHtml(s) + '</th>').join('') + '</tr>';
    body.innerHTML = mx.days.slice().reverse().map(d => {
      const m = mx.daySize.get(d) || new Map();
      let total = 0;
      sizes.forEach(s => { total += m.get(s) || 0; });
      const active = selectedDay === d ? ' class="tsd-row-active"' : '';
      return '<tr data-tsd-day="' + d + '"' + active + '>' +
        '<td><strong>' + d + '</strong></td>' +
        '<td>' + total + '</td>' +
        sizes.map(s => {
          const n = m.get(s) || 0;
          return n ? '<td>' + n + '</td>' : '<td class="tsd-empty">—</td>';
        }).join('') +
        '</tr>';
    }).join('');

    body.querySelectorAll('[data-tsd-day]').forEach(tr => {
      tr.addEventListener('click', () => {
        selectedDay = tr.getAttribute('data-tsd-day');
        selectedRoute = null;
        selectedSize = null;
        body.querySelectorAll('tr').forEach(r => r.classList.remove('tsd-row-active'));
        tr.classList.add('tsd-row-active');
        renderDetail();
      });
    });
  }

  function renderCharts(mx) {
    if (typeof Chart === 'undefined') return;
    if (chartMix) { try { chartMix.destroy(); } catch (e) {} chartMix = null; }
    if (chartDaily) { try { chartDaily.destroy(); } catch (e) {} chartDaily = null; }

    const mixEl = document.getElementById('tsdChartMix');
    if (mixEl && mx.sizes.length) {
      const palette = ['#E60012', '#1565C0', '#2E7D32', '#F9A825', '#6A1B9A', '#00838F', '#EF6C00', '#AD1457', '#455A64', '#5D4037'];
      chartMix = new Chart(mixEl, {
        type: 'doughnut',
        data: {
          labels: mx.sizes,
          datasets: [{
            data: mx.sizes.map(s => mx.sizeTotals.get(s) || 0),
            backgroundColor: mx.sizes.map((_, i) => palette[i % palette.length]),
            borderWidth: 2,
            borderColor: '#fff'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } },
            tooltip: {
              callbacks: {
                label: ctx => {
                  const v = ctx.parsed || 0;
                  const pct = mx.totalTrips ? ((v / mx.totalTrips) * 100).toFixed(1) : '0';
                  return ' ' + ctx.label + ': ' + v + ' (' + pct + '%)';
                }
              }
            }
          }
        }
      });
    }

    const dayEl = document.getElementById('tsdChartDaily');
    if (dayEl && mx.days.length) {
      const palette = ['#E60012', '#1565C0', '#2E7D32', '#F9A825', '#6A1B9A', '#00838F', '#EF6C00', '#AD1457'];
      const topSizes = mx.sizes.slice().sort((a, b) => (mx.sizeTotals.get(b) || 0) - (mx.sizeTotals.get(a) || 0)).slice(0, 6);
      chartDaily = new Chart(dayEl, {
        type: 'bar',
        data: {
          labels: mx.days.map(d => String(d).slice(5)),
          datasets: topSizes.map((s, i) => ({
            label: s,
            data: mx.days.map(d => (mx.daySize.get(d) || new Map()).get(s) || 0),
            backgroundColor: palette[i % palette.length],
            borderRadius: 3,
            maxBarThickness: 22
          }))
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } }
          },
          scales: {
            x: { stacked: true, grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 45 } },
            y: { stacked: true, beginAtZero: true, grid: { color: '#F0F0F0' }, title: { display: true, text: 'Trips' } }
          }
        }
      });
    }
  }

  function detailRows() {
    let rows = baseFilter(allRows());
    if (selectedRoute) rows = rows.filter(r => String(r.route || '').trim() === selectedRoute);
    if (selectedSize) rows = rows.filter(r => sizeOf(r) === selectedSize);
    if (selectedDay) rows = rows.filter(r => r.dateKey === selectedDay);
    return rows.slice().sort((a, b) => {
      if (a.dateKey !== b.dateKey) return (b.dateKey || '').localeCompare(a.dateKey || '');
      return String(a.route || '').localeCompare(String(b.route || ''));
    });
  }

  function renderDetail() {
    const note = document.getElementById('tsdDetailNote');
    const body = document.getElementById('tsdDetailBody');
    const count = document.getElementById('tsdDetailCount');
    if (!body) return;
    const rows = detailRows();
    const parts = [];
    if (selectedRoute) parts.push('Route ' + selectedRoute);
    if (selectedSize) parts.push('Size ' + selectedSize);
    if (selectedDay) parts.push('Day ' + selectedDay);
    if (!parts.length) parts.push('All filtered trips (top 300)');
    if (note) note.textContent = parts.join(' · ');
    if (count) count.textContent = rows.length + ' trip(s)';

    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="10">No trips for this selection.</td></tr>';
      return;
    }
    body.innerHTML = rows.slice(0, 300).map(r => {
      return '<tr>' +
        '<td>' + escapeHtml(r.dateKey || '') + '</td>' +
        '<td>' + escapeHtml(r.route || '') + '</td>' +
        '<td>' + escapeHtml(r.region || '') + '</td>' +
        '<td><strong>' + escapeHtml(sizeOf(r)) + '</strong></td>' +
        '<td>' + escapeHtml(r.plate || '—') + '</td>' +
        '<td>' + escapeHtml(r.trucker || '') + '</td>' +
        '<td>' + escapeHtml(r.taskId || '') + '</td>' +
        '<td>' + escapeHtml(r.dcIntended || '') + '</td>' +
        '<td>' + escapeHtml(r.onTime || '') + '</td>' +
        '<td>' + escapeHtml(r.routeType || '') + '</td>' +
        '</tr>';
    }).join('');
  }

  function updateInfo(mx) {
    const el = document.getElementById('tsdInfo');
    if (!el) return;
    const warn = mx && !mx.hasSizeData
      ? ' · <span class="badge" style="background:#E65100">No Vehicle Type / size column found — counts under (unknown).</span>'
      : '';
    el.innerHTML = 'Range <span class="badge">' + escapeHtml(dateFrom || '—') + ' → ' + escapeHtml(dateTo || '—') +
      '</span> · Scope <span class="badge">' + scope + '</span> · Trips <span class="badge">' +
      (mx ? mx.totalTrips : 0) + '</span>' + warn;
  }

  /* ---- Excel styles (match Rate Matrix / Mainline Report) ---- */
  const BORDER = {
    top: { style: 'thin', color: { rgb: '8B0000' } },
    bottom: { style: 'thin', color: { rgb: '8B0000' } },
    left: { style: 'thin', color: { rgb: '8B0000' } },
    right: { style: 'thin', color: { rgb: '8B0000' } }
  };
  const BORDER_LIGHT = {
    top: { style: 'thin', color: { rgb: 'BDBDBD' } },
    bottom: { style: 'thin', color: { rgb: 'BDBDBD' } },
    left: { style: 'thin', color: { rgb: 'BDBDBD' } },
    right: { style: 'thin', color: { rgb: 'BDBDBD' } }
  };

  function titleStyle() {
    return {
      fill: { patternType: 'solid', fgColor: { rgb: 'C00000' } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 12, name: 'Calibri' },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: BORDER
    };
  }
  function headStyle() {
    return {
      fill: { patternType: 'solid', fgColor: { rgb: 'C00000' } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 9, name: 'Calibri' },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: BORDER
    };
  }
  function metaStyle() {
    return {
      font: { bold: true, sz: 10, name: 'Calibri', color: { rgb: '424242' } },
      alignment: { horizontal: 'left', vertical: 'center' }
    };
  }
  function cellStyle(opts) {
    return Object.assign({
      font: { sz: 10, name: 'Calibri' },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: BORDER_LIGHT
    }, opts || {});
  }
  function totalStyle() {
    return {
      fill: { patternType: 'solid', fgColor: { rgb: 'FFEBEE' } },
      font: { bold: true, sz: 10, name: 'Calibri', color: { rgb: 'B71C1C' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: BORDER
    };
  }
  function nameStyle() {
    return {
      font: { bold: true, sz: 10, name: 'Calibri' },
      alignment: { horizontal: 'left', vertical: 'center' },
      border: BORDER_LIGHT
    };
  }

  function applySheetStyles(ws, pack) {
    ws['!merges'] = pack.merges || [];
    ws['!cols'] = pack.cols || [];
    if (pack.rowHeights) ws['!rows'] = pack.rowHeights;
    Object.keys(pack.styles || {}).forEach(function (key) {
      const parts = key.split('_');
      const r = parseInt(parts[0], 10);
      const c = parseInt(parts[1], 10);
      const ref = XLSX.utils.encode_cell({ r: r, c: c });
      if (!ws[ref]) ws[ref] = { t: 's', v: '' };
      ws[ref].s = pack.styles[key];
      if (ws[ref].v == null) { ws[ref].v = ''; ws[ref].t = 's'; }
    });
  }

  function buildRouteSizePack(mx) {
    const sizes = mx.sizes;
    const aoa = [];
    const merges = [];
    const styles = {};
    function setS(r, c, s) { styles[r + '_' + c] = s; }
    const colCount = 5 + sizes.length;

    // Title
    const titleRow = 0;
    const title = ['TRUCK SIZE DISPATCH — ROUTE × SIZE'];
    for (let i = 1; i < colCount; i++) title.push('');
    aoa.push(title);
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } });
    for (let c = 0; c < colCount; c++) setS(0, c, titleStyle());

    // Meta
    aoa.push(['From', dateFrom || '—', 'To', dateTo || '—', 'Scope', scope]);
    for (let c = 0; c < 6; c++) setS(1, c, metaStyle());
    while (aoa[1].length < colCount) aoa[1].push('');

    // Blank spacer
    aoa.push([]);

    // Header
    const headRow = aoa.length;
    const head = ['Route', 'Region', 'Type', 'Total trips', 'Unique plates'].concat(sizes);
    aoa.push(head);
    for (let c = 0; c < head.length; c++) setS(headRow, c, headStyle());

    // Data rows
    mx.routes.forEach(rec => {
      const r = aoa.length;
      const vals = [rec.route, rec.region, rec.type, rec.total, rec.uniquePlates.size]
        .concat(sizes.map(s => rec.sizes.get(s) || 0));
      aoa.push(vals);
      setS(r, 0, nameStyle());
      setS(r, 1, cellStyle({ alignment: { horizontal: 'left', vertical: 'center' } }));
      setS(r, 2, cellStyle());
      setS(r, 3, cellStyle({ font: { bold: true, sz: 10, name: 'Calibri' } }));
      setS(r, 4, cellStyle());
      sizes.forEach((_, i) => {
        const n = vals[5 + i];
        setS(r, 5 + i, cellStyle(n
          ? { fill: { patternType: 'solid', fgColor: { rgb: 'E0F2F1' } }, font: { bold: true, sz: 10, name: 'Calibri', color: { rgb: '00695C' } } }
          : { font: { sz: 10, name: 'Calibri', color: { rgb: 'BDBDBD' } } }));
      });
    });

    // Total
    const tr = aoa.length;
    const totalVals = ['TOTAL', '', '', mx.totalTrips, mx.uniquePlates]
      .concat(sizes.map(s => mx.sizeTotals.get(s) || 0));
    aoa.push(totalVals);
    for (let c = 0; c < colCount; c++) setS(tr, c, totalStyle());

    const cols = [
      { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 14 }
    ].concat(sizes.map(() => ({ wch: 11 })));

    return { aoa, merges, styles, cols, rowHeights: [{ hpt: 22 }, { hpt: 18 }, { hpt: 8 }, { hpt: 20 }] };
  }

  function buildDailyPack(mx) {
    const sizes = mx.sizes;
    const aoa = [];
    const merges = [];
    const styles = {};
    function setS(r, c, s) { styles[r + '_' + c] = s; }
    const colCount = 2 + sizes.length;

    const title = ['DAILY SIZE MIX'];
    for (let i = 1; i < colCount; i++) title.push('');
    aoa.push(title);
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } });
    for (let c = 0; c < colCount; c++) setS(0, c, titleStyle());

    aoa.push(['From', dateFrom || '—', 'To', dateTo || '—', 'Scope', scope]);
    for (let c = 0; c < 6; c++) setS(1, c, metaStyle());
    while (aoa[1].length < colCount) aoa[1].push('');
    aoa.push([]);

    const headRow = aoa.length;
    const head = ['Date', 'Total'].concat(sizes);
    aoa.push(head);
    for (let c = 0; c < head.length; c++) setS(headRow, c, headStyle());

    mx.days.forEach(d => {
      const m = mx.daySize.get(d) || new Map();
      let total = 0;
      sizes.forEach(s => { total += m.get(s) || 0; });
      const r = aoa.length;
      const vals = [d, total].concat(sizes.map(s => m.get(s) || 0));
      aoa.push(vals);
      setS(r, 0, nameStyle());
      setS(r, 1, cellStyle({ font: { bold: true, sz: 10, name: 'Calibri' } }));
      sizes.forEach((_, i) => {
        const n = vals[2 + i];
        setS(r, 2 + i, cellStyle(n
          ? { fill: { patternType: 'solid', fgColor: { rgb: 'E0F2F1' } }, font: { bold: true, sz: 10, name: 'Calibri', color: { rgb: '00695C' } } }
          : { font: { sz: 10, name: 'Calibri', color: { rgb: 'BDBDBD' } } }));
      });
    });

    const cols = [{ wch: 14 }, { wch: 10 }].concat(sizes.map(() => ({ wch: 11 })));
    return { aoa, merges, styles, cols };
  }

  function buildSummaryPack(mx) {
    const sizes = mx.sizes;
    const aoa = [];
    const merges = [];
    const styles = {};
    function setS(r, c, s) { styles[r + '_' + c] = s; }

    aoa.push(['SIZE SUMMARY', '', '']);
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } });
    for (let c = 0; c < 3; c++) setS(0, c, titleStyle());

    aoa.push(['From ' + (dateFrom || '—') + '  →  ' + (dateTo || '—') + '   ·   Scope: ' + scope, '', '']);
    merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: 2 } });
    setS(1, 0, metaStyle());
    aoa.push([]);

    const headRow = aoa.length;
    aoa.push(['Size', 'Trips', 'Share %']);
    for (let c = 0; c < 3; c++) setS(headRow, c, headStyle());

    sizes.forEach(s => {
      const n = mx.sizeTotals.get(s) || 0;
      const share = mx.totalTrips ? +(n / mx.totalTrips * 100).toFixed(2) : 0;
      const r = aoa.length;
      aoa.push([s, n, share]);
      setS(r, 0, nameStyle());
      setS(r, 1, cellStyle({ font: { bold: true, sz: 10, name: 'Calibri' } }));
      setS(r, 2, cellStyle({
        fill: { patternType: 'solid', fgColor: { rgb: 'E0F2F1' } },
        font: { bold: true, sz: 10, name: 'Calibri', color: { rgb: '00695C' } }
      }));
    });

    const tr = aoa.length;
    aoa.push(['TOTAL', mx.totalTrips, 100]);
    for (let c = 0; c < 3; c++) setS(tr, c, totalStyle());

    return { aoa, merges, styles, cols: [{ wch: 16 }, { wch: 12 }, { wch: 12 }] };
  }

  function exportExcel() {
    if (typeof XLSX === 'undefined') {
      alert('Excel library not loaded.');
      return;
    }
    const rows = baseFilter(allRows());
    if (!rows.length) {
      alert('No data to export for the current filters.');
      return;
    }
    const mx = buildMatrix(rows);
    const wb = XLSX.utils.book_new();

    const routePack = buildRouteSizePack(mx);
    const ws1 = XLSX.utils.aoa_to_sheet(routePack.aoa);
    applySheetStyles(ws1, routePack);
    XLSX.utils.book_append_sheet(wb, ws1, 'Route x Size');

    const dailyPack = buildDailyPack(mx);
    const ws2 = XLSX.utils.aoa_to_sheet(dailyPack.aoa);
    applySheetStyles(ws2, dailyPack);
    XLSX.utils.book_append_sheet(wb, ws2, 'Daily mix');

    const sumPack = buildSummaryPack(mx);
    const ws3 = XLSX.utils.aoa_to_sheet(sumPack.aoa);
    applySheetStyles(ws3, sumPack);
    XLSX.utils.book_append_sheet(wb, ws3, 'Size summary');

    const fname = 'TRUCK_SIZE_DISPATCH_' + (dateFrom || 'all') + '_to_' + (dateTo || 'all') + '.xlsx';
    XLSX.writeFile(wb, fname);
  }

  function run() {
    const rows0 = allRows();
    if (!rows0.length) {
      const body = document.getElementById('tsdMatrixBody');
      if (body) body.innerHTML = '<tr><td>Upload a Mainline workbook first.</td></tr>';
      updateInfo(null);
      return;
    }
    populateSelectors();
    const rows = baseFilter(rows0);
    const mx = buildMatrix(rows);
    lastMatrix = mx;
    updateInfo(mx);
    renderMetrics(mx);
    renderSizeChips(mx);
    renderMatrix(mx);
    renderDailyTable(mx);
    renderCharts(mx);
    renderDetail();
  }

  function onDataReady() {
    selectedRoute = null;
    selectedSize = null;
    selectedDay = null;
    sizeFilter = 'ALL';
    routeFilter = 'ALL';
    regionFilter = 'ALL';
    scope = 'ALL';
    const dates = allDates();
    dateFrom = dates.length ? dates[0] : null;
    dateTo = dates.length ? dates[dates.length - 1] : null;
    run();
  }

  function init() {
    ['tsdScope', 'tsdRegion', 'tsdRoute', 'tsdSize', 'tsdDateFrom', 'tsdDateTo'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', () => {
        if (id === 'tsdScope') { scope = el.value || 'ALL'; selectedRoute = null; }
        if (id === 'tsdRegion') { regionFilter = el.value || 'ALL'; selectedRoute = null; }
        if (id === 'tsdRoute') {
          routeFilter = el.value || 'ALL';
          selectedRoute = routeFilter !== 'ALL' ? routeFilter : null;
        }
        if (id === 'tsdSize') {
          sizeFilter = el.value || 'ALL';
          selectedSize = sizeFilter !== 'ALL' ? sizeFilter : null;
        }
        if (id === 'tsdDateFrom') dateFrom = el.value;
        if (id === 'tsdDateTo') dateTo = el.value;
        run();
      });
    });

    const apply = document.getElementById('btnTsdApply');
    if (apply) apply.addEventListener('click', run);

    const exp = document.getElementById('btnTsdExport');
    if (exp) exp.addEventListener('click', exportExcel);

    const clear = document.getElementById('btnTsdClear');
    if (clear) {
      clear.addEventListener('click', () => {
        scope = 'ALL';
        regionFilter = 'ALL';
        routeFilter = 'ALL';
        sizeFilter = 'ALL';
        selectedRoute = null;
        selectedSize = null;
        selectedDay = null;
        const dates = allDates();
        dateFrom = dates.length ? dates[0] : null;
        dateTo = dates.length ? dates[dates.length - 1] : null;
        ['tsdScope', 'tsdRegion', 'tsdRoute', 'tsdSize'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.value = 'ALL';
        });
        run();
      });
    }
  }

  return { init, onDataReady, run, exportExcel };
})();
