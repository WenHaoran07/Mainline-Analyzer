/* ==========================================================================
   MODULE: MTT MAIN APPLICATION COORDINATOR
   ========================================================================== */
const MttApp = (() => {
  function getRouteFilter() {
    const el = document.getElementById('selectRouteType');
    return el ? el.value : 'ALL';
  }

  function runCompare(datePrev, dateLatest, routeFilter, useCompareLoader) {
    if (!routeFilter) routeFilter = getRouteFilter();
    const { storedRows, storedDates } = MttFileProcessor.getState();
    if (!storedRows) {
      alert('Please upload an Excel file first.');
      return;
    }
    const loading = document.getElementById('loading');
    const loadingCompare = document.getElementById('loadingCompare');
    const results = document.getElementById('results');

    if (useCompareLoader && loadingCompare) {
      loadingCompare.classList.remove('hidden');
      if (loading) loading.classList.add('hidden');
    } else if (loading) {
      loading.classList.remove('hidden');
    }
    if (results) results.classList.add('hidden');

    setTimeout(() => {
      try {
        const data = MttDataAnalyzer.compute(datePrev, dateLatest, routeFilter, storedRows, storedDates);
        MttUIManager.render(data);
        // Refresh Delay Reason / Problem Encountered for focus day
        if (typeof MttDelayReason !== 'undefined') {
          MttDelayReason.render(dateLatest);
        }
        if (typeof MttWeeklyMonthly !== 'undefined') {
          MttWeeklyMonthly.onDataReady();
        }
      } catch (err) {
        console.error(err);
        alert('Error during comparison: ' + err.message);
        if (loading) loading.classList.add('hidden');
        if (loadingCompare) loadingCompare.classList.add('hidden');
      }
    }, 100);
  }

  function triggerCompare() {
    const d1 = document.getElementById('selectPrev').value;
    const d2 = document.getElementById('selectLatest').value;
    const filter = getRouteFilter();
    if (!d1 || !d2) {
      alert('Please select both dates.');
      return;
    }
    runCompare(d1, d2, filter, true);
  }

  function init() {
    MttUIManager.initTabs();
    if (typeof MttDelayReason !== 'undefined') MttDelayReason.init();
    if (typeof MttWeeklyMonthly !== 'undefined') MttWeeklyMonthly.init();

    MttFileProcessor.init((d1, d2, group) => {
      runCompare(d1, d2, group || 'ALL', false);
    });

    const btn = document.getElementById('btnCompare');
    if (btn) btn.addEventListener('click', triggerCompare);

    const selRoute = document.getElementById('selectRouteType');
    if (selRoute) selRoute.addEventListener('change', triggerCompare);
  }

  return { init, runCompare };
})();

document.addEventListener('DOMContentLoaded', MttApp.init);
