/* ==========================================================================
   MODULE: VSA UI MANAGER
   ========================================================================== */
const VsaUIManager = (() => {

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
    const rateCls = VsaUtils.rateClass(summary.rate);
    const diff = prevSummary && summary.rate != null && prevSummary.rate != null
      ? summary.rate - prevSummary.rate : null;
    const diffText = diff != null
      ? (diff >= 0 ? '▲ +' : '▼ ') + VsaUtils.pct(Math.abs(diff)) + ' vs prev'
      : '';

    el.innerHTML =
      metricCard('Accuracy Rate', VsaUtils.pct(summary.rate),
        `Target ${VsaUtils.pct(VsaUtils.TARGET)} · ${diffText}`, rateCls) +
      metricCard('Total (decided)', summary.total, '') +
      metricCard('YES (match)', summary.yes, summary.total ? VsaUtils.pct(summary.yes / summary.total) + ' of total' : '', 'rate-good') +
      metricCard('NO (mismatch)', summary.no, summary.total ? VsaUtils.pct(summary.no / summary.total) + ' of total' : '', summary.no ? 'rate-bad' : 'rate-good');
  }

  function renderSummaryText(cmp) {
    const el = document.getElementById('summaryText');
    if (!el) return;
    const L = cmp.latest;
    const P = cmp.prev;
    const hit = L.rate != null && L.rate >= VsaUtils.TARGET;
    let html = `<strong>${VsaUtils.formatDateLabel(cmp.dateLatest)}</strong>`;
    if (cmp.areaFilter && cmp.areaFilter !== 'ALL') {
      html += ` · <span class="badge">${cmp.areaFilter}</span>`;
    }
    html += `: ${L.total} trips · <strong class="${VsaUtils.rateClass(L.rate)}">${VsaUtils.pct(L.rate)}</strong> accurate `;
    html += hit ? '(✅ at/above target)' : '(⚠️ below 97% target)';
    if (L.no) {
      html += `. <strong>${L.no}</strong> size mismatch(es).`;
    } else {
      html += '. No size mismatches.';
    }
    if (P.total) {
      const d = L.rate != null && P.rate != null ? L.rate - P.rate : null;
      if (d != null) {
        html += ` vs ${VsaUtils.formatDateLabel(cmp.datePrev)}: ${d >= 0 ? '+' : ''}${VsaUtils.pct(d)}.`;
      }
    }
    el.innerHTML = html;
  }

  function rateCell(rate) {
    const cls = VsaUtils.rateClass(rate);
    return `<td class="${cls}">${VsaUtils.pct(rate)}</td>`;
  }

  function diffCell(diff) {
    if (diff == null) return '<td>—</td>';
    const sign = diff >= 0 ? '+' : '';
    const cls = diff >= 0 ? 'rate-good' : 'rate-bad';
    return `<td class="${cls}">${sign}${VsaUtils.pct(diff)}</td>`;
  }

  function renderAreaTable(areaCompare) {
    const body = document.getElementById('areaBody');
    if (!body) return;
    body.innerHTML = areaCompare.map(d => `<tr>
      <td>${d.key}</td>
      <td>${d.total}</td>
      <td>${d.yes}</td>
      <td>${d.no}</td>
      ${rateCell(d.rate)}
      ${rateCell(d.prevRate)}
      ${diffCell(d.rateDiff)}
    </tr>`).join('') || '<tr><td colspan="7">No data</td></tr>';
  }

  function renderRouteTable(routes) {
    const body = document.getElementById('routeBody');
    if (!body) return;
    // Show routes with any activity; highlight those with NO
    const sorted = [...routes].sort((a, b) => b.no - a.no || b.total - a.total);
    body.innerHTML = sorted.map(d => `<tr class="${d.no ? 'row-warn' : ''}">
      <td>${d.key}</td>
      <td>${d.total}</td>
      <td>${d.yes}</td>
      <td>${d.no}</td>
      ${rateCell(d.rate)}
      ${rateCell(d.prevRate)}
      ${diffCell(d.rateDiff)}
    </tr>`).join('') || '<tr><td colspan="7">No data</td></tr>';
  }

  function renderBranchTable(branches) {
    const body = document.getElementById('branchBody');
    if (!body) return;
    body.innerHTML = branches.map(d => `<tr class="${d.no ? 'row-warn' : ''}">
      <td>${d.key}</td>
      <td>${d.total}</td>
      <td>${d.yes}</td>
      <td>${d.no}</td>
      ${rateCell(d.rate)}
    </tr>`).join('') || '<tr><td colspan="5">No data</td></tr>';
  }

  function renderCarrierTable(carriers) {
    const body = document.getElementById('carrierBody');
    if (!body) return;
    body.innerHTML = carriers.map(d => `<tr class="${d.no ? 'row-warn' : ''}">
      <td>${d.key}</td>
      <td>${d.total}</td>
      <td>${d.yes}</td>
      <td>${d.no}</td>
      ${rateCell(d.rate)}
    </tr>`).join('') || '<tr><td colspan="5">No data</td></tr>';
  }

  function renderMismatchDetail(rows) {
    const body = document.getElementById('mismatchBody');
    if (!body) return;
    const list = (rows || []).slice(0, 200);
    body.innerHTML = list.map(r => `<tr>
      <td>${r.dateKey || ''}</td>
      <td>${r.route || ''}</td>
      <td>${r.area || ''}</td>
      <td>${r.plate || ''}</td>
      <td class="size-planned">${r.plannedSize || '—'}</td>
      <td class="size-actual">${r.actualSize || '—'}</td>
      <td>${r.shippingBranch || ''}</td>
      <td>${r.carrier || ''}</td>
      <td>${r.shipmentNo || ''}</td>
    </tr>`).join('') || '<tr><td colspan="9">No mismatches</td></tr>';
    const note = document.getElementById('mismatchNote');
    if (note) {
      note.textContent = rows && rows.length > 200
        ? `Showing first 200 of ${rows.length} mismatches.`
        : (rows && rows.length ? `${rows.length} mismatch(es).` : 'No mismatches for this day.');
    }
  }

  function renderSizePatterns(patterns) {
    const body = document.getElementById('sizeBody');
    if (!body) return;
    body.innerHTML = (patterns || []).map(d => `<tr>
      <td>${d.planned}</td>
      <td>${d.actual}</td>
      <td><strong>${d.count}</strong></td>
      <td class="muted">${d.samples.map(s => s.route + (s.plate ? ' · ' + s.plate : '')).join('; ')}</td>
    </tr>`).join('') || '<tr><td colspan="4">No size patterns</td></tr>';
  }

  function renderHistory(history) {
    const body = document.getElementById('historyBody');
    if (!body) return;
    body.innerHTML = (history || []).map(d => `<tr>
      <td>${d.key}</td>
      <td>${VsaUtils.formatDateLabel(d.key)}</td>
      <td>${d.total}</td>
      <td>${d.yes}</td>
      <td>${d.no}</td>
      ${rateCell(d.rate)}
    </tr>`).join('') || '<tr><td colspan="6">No history</td></tr>';
  }

  function populateDateSelects(dates, prevId, latestId) {
    const prev = document.getElementById(prevId);
    const latest = document.getElementById(latestId);
    if (!prev || !latest) return;
    const opts = dates.map(d => `<option value="${d}">${VsaUtils.formatDateLabel(d)} (${d})</option>`).join('');
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

  function populateAreaFilter(areas) {
    const sel = document.getElementById('selectArea');
    if (!sel) return;
    const opts = ['<option value="ALL">All areas</option>']
      .concat(areas.map(a => `<option value="${a}">${a}</option>`));
    sel.innerHTML = opts.join('');
    // Prefer SLU if present
    if (areas.includes('SLU')) sel.value = 'SLU';
  }

  function setDateBadges(datePrev, dateLatest) {
    const elL = document.getElementById('dateLatest');
    const elP = document.getElementById('datePrev');
    if (elL) elL.textContent = VsaUtils.formatDateLabel(dateLatest) + ' (' + dateLatest + ')';
    if (elP) elP.textContent = VsaUtils.formatDateLabel(datePrev) + ' (' + datePrev + ')';
  }

  function showResults() {
    const results = document.getElementById('results');
    if (results) results.classList.remove('hidden');
  }

  function initTabs() {
    const tabs = document.querySelectorAll('.tab');
    const panels = document.querySelectorAll('.tab-panel');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        panels.forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const id = tab.getAttribute('data-tab');
        const panel = document.getElementById(id);
        if (panel) panel.classList.add('active');
      });
    });
  }

  return {
    renderMetrics,
    renderSummaryText,
    renderAreaTable,
    renderRouteTable,
    renderBranchTable,
    renderCarrierTable,
    renderMismatchDetail,
    renderSizePatterns,
    renderHistory,
    populateDateSelects,
    populateAreaFilter,
    setDateBadges,
    showResults,
    initTabs
  };
})();
