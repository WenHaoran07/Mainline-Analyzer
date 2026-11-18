/* ==========================================================================
   MODULE: BT CHART MANAGER — bar / line / pie + count labels
   ========================================================================== */
const BtChartManager = (() => {
  const charts = {};
  const PALETTE = [
    '#E60012', '#1565C0', '#2E7D32', '#F9A825', '#6A1B9A',
    '#00838F', '#EF6C00', '#AD1457', '#455A64', '#5D4037',
    '#C62828', '#283593', '#00695C', '#F57F17', '#4A148C'
  ];

  if (typeof Chart !== 'undefined' && typeof ChartDataLabels !== 'undefined') {
    Chart.register(ChartDataLabels);
  }

  function destroy(id) {
    if (charts[id]) {
      charts[id].destroy();
      delete charts[id];
    }
  }

  function destroyAll() {
    Object.keys(charts).forEach(destroy);
  }

  function colorsFor(n) {
    return Array.from({ length: n }, (_, i) => PALETTE[i % PALETTE.length]);
  }

  /** Count labels on the primary dataset only */
  function countLabels(opts) {
    const anchor = (opts && opts.anchor) || 'end';
    const align = (opts && opts.align) || 'top';
    const color = (opts && opts.color) || '#212121';
    return {
      datalabels: {
        display: true,
        anchor,
        align,
        color,
        font: { weight: '700', size: 11 },
        formatter(value, ctx) {
          // Only label first dataset (broken truck counts), skip avg-downtime line
          if (ctx.datasetIndex > 0) return '';
          if (value == null || value === 0) return '';
          return value;
        },
        clamp: true,
        clip: false
      }
    };
  }

  function monthlyBarLine(canvasId, monthly, type) {
    destroy(canvasId);
    const el = document.getElementById(canvasId);
    if (!el || !monthly || !monthly.length) return;

    const t = (type || 'bar').toLowerCase();
    const labels = monthly.map(m => m.key.length > 3 ? m.key.slice(0, 3) : m.key);
    const fullLabels = monthly.map(m => m.key);
    const counts = monthly.map(m => m.total);
    const avgHrs = monthly.map(m => m.avgHours != null ? +m.avgHours.toFixed(1) : null);

    if (t === 'pie') {
      charts[canvasId] = new Chart(el, {
        type: 'doughnut',
        data: {
          labels: fullLabels,
          datasets: [{
            label: 'Broken trucks',
            data: counts,
            backgroundColor: colorsFor(counts.length),
            borderWidth: 2,
            borderColor: '#fff'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'right', labels: { boxWidth: 10, font: { size: 10 }, padding: 8 } },
            ...countLabels({ anchor: 'center', align: 'center', color: '#fff' }),
            tooltip: {
              callbacks: {
                label(ctx) {
                  const total = counts.reduce((a, b) => a + b, 0);
                  const v = ctx.raw;
                  const pct = total ? ((v / total) * 100).toFixed(1) : 0;
                  return ctx.label + ': ' + v + ' (' + pct + '%)';
                }
              }
            }
          }
        }
      });
      return;
    }

    const isLine = t === 'line';
    charts[canvasId] = new Chart(el, {
      type: isLine ? 'line' : 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Broken trucks',
            data: counts,
            backgroundColor: isLine ? 'rgba(230,0,18,0.15)' : '#E60012',
            borderColor: '#E60012',
            borderWidth: isLine ? 2.5 : 0,
            borderRadius: isLine ? 0 : 6,
            tension: 0.3,
            fill: isLine,
            yAxisID: 'y',
            order: 1,
            datalabels: {
              display: true,
              anchor: 'end',
              align: 'top',
              color: '#E60012',
              font: { weight: '700', size: 11 },
              formatter: v => (v == null || v === 0 ? '' : v)
            }
          },
          {
            label: 'Avg downtime (hrs)',
            data: avgHrs,
            type: 'line',
            borderColor: '#1565C0',
            backgroundColor: 'transparent',
            borderWidth: 2,
            pointRadius: 3,
            tension: 0.3,
            yAxisID: 'y1',
            order: 0,
            datalabels: { display: false }
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        layout: { padding: { top: 18 } },
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
          datalabels: { display: false },
          tooltip: {
            callbacks: {
              afterBody(items) {
                const i = items[0]?.dataIndex;
                if (i == null || !monthly[i]) return '';
                const m = monthly[i];
                return [
                  'Transfers: ' + m.transfers,
                  'Repairs: ' + m.repairs,
                  'Accidents: ' + m.accidents
                ];
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: { display: true, text: 'Count', font: { size: 11 } },
            ticks: { precision: 0 }
          },
          y1: {
            beginAtZero: true,
            position: 'right',
            grid: { drawOnChartArea: false },
            title: { display: true, text: 'Hours', font: { size: 11 } }
          }
        }
      }
    });
  }

  function groupChart(canvasId, groups, type, opts) {
    destroy(canvasId);
    const el = document.getElementById(canvasId);
    if (!el || !groups || !groups.length) return;

    const t = (type || 'bar').toLowerCase();
    const maxBars = opts && opts.maxBars ? opts.maxBars : 0;
    let list = groups.slice();
    if (maxBars && list.length > maxBars) list = list.slice(0, maxBars);

    const labels = list.map(g => {
      const k = String(g.key || 'Unknown');
      return k.length > 22 ? k.slice(0, 20) + '…' : k;
    });
    const fullLabels = list.map(g => String(g.key || 'Unknown'));
    const data = list.map(g => g.total);
    const seriesLabel = (opts && opts.label) || 'Broken trucks';

    if (t === 'pie') {
      charts[canvasId] = new Chart(el, {
        type: 'doughnut',
        data: {
          labels: fullLabels,
          datasets: [{
            label: seriesLabel,
            data,
            backgroundColor: colorsFor(data.length),
            borderWidth: 2,
            borderColor: '#fff'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'right',
              labels: { boxWidth: 10, font: { size: 10 }, padding: 8 }
            },
            datalabels: {
              display: true,
              anchor: 'center',
              align: 'center',
              color: '#fff',
              font: { weight: '700', size: 11 },
              formatter: v => (v == null || v === 0 ? '' : v)
            },
            tooltip: {
              callbacks: {
                label(ctx) {
                  const total = data.reduce((a, b) => a + b, 0);
                  const v = ctx.raw;
                  const pct = total ? ((v / total) * 100).toFixed(1) : 0;
                  return ctx.label + ': ' + v + ' (' + pct + '%)';
                }
              }
            }
          }
        }
      });
      return;
    }

    if (t === 'line') {
      charts[canvasId] = new Chart(el, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: seriesLabel,
            data,
            borderColor: '#E60012',
            backgroundColor: 'rgba(230,0,18,0.12)',
            borderWidth: 2.5,
            pointRadius: 4,
            pointBackgroundColor: '#E60012',
            tension: 0.3,
            fill: true
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          layout: { padding: { top: 18 } },
          plugins: {
            legend: { display: true, position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
            datalabels: {
              display: true,
              anchor: 'end',
              align: 'top',
              color: '#E60012',
              font: { weight: '700', size: 11 },
              formatter: v => (v == null || v === 0 ? '' : v)
            }
          },
          scales: {
            y: { beginAtZero: true, ticks: { precision: 0 } }
          }
        }
      });
      return;
    }

    const horizontal = !!(opts && opts.horizontal !== false && list.length > 4);
    const barLabels = horizontal ? labels.slice().reverse() : labels;
    const barData = horizontal ? data.slice().reverse() : data;
    const barList = horizontal ? list.slice().reverse() : list;

    charts[canvasId] = new Chart(el, {
      type: 'bar',
      data: {
        labels: barLabels,
        datasets: [{
          label: seriesLabel,
          data: barData,
          backgroundColor: horizontal ? '#E60012' : colorsFor(barData.length),
          borderRadius: 4
        }]
      },
      options: {
        indexAxis: horizontal ? 'y' : 'x',
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: horizontal ? { right: 28 } : { top: 18 } },
        plugins: {
          legend: { display: false },
          datalabels: {
            display: true,
            anchor: 'end',
            align: horizontal ? 'right' : 'top',
            color: horizontal ? '#212121' : '#E60012',
            font: { weight: '700', size: 11 },
            formatter: v => (v == null || v === 0 ? '' : v)
          },
          tooltip: {
            callbacks: {
              afterLabel(ctx) {
                const g = barList[ctx.dataIndex];
                if (!g || g.avgHours == null) return '';
                return 'Avg DT: ' + BtUtils.formatHours(g.avgHours);
              }
            }
          }
        },
        scales: horizontal
          ? { x: { beginAtZero: true, ticks: { precision: 0 } } }
          : { y: { beginAtZero: true, ticks: { precision: 0 } } }
      }
    });
  }

  function pieChart(canvasId, groups, label) {
    groupChart(canvasId, groups, 'pie', { label: label || 'Count' });
  }

  function horizontalBar(canvasId, groups, maxBars) {
    groupChart(canvasId, groups, 'bar', { maxBars: maxBars || 12, horizontal: true, label: 'Broken trucks' });
  }

  function getChartImageBase64(canvasId) {
    const el = document.getElementById(canvasId);
    if (!el) return null;
    try {
      const url = el.toDataURL('image/png');
      const m = url.match(/^data:image\/png;base64,(.+)$/);
      return m ? m[1] : null;
    } catch (e) {
      return null;
    }
  }

  function getAllChartImages() {
    return {
      monthly: getChartImageBase64('chartMonthly') || getChartImageBase64('chartMonthlyCharts'),
      monthlyCharts: getChartImageBase64('chartMonthlyCharts'),
      trucker: getChartImageBase64('chartTrucker'),
      reason: getChartImageBase64('chartReason'),
      status: getChartImageBase64('chartStatus')
    };
  }

  function getTypeFor(chartKey, fallback) {
    const group = document.querySelector('.chart-type-toggle[data-chart="' + chartKey + '"]');
    if (!group) return fallback || 'bar';
    const active = group.querySelector('.chart-type-btn.active');
    return (active && active.getAttribute('data-type')) || fallback || 'bar';
  }

  return {
    destroyAll,
    monthlyBarLine,
    groupChart,
    pieChart,
    horizontalBar,
    getChartImageBase64,
    getAllChartImages,
    getTypeFor
  };
})();
