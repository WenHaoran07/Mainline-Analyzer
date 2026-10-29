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
        <td>${r.supervisor}</td>
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
        <td class="sticky-col"><strong>${row.name}</strong></td>
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
    populateDateSelects,
    setDateBadges,
    showResults,
    initTabs,
    initMainTabs
  };
})();
