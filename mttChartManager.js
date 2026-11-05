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
          datasets: [{ data: regionLate.map(r => r.late), backgroundColor: 'rgba(230,0,18,0.75)', borderRadius: 5 }]
        },
        options: barOpts('Late trips')
      });
    }
    if (el('chartRoutes')) {
      charts.routes = new Chart(el('chartRoutes'), {
        type: 'bar',
        data: {
          labels: routeLate.slice(0, 12).map(r => r.route),
          datasets: [{ data: routeLate.slice(0, 12).map(r => r.late), backgroundColor: 'rgba(183,28,28,0.7)', borderRadius: 5 }]
        },
        options: barOpts('Late trips')
      });
    }
    if (el('chartTruckers')) {
      charts.truckers = new Chart(el('chartTruckers'), {
        type: 'bar',
        data: {
          labels: truckerLate.map(t => t.key.length > 16 ? t.key.slice(0, 14) + '…' : t.key),
          datasets: [{ data: truckerLate.map(t => t.no), backgroundColor: 'rgba(198,40,40,0.7)', borderRadius: 5 }]
        },
        options: barOpts('Late trips')
      });
    }
    if (el('chartDC')) {
      charts.dc = new Chart(el('chartDC'), {
        type: 'bar',
        data: {
          labels: dcLate.map(d => d.key),
          datasets: [{ data: dcLate.map(d => d.no), backgroundColor: 'rgba(239,83,80,0.75)', borderRadius: 5 }]
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

    if (title) title.textContent = meta.title + ' — all dates';
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
      stopPlane();
      const playBtn = document.getElementById('graphFocusPlay');
      if (playBtn) {
        playBtn.disabled = false;
        playBtn.textContent = '▶ Play';
        playBtn.setAttribute('data-plane-play', which);
      }
    }, 50);
  }

  function closeFocus() {
    stopPlane();
    const overlay = document.getElementById('graphFocusOverlay');
    if (overlay) overlay.classList.add('hidden');
    document.body.classList.remove('graph-focus-open');
    destroy('focusTrend');
  }

/* ---- Fun plane animation along trend line ---- */
  const planeAnim = { raf: null, running: null };

  function stopPlane() {
    if (planeAnim.raf) cancelAnimationFrame(planeAnim.raf);
    planeAnim.raf = null;
    planeAnim.running = null;
    document.querySelectorAll('.graph-plane').forEach(function (el) {
      el.classList.remove('is-flying', 'is-crash');
      el.style.opacity = '0';
    });
    document.querySelectorAll('.graph-crash-msg, .graph-crash-fx').forEach(function (el) {
      el.classList.add('hidden');
    });
    document.querySelectorAll('.graph-plane-value').forEach(function (el) {
      el.classList.add('hidden');
    });
    document.querySelectorAll('.graph-play-btn').forEach(function (btn) {
      btn.disabled = false;
      btn.textContent = '▶ Play';
    });
  }

  function playPlaneAnimation(which) {
    // Focus overlay only — plane follows chartFocusTrend
    const chart = charts.focusTrend;
    const plane = document.getElementById('plane-focus');
    const crashMsg = document.getElementById('crash-focus');
    const btn = document.getElementById('graphFocusPlay');
    const overlay = document.getElementById('graphFocusOverlay');
    const host = document.getElementById('graphFocusScroll');
    if (!overlay || overlay.classList.contains('hidden')) return;
    if (!chart || !plane) return;

    stopPlane();
    planeAnim.running = which || 'focus';
    if (btn) { btn.disabled = true; btn.textContent = '…'; }

    // Value popup element (create once per host)
    let valuePop = host ? host.querySelector('.graph-plane-value') : null;
    if (host && !valuePop) {
      valuePop = document.createElement('div');
      valuePop.className = 'graph-plane-value hidden';
      host.appendChild(valuePop);
    }

    const meta = chart.getDatasetMeta(0);
    if (!meta || !meta.data || !meta.data.length) {
      stopPlane();
      return;
    }

    const points = [];
    const rates = chart.data.datasets[0].data || [];
    const labels = chart.data.labels || [];
    meta.data.forEach(function (pt, i) {
      if (!pt || pt.skip) return;
      const v = rates[i];
      if (v == null || isNaN(v)) return;
      points.push({
        x: pt.x,
        y: pt.y,
        rate: Number(v),
        i: i,
        label: labels[i] != null ? String(labels[i]) : ''
      });
    });
    if (points.length < 2) {
      stopPlane();
      return;
    }

    plane.classList.remove('is-crash');
    plane.classList.add('is-flying');
    plane.style.opacity = '1';
    const planeImg = plane.querySelector('.graph-plane-img');
    if (planeImg) {
      const src = planeImg.getAttribute('data-src') || planeImg.getAttribute('src') || 'Plane.gif';
      planeImg.setAttribute('data-src', src.split('?')[0]);
      planeImg.setAttribute('src', src.split('?')[0] + '?t=' + Date.now());
    }
    if (crashMsg) crashMsg.classList.add('hidden');
    if (valuePop) valuePop.classList.add('hidden');

    const CRASH_BELOW = 60;
    const CRASH_HOLD_MS = 4000;
    const SPEED_DOWN = 0.18;
    const SPEED_UP = 0.08;

    const segs = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const climbing = b.y < a.y - 0.5;
      const speed = climbing ? SPEED_UP : SPEED_DOWN;
      segs.push({ a: a, b: b, dist: dist, dur: dist / speed, climbing: climbing });
    }

    function place(x, y, rot) {
      plane.style.transform = 'translate(' + x + 'px, ' + y + 'px) rotate(' + rot + 'deg)';
    }

    function showValueAt(pt) {
      if (!valuePop || !pt) return;
      valuePop.textContent = (pt.label ? pt.label + ' · ' : '') +
        pt.rate.toFixed(2) + '%';
      valuePop.classList.remove('hidden', 'pop-flash');
      // force reflow for animation restart
      void valuePop.offsetWidth;
      valuePop.classList.add('pop-flash');
      valuePop.style.left = Math.max(4, pt.x - 28) + 'px';
      valuePop.style.top = Math.max(4, pt.y - 48) + 'px';
    }

function showCrash(x, y) {
      if (!crashMsg) return;
      const img = crashMsg.querySelector('.graph-crash-img');
      if (img) {
        const src = (img.getAttribute('data-src') || img.getAttribute('src') || 'Explosion4.gif').split('?')[0];
        img.setAttribute('data-src', src);
        img.setAttribute('src', src + '?t=' + Date.now());
      }
      crashMsg.classList.remove('hidden');
      // Removed coordinate positioning so CSS fixed inset:0 takes effect full-screen
      crashMsg.style.left = '';
      crashMsg.style.top = '';
    }

    function hideCrash() {
      if (crashMsg) crashMsg.classList.add('hidden');
    }

    function finish() {
      plane.classList.remove('is-flying', 'is-crash');
      place(points[points.length - 1].x - 22, points[points.length - 1].y - 22, 0);
      plane.style.opacity = '1';
      hideCrash();
      // final point value
      showValueAt(points[points.length - 1]);
      if (btn) { btn.disabled = false; btn.textContent = '▶ Replay'; }
      planeAnim.running = null;
    }

    // Show first point value at takeoff
    showValueAt(points[0]);
    place(points[0].x - 22, points[0].y - 22, -12);

    let segIdx = 0;
    let segElapsed = 0;
    let lastTs = null;
    let crashedOnce = false; // explosion only once
    let lastAnnouncedIdx = points[0].i; // value popup per dot
function hideCrash(callback) {
      if (!crashMsg) {
        if (callback) callback();
        return;
      }
      // Start opacity fade out
      crashMsg.classList.add('is-fading');
      
      // Wait for CSS fade transition (600ms) before hiding element completely
      setTimeout(function () {
        crashMsg.classList.add('hidden');
        crashMsg.classList.remove('is-fading');
        if (callback) callback();
      }, 600);
    }

    function runCrashHold(x, y, angle, resumeSeg, resumeLocal) {
      plane.classList.remove('is-flying');
      plane.classList.add('is-crash');
      place(x - 22, y - 22, angle + 25);
      showCrash(x, y);

      const holdStart = performance.now();
      // Adjust GIF_DURATION_MS to match the exact duration of Explosion3.gif
      const GIF_DURATION_MS = 3000;

      function hold(ts) {
        const ht = ts - holdStart;
        const wobble = Math.sin(ht / 120) * 4;
        place(x - 22 + wobble, y - 22 + Math.min(10, ht / 250), angle + 25 + wobble);

        if (ht < GIF_DURATION_MS) {
          planeAnim.raf = requestAnimationFrame(hold);
          return;
        }

        // GIF finished playing: smoothly hide explosion overlay and resume flight
        hideCrash(function () {
          plane.classList.remove('is-crash');
          plane.classList.add('is-flying');
          plane.style.opacity = '1';
          segIdx = resumeSeg;
          segElapsed = resumeLocal * (segs[resumeSeg] ? segs[resumeSeg].dur : 0);
          lastTs = null;
          planeAnim.raf = requestAnimationFrame(frame);
        });
      }
      planeAnim.raf = requestAnimationFrame(hold);
    }
    function frame(ts) {
      if (lastTs == null) lastTs = ts;
      const dt = Math.min(40, ts - lastTs);
      lastTs = ts;

      if (segIdx >= segs.length) {
        finish();
        return;
      }

      const seg = segs[segIdx];
      segElapsed += dt;
      let local = Math.min(1, segElapsed / seg.dur);
      const x = seg.a.x + (seg.b.x - seg.a.x) * local;
      const y = seg.a.y + (seg.b.y - seg.a.y) * local;
      const rate = seg.a.rate + (seg.b.rate - seg.a.rate) * local;
      const angle = Math.atan2(seg.b.y - seg.a.y, seg.b.x - seg.a.x) * 180 / Math.PI;

      // Announce value when we reach / pass the end of this segment (the next dot)
      if (local >= 0.98 && seg.b.i !== lastAnnouncedIdx) {
        lastAnnouncedIdx = seg.b.i;
        showValueAt(seg.b);
      }

      // Crash once only when dipping below 60%
      if (!crashedOnce && rate < CRASH_BELOW) {
        crashedOnce = true;
        runCrashHold(x, y, angle, segIdx, local);
        return;
      }

      place(x - 22, y - 22, angle);

      if (segElapsed >= seg.dur) {
        segIdx += 1;
        segElapsed = 0;
      }
      planeAnim.raf = requestAnimationFrame(frame);
    }

    planeAnim.raf = requestAnimationFrame(frame);
  }

  function bindPlaneButtons() {
    const btn = document.getElementById('graphFocusPlay');
    if (!btn || btn._planeBound) return;
    btn._planeBound = true;
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      const which = btn.getAttribute('data-plane-play') ||
        (document.getElementById('graphFocusOverlay') || {}).getAttribute('data-focus') ||
        'overall';
      if (planeAnim.running) {
        stopPlane();
        btn.textContent = '▶ Play';
        return;
      }
      playPlaneAnimation(which);
    });
  }

  function initGraphFocus() {
    const btn = document.getElementById('graphFocusClose');
    if (btn) {
      btn.addEventListener('click', closeFocus);
    }
    const overlay = document.getElementById('graphFocusOverlay');
    if (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeFocus();
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeFocus();
    });
    bindPlaneButtons();
  }

  return { render, renderTrends, openFocus, closeFocus, initGraphFocus, playPlaneAnimation, stopPlane };
})();


