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

  function onDataReady(rows, dates) {
    WfdUIManager.populateDateSelects(dates, 'selectPrev', 'selectLatest');
    const prev = dates.length >= 2 ? dates[dates.length - 2] : dates[0];
    const latest = dates[dates.length - 1];
    runCompare(prev, latest);
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
