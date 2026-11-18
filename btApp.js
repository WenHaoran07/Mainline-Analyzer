/* ==========================================================================
   MODULE: BT MAIN APPLICATION COORDINATOR
   ========================================================================== */
const BtApp = (() => {

  function readFilters() {
    return {
      month: document.getElementById('filterMonth')?.value || 'ALL',
      trucker: document.getElementById('filterTrucker')?.value || 'ALL',
      reasonGroup: document.getElementById('filterReason')?.value || 'ALL',
      status: document.getElementById('filterStatus')?.value || 'ALL',
      search: (document.getElementById('filterSearch')?.value || '').trim(),
      backload: document.getElementById('filterBackload')?.value || 'ALL'
    };
  }

  function applyFiltersAndRender() {
    const { storedRows } = BtFileProcessor.getState();
    if (!storedRows || !storedRows.length) return;

    const filters = readFilters();
    const filtered = BtDataAnalyzer.filterRows(storedRows, filters);
    const overview = BtDataAnalyzer.buildOverview(filtered);

    BtUIManager.renderMetrics(overview.overall);
    BtUIManager.renderMonthlyTable(overview.monthly);
    BtUIManager.renderTruckerTable(overview.byTrucker);
    BtUIManager.renderDetailTable(filtered);

    const minRepeat = parseInt(document.getElementById('filterRepeatMin')?.value || '2', 10);
    const repeats = BtDataAnalyzer.repeatOffenders(filtered, minRepeat);
    BtUIManager.renderRepeatTable(repeats);

    // Overview monthly — type from its own toggle
    const ovType = BtChartManager.getTypeFor('monthlyOverview', 'bar');
    BtChartManager.monthlyBarLine('chartMonthly', overview.monthly, ovType);

    // Charts tab — each chart has its own bar / line / pie toggle
    const monthType = BtChartManager.getTypeFor('monthlyCharts', 'bar');
    const truckerType = BtChartManager.getTypeFor('trucker', 'bar');
    const reasonType = BtChartManager.getTypeFor('reason', 'pie');
    const statusType = BtChartManager.getTypeFor('status', 'pie');

    BtChartManager.monthlyBarLine('chartMonthlyCharts', overview.monthly, monthType);
    BtChartManager.groupChart('chartTrucker', overview.byTrucker, truckerType, {
      maxBars: 15,
      horizontal: true,
      label: 'Broken trucks'
    });
    BtChartManager.groupChart('chartReason', overview.byReason, reasonType, {
      label: 'By reason'
    });
    BtChartManager.groupChart('chartStatus', overview.byStatus, statusType, {
      label: 'By status'
    });
  }

  function resetFilters() {
    const ids = ['filterMonth', 'filterTrucker', 'filterReason', 'filterStatus', 'filterBackload'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = 'ALL';
    });
    const search = document.getElementById('filterSearch');
    if (search) search.value = '';
    applyFiltersAndRender();
  }

  function openExportModal() {
    const { storedRows } = BtFileProcessor.getState();
    if (!storedRows || !storedRows.length) {
      alert('No data loaded.');
      return;
    }
    const modal = document.getElementById('exportModal');
    if (modal) modal.classList.remove('hidden');
  }

  function closeExportModal() {
    const modal = document.getElementById('exportModal');
    if (modal) modal.classList.add('hidden');
  }

  function onExport(mode) {
    closeExportModal();
    const { storedRows } = BtFileProcessor.getState();
    if (!storedRows || !storedRows.length) {
      alert('No data loaded.');
      return;
    }
    const filters = readFilters();
    const filtered = BtDataAnalyzer.filterRows(storedRows, filters);
    const overview = BtDataAnalyzer.buildOverview(filtered);
    const minRepeat = parseInt(document.getElementById('filterRepeatMin')?.value || '2', 10);
    const repeats = BtDataAnalyzer.repeatOffenders(filtered, minRepeat);
    BtExport.exportWorkbook({
      rows: filtered,
      overview,
      filters,
      mode: mode || 'detailed',
      repeats
    });
  }

  function onDataReady(rows) {
    const overview = BtDataAnalyzer.buildOverview(rows);
    BtUIManager.populateFilters(overview);
    BtUIManager.showResults();
    applyFiltersAndRender();
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
        BtFileProcessor.handleFile(e.dataTransfer.files[0]);
      }
    });
    fileInput.addEventListener('change', () => {
      if (fileInput.files.length) BtFileProcessor.handleFile(fileInput.files[0]);
    });
  }

  function initChartTypeToggles() {
    document.querySelectorAll('.chart-type-toggle').forEach(group => {
      group.querySelectorAll('.chart-type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          group.querySelectorAll('.chart-type-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          applyFiltersAndRender();
        });
      });
    });
  }

  function initFilters() {
    ['filterMonth', 'filterTrucker', 'filterReason', 'filterStatus', 'filterBackload'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', applyFiltersAndRender);
    });
    const search = document.getElementById('filterSearch');
    if (search) {
      let t;
      search.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(applyFiltersAndRender, 220);
      });
    }

    const reset = document.getElementById('btnResetFilters');
    if (reset) reset.addEventListener('click', resetFilters);

    initChartTypeToggles();

    const exp = document.getElementById('btnExport');
    if (exp) exp.addEventListener('click', openExportModal);

    const expClose = document.getElementById('exportModalClose');
    if (expClose) expClose.addEventListener('click', closeExportModal);
    const expModal = document.getElementById('exportModal');
    if (expModal) {
      expModal.addEventListener('click', e => {
        if (e.target === expModal) closeExportModal();
      });
    }
    const expSum = document.getElementById('exportSummaryBtn');
    if (expSum) expSum.addEventListener('click', () => onExport('summary'));
    const expDet = document.getElementById('exportDetailedBtn');
    if (expDet) expDet.addEventListener('click', () => onExport('detailed'));

    const repMin = document.getElementById('filterRepeatMin');
    if (repMin) repMin.addEventListener('change', applyFiltersAndRender);
  }

  function init() {
    BtFileProcessor.setOnReady(onDataReady);
    BtUIManager.initTabs();
    BtUIManager.initModal();
    initUpload();
    initFilters();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { applyFiltersAndRender, readFilters, init };
})();
