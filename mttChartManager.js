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
          datasets: [{ data: regionLate.map(r => r.late), backgroundColor: 'rgb(172, 0, 0)', borderRadius: 5 }]
        },
        options: barOpts('Late trips')
      });
    }
    if (el('chartRoutes')) {
      charts.routes = new Chart(el('chartRoutes'), {
        type: 'bar',
        data: {
          labels: routeLate.slice(0, 12).map(r => r.route),
          datasets: [{ data: routeLate.slice(0, 12).map(r => r.late), backgroundColor: 'rgb(172, 0, 0)', borderRadius: 5 }]
        },
        options: barOpts('Late trips')
      });
    }
    if (el('chartTruckers')) {
      charts.truckers = new Chart(el('chartTruckers'), {
        type: 'bar',
        data: {
          labels: truckerLate.map(t => t.key.length > 16 ? t.key.slice(0, 14) + '…' : t.key),
          datasets: [{ data: truckerLate.map(t => t.no), backgroundColor: 'rgb(172, 0, 0)', borderRadius: 5 }]
        },
        options: barOpts('Late trips')
      });
    }
    if (el('chartDC')) {
      charts.dc = new Chart(el('chartDC'), {
        type: 'bar',
        data: {
          labels: dcLate.map(d => d.key),
          datasets: [{ data: dcLate.map(d => d.no), backgroundColor: 'rgb(172, 0, 0)', borderRadius: 5 }]
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


  /** Last trend data for focus mode re-render */
  let trendCache = {
    overall: [], luzon: [], vismin: []
  };

  const TREND_META = {
    overall: { title: 'Overall', target: 96, color: '#E60012' },
    luzon:   { title: 'Luzon Route', target: 97, color: '#1565C0' },
    vismin:  { title: 'VisMin Route', target: 85, color: '#6A1B9A' }
  };

  function shortDate(d) {
    return d && String(d).length >= 10 ? String(d).slice(5) : (d || '');
  }

  /**
   * minimized (focused=false): same as original Graphs look — short labels, autoSkip
   * focused=true: every date in the series shown on the X axis
   */
  function makeTrendChart(canvasId, hist, targetPct, color, chartKey, focused) {
    const el = document.getElementById(canvasId);
    if (!el) return;
    destroy(chartKey);

    const series = hist || [];
    // Minimized: MM-DD only (old behaviour). Focus: full YYYY-MM-DD for every point.
    const labels = series.map(h => focused ? String(h.date) : shortDate(h.date));
    const rates = series.map(h => h.rate != null ? +(h.rate * 100).toFixed(2) : null);
    const fullDates = series.map(h => h.date);
    const totals = series.map(h => h.total != null ? h.total : null);
    const lates = series.map(h => h.late != null ? h.late : (h.no != null ? h.no : null));

    const xTicks = focused
      ? {
          // Show EVERY date present in the data
          autoSkip: false,
          maxRotation: 90,
          minRotation: 60,
          font: { size: 10 },
          callback: function (val, idx) {
            return labels[idx] != null ? labels[idx] : '';
          }
        }
      : {
          // Original compact view
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 14
        };

    charts[chartKey] = new Chart(el, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Rate %',
            data: rates,
            borderColor: color,
            backgroundColor: color,
            borderWidth: 2.5,
            tension: 0.3,
            spanGaps: true,
            fill: false,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBackgroundColor: '#fff',
            pointBorderColor: color,
            pointBorderWidth: 2,
            pointStyle: 'rect'
          },
          {
            label: 'Target ' + targetPct + '%',
            data: labels.map(function () { return targetPct; }),
            borderColor: '#9E9E9E',
            borderDash: [6, 4],
            borderWidth: 1.5,
            pointRadius: 0,
            pointHoverRadius: 0,
            tension: 0,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        layout: focused ? { padding: { bottom: 8 } } : {},
        plugins: {
          legend: {
            position: 'bottom',
            labels: { boxWidth: 14, boxHeight: 10, font: { size: 10 }, usePointStyle: true }
          },
          tooltip: {
            callbacks: {
              title: function (items) {
                if (!items || !items.length) return '';
                const i = items[0].dataIndex;
                return fullDates[i] || labels[i] || '';
              },
              label: function (ctx) {
                const v = ctx.parsed.y;
                if (ctx.datasetIndex === 1) return 'Target: ' + targetPct + '%';
                const i = ctx.dataIndex;
                let line = 'Rate: ' + (v != null ? v.toFixed(2) + '%' : '—');
                if (totals[i] != null) line += ' · ' + totals[i] + ' trips';
                if (lates[i] != null) line += ' · ' + lates[i] + ' late';
                return line;
              }
            }
          }
        },
        scales: {
          y: {
            min: 40,
            max: 120,
            title: { display: true, text: 'Rate %' },
            grid: { color: 'rgba(0,0,0,0.06)' }
          },
          x: {
            grid: { display: true, color: 'rgba(0,0,0,0.04)' },
            ticks: xTicks
          }
        }
      }
    });
  }

  function renderTrends(histOverall, histLuzon, histVismin) {
    trendCache = {
      overall: histOverall || [],
      luzon: histLuzon || [],
      vismin: histVismin || []
    };
    ['overallTrend', 'luzonTrend', 'visminTrend', 'focusTrend'].forEach(destroy);

    // Minimized cards — identical to original Graphs
    makeTrendChart('chartOverallTrend', trendCache.overall, 96, '#E60012', 'overallTrend', false);
    makeTrendChart('chartLuzonTrend', trendCache.luzon, 97, '#1565C0', 'luzonTrend', false);
    makeTrendChart('chartVisminTrend', trendCache.vismin, 85, '#6A1B9A', 'visminTrend', false);

    bindFocusCards();
  }

  function bindFocusCards() {
    document.querySelectorAll('.graph-card[data-graph-focus]').forEach(function (card) {
      if (card._mttFocusBound) return;
      card._mttFocusBound = true;
      card.addEventListener('click', function (e) {
        if (e.target.closest && e.target.closest('button')) return;
        openFocus(card.getAttribute('data-graph-focus'));
      });
      card.setAttribute('title', 'Click to focus — show all dates');
    });
  }

  function openFocus(which) {
    const meta = TREND_META[which];
    if (!meta) return;
    const hist = (trendCache[which] || []).slice().sort(function (a, b) {
      return String(a.date).localeCompare(String(b.date));
    });
    const overlay = document.getElementById('graphFocusOverlay');
    const title = document.getElementById('graphFocusTitle');
    const sub = document.getElementById('graphFocusSub');
    const scroll = document.getElementById('graphFocusScroll');
    if (!overlay) return;

    if (title) title.textContent = meta.title;
    if (sub) {
      const n = hist.length;
      const first = n ? hist[0].date : '—';
      const last = n ? hist[n - 1].date : '—';
      sub.textContent = n + ' date(s) in data · ' + first + ' → ' + last + ' · Target ' + meta.target + '%';
    }

    // Widen inner canvas area when many dates so every label has room
    if (scroll) {
      const minW = Math.max(900, hist.length * 36);
      scroll.style.minWidth = minW + 'px';
    }

    overlay.classList.remove('hidden');
    overlay.setAttribute('data-focus', which);
    document.body.classList.add('graph-focus-open');

    setTimeout(function () {
      makeTrendChart('chartFocusTrend', hist, meta.target, meta.color, 'focusTrend', true);
      if (charts.focusTrend) charts.focusTrend.resize();
    }, 50);
  }

  function closeFocus() {
    const overlay = document.getElementById('graphFocusOverlay');
    if (overlay) overlay.classList.add('hidden');
    document.body.classList.remove('graph-focus-open');
    destroy('focusTrend');
  }

  function initGraphFocus() {
    const btn = document.getElementById('graphFocusClose');
    if (btn) btn.addEventListener('click', function (e) {
      e.stopPropagation();
      closeFocus();
    });
    const overlay = document.getElementById('graphFocusOverlay');
    if (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeFocus();
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeFocus();
    });
  }

  return { render, renderTrends, openFocus, closeFocus, initGraphFocus };
})();

