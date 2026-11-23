/* ==========================================================================
   MODULE: BT UI MANAGER
   ========================================================================== */
const BtUIManager = (() => {
  let currentRows = [];
  let overview = null;
  let activeDetailId = null;

  function showResults() {
    const results = document.getElementById('results');
    const drop = document.getElementById('dropZone');
    if (results) results.classList.remove('hidden');
    if (drop) drop.classList.add('collapsed');
  }

  function populateFilters(overviewData) {
    overview = overviewData;
    const fill = (id, values, allLabel) => {
      const sel = document.getElementById(id);
      if (!sel) return;
      const cur = sel.value;
      sel.innerHTML = '<option value="ALL">' + (allLabel || 'All') + '</option>';
      (values || []).forEach(v => {
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = v;
        sel.appendChild(opt);
      });
      if (cur && (cur === 'ALL' || (values || []).includes(cur))) sel.value = cur;
    };
    // Options from full dataset (unfiltered) so user can always switch back
    const { storedRows } = BtFileProcessor.getState();
    const full = storedRows && storedRows.length
      ? BtDataAnalyzer.buildOverview(storedRows)
      : overviewData;
    fill('filterMonth', full.monthly.map(m => m.key), 'All months');
    fill('filterTrucker', full.truckers, 'All truckers');
    fill('filterReason', full.reasons, 'All reasons');
    fill('filterStatus', full.statuses, 'All statuses');
  }

  function renderMetrics(summary) {
    const el = document.getElementById('metricsOverall');
    if (!el) return;
    const cards = [
      { label: 'Broken Trucks', value: summary.total, sub: 'all filtered' },
      { label: 'Avg Downtime', value: BtUtils.formatHours(summary.avgHours), sub: summary.withDtCount + ' with hours' },
      { label: 'Transfers', value: summary.transfers, sub: 'rescue / transfer' },
      { label: 'Repairs', value: summary.repairs, sub: 'done on site' },
      { label: 'Accidents', value: summary.accidents, sub: 'accident-related' }
    ];
    el.innerHTML = cards.map(c =>
      '<div class="metric-card">' +
        '<div class="metric-value">' + BtUtils.escapeHtml(String(c.value)) + '</div>' +
        '<div class="metric-label">' + BtUtils.escapeHtml(c.label) + '</div>' +
        '<div class="metric-sub">' + BtUtils.escapeHtml(c.sub) + '</div>' +
      '</div>'
    ).join('');
  }

  function renderMonthlyTable(monthly) {
    const el = document.getElementById('monthlyTableBody');
    if (!el) return;
    if (!monthly.length) {
      el.innerHTML = '<tr><td colspan="6" class="empty-cell">No monthly data</td></tr>';
      return;
    }
    el.innerHTML = monthly.map(m =>
      '<tr class="clickable-row" data-month="' + BtUtils.escapeHtml(m.key) + '">' +
        '<td><strong>' + BtUtils.escapeHtml(m.key) + '</strong></td>' +
        '<td class="num">' + m.total + '</td>' +
        '<td class="num">' + BtUtils.formatHours(m.avgHours) + '</td>' +
        '<td class="num">' + m.transfers + '</td>' +
        '<td class="num">' + m.repairs + '</td>' +
        '<td class="num">' + m.accidents + '</td>' +
      '</tr>'
    ).join('');

    el.querySelectorAll('.clickable-row').forEach(tr => {
      tr.addEventListener('click', () => {
        const month = tr.getAttribute('data-month');
        const sel = document.getElementById('filterMonth');
        if (sel) {
          sel.value = month;
          sel.dispatchEvent(new Event('change'));
        }
        // switch to detail tab
        const tab = document.getElementById('tabBtDetail');
        if (tab) tab.click();
      });
    });
  }

  function renderTruckerTable(groups) {
    const el = document.getElementById('truckerTableBody');
    if (!el) return;
    el.innerHTML = groups.slice(0, 15).map(g =>
      '<tr class="clickable-row" data-trucker="' + BtUtils.escapeHtml(g.key) + '">' +
        '<td>' + BtUtils.escapeHtml(g.key) + '</td>' +
        '<td class="num">' + g.total + '</td>' +
        '<td class="num">' + BtUtils.formatHours(g.avgHours) + '</td>' +
        '<td class="num">' + g.transfers + '</td>' +
      '</tr>'
    ).join('');
    el.querySelectorAll('.clickable-row').forEach(tr => {
      tr.addEventListener('click', () => {
        const t = tr.getAttribute('data-trucker');
        const sel = document.getElementById('filterTrucker');
        if (sel) {
          sel.value = t;
          sel.dispatchEvent(new Event('change'));
        }
        const tab = document.getElementById('tabBtDetail');
        if (tab) tab.click();
      });
    });
  }

  function renderDetailTable(rows) {
    currentRows = rows;
    const el = document.getElementById('detailTableBody');
    const countEl = document.getElementById('detailCount');
    if (countEl) countEl.textContent = rows.length + ' record' + (rows.length === 1 ? '' : 's');
    if (!el) return;

    if (!rows.length) {
      el.innerHTML = '<tr><td colspan="9" class="empty-cell">No matching records. Adjust filters.</td></tr>';
      return;
    }

    el.innerHTML = rows.map(r =>
      '<tr class="clickable-row detail-row" data-id="' + r.id + '">' +
        '<td>' + BtUtils.escapeHtml(r.dateKey || '—') + '</td>' +
        '<td>' + BtUtils.escapeHtml(r.month) + '</td>' +
        '<td>' + BtUtils.escapeHtml(r.trucker) + '</td>' +
        '<td><code>' + BtUtils.escapeHtml(r.plate) + '</code></td>' +
        '<td>' + BtUtils.escapeHtml(r.destination || '—') + '</td>' +
        '<td title="' + BtUtils.escapeHtml(r.reason) + '">' + BtUtils.escapeHtml(r.reasonGroup) + '</td>' +
        '<td class="num">' + BtUtils.formatHours(r.downtimeHrs) + '</td>' +
        '<td><span class="status-pill status-' + statusClass(r.status) + '">' +
          BtUtils.escapeHtml(r.status) + '</span></td>' +
        '<td class="center"><button type="button" class="btn-view" data-id="' + r.id + '">View</button></td>' +
      '</tr>'
    ).join('');

    el.querySelectorAll('.detail-row, .btn-view').forEach(node => {
      node.addEventListener('click', e => {
        e.stopPropagation();
        const id = parseInt(node.getAttribute('data-id'), 10);
        openDetail(id);
      });
    });
  }

  function statusClass(status) {
    if (/transfer/i.test(status)) return 'transfer';
    if (/repair/i.test(status)) return 'repair';
    if (/settled/i.test(status)) return 'settled';
    if (/for repair/i.test(status)) return 'pending';
    return 'other';
  }

  function fmtVal(v) {
    if (v == null || v === '') return '—';
    if (v instanceof Date) return v.toLocaleString();
    if (typeof v === 'number' && v > 40000 && v < 60000) {
      // likely excel serial datetime – show date key style
      const key = BtUtils.parseDateKey(v);
      return key || String(v);
    }
    return String(v);
  }

  function openDetail(id) {
    const row = currentRows.find(r => r.id === id) ||
      (BtFileProcessor.getState().storedRows || []).find(r => r.id === id);
    if (!row) return;
    activeDetailId = id;

    const modal = document.getElementById('detailModal');
    const body = document.getElementById('detailModalBody');
    const title = document.getElementById('detailModalTitle');
    if (!modal || !body) return;

    if (title) {
      title.textContent = (row.plate || 'Truck') + ' · ' + (row.dateKey || row.month || '');
    }

    const fields = [
      ['Entry Date', row.dateKey],
      ['Month', row.month],
      ['Trucker', row.truckerRaw || row.trucker],
      ['Plate #', row.plate],
      ['Task / Plan', row.taskPlan],
      ['Destination', row.destination],
      ['Departure from DC', fmtVal(row.depTime)],
      ['Time Reported', fmtVal(row.timeReported)],
      ['Exact Location', row.location],
      ['Downtime', row.downtimeRaw || BtUtils.formatHours(row.downtimeHrs)],
      ['Actual Resume', fmtVal(row.resumeTime)],
      ['Reason', row.reason || '—'],
      ['Reason Group', row.reasonGroup],
      ['Broken?', row.broken || '—'],
      ['Rescue Truck', row.rescue || '—'],
      ['Status', row.statusRaw || row.status],
      ['Persons for Transfer', row.persons != null && row.persons !== '' ? row.persons : '—'],
      ['Total Amount', row.amount != null && row.amount !== '' ? row.amount : '—'],
      ['Remarks', row.remarks || '—'],
      ['Email flag', row.email || '—'],
      ['Source', row.isBackload ? 'Backload' : (row.sheet || 'Forward')]
    ];

    body.innerHTML =
      '<div class="detail-grid">' +
      fields.map(([label, val]) =>
        '<div class="detail-item">' +
          '<div class="detail-label">' + BtUtils.escapeHtml(label) + '</div>' +
          '<div class="detail-value">' + BtUtils.escapeHtml(String(val == null || val === '' ? '—' : val)) + '</div>' +
        '</div>'
      ).join('') +
      '</div>';

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeDetail() {
    const modal = document.getElementById('detailModal');
    if (modal) modal.classList.add('hidden');
    document.body.style.overflow = '';
    activeDetailId = null;
  }

  function renderRepeatTable(repeatList) {
    const el = document.getElementById('repeatTableBody');
    const countEl = document.getElementById('repeatCount');
    const metricsEl = document.getElementById('metricsRepeat');
    if (countEl) {
      countEl.textContent = repeatList.length + ' plate' + (repeatList.length === 1 ? '' : 's');
    }
    if (metricsEl) {
      const totalBreaks = repeatList.reduce((s, x) => s + x.times, 0);
      const top = repeatList[0];
      const cards = [
        { label: 'Repeat plates', value: repeatList.length, sub: 'min threshold' },
        { label: 'Total breaks', value: totalBreaks, sub: 'among repeats' },
        { label: 'Worst plate', value: top ? top.plate : '—', sub: top ? (top.times + ' times') : '' }
      ];
      metricsEl.innerHTML = cards.map(c =>
        '<div class="metric-card">' +
          '<div class="metric-value">' + BtUtils.escapeHtml(String(c.value)) + '</div>' +
          '<div class="metric-label">' + BtUtils.escapeHtml(c.label) + '</div>' +
          '<div class="metric-sub">' + BtUtils.escapeHtml(c.sub) + '</div>' +
        '</div>'
      ).join('');
    }
    if (!el) return;
    if (!repeatList.length) {
      el.innerHTML = '<tr><td colspan="10" class="empty-cell">No plates meet the min times threshold for current filters.</td></tr>';
      return;
    }
    el.innerHTML = repeatList.map((r, i) =>
      '<tr class="clickable-row repeat-row" data-plate="' + BtUtils.escapeHtml(r.plate) + '">' +
        '<td class="num">' + (i + 1) + '</td>' +
        '<td><code>' + BtUtils.escapeHtml(r.plate) + '</code></td>' +
        '<td>' + BtUtils.escapeHtml(r.truckerLabel) + '</td>' +
        '<td class="num"><strong>' + r.times + '</strong></td>' +
        '<td>' + BtUtils.escapeHtml(r.monthLabel) + '</td>' +
        '<td class="num">' + BtUtils.formatHours(r.totalHours) + '</td>' +
        '<td class="num">' + BtUtils.formatHours(r.avgHours) + '</td>' +
        '<td>' + BtUtils.escapeHtml(r.topReason) + '</td>' +
        '<td>' + BtUtils.escapeHtml(r.lastDate) + '</td>' +
        '<td class="center"><button type="button" class="btn-view btn-repeat-view" data-plate="' +
          BtUtils.escapeHtml(r.plate) + '">Incidents</button></td>' +
      '</tr>'
    ).join('');

    el.querySelectorAll('.repeat-row, .btn-repeat-view').forEach(node => {
      node.addEventListener('click', e => {
        e.stopPropagation();
        const plate = node.getAttribute('data-plate');
        if (!plate) return;
        // Broken truck plate only — do not match rescue truck column
        const search = document.getElementById('filterSearch');
        if (search) search.value = '';
        if (typeof BtApp !== 'undefined' && BtApp.setPlateFilter) {
          BtApp.setPlateFilter(plate);
        }
        const tab = document.getElementById('tabBtDetail');
        if (tab) tab.click();
      });
    });
  }

  function initTabs() {
    const tabs = document.querySelectorAll('.bt-main-tab');
    const panels = {
      tabBtOverview: 'btOverviewPanel',
      tabBtDetail: 'btDetailPanel',
      tabBtRepeat: 'btRepeatPanel',
      tabBtCharts: 'btChartsPanel'
    };
    tabs.forEach(btn => {
      btn.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        Object.values(panels).forEach(pid => {
          const p = document.getElementById(pid);
          if (p) p.classList.add('hidden');
        });
        const panelId = panels[btn.id];
        const panel = panelId ? document.getElementById(panelId) : null;
        if (panel) panel.classList.remove('hidden');
      });
    });
  }

  function initModal() {
    const modal = document.getElementById('detailModal');
    const closeBtn = document.getElementById('detailModalClose');
    if (closeBtn) closeBtn.addEventListener('click', closeDetail);
    if (modal) {
      modal.addEventListener('click', e => {
        if (e.target === modal) closeDetail();
      });
    }
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeDetail();
    });
  }

  return {
    showResults, populateFilters, renderMetrics, renderMonthlyTable,
    renderTruckerTable, renderDetailTable, renderRepeatTable,
    openDetail, closeDetail, initTabs, initModal
  };
})();
