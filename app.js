/* ==========================================================================
   MODULE: MAIN APPLICATION COORDINATOR (CONTROLLER)
   ========================================================================== */
const App = (() => {
  let currentComparisonData = null;

  function runCompare(datePrev, dateLatest, routeGroup = 'ALL') {
    const { storedAllRows, storedSlu, storedColMap } = FileProcessor.getState();

    if (!storedSlu || !storedColMap) {
      alert('Please upload an Excel file first before comparing.');
      return;
    }

    const loadingUpload = document.getElementById('loading');
    const loadingCompare = document.getElementById('loadingCompare');
    const results = document.getElementById('results');
    const aiBox = document.getElementById('aiReasoningBox');

    if (aiBox) aiBox.classList.add('hidden');

    setTimeout(() => {
      try {
        const analysisData = DataAnalyzer.computeMetrics(storedSlu, storedColMap, datePrev, dateLatest, routeGroup);
        currentComparisonData = analysisData;

        UIManager.renderComparisonView(analysisData, routeGroup);

        // Render Daily Trend Matrix
        DailyTrendManager.render(storedAllRows || storedSlu, storedColMap);

        const prevTotalLT = (analysisData.prevAvg || 0) * (analysisData.prevTrips || 0);
        const latestTotalLT = (analysisData.latestAvg || 0) * (analysisData.latestTrips || 0);
        ChartManager.renderCharts(
          analysisData.topNeg,
          analysisData.branchStats.filter(b => b.contrib < -10 || b.contrib > 20).slice(0, 10),
          analysisData.topPos || [],
          {
            datePrev: analysisData.datePrev,
            dateLatest: analysisData.dateLatest,
            prevTotal: prevTotalLT,
            latestTotal: latestTotalLT
          }
        );

        // Trip-level detail table (sorted by Loading Tickets)
        if (typeof DetailTableManager !== 'undefined') {
          DetailTableManager.render(storedSlu, storedColMap, datePrev, dateLatest, routeGroup);
        }

        // Explicitly hide BOTH loading overlays
        if (loadingUpload) loadingUpload.classList.add('hidden');
        if (loadingCompare) loadingCompare.classList.add('hidden');
        
        results.classList.remove('hidden');
      } catch (err) {
        console.error('Error during comparison:', err);
        alert('An error occurred while processing the comparison: ' + err.message);
        if (loadingUpload) loadingUpload.classList.add('hidden');
        if (loadingCompare) loadingCompare.classList.add('hidden');
      }
    }, 6000);
  }

  function init() {
    ReferenceManager.init();
    if (typeof DetailTableManager !== 'undefined') DetailTableManager.init();

    FileProcessor.init((d1, d2, group) => {
      runCompare(d1, d2, group);
    });

    AiReasoningManager.init(() => currentComparisonData);

    const btnCompare = document.getElementById('btnCompare');
    if (btnCompare) {
      btnCompare.addEventListener('click', () => {
        const selPrev = document.getElementById('selectPrev');
        const selLatest = document.getElementById('selectLatest');
        const selGroup = document.getElementById('selectGroup');

        if (!selPrev || !selLatest || !selPrev.value || !selLatest.value) {
          alert('Please upload a file to populate comparison dates.');
          return;
        }

        const d1 = selPrev.value;
        const d2 = selLatest.value;
        const group = selGroup ? selGroup.value : 'ALL';

        if (d1 === d2) {
          alert('Please select two different dates.');
          return;
        }

        // Show compare loading overlay on button click
        const loadingCompare = document.getElementById('loadingCompare');
        const results = document.getElementById('results');
        if (loadingCompare) loadingCompare.classList.remove('hidden');
        if (results) results.classList.add('hidden');

        runCompare(d1, d2, group);
      });
    }
  }

  return { init };
})();

// Start Application
document.addEventListener('DOMContentLoaded', App.init);