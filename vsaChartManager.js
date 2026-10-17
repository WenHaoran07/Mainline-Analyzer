/* ==========================================================================
   MODULE: VSA CHART MANAGER
   ========================================================================== */
const VsaChartManager = (() => {
  let chartArea = null;
  let chartRoute = null;
  let chartHistory = null;
  let chartSize = null;

  function destroy(c) {
    if (c) { try { c.destroy(); } catch (_) {} }
  }

  function rateColor(rate) {
    if (rate == null) return '#9E9E9E';
    if (rate >= VsaUtils.TARGET) return '#2E7D32';
    if (rate >= VsaUtils.TARGET - 0.03) return '#FF8F00';
    return '#E60012';
  }

  function renderAreaChart(areaCompare) {
    const canvas = document.getElementById('chartArea');
    if (!canvas) return;
    destroy(chartArea);

    const labels = areaCompare.map(d => d.key);
    const rates = areaCompare.map(d => d.rate != null ? +(d.rate * 100).toFixed(1) : null);
    const colors = areaCompare.map(d => rateColor(d.rate));

    chartArea = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Accuracy %',
          data: rates,
          backgroundColor: colors,
          borderRadius: 6,
          maxBarThickness: 48
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => {
                const d = areaCompare[ctx.dataIndex];
                return `${ctx.parsed.y}%  (${d.yes} YES / ${d.no} NO · n=${d.total})`;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: false,
            min: 70,
            max: 100,
            ticks: { callback: v => v + '%' },
            grid: { color: '#F0F0F0' }
          },
          x: { grid: { display: false } }
        }
      }
    });
  }

  function renderRouteChart(topMismatch) {
    const canvas = document.getElementById('chartRoute');
    if (!canvas) return;
    destroy(chartRoute);

    const data = (topMismatch || []).slice(0, 12);
    const labels = data.map(d => d.key);
    const nos = data.map(d => d.no);
    const rates = data.map(d => d.rate != null ? +(d.rate * 100).toFixed(1) : 0);

    chartRoute = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Num count',
            data: nos,
            backgroundColor: '#E60012',
            borderRadius: 5,
            maxBarThickness: 36,
            yAxisID: 'y'
          },
          {
            label: 'Accuracy %',
            data: rates,
            type: 'line',
            borderColor: '#1565C0',
            backgroundColor: 'transparent',
            pointBackgroundColor: '#1565C0',
            pointRadius: 4,
            tension: 0.25,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } }
        },
        scales: {
          y: {
            beginAtZero: true,
            position: 'left',
            title: { display: true, text: 'NO count', font: { size: 11 } },
            grid: { color: '#F0F0F0' }
          },
          y1: {
            beginAtZero: false,
            min: 0,
            max: 100,
            position: 'right',
            title: { display: true, text: 'Accuracy %', font: { size: 11 } },
            ticks: { callback: v => v + '%' },
            grid: { drawOnChartArea: false }
          },
          x: {
            ticks: { maxRotation: 45, minRotation: 30, font: { size: 10 } },
            grid: { display: false }
          }
        }
      }
    });
  }

  function renderHistoryChart(history) {
    const canvas = document.getElementById('chartHistory');
    if (!canvas) return;
    destroy(chartHistory);

    const labels = history.map(d => VsaUtils.formatDateLabel(d.key));
    const rates = history.map(d => d.rate != null ? +(d.rate * 100).toFixed(1) : null);
    const targetLine = history.map(() => +(VsaUtils.TARGET * 100).toFixed(1));

    chartHistory = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Accuracy %',
            data: rates,
            borderColor: '#E60012',
            backgroundColor: 'rgba(230,0,18,0.08)',
            fill: true,
            tension: 0.3,
            pointRadius: 3,
            pointBackgroundColor: '#E60012'
          },
          {
            label: 'Target 97%',
            data: targetLine,
            borderColor: '#2E7D32',
            borderDash: [6, 4],
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } }
        },
        scales: {
          y: {
            beginAtZero: false,
            min: 70,
            max: 100,
            ticks: { callback: v => v + '%' },
            grid: { color: '#F0F0F0' }
          },
          x: {
            ticks: { maxRotation: 40, font: { size: 10 } },
            grid: { display: false }
          }
        }
      }
    });
  }

  function renderSizeChart(patterns) {
    const canvas = document.getElementById('chartSize');
    if (!canvas) return;
    destroy(chartSize);

    const data = (patterns || []).slice(0, 10);
    const labels = data.map(d => d.planned + ' → ' + d.actual);
    const counts = data.map(d => d.count);

    chartSize = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Mismatch count',
          data: counts,
          backgroundColor: '#FF8F00',
          borderRadius: 5,
          maxBarThickness: 40
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              afterLabel: ctx => {
                const d = data[ctx.dataIndex];
                return d.samples.map(s => `${s.route} · ${s.plate || '—'} · ${s.dateKey}`).join('\n');
              }
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            grid: { color: '#F0F0F0' },
            ticks: { stepSize: 1 }
          },
          y: {
            grid: { display: false },
            ticks: { font: { size: 11 } }
          }
        }
      }
    });
  }

  return {
    renderAreaChart,
    renderRouteChart,
    renderHistoryChart,
    renderSizeChart
  };
})();
