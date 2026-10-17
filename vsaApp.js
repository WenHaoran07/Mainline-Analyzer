/* ==========================================================================
   MODULE: VSA MAIN APPLICATION COORDINATOR
   ========================================================================== */
const VsaApp = (() => {

  function runCompare(datePrev, dateLatest) {
    const { storedRows } = VsaFileProcessor.getState();
    if (!storedRows || !storedRows.length) {
      alert('No data loaded.');
      return;
    }
    if (!datePrev) datePrev = document.getElementById('selectPrev')?.value;
    if (!dateLatest) dateLatest = document.getElementById('selectLatest')?.value;
    if (!datePrev || !dateLatest) return;

    const areaFilter = document.getElementById('selectArea')?.value || 'ALL';

    const loading = document.getElementById('loadingCompare');
    if (loading) loading.classList.remove('hidden');

    setTimeout(() => {
      try {
        const cmp = VsaDataAnalyzer.compareDays(storedRows, datePrev, dateLatest, areaFilter);

        VsaUIManager.setDateBadges(datePrev, dateLatest);
        VsaUIManager.renderMetrics(cmp.latest, cmp.prev);
        VsaUIManager.renderSummaryText(cmp);
        VsaUIManager.renderAreaTable(cmp.areaCompare);
        VsaUIManager.renderRouteTable(cmp.routeCompare);
        VsaUIManager.renderBranchTable(cmp.branches);
        VsaUIManager.renderCarrierTable(cmp.carriers);
        VsaUIManager.renderMismatchDetail(cmp.mismatchDetail);
        VsaUIManager.renderSizePatterns(cmp.sizePatterns);
        VsaUIManager.renderHistory(cmp.history);

        VsaChartManager.renderAreaChart(cmp.areaCompare);
        VsaChartManager.renderRouteChart(cmp.topMismatchRoutes);
        VsaChartManager.renderHistoryChart(cmp.history);
        VsaChartManager.renderSizeChart(cmp.sizePatterns);

        VsaUIManager.showResults();
      } catch (err) {
        console.error(err);
        alert('Analysis error: ' + err.message);
      } finally {
        if (loading) loading.classList.add('hidden');
      }
    }, 30);
  }

  function onDataReady(rows, dates) {
    VsaUIManager.populateDateSelects(dates, 'selectPrev', 'selectLatest');
    const areas = VsaDataAnalyzer.listAreas(rows);
    VsaUIManager.populateAreaFilter(areas);
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
        VsaFileProcessor.handleFile(e.dataTransfer.files[0]);
      }
    });
    fileInput.addEventListener('change', () => {
      if (fileInput.files.length) VsaFileProcessor.handleFile(fileInput.files[0]);
    });
  }

  function init() {
    VsaFileProcessor.setOnReady(onDataReady);
    VsaUIManager.initTabs();
    initUpload();

    const btn = document.getElementById('btnCompare');
    if (btn) btn.addEventListener('click', () => runCompare());

    const areaSel = document.getElementById('selectArea');
    if (areaSel) {
      areaSel.addEventListener('change', () => runCompare());
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { runCompare, init };
})();
