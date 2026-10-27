/* ==========================================================================
   MODULE: MTT CHART MANAGER
   ========================================================================== */
const MttChartManager = (() => {
  const charts = {};

  function destroy(key) {
    if (charts[key]) {
      charts[key].destroy();
      charts[key] = null;
    }
  }

  function render(regionLate, routeLate, truckerLate, dcLate, histRows, targetPct, filterLabel) {
    if (targetPct == null) targetPct = 96;
    if (!filterLabel) filterLabel = 'Rate';
    ['regions', 'routes', 'truckers', 'dc', 'history'].forEach(destroy);

    const barOpts = (label) => ({
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, ticks: { stepSize: 1 }, title: { display: true, text: label } },
        y: { ticks: { font: { size: 11 } } }
      }
    });

    const el = (id) => document.getElementById(id);

    if (el('chartRegions')) {
      charts.regions = new Chart(el('chartRegions'), {
        type: 'bar',
        data: {
          labels: regionLate.map(r => r.region),
          datasets: [{ data: regionLate.map(r => r.late), backgroundColor: 'rgba(133, 2, 0, 0.95)', borderRadius: 5 }]
        },
        options: barOpts('Late trips')
      });
    }
    if (el('chartRoutes')) {
      charts.routes = new Chart(el('chartRoutes'), {
        type: 'bar',
        data: {
          labels: routeLate.slice(0, 12).map(r => r.route),
          datasets: [{ data: routeLate.slice(0, 12).map(r => r.late), backgroundColor: 'rgb(133, 2, 0)', borderRadius: 5 }]
        },
        options: barOpts('Late trips')
      });
    }
    if (el('chartTruckers')) {
      charts.truckers = new Chart(el('chartTruckers'), {
        type: 'bar',
        data: {
          labels: truckerLate.map(t => t.key.length > 16 ? t.key.slice(0, 14) + '…' : t.key),
          datasets: [{ data: truckerLate.map(t => t.no), backgroundColor: 'rgb(133, 2, 0)', borderRadius: 5 }]
        },
        options: barOpts('Late trips')
      });
    }
    if (el('chartDC')) {
      charts.dc = new Chart(el('chartDC'), {
        type: 'bar',
        data: {
          labels: dcLate.map(d => d.key),
          datasets: [{ data: dcLate.map(d => d.no), backgroundColor: 'rgb(133, 2, 0)', borderRadius: 5 }]
        },
        options: barOpts('Late trips')
      });
    }
    if (el('chartHistory')) {
      charts.history = new Chart(el('chartHistory'), {
        type: 'line',
        data: {
          labels: histRows.map(h => h.date.slice(5)),
          datasets: [
            {
              label: filterLabel,
              data: histRows.map(h => h.rate != null ? h.rate * 100 : null),
              borderColor: '#0400e6',
              tension: 0.25,
              spanGaps: true
            },
            {
              label: 'Target ' + targetPct + '%',
              data: histRows.map(() => targetPct),
              borderColor: '#9E9E9E',
              borderDash: [6, 4],
              pointRadius: 0,
              tension: 0
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
          scales: { y: { min: 40, max: 120, title: { display: true, text: 'Rate %' } } }
        }
      });
    }
  }


  function renderTrends(histOverall, histLuzon, histVismin) {
    ['overallTrend', 'luzonTrend', 'visminTrend'].forEach(destroy);

    function makeLine(canvasId, hist, targetPct, color, chartKey) {
      const el = document.getElementById(canvasId);
      if (!el) return;
      const labels = (hist || []).map(h => h.date.slice(5));
      const rates = (hist || []).map(h => h.rate != null ? +(h.rate * 100).toFixed(2) : null);
      charts[chartKey] = new Chart(el, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Rate %',
              data: rates,
              borderColor: color,
              tension: 0.25,
              spanGaps: true,
              pointRadius: 3
            },
            {
              label: 'Target ' + targetPct + '%',
              data: labels.map(() => targetPct),
              borderColor: '#9E9E9E',
              borderDash: [6, 4],
              pointRadius: 0,
              tension: 0
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } } },
          scales: { y: { min: 40, max: 120, title: { display: true, text: 'Rate %' } } }
        }
      });
    }

    makeLine('chartOverallTrend', histOverall || [], 96, '#E60012', 'overallTrend');
    makeLine('chartLuzonTrend', histLuzon || [], 97, '#1565C0', 'luzonTrend');
    makeLine('chartVisminTrend', histVismin || [], 85, '#6A1B9A', 'visminTrend');
  }

  return { render, renderTrends };
})();

