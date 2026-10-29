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
        if (typeof MttProblemReport !== 'undefined') {
          MttProblemReport.render();
        }
        if (typeof MttWeeklyMonthly !== 'undefined') {
          MttWeeklyMonthly.onDataReady();
        }
        if (typeof MttRateMatrix !== 'undefined') {
          MttRateMatrix.onDataReady();
        }
        if (typeof MttAllData !== 'undefined') {
          MttAllData.onDataReady();
        }
        if (typeof MttSupervisor !== 'undefined') {
          MttSupervisor.onDataReady();
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
    if (typeof MttProblemReport !== 'undefined') MttProblemReport.init();
    if (typeof MttWeeklyMonthly !== 'undefined') MttWeeklyMonthly.init();
    if (typeof MttRateMatrix !== 'undefined') MttRateMatrix.init();
    if (typeof MttAllData !== 'undefined') MttAllData.init();
    if (typeof MttSupervisor !== 'undefined') MttSupervisor.init();

    MttFileProcessor.init((d1, d2, group) => {
      runCompare(d1, d2, group || 'ALL', false);
    });

    const btn = document.getElementById('btnCompare');
    if (btn) btn.addEventListener('click', triggerCompare);

    const selRoute = document.getElementById('selectRouteType');
    if (selRoute) selRoute.addEventListener('change', triggerCompare);

    // Top-level: Day Comparison / All Data / On-time by Supervisor
    function switchMainTab(which) {
      const day = document.getElementById('mttDayPanel');
      const all = document.getElementById('mttAllDataPanel');
      const sup = document.getElementById('mttSupPanel');
      const btnDay = document.getElementById('tabMttDay');
      const btnAll = document.getElementById('tabMttAllData');
      const btnSup = document.getElementById('tabMttSup');
      if (day) day.classList.add('hidden');
      if (all) all.classList.add('hidden');
      if (sup) sup.classList.add('hidden');
      if (btnDay) btnDay.classList.remove('active');
      if (btnAll) btnAll.classList.remove('active');
      if (btnSup) btnSup.classList.remove('active');
      if (which === 'all') {
        if (all) all.classList.remove('hidden');
        if (btnAll) btnAll.classList.add('active');
        if (typeof MttAllData !== 'undefined') MttAllData.render();
      } else if (which === 'sup') {
        if (sup) sup.classList.remove('hidden');
        if (btnSup) btnSup.classList.add('active');
        if (typeof MttSupervisor !== 'undefined') MttSupervisor.render();
      } else {
        if (day) day.classList.remove('hidden');
        if (btnDay) btnDay.classList.add('active');
      }
    }
    const btnDay = document.getElementById('tabMttDay');
    const btnAll = document.getElementById('tabMttAllData');
    const btnSup = document.getElementById('tabMttSup');
    if (btnDay) btnDay.addEventListener('click', () => switchMainTab('day'));
    if (btnAll) btnAll.addEventListener('click', () => switchMainTab('all'));
    if (btnSup) btnSup.addEventListener('click', () => switchMainTab('sup'));
  }

  return { init, runCompare };
})();

document.addEventListener('DOMContentLoaded', MttApp.init);
