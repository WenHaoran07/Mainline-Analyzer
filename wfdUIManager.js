/* ==========================================================================
   MODULE: WFD UI MANAGER
   ========================================================================== */
const WfdUIManager = (() => {

  function metricCard(label, value, sub, cls) {
    return `<div class="metric ${cls || ''}">
      <div class="metric-label">${label}</div>
      <div class="metric-value">${value}</div>
      ${sub ? `<div class="metric-sub">${sub}</div>` : ''}
    </div>`;
  }

  function renderMetrics(summary, prevSummary) {
    const el = document.getElementById('metricsOverall');
    if (!el) return;
    const rateCls = WfdUtils.rateClass(summary.rate);
    const diff = prevSummary && summary.rate != null && prevSummary.rate != null
      ? summary.rate - prevSummary.rate : null;
    const diffText = diff != null
      ? (diff >= 0 ? '▲ +' : '▼ ') + WfdUtils.pct(Math.abs(diff)) + ' vs prev'
      : '';

    el.innerHTML =
      metricCard('On-time Rate', WfdUtils.pct(summary.rate),
        `Target ${WfdUtils.pct(WfdUtils.TARGET)} · ${diffText}`, rateCls) +
      metricCard('Total Departures', summary.total, '') +
      metricCard('On Time', summary.onTime, '') +
      metricCard('Over 30 min', summary.late, summary.total ? WfdUtils.pct(summary.late / summary.total) + ' of total' : '', summary.late ? 'rate-bad' : 'rate-good') +
      metricCard('Avg Wait (min)', WfdUtils.num(summary.avgWait), `Threshold ${WfdUtils.THRESHOLD_MIN} min`);
  }

  function renderSummaryText(cmp) {
    const el = document.getElementById('summaryText');
    if (!el) return;
    const L = cmp.latest;
    const P = cmp.prev;
    const hit = L.rate != null && L.rate >= WfdUtils.TARGET;
    let html = `<strong>${WfdUtils.formatDateLabel(cmp.dateLatest)}</strong>: `;
    html += `${L.total} departures · <strong class="${WfdUtils.rateClass(L.rate)}">${WfdUtils.pct(L.rate)}</strong> on-time `;
    html += hit ? '(at/above target)' : '(below 97% target)';
    if (L.late) {
      html += `. <strong>${L.late}</strong> trip(s) waited over 30 minutes.`;
    } else {
      html += '. No over-30-minute waits.';
    }
    if (P.total) {
      const d = L.rate != null && P.rate != null ? L.rate - P.rate : null;
      if (d != null) {
        html += ` vs ${WfdUtils.formatDateLabel(cmp.datePrev)}: ${d >= 0 ? '+' : ''}${WfdUtils.pct(d)}.`;
      }
    }
    el.innerHTML = html;
  }

  function rateCell(rate) {
    const cls = WfdUtils.rateClass(rate);
    return `<td class="${cls}">${WfdUtils.pct(rate)}</td>`;
  }

  function diffCell(diff) {
    if (diff == null) return '<td>—</td>';
    const sign = diff >= 0 ? '+' : '';
    const cls = diff >= 0 ? 'rate-good' : 'rate-bad';
    return `<td class="${cls}">${sign}${WfdUtils.pct(diff)}</td>`;
  }

  function renderDcTable(dcCompare) {
    const body = document.getElementById('dcBody');
    if (!body) return;
    body.innerHTML = dcCompare.map(d => `<tr>
      <td>${d.key}</td>
      <td>${d.total}</td>
      <td>${d.onTime}</td>
      <td>${d.late}</td>
      ${rateCell(d.rate)}
      ${rateCell(d.prevRate)}
      ${diffCell(d.rateDiff)}
      <td>${WfdUtils.num(d.avgWait)}</td>
    </tr>`).join('') || '<tr><td colspan="8">No data</td></tr>';
  }

  function renderSupTable(supCompare) {
    const body = document.getElementById('supBody');
    if (!body) return;
    body.innerHTML = supCompare.map(d => `<tr>
      <td>${WfdUtils.displaySupervisorName(d.key)}</td>
      <td>${d.total}</td>
      <td>${d.onTime}</td>
      <td>${d.late}</td>
      ${rateCell(d.rate)}
      ${rateCell(d.prevRate)}
      ${diffCell(d.rateDiff)}
      <td>${WfdUtils.num(d.avgWait)}</td>
    </tr>`).join('') || '<tr><td colspan="8">No data</td></tr>';
  }

  function renderRouteTable(routes) {
    const body = document.getElementById('routeBody');
    if (!body) return;
    body.innerHTML = routes.map(d => `<tr>
      <td>${d.key}</td>
      <td>${d.total}</td>
      <td>${d.onTime}</td>
      <td>${d.late}</td>
      ${rateCell(d.rate)}
      <td>${WfdUtils.num(d.avgWait)}</td>
    </tr>`).join('') || '<tr><td colspan="6">No data</td></tr>';
  }

  function renderCarrierTable(carriers) {
    const body = document.getElementById('carrierBody');
    if (!body) return;
    body.innerHTML = carriers.map(d => `<tr>
      <td>${d.key}</td>
      <td>${d.total}</td>
      <td>${d.onTime}</td>
      <td>${d.late}</td>
      ${rateCell(d.rate)}
      <td>${WfdUtils.num(d.avgWait)}</td>
    </tr>`).join('') || '<tr><td colspan="6">No data</td></tr>';
  }

  function renderLateDetail(lateRows) {
    const body = document.getElementById('lateBody');
    if (!body) return;
    if (!lateRows.length) {
      body.innerHTML = '<tr><td colspan="8" class="rate-good">No over-30-minute waits on this day 🎉</td></tr>';
      return;
    }
    body.innerHTML = lateRows
      .slice()
      .sort((a, b) => (b.interval || 0) - (a.interval || 0))
      .map(r => `<tr>
        <td>${r.taskId || '—'}</td>
        <td>${r.routeName || '—'}</td>
        <td>${r.dcName}</td>
        <td>${WfdUtils.displaySupervisorName(r.supervisor)}</td>
        <td>${r.plate || '—'}</td>
        <td>${r.carrier || '—'}</td>
        <td class="rate-bad">${WfdUtils.num(r.interval)}</td>
        <td>${r.status || '—'}</td>
      </tr>`).join('');
  }

  function renderHistory(history) {
    const body = document.getElementById('historyBody');
    if (!body) return;
    body.innerHTML = history.map(h => `<tr>
      <td>${WfdUtils.formatDateLabel(h.key)}</td>
      <td>${h.total}</td>
      <td>${h.onTime}</td>
      <td>${h.late}</td>
      ${rateCell(h.rate)}
      <td>${WfdUtils.num(h.avgWait)}</td>
    </tr>`).join('') || '<tr><td colspan="6">No data</td></tr>';
  }

  function populateDateSelects(dates, selectPrevId, selectLatestId) {
    const prev = document.getElementById(selectPrevId);
    const latest = document.getElementById(selectLatestId);
    if (!prev || !latest) return;
    const opts = dates.map(d => `<option value="${d}">${WfdUtils.formatDateLabel(d)} (${d})</option>`).join('');
    prev.innerHTML = opts;
    latest.innerHTML = opts;
    if (dates.length >= 2) {
      prev.value = dates[dates.length - 2];
      latest.value = dates[dates.length - 1];
    } else if (dates.length === 1) {
      prev.value = dates[0];
      latest.value = dates[0];
    }
  }

  function setDateBadges(datePrev, dateLatest) {
    const a = document.getElementById('dateLatest');
    const b = document.getElementById('datePrev');
    if (a) a.textContent = WfdUtils.formatDateLabel(dateLatest);
    if (b) b.textContent = WfdUtils.formatDateLabel(datePrev);
  }

  function showResults() {
    const results = document.getElementById('results');
    if (results) results.classList.remove('hidden');
  }

  function initTabs() {
    document.querySelectorAll('.tabs .tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const id = tab.getAttribute('data-tab');
        document.querySelectorAll('.tabs .tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const panel = document.getElementById(id);
        if (panel) panel.classList.add('active');
      });
    });
  }

  function initMainTabs() {
    const dayBtn = document.getElementById('tabWfdDay');
    const supBtn = document.getElementById('tabWfdSup');
    const dayPanel = document.getElementById('wfdDayPanel');
    const supPanel = document.getElementById('wfdSupPanel');
    if (!dayBtn || !supBtn || !dayPanel || !supPanel) return;

    function show(which) {
      const isDay = which === 'day';
      dayBtn.classList.toggle('active', isDay);
      supBtn.classList.toggle('active', !isDay);
      dayPanel.classList.toggle('hidden', !isDay);
      supPanel.classList.toggle('hidden', isDay);
    }
    dayBtn.addEventListener('click', () => show('day'));
    supBtn.addEventListener('click', () => show('sup'));
  }


  function rateClassSup(rate, target) {
    if (rate == null) return '';
    if (target != null && rate >= target) return 'ok';
    if (rate >= 0.95) return 'ok';
    if (rate >= 0.90) return 'mid';
    return 'bad';
  }

  /** MTT-style overview: hero + KPIs + by supervisor + by DC (WFD on-time logic) */
  function renderSupervisorOverview(matrix, periodLabel, byDc, maps) {
    const host = document.getElementById('wfdSupView');
    if (!host) return;

    if (!matrix || !(matrix.rows || []).length) {
      host.innerHTML = '<div class="sup-empty-state"><div class="sup-empty-ico">👤</div>' +
        '<div class="sup-empty-title">No supervisor data</div>' +
        '<p>Upload a Waiting for Departure file to see performance.</p></div>';
      return;
    }

    const slu = (matrix.rows || []).find(r => r.name === 'SLU') || {};
    const target = WfdUtils.TARGET; // overall 97%
    const rate = slu.accumulated;
    const hit = rate != null && rate >= target;
    const gap = (rate != null) ? (rate - target) * 100 : null;
    const total = slu.total || 0;
    const onTime = slu.onTime || 0;
    const late = slu.late || 0;

    let h = '';
    h += '<div class="sup-showing">Showing: <strong>' + (periodLabel || 'All dates') +
      '</strong> · ' + total.toLocaleString() + ' departures</div>';

    h += '<div class="sup-top-row">';
    h += '<div class="sup-hero ' + (hit ? 'is-ok' : 'is-bad') + '">';
    h += '<div class="sup-hero-kicker">SLU Waiting for Departure</div>';
    h += '<div class="sup-hero-rate">' + WfdUtils.pct(rate) + '</div>';
    h += '<div class="sup-hero-tgt">Target ' + WfdUtils.pct(target, 0);
    if (gap != null) {
      h += ' · <span class="' + (gap >= 0 ? 'up' : 'down') + '">' +
        (gap >= 0 ? '+' : '') + gap.toFixed(2) + ' pp vs target</span>';
    }
    h += '</div></div>';

    h += '<div class="sup-kpi-row">';
    h += '<div class="sup-kpi"><div class="sup-kpi-ico muted">📦</div><div class="sup-kpi-body">';
    h += '<div class="sup-kpi-k">Total departures</div><div class="sup-kpi-v">' + total.toLocaleString() + '</div></div></div>';
    h += '<div class="sup-kpi ok"><div class="sup-kpi-ico ok">✓</div><div class="sup-kpi-body">';
    h += '<div class="sup-kpi-k">On time (≤30 min)</div><div class="sup-kpi-v pos">' + onTime.toLocaleString() + '</div></div></div>';
    h += '<div class="sup-kpi bad"><div class="sup-kpi-ico bad">✕</div><div class="sup-kpi-body">';
    h += '<div class="sup-kpi-k">Late (&gt;30 min)</div><div class="sup-kpi-v neg">' + late.toLocaleString() + '</div></div></div>';
    h += '</div></div>'; // kpi-row + top-row

    // By Supervisor
    const supRows = (matrix.rows || []).filter(r => r.name !== 'SLU');
    const supDcs = (maps && maps.supDcs) || {};
    const dcSups = (maps && maps.dcSups) || {};
    h += '<div class="sup-section-bar"><h4 class="sup-section-title">By Supervisor In-charge</h4></div>';
    if (!supRows.length) {
      h += '<p class="section-note">No supervisor rows.</p>';
    } else {
      h += '<div class="sup-table-wrap"><table class="sup-grid"><thead><tr>';
      h += '<th>Supervisor In-charge</th><th>DC Handling</th><th>Total departures</th><th>On time</th><th>Late</th><th>Target</th><th>Rate</th>';
      h += '</tr></thead><tbody>';
      supRows.forEach(r => {
        const tgt = r.target != null ? r.target : WfdUtils.supervisorTarget(r.name);
        const rc = rateClassSup(r.accumulated, tgt);
        const dcs = supDcs[r.name] || [];
        const dcHtml = dcs.length
          ? dcs.map(d => '<span class="sup-dc-chip">' + d + '</span>').join(' ')
          : '<span class="muted-cell">—</span>';
        h += '<tr>';
        h += '<td class="left"><strong>' + WfdUtils.displaySupervisorName(r.name || '—') + '</strong></td>';
        h += '<td class="left dc-list-cell">' + dcHtml + '</td>';
        h += '<td>' + (r.total || 0).toLocaleString() + '</td>';
        h += '<td class="pos">' + (r.onTime || 0).toLocaleString() + '</td>';
        h += '<td class="' + (r.late ? 'neg' : '') + '">' + (r.late || 0).toLocaleString() + '</td>';
        h += '<td>' + WfdUtils.pct(tgt, 0) + '</td>';
        h += '<td class="rate-cell ' + rc + '">' + WfdUtils.pct(r.accumulated) + '</td>';
        h += '</tr>';
      });
      h += '</tbody></table></div>';
    }

    // By DC
    h += '<div class="sup-section-bar" style="margin-top:20px;"><h4 class="sup-section-title">By Departure DC</h4></div>';
    if (!byDc || !byDc.length) {
      h += '<p class="section-note">No DC rows.</p>';
    } else {
      h += '<div class="sup-table-wrap"><table class="sup-grid"><thead><tr>';
      h += '<th>DC Name</th><th>Supervisor Handling</th><th>Total departures</th><th>On time</th><th>Late</th><th>Target</th><th>Rate</th><th>Avg wait (min)</th>';
      h += '</tr></thead><tbody>';
      byDc.forEach(d => {
        const tgt = WfdUtils.TARGET;
        const rc = rateClassSup(d.rate, tgt);
        const sups = dcSups[d.key] || [];
        const supHtml = sups.length
          ? sups.map(s => '<span class="sup-person-chip">' + WfdUtils.displaySupervisorName(s) + '</span>').join(' ')
          : '<span class="muted-cell">—</span>';
        h += '<tr>';
        h += '<td class="left"><strong>' + (d.key || '—') + '</strong></td>';
        h += '<td class="left dc-list-cell">' + supHtml + '</td>';
        h += '<td>' + (d.total || 0).toLocaleString() + '</td>';
        h += '<td class="pos">' + (d.onTime || 0).toLocaleString() + '</td>';
        h += '<td class="' + (d.late ? 'neg' : '') + '">' + (d.late || 0).toLocaleString() + '</td>';
        h += '<td>' + WfdUtils.pct(tgt, 0) + '</td>';
        h += '<td class="rate-cell ' + rc + '">' + WfdUtils.pct(d.rate) + '</td>';
        h += '<td>' + WfdUtils.num(d.avgWait) + '</td>';
        h += '</tr>';
      });
      h += '</tbody></table></div>';
    }

    host.innerHTML = h;
  }


  function loadScriptOnce(src) {
    return new Promise(function (resolve, reject) {
      if (document.querySelector('script[src="' + src + '"]') && typeof ExcelJS !== 'undefined') {
        resolve();
        return;
      }
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async function ensureExcelJS() {
    if (typeof ExcelJS !== 'undefined') return;
    await loadScriptOnce('https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js');
  }

  const WfdXLS = {
    thin: function (argb) {
      const s = { style: 'thin', color: { argb: argb || 'FFE0E0E0' } };
      return { top: s, left: s, bottom: s, right: s };
    },
    fill: function (argb) {
      return { type: 'pattern', pattern: 'solid', fgColor: { argb: argb } };
    },
    font: function (opts) {
      return Object.assign({ name: 'Calibri', size: 10 }, opts || {});
    }
  };

  function styleTitleRow(ws, row, text, colCount) {
    ws.mergeCells(row, 1, row, colCount);
    const cell = ws.getCell(row, 1);
    cell.value = text;
    cell.font = WfdXLS.font({ bold: true, size: 16, color: { argb: 'FFE60012' } });
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    ws.getRow(row).height = 26;
  }

  function styleSubRow(ws, row, text, colCount) {
    ws.mergeCells(row, 1, row, colCount);
    const cell = ws.getCell(row, 1);
    cell.value = text;
    cell.font = WfdXLS.font({ size: 10, color: { argb: 'FF757575' } });
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    ws.getRow(row).height = 18;
  }

  function styleHeaderRow(ws, rowNum, colCount) {
    const row = ws.getRow(rowNum);
    for (let c = 1; c <= colCount; c++) {
      const cell = row.getCell(c);
      cell.fill = WfdXLS.fill('FFE60012');
      cell.font = WfdXLS.font({ bold: true, color: { argb: 'FFFFFFFF' }, size: 11 });
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = WfdXLS.thin('FFE0E0E0');
    }
    row.height = 22;
  }

  function rateFill(rate, target) {
    if (rate == null || isNaN(rate)) return WfdXLS.fill('FFFFFFFF');
    if (target != null && rate >= target) return WfdXLS.fill('FFC6EFCE');
    if (target != null && rate < target) return WfdXLS.fill('FFFFC7CE');
    return WfdXLS.fill('FFFFFFFF');
  }

  function rateFont(rate, target) {
    if (rate == null || isNaN(rate)) return WfdXLS.font({ size: 10 });
    if (target != null && rate >= target) return WfdXLS.font({ bold: true, size: 10, color: { argb: 'FF006100' } });
    if (target != null && rate < target) return WfdXLS.font({ bold: true, size: 10, color: { argb: 'FF9C0006' } });
    return WfdXLS.font({ size: 10 });
  }

  function writeDataCell(cell, value, opts) {
    opts = opts || {};
    cell.value = value;
    cell.border = WfdXLS.thin('FFE0E0E0');
    cell.font = opts.font || WfdXLS.font({ size: 10 });
    cell.alignment = opts.alignment || { vertical: 'middle', horizontal: opts.left ? 'left' : 'center' };
    if (opts.fill) cell.fill = opts.fill;
    if (opts.numFmt) cell.numFmt = opts.numFmt;
  }

  async function exportSupervisorPerformance(matrix, byDc, periodLabel, maps) {
    if (!matrix || !(matrix.rows || []).length) {
      alert('No supervisor data to export.');
      return;
    }

    try {
      await ensureExcelJS();
    } catch (e) {
      alert('Could not load Excel library. Check your internet connection.');
      return;
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = 'WFD Analyzer';
    wb.created = new Date();
    const period = periodLabel || 'All dates';
    const stamp = new Date().toISOString().slice(0, 10);

    // ===== Sheet 1: By Supervisor =====
    {
      const ws = wb.addWorksheet('By Supervisor', {
        views: [{ state: 'frozen', ySplit: 4 }]
      });
      const headers = ['Supervisor', 'DC Handling', 'Total Departures', 'On Time', 'Late', 'Target %', 'Rate %'];
      const colCount = headers.length;
      const supDcsMap = (maps && maps.supDcs) || {};
      const dcSupsMap = (maps && maps.dcSups) || {};
      ws.columns = [
        { width: 28 }, { width: 36 }, { width: 16 }, { width: 12 }, { width: 10 }, { width: 12 }, { width: 12 }
      ];

      styleTitleRow(ws, 1, 'Waiting for Departure — Supervisor Performance', colCount);
      styleSubRow(ws, 2, 'Period: ' + period + '  ·  Generated: ' + stamp, colCount);
      ws.getRow(3).height = 8;

      headers.forEach((h, i) => { ws.getCell(4, i + 1).value = h; });
      styleHeaderRow(ws, 4, colCount);

      (matrix.rows || []).forEach((r, idx) => {
        const rowNum = 5 + idx;
        const tgt = r.target != null ? r.target : WfdUtils.supervisorTarget(r.name);
        const rate = r.accumulated;
        const isSlu = r.name === 'SLU';
        const name = isSlu ? 'SLU' : WfdUtils.displaySupervisorName(r.name);
        const alt = idx % 2 === 1 ? WfdXLS.fill('FFF9F9F9') : WfdXLS.fill('FFFFFFFF');
        const sluFill = isSlu ? WfdXLS.fill('FFFFEBEE') : alt;

        const dcList = isSlu ? 'All DCs' : ((supDcsMap[r.name] || []).join(', ') || '—');
        writeDataCell(ws.getCell(rowNum, 1), name, {
          left: true,
          fill: sluFill,
          font: WfdXLS.font({ bold: isSlu, size: 10 })
        });
        writeDataCell(ws.getCell(rowNum, 2), dcList, {
          left: true,
          fill: sluFill,
          font: WfdXLS.font({ size: 9, color: { argb: 'FF616161' } })
        });
        writeDataCell(ws.getCell(rowNum, 3), r.total || 0, { fill: sluFill });
        writeDataCell(ws.getCell(rowNum, 4), r.onTime || 0, {
          fill: sluFill,
          font: WfdXLS.font({ size: 10, color: { argb: 'FF2E7D32' }, bold: true })
        });
        writeDataCell(ws.getCell(rowNum, 5), r.late || 0, {
          fill: sluFill,
          font: WfdXLS.font({ size: 10, color: { argb: r.late ? 'FFC62828' : 'FF616161' }, bold: !!r.late })
        });
        writeDataCell(ws.getCell(rowNum, 6), tgt != null ? +(tgt * 100).toFixed(1) : '', {
          fill: sluFill,
          numFmt: '0.0'
        });
        writeDataCell(ws.getCell(rowNum, 7), rate != null ? +(rate * 100).toFixed(2) : '', {
          fill: rateFill(rate, tgt),
          font: rateFont(rate, tgt),
          numFmt: '0.00'
        });
        ws.getRow(rowNum).height = 18;
      });
    }

    // ===== Sheet 2: By DC =====
    if (byDc && byDc.length) {
      const ws = wb.addWorksheet('By DC', {
        views: [{ state: 'frozen', ySplit: 4 }]
      });
      const headers = ['DC Name', 'Supervisor Handling', 'Total Departures', 'On Time', 'Late', 'Target %', 'Rate %', 'Avg Wait (min)'];
      const colCount = headers.length;
      const dcSupsMap = (maps && maps.dcSups) || {};
      ws.columns = [
        { width: 22 }, { width: 32 }, { width: 16 }, { width: 12 }, { width: 10 },
        { width: 12 }, { width: 12 }, { width: 14 }
      ];

      styleTitleRow(ws, 1, 'Waiting for Departure — By Departure DC', colCount);
      styleSubRow(ws, 2, 'Period: ' + period + '  ·  Generated: ' + stamp, colCount);
      ws.getRow(3).height = 8;

      headers.forEach((h, i) => { ws.getCell(4, i + 1).value = h; });
      styleHeaderRow(ws, 4, colCount);

      const tgt = WfdUtils.TARGET;
      byDc.forEach((d, idx) => {
        const rowNum = 5 + idx;
        const rate = d.rate;
        const alt = idx % 2 === 1 ? WfdXLS.fill('FFF9F9F9') : WfdXLS.fill('FFFFFFFF');

        const supList = (dcSupsMap[d.key] || []).map(s => WfdUtils.displaySupervisorName(s)).join(', ') || '—';
        writeDataCell(ws.getCell(rowNum, 1), d.key || '', { left: true, fill: alt, font: WfdXLS.font({ bold: true, size: 10 }) });
        writeDataCell(ws.getCell(rowNum, 2), supList, {
          left: true,
          fill: alt,
          font: WfdXLS.font({ size: 9, color: { argb: 'FF616161' } })
        });
        writeDataCell(ws.getCell(rowNum, 3), d.total || 0, { fill: alt });
        writeDataCell(ws.getCell(rowNum, 4), d.onTime || 0, {
          fill: alt,
          font: WfdXLS.font({ size: 10, color: { argb: 'FF2E7D32' }, bold: true })
        });
        writeDataCell(ws.getCell(rowNum, 5), d.late || 0, {
          fill: alt,
          font: WfdXLS.font({ size: 10, color: { argb: d.late ? 'FFC62828' : 'FF616161' }, bold: !!d.late })
        });
        writeDataCell(ws.getCell(rowNum, 6), +(tgt * 100).toFixed(1), { fill: alt, numFmt: '0.0' });
        writeDataCell(ws.getCell(rowNum, 7), rate != null ? +(rate * 100).toFixed(2) : '', {
          fill: rateFill(rate, tgt),
          font: rateFont(rate, tgt),
          numFmt: '0.00'
        });
        writeDataCell(ws.getCell(rowNum, 8), d.avgWait != null ? +Number(d.avgWait).toFixed(1) : '', {
          fill: alt,
          numFmt: '0.0'
        });
        ws.getRow(rowNum).height = 18;
      });
    }

    // ===== Sheet 3: Daily Matrix =====
    {
      const ws = wb.addWorksheet('Daily Matrix', {
        views: [{ state: 'frozen', xSplit: 1, ySplit: 4 }]
      });
      const dates = matrix.dates || [];
      const dayLabels = dates.map(d => {
        const parts = String(d).split('-');
        if (parts.length === 3) {
          const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
          const mi = parseInt(parts[1], 10) - 1;
          return parseInt(parts[2], 10) + '/' + (months[mi] || parts[1]);
        }
        return WfdUtils.formatDateLabel(d);
      });
      const headers = ['Supervisor', 'Accumulated %', 'Target %', 'Variance pp', ...dayLabels];
      const colCount = headers.length;

      ws.getColumn(1).width = 28;
      ws.getColumn(2).width = 14;
      ws.getColumn(3).width = 12;
      ws.getColumn(4).width = 12;
      for (let i = 5; i <= colCount; i++) ws.getColumn(i).width = 10;

      styleTitleRow(ws, 1, 'Waiting for Departure — Daily Supervisor Matrix', colCount);
      styleSubRow(ws, 2, 'Period: ' + period + '  ·  Generated: ' + stamp + '  ·  Yellow / red = below target', colCount);
      ws.getRow(3).height = 8;

      headers.forEach((h, i) => { ws.getCell(4, i + 1).value = h; });
      styleHeaderRow(ws, 4, colCount);

      (matrix.rows || []).forEach((row, idx) => {
        const rowNum = 5 + idx;
        const isSlu = row.name === 'SLU';
        const name = isSlu ? 'SLU' : WfdUtils.displaySupervisorName(row.name);
        const tgt = row.target != null ? row.target : WfdUtils.supervisorTarget(row.name);
        const alt = isSlu ? WfdXLS.fill('FFFFEBEE') : (idx % 2 === 1 ? WfdXLS.fill('FFF9F9F9') : WfdXLS.fill('FFFFFFFF'));

        writeDataCell(ws.getCell(rowNum, 1), name, {
          left: true,
          fill: isSlu ? WfdXLS.fill('FFE60012') : alt,
          font: WfdXLS.font({ bold: true, size: 10, color: { argb: isSlu ? 'FFFFFFFF' : 'FF212121' } })
        });
        writeDataCell(ws.getCell(rowNum, 2), row.accumulated != null ? +(row.accumulated * 100).toFixed(2) : '', {
          fill: rateFill(row.accumulated, tgt),
          font: rateFont(row.accumulated, tgt),
          numFmt: '0.00'
        });
        writeDataCell(ws.getCell(rowNum, 3), tgt != null ? +(tgt * 100).toFixed(1) : '', {
          fill: alt,
          numFmt: '0.0'
        });
        const variance = row.variance != null ? +(row.variance * 100).toFixed(2) : null;
        writeDataCell(ws.getCell(rowNum, 4), variance != null ? variance : '', {
          fill: variance == null ? alt : rateFill(variance >= 0 ? 1 : 0, 0.5),
          font: variance == null ? WfdXLS.font({ size: 10 }) : rateFont(variance >= 0 ? 1 : 0, 0.5),
          numFmt: '0.00'
        });

        dates.forEach((d, di) => {
          const r = row.daily && row.daily[d];
          const cell = ws.getCell(rowNum, 5 + di);
          if (r == null) {
            writeDataCell(cell, '—', {
              fill: alt,
              font: WfdXLS.font({ size: 10, color: { argb: 'FFBDBDBD' } })
            });
          } else {
            writeDataCell(cell, +(r * 100).toFixed(2), {
              fill: rateFill(r, tgt),
              font: rateFont(r, tgt),
              numFmt: '0.00'
            });
          }
        });
        ws.getRow(rowNum).height = 18;
      });
    }

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'WFD_Supervisor_Performance_' + stamp + '.xlsx';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1500);
  }

  function renderSupervisorMetrics(matrix) {
    // kept for compatibility — overview is preferred
    renderSupervisorOverview(matrix, 'All dates', null);
  }


  /** Excel Sheet2-style matrix: red header, yellow below-target, hover totals */
  function renderSupervisorMatrix(matrix) {
    const head = document.getElementById('supMatrixHead');
    const body = document.getElementById('supMatrixBody');
    const titleEl = document.getElementById('supMatrixTitle');
    if (!head || !body || !matrix) return;

    if (titleEl) titleEl.textContent = 'WAITING FOR DEPARTURE ON TIME PERFORMANCE PER SUPERVISOR';

    const dates = matrix.dates || [];
    const dayLabels = dates.map(d => {
      // Excel style: 1/Oct, 2/Oct
      const parts = d.split('-');
      if (parts.length === 3) {
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const mi = parseInt(parts[1], 10) - 1;
        return parseInt(parts[2], 10) + '/' + (months[mi] || parts[1]);
      }
      return WfdUtils.formatDateLabel(d);
    });

    head.innerHTML = `<tr class="sup-matrix-hrow">
      <th class="sticky-col">SUPERVISOR</th>
      <th>ACCUMULATED</th>
      <th>TARGET</th>
      <th>VARIANCE</th>
      ${dayLabels.map((lbl, i) => `<th title="${dates[i]}">${lbl}</th>`).join('')}
    </tr>`;

    body.innerHTML = (matrix.rows || []).map(row => {
      const belowAcc = row.accumulated != null && row.target != null && row.accumulated < row.target;
      const accCls = row.accumulated == null ? '' : (belowAcc ? 'cell-warn' : 'cell-ok');
      const varCls = row.variance == null ? '' : (row.variance >= 0 ? 'cell-ok' : 'cell-warn');
      const varText = row.variance == null ? '—'
        : (row.variance >= 0 ? '+' : '') + WfdUtils.pct(row.variance, 2);
      const accTip = `Total: ${row.total || 0} · On-time: ${row.onTime || 0} · Late: ${row.late || 0}`;
      const dailyCells = dates.map(d => {
        const r = row.daily[d];
        const det = row.dailyDetail && row.dailyDetail[d];
        if (r == null || !det) return '<td class="muted-cell">—</td>';
        const below = r < (row.target || 0.98);
        const cls = below ? 'cell-warn' : 'cell-ok';
        const tip = `${WfdUtils.formatDateLabel(d)}\nTotal: ${det.total}\nOn-time: ${det.onTime}\nLate: ${det.late}`;
        return `<td class="${cls} pct-cell" title="${tip.replace(/"/g, '&quot;')}">${WfdUtils.pct(r, 2)}</td>`;
      }).join('');
      const nameCls = row.name === 'SLU' ? 'sup-slu-row' : '';
      return `<tr class="${nameCls}">
        <td class="sticky-col"><strong>${WfdUtils.displaySupervisorName(row.name)}</strong></td>
        <td class="${accCls} pct-cell" title="${accTip}">${WfdUtils.pct(row.accumulated, 2)}</td>
        <td>${WfdUtils.pct(row.target, 2)}</td>
        <td class="${varCls}">${varText}</td>
        ${dailyCells}
      </tr>`;
    }).join('') || '<tr><td colspan="4">No supervisor data</td></tr>';
  }

  return {
    renderMetrics,
    renderSummaryText,
    renderDcTable,
    renderSupTable,
    renderRouteTable,
    renderCarrierTable,
    renderLateDetail,
    renderHistory,
    renderSupervisorMatrix,
    renderSupervisorMetrics,
    renderSupervisorOverview,
    exportSupervisorPerformance,
    populateDateSelects,
    setDateBadges,
    showResults,
    initTabs,
    initMainTabs
  };
})();
