/* ==========================================================================
   MODULE: MTT ALL DATA EXPLORER
   Full SLU trip list — search Task ID / plate, filter date / route / on-time
   ========================================================================== */
const MttAllData = (() => {
  const PAGE_SIZE = 200;
  let page = 0;

  function allRows() {
    if (typeof MttFileProcessor === 'undefined') return [];
    return MttFileProcessor.getState().storedRows || [];
  }

  function uniqueDates(rows) {
    return [...new Set(rows.map(r => r.dateKey).filter(Boolean))].sort();
  }

  function fillDateSelects(rows) {
    const dates = uniqueDates(rows);
    ['adDateFrom', 'adDateTo'].forEach(id => {
      const sel = document.getElementById(id);
      if (!sel) return;
      const prev = sel.value;
      sel.innerHTML = '<option value="">All dates</option>' +
        dates.map(d => '<option value="' + d + '">' + d + '</option>').join('');
      if (prev && dates.indexOf(prev) >= 0) sel.value = prev;
    });
  }

  function filters() {
    return {
      task: (document.getElementById('adSearchTask') || {}).value || '',
      plate: (document.getElementById('adSearchPlate') || {}).value || '',
      dateFrom: (document.getElementById('adDateFrom') || {}).value || '',
      dateTo: (document.getElementById('adDateTo') || {}).value || '',
      route: (document.getElementById('adRouteType') || {}).value || 'ALL',
      onTime: (document.getElementById('adOnTime') || {}).value || 'ALL'
    };
  }

  function applyFilters(rows) {
    const f = filters();
    const taskQ = f.task.trim().toLowerCase();
    const plateQ = f.plate.trim().toLowerCase();
    return rows.filter(r => {
      if (taskQ && String(r.taskId || '').toLowerCase().indexOf(taskQ) < 0) return false;
      if (plateQ && String(r.plate || '').toLowerCase().indexOf(plateQ) < 0) return false;
      if (f.dateFrom && r.dateKey < f.dateFrom) return false;
      if (f.dateTo && r.dateKey > f.dateTo) return false;
      if (f.route === 'LUZON' && r.routeType !== 'LUZON') return false;
      if (f.route === 'VISMIN' && r.routeType !== 'VISMIN') return false;
      if (f.onTime === 'YES' && String(r.onTime).toUpperCase() !== 'YES') return false;
      if (f.onTime === 'NO' && String(r.onTime).toUpperCase() !== 'NO') return false;
      return true;
    });
  }

  function fmtPct(v) {
    if (v == null || isNaN(v)) return '—';
    return (v * 100).toFixed(1) + '%';
  }

  function render() {
    const body = document.getElementById('adBody');
    const meta = document.getElementById('adMeta');
    if (!body) return;
    const rows = allRows();
    fillDateSelects(rows);
    const filtered = applyFilters(rows);
    const total = filtered.length;
    const yes = filtered.filter(r => String(r.onTime).toUpperCase() === 'YES').length;
    const rate = total ? yes / total : null;

    if (meta) {
      meta.innerHTML = '<strong>' + total.toLocaleString() + '</strong> trip(s) matched' +
        (total ? ' · on-time <strong>' + fmtPct(rate) + '</strong> (' + yes + ' / ' + total + ')' : '') +
        ' · showing page ' + (page + 1) + ' of ' + Math.max(1, Math.ceil(total / PAGE_SIZE));
    }

    const start = page * PAGE_SIZE;
    const slice = filtered.slice(start, start + PAGE_SIZE);
    if (!slice.length) {
      body.innerHTML = '<tr><td colspan="11" style="text-align:center;color:#757575;padding:24px;">No trips match the current filters.</td></tr>';
    } else {
      body.innerHTML = slice.map(r => {
        const late = String(r.onTime).toUpperCase() === 'NO';
        return '<tr class="' + (late ? 'late-row' : '') + '">' +
          '<td>' + (r.dateKey || '') + '</td>' +
          '<td>' + (r.taskId || '—') + '</td>' +
          '<td>' + (r.plate || '—') + '</td>' +
          '<td>' + (r.routeType || '') + '</td>' +
          '<td>' + (r.route || '') + '</td>' +
          '<td>' + (r.region || '') + '</td>' +
          '<td>' + (r.trucker || '') + '</td>' +
          '<td>' + (r.dcIntended || '') + '</td>' +
          '<td class="' + (late ? 'neg' : 'pos') + '">' + (r.onTime || '') + '</td>' +
          '<td>' + (r.planTT || '') + '</td>' +
          '<td>' + (r.actualTT || '') + '</td>' +
          '</tr>';
      }).join('');
    }

    const btnPrev = document.getElementById('adPrev');
    const btnNext = document.getElementById('adNext');
    if (btnPrev) btnPrev.disabled = page <= 0;
    if (btnNext) btnNext.disabled = start + PAGE_SIZE >= total;
  }

  function resetPageAndRender() {
    page = 0;
    render();
  }

  function onDataReady() {
    page = 0;
    render();
  }

  function init() {
    ['adSearchTask', 'adSearchPlate'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      let timer = null;
      el.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(resetPageAndRender, 200);
      });
    });
    ['adDateFrom', 'adDateTo', 'adRouteType', 'adOnTime'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', resetPageAndRender);
    });
    const btnClear = document.getElementById('adClear');
    if (btnClear) {
      btnClear.addEventListener('click', () => {
        const ids = ['adSearchTask', 'adSearchPlate'];
        ids.forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
        const df = document.getElementById('adDateFrom'); if (df) df.value = '';
        const dt = document.getElementById('adDateTo'); if (dt) dt.value = '';
        const rt = document.getElementById('adRouteType'); if (rt) rt.value = 'ALL';
        const ot = document.getElementById('adOnTime'); if (ot) ot.value = 'ALL';
        resetPageAndRender();
      });
    }
    const btnPrev = document.getElementById('adPrev');
    const btnNext = document.getElementById('adNext');
    if (btnPrev) btnPrev.addEventListener('click', () => { if (page > 0) { page--; render(); } });
    if (btnNext) btnNext.addEventListener('click', () => { page++; render(); });
  }

  return { init, onDataReady, render };
})();
