/* ==========================================================================
   MODULE: WFD CHART MANAGER
   ========================================================================== */
const WfdChartManager = (() => {
  const charts = {};

  function destroy(id) {
    if (charts[id]) {
      charts[id].destroy();
      delete charts[id];
    }
  }

  function destroyAll() {
    Object.keys(charts).forEach(destroy);
  }

  function rateColor(rate) {
    if (rate == null) return '#9E9E9E';
    if (rate >= WfdUtils.TARGET) return '#2E7D32';
    if (rate >= WfdUtils.TARGET - 0.03) return '#F9A825';
    return '#E60012';
  }

  function barChart(canvasId, labels, values, label, opts = {}) {
    destroy(canvasId);
    const el = document.getElementById(canvasId);
    if (!el) return;
    const colors = (opts.colorByRate && values)
      ? values.map(v => rateColor(v))
      : (opts.colors || '#E60012');

    charts[canvasId] = new Chart(el, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: label || 'Rate',
          data: values,
          backgroundColor: colors,
          borderRadius: 6,
          maxBarThickness: 42
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
                const v = ctx.raw;
                if (opts.isPercent) return WfdUtils.pct(v);
                return v != null ? Number(v).toFixed(1) : '—';
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            max: opts.isPercent ? 1.2 : undefined,
            ticks: opts.isPercent ? {
              callback: v => (v * 100).toFixed(0) + '%'
            } : undefined
          },
          x: {
            ticks: { maxRotation: 45, minRotation: 0, font: { size: 11 } }
          }
        }
      }
    });
  }

  function lineChart(canvasId, labels, datasets) {
    destroy(canvasId);
    const el = document.getElementById(canvasId);
    if (!el) return;
    charts[canvasId] = new Chart(el, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top' },
          tooltip: {
            callbacks: {
              label: ctx => ctx.dataset.label + ': ' + WfdUtils.pct(ctx.raw)
            }
          }
        },
        scales: {
          y: {
            min: 0,
            max: 1.2,
            ticks: { callback: v => (v * 100).toFixed(0) + '%' }
          }
        }
      }
    });
  }

  function renderDcChart(dcCompare) {
    const labels = dcCompare.map(d => d.key);
    const rates = dcCompare.map(d => d.rate);
    barChart('chartDc', labels, rates, 'On-time rate', { isPercent: true, colorByRate: true });
  }

  function renderSupChart(supCompare) {
    const labels = supCompare.map(d => d.key.length > 22 ? d.key.slice(0, 20) + '…' : d.key);
    const rates = supCompare.map(d => d.rate);
    barChart('chartSup', labels, rates, 'On-time rate', { isPercent: true, colorByRate: true });
  }

  function renderHistoryChart(history) {
    const labels = history.map(h => WfdUtils.formatDateLabel(h.key));
    const rates = history.map(h => h.rate);
    lineChart('chartHistory', labels, [{
      label: 'On-time rate',
      data: rates,
      borderColor: '#E60012',
      backgroundColor: 'rgba(230,0,18,0.12)',
      fill: true,
      tension: 0.25,
      pointRadius: 4,
      pointBackgroundColor: rates.map(rateColor)
    }, {
      label: 'Target 97%',
      data: rates.map(() => WfdUtils.TARGET),
      borderColor: '#2E7D32',
      borderDash: [6, 4],
      pointRadius: 0,
      fill: false
    }]);
  }

  function renderLateByDc(lateRows) {
    const map = new Map();
    for (const r of lateRows) {
      map.set(r.dcName, (map.get(r.dcName) || 0) + 1);
    }
    const entries = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    barChart('chartLateDc', entries.map(e => e[0]), entries.map(e => e[1]), 'Late trips', {
      colors: '#E60012'
    });
  }

  let lastSupMatrix = null;
  let lastSupChartType = 'bar';

  function renderSupervisorAccumChart(matrix, chartType) {
    if (matrix) lastSupMatrix = matrix;
    if (chartType) lastSupChartType = chartType;
    const m = lastSupMatrix;
    if (!m || !m.rows) return;

    const rows = m.rows.filter(r => r.name !== 'SLU' && r.accumulated != null);
    const labels = rows.map(r => r.name.length > 20 ? r.name.slice(0, 18) + '…' : r.name);
    const rates = rows.map(r => r.accumulated);
    const totals = rows.map(r => r.total || 0);
    const lates = rows.map(r => r.late || 0);
    const type = lastSupChartType === 'line' ? 'line' : 'bar';
    const canvasId = 'chartSupAccum';
    destroy(canvasId);
    const el = document.getElementById(canvasId);
    if (!el) return;

    const colors = rates.map(v => rateColor(v));
    charts[canvasId] = new Chart(el, {
      type,
      data: {
        labels,
        datasets: [{
          label: 'Accumulated on-time',
          data: rates,
          backgroundColor: type === 'bar' ? colors : 'rgba(230,0,18,0.12)',
          borderColor: type === 'line' ? '#E60012' : colors,
          borderWidth: type === 'line' ? 2 : 0,
          borderRadius: type === 'bar' ? 6 : 0,
          maxBarThickness: 42,
          tension: 0.3,
          fill: type === 'line',
          pointRadius: type === 'line' ? 5 : 0,
          pointBackgroundColor: colors
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label(ctx) {
                const i = ctx.dataIndex;
                const rate = rates[i];
                return [
                  'Rate: ' + WfdUtils.pct(rate),
                  'Total: ' + totals[i],
                  'Late: ' + lates[i]
                ];
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            min: 0,
            max: 1.2,
            ticks: {
              callback: v => (v * 100).toFixed(0) + '%'
            }
          },
          x: {
            ticks: { maxRotation: 45, minRotation: 0, font: { size: 11 } }
          }
        }
      }
    });
  }

  function setSupervisorChartType(type) {
    lastSupChartType = type === 'line' ? 'line' : 'bar';
    renderSupervisorAccumChart(null, lastSupChartType);
  }

  return {
    destroyAll,
    renderDcChart,
    renderSupChart,
    renderHistoryChart,
    renderLateByDc,
    renderSupervisorAccumChart,
    setSupervisorChartType
  };
})();
