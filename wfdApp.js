/* ==========================================================================
   MODULE: WFD MAIN APPLICATION COORDINATOR
   ========================================================================== */
const WfdApp = (() => {

  function runCompare(datePrev, dateLatest) {
    const { storedRows } = WfdFileProcessor.getState();
    if (!storedRows || !storedRows.length) {
      alert('No data loaded.');
      return;
    }
    if (!datePrev) datePrev = document.getElementById('selectPrev')?.value;
    if (!dateLatest) dateLatest = document.getElementById('selectLatest')?.value;
    if (!datePrev || !dateLatest) return;

    const loading = document.getElementById('loadingCompare');
    if (loading) loading.classList.remove('hidden');

    // Yield so loading spinner can paint
    setTimeout(() => {
      try {
        const cmp = WfdDataAnalyzer.compareDays(storedRows, datePrev, dateLatest);

        WfdUIManager.setDateBadges(datePrev, dateLatest);
        WfdUIManager.renderMetrics(cmp.latest, cmp.prev);
        WfdUIManager.renderSummaryText(cmp);
        WfdUIManager.renderDcTable(cmp.dcCompare);
        WfdUIManager.renderSupTable(cmp.supCompare);
        WfdUIManager.renderRouteTable(cmp.routes);
        WfdUIManager.renderCarrierTable(cmp.carriers);
        WfdUIManager.renderLateDetail(cmp.lateDetail);
        WfdUIManager.renderHistory(cmp.history);

        WfdChartManager.renderDcChart(cmp.dcCompare);
        WfdChartManager.renderSupChart(cmp.supCompare);
        WfdChartManager.renderHistoryChart(cmp.history);
        WfdChartManager.renderLateByDc(cmp.lateDetail);

        WfdUIManager.showResults();
      } catch (err) {
        console.error(err);
        alert('Analysis error: ' + err.message);
      } finally {
        if (loading) loading.classList.add('hidden');
      }
    }, 30);
  }

  let supPeriodMode = 'all';
  let supPeriodKey = '';
  let lastRows = null;
  let lastDates = [];
  let lastSupMatrix = null;
  let lastSupByDc = [];
  let lastSupMaps = null;
  let lastSupPeriodLabel = 'All dates';

  function filterRowsByPeriod(rows) {
    if (!rows || !rows.length) return [];
    if (supPeriodMode === 'all' || !supPeriodKey) return rows;
    if (supPeriodMode === 'week') {
      return rows.filter(r => WfdUtils.weekKey(r.dateKey) === supPeriodKey);
    }
    if (supPeriodMode === 'month') {
      return rows.filter(r => WfdUtils.monthKey(r.dateKey) === supPeriodKey);
    }
    return rows;
  }

  function datesInRows(rows) {
    return Array.from(new Set(rows.map(r => r.dateKey).filter(Boolean))).sort();
  }

  function availableWeeks(dates) {
    const map = new Map();
    (dates || []).forEach(dk => {
      const wk = WfdUtils.weekKey(dk);
      if (!wk) return;
      if (!map.has(wk)) map.set(wk, { key: wk, label: WfdUtils.weekLabel(dk) || wk });
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(e => e[1]);
  }

  function availableMonths(dates) {
    const map = new Map();
    (dates || []).forEach(dk => {
      const mk = WfdUtils.monthKey(dk);
      if (!mk) return;
      map.set(mk, { key: mk, label: WfdUtils.monthLabel(mk) });
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(e => e[1]);
  }

  function syncSupPeriodSelects() {
    const modeSel = document.getElementById('supPeriodMode');
    const weekSel = document.getElementById('supPeriodWeek');
    const monthSel = document.getElementById('supPeriodMonth');
    const weekWrap = document.getElementById('supPeriodWeekWrap');
    const monthWrap = document.getElementById('supPeriodMonthWrap');
    const badge = document.getElementById('supPeriodBadge');

    if (modeSel) modeSel.value = supPeriodMode;

    const weeks = availableWeeks(lastDates);
    if (weekSel) {
      weekSel.innerHTML = weeks.length
        ? weeks.map(w => `<option value="${w.key}">${w.label}</option>`).join('')
        : '<option value="">No weeks</option>';
      if (supPeriodMode === 'week' && supPeriodKey && weeks.some(w => w.key === supPeriodKey)) {
        weekSel.value = supPeriodKey;
      } else if (weeks.length) {
        weekSel.value = weeks[weeks.length - 1].key;
        if (supPeriodMode === 'week') supPeriodKey = weekSel.value;
      }
    }

    const months = availableMonths(lastDates);
    if (monthSel) {
      monthSel.innerHTML = months.length
        ? months.map(m => `<option value="${m.key}">${m.label}</option>`).join('')
        : '<option value="">No months</option>';
      if (supPeriodMode === 'month' && supPeriodKey && months.some(m => m.key === supPeriodKey)) {
        monthSel.value = supPeriodKey;
      } else if (months.length) {
        monthSel.value = months[months.length - 1].key;
        if (supPeriodMode === 'month') supPeriodKey = monthSel.value;
      }
    }

    if (weekWrap) weekWrap.classList.toggle('hidden', supPeriodMode !== 'week');
    if (monthWrap) monthWrap.classList.toggle('hidden', supPeriodMode !== 'month');

    let label = 'All dates';
    if (supPeriodMode === 'week' && supPeriodKey) {
      const w = weeks.find(x => x.key === supPeriodKey);
      label = w ? w.label : supPeriodKey;
    } else if (supPeriodMode === 'month' && supPeriodKey) {
      const m = months.find(x => x.key === supPeriodKey);
      label = m ? m.label : supPeriodKey;
    }
    if (badge) badge.textContent = label;
  }

  function periodLabelText() {
    if (supPeriodMode === 'week' && supPeriodKey) {
      const weeks = availableWeeks(lastDates);
      const w = weeks.find(x => x.key === supPeriodKey);
      return w ? w.label : supPeriodKey;
    }
    if (supPeriodMode === 'month' && supPeriodKey) {
      const months = availableMonths(lastDates);
      const m = months.find(x => x.key === supPeriodKey);
      return m ? m.label : supPeriodKey;
    }
    return 'All dates';
  }

  function renderSupervisorTab(rows, dates) {
    if (rows) lastRows = rows;
    if (dates) lastDates = dates.slice();
    if (!lastRows) return;

    syncSupPeriodSelects();
    const filtered = filterRowsByPeriod(lastRows);
    const fDates = datesInRows(filtered);
    const matrix = WfdDataAnalyzer.supervisorPerformanceMatrix(filtered, fDates);
    const byDc = WfdDataAnalyzer.byDc(filtered);
    const maps = WfdDataAnalyzer.supervisorDcMaps(filtered);
    const label = periodLabelText();

    lastSupMatrix = matrix;
    lastSupByDc = byDc || [];
    lastSupMaps = maps;
    lastSupPeriodLabel = label;
    WfdUIManager.renderSupervisorOverview(matrix, label, byDc, maps);
    WfdUIManager.renderSupervisorMatrix(matrix);

    const typeBtn = document.querySelector('.chart-type-btn.active');
    const type = typeBtn ? typeBtn.getAttribute('data-type') : 'bar';
    WfdChartManager.renderSupervisorAccumChart(matrix, type || 'bar');
  }

  function initWfdSupExport() {
    const btn = document.getElementById('btnWfdSupExport');
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (!lastSupMatrix) {
        alert('Load data first, then export.');
        return;
      }
      WfdUIManager.exportSupervisorPerformance(lastSupMatrix, lastSupByDc, lastSupPeriodLabel, lastSupMaps);
    });
  }

  function initWfdSupSubtabs() {
    const overview = document.getElementById('wfdSupOverview');
    const matrixPanel = document.getElementById('wfdSupMatrixPanel');
    document.querySelectorAll('.wfd-sup-subtab').forEach(btn => {
      btn.addEventListener('click', () => {
        const which = btn.getAttribute('data-wfd-sup') || 'overview';
        document.querySelectorAll('.wfd-sup-subtab').forEach(b => {
          b.classList.toggle('active', b === btn);
        });
        if (overview) overview.classList.toggle('hidden', which !== 'overview');
        if (matrixPanel) matrixPanel.classList.toggle('hidden', which !== 'matrix');
      });
    });
  }

  function initSupPeriodControls() {
    const modeSel = document.getElementById('supPeriodMode');
    const weekSel = document.getElementById('supPeriodWeek');
    const monthSel = document.getElementById('supPeriodMonth');
    if (modeSel) {
      modeSel.addEventListener('change', () => {
        supPeriodMode = modeSel.value || 'all';
        if (supPeriodMode === 'week') {
          const weeks = availableWeeks(lastDates);
          supPeriodKey = weeks.length ? weeks[weeks.length - 1].key : '';
        } else if (supPeriodMode === 'month') {
          const months = availableMonths(lastDates);
          supPeriodKey = months.length ? months[months.length - 1].key : '';
        } else {
          supPeriodKey = '';
        }
        renderSupervisorTab();
      });
    }
    if (weekSel) {
      weekSel.addEventListener('change', () => {
        supPeriodKey = weekSel.value || '';
        renderSupervisorTab();
      });
    }
    if (monthSel) {
      monthSel.addEventListener('change', () => {
        supPeriodKey = monthSel.value || '';
        renderSupervisorTab();
      });
    }
  }

  function initChartTypeToggle() {
    document.querySelectorAll('.chart-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.chart-type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const type = btn.getAttribute('data-type') || 'bar';
        WfdChartManager.setSupervisorChartType(type);
      });
    });
  }

  function onDataReady(rows, dates) {
    WfdUIManager.populateDateSelects(dates, 'selectPrev', 'selectLatest');
    const prev = dates.length >= 2 ? dates[dates.length - 2] : dates[0];
    const latest = dates[dates.length - 1];
    runCompare(prev, latest);
    renderSupervisorTab(rows, dates);
  }

  function initUpload() {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    if (!dropZone || !fileInput) return;

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', e => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      if (e.dataTransfer.files.length) {
        WfdFileProcessor.handleFile(e.dataTransfer.files[0]);
      }
    });
    fileInput.addEventListener('change', () => {
      if (fileInput.files.length) WfdFileProcessor.handleFile(fileInput.files[0]);
    });
  }

  function init() {
    WfdFileProcessor.setOnReady(onDataReady);
    WfdUIManager.initTabs();
    WfdUIManager.initMainTabs();
    initChartTypeToggle();
    initSupPeriodControls();
    initWfdSupSubtabs();
    initWfdSupExport();
    initUpload();

    const btn = document.getElementById('btnCompare');
    if (btn) btn.addEventListener('click', () => runCompare());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { runCompare, init };
})();
