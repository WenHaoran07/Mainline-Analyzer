/* ==========================================================================
   MODULE: CHART MANAGER
   ========================================================================== */
const ChartManager = (() => {
  let chartRoutes = null;
  let chartRoutesPos = null;
  let chartBranches = null;
  let chartTotalLT = null;

  function renderCharts(topNeg, branchData, topPos = [], totalLtData = null) {
    const reds = ['#E60012', '#FF1744', '#FF5252', '#EF5350', '#E57373', '#EF9A9A', '#FFCDD2', '#FFEBEE'];
    const greens = ['#1B5E20', '#2E7D32', '#388E3C', '#43A047', '#66BB6A', '#81C784', '#A5D6A7', '#C8E6C9'];

    // Negative Routes Chart
    if (chartRoutes) chartRoutes.destroy();
    const routeLabels = topNeg.slice(0, 8).map(r => r.route);
    const routeData = topNeg.slice(0, 8).map(r => Math.round(r.contrib));
    const elNeg = document.getElementById('chartRoutes');
    if (elNeg) {
      chartRoutes = new Chart(elNeg, {
        type: 'bar',
        data: {
          labels: routeLabels,
          datasets: [{
            label: 'Impact on Avg',
            data: routeData,
            backgroundColor: routeData.map((_, i) => i === 0 ? '#E60012' : reds[Math.min(i, reds.length - 1)]),
            borderRadius: 6,
            borderSkipped: false
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: ctx => ' Impact: ' + ctx.raw } }
          },
          scales: {
            x: { grid: { color: '#F0F0F0' }, ticks: { font: { size: 11 } } },
            y: { grid: { display: false }, ticks: { font: { size: 11, weight: '600' } } }
          }
        }
      });
    }

    // Positive Routes Chart
    if (chartRoutesPos) chartRoutesPos.destroy();
    const posLabels = (topPos || []).slice(0, 8).map(r => r.route);
    const posData = (topPos || []).slice(0, 8).map(r => Math.round(r.contrib));
    const elPos = document.getElementById('chartRoutesPos');
    if (elPos) {
      chartRoutesPos = new Chart(elPos, {
        type: 'bar',
        data: {
          labels: posLabels.length ? posLabels : ['No positive routes'],
          datasets: [{
            label: 'Positive Impact',
            data: posData.length ? posData : [0],
            backgroundColor: posData.map((_, i) => i === 0 ? '#1B5E20' : greens[Math.min(i, greens.length - 1)]),
            borderRadius: 6,
            borderSkipped: false
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: ctx => ' Impact: +' + ctx.raw } }
          },
          scales: {
            x: { grid: { color: '#F0F0F0' }, ticks: { font: { size: 11 } } },
            y: { grid: { display: false }, ticks: { font: { size: 11, weight: '600' } } }
          }
        }
      });
    }

    // Branches Chart (mixed)
    if (chartBranches) chartBranches.destroy();
    const brSorted = [...branchData].sort((a, b) => a.contrib - b.contrib);
    const brLabels = brSorted.map(b => b.branch.length > 16 ? b.branch.slice(0, 14) + '…' : b.branch);
    const brData = brSorted.map(b => Math.round(b.contrib));
    const elBr = document.getElementById('chartBranches');
    if (elBr) {
      chartBranches = new Chart(elBr, {
        type: 'bar',
        data: {
          labels: brLabels,
          datasets: [{
            label: 'Impact',
            data: brData,
            backgroundColor: brData.map(v => v < 0 ? '#E60012' : '#2E7D32'),
            borderRadius: 6,
            borderSkipped: false
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: ctx => ' Impact: ' + (ctx.raw > 0 ? '+' : '') + ctx.raw } }
          },
          scales: {
            x: { grid: { color: '#F0F0F0' }, ticks: { font: { size: 11 } } },
            y: { grid: { display: false }, ticks: { font: { size: 11, weight: '600' } } }
          }
        }
      });
    }

    // Total Loading Tickets comparison chart
    if (chartTotalLT) chartTotalLT.destroy();
    const elTotal = document.getElementById('chartTotalLT');
    if (elTotal && totalLtData) {
      const prevLabel = totalLtData.datePrev || 'Previous';
      const latestLabel = totalLtData.dateLatest || 'Latest';
      const prevVal = Math.round(totalLtData.prevTotal || 0);
      const latestVal = Math.round(totalLtData.latestTotal || 0);
      chartTotalLT = new Chart(elTotal, {
        type: 'bar',
        data: {
          labels: [prevLabel, latestLabel],
          datasets: [{
            label: 'Total Loading Tickets',
            data: [prevVal, latestVal],
            backgroundColor: ['#90A4AE', latestVal >= prevVal ? '#2E7D32' : '#E60012'],
            borderRadius: 8,
            borderSkipped: false,
            maxBarThickness: 64
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: ctx => ' Total LT: ' + Number(ctx.raw).toLocaleString()
              }
            }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { font: { size: 11, weight: '600' } }
            },
            y: {
              beginAtZero: true,
              grid: { color: '#F0F0F0' },
              ticks: {
                font: { size: 10 },
                callback: v => Number(v).toLocaleString()
              }
            }
          }
        }
      });
    }
  }

  return { renderCharts };
})();
