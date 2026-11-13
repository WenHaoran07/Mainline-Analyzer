/* ==========================================================================
   MODULE: MTT PLAN TRAVEL TIME ABNORMALITIES
   Detects sudden / unusual changes in Plan Travel Time per route.
   Example: route usually 67 min, some dates drop to 60 min.
   Filters: All dates · Day · Weekly · Monthly
   Select a route → line chart of plan TT over time with abnormal points marked.
   ========================================================================== */
const MttPlanAbnormality = (() => {
  const ABS_MIN_DIFF = 5;      // minutes — absolute gap vs baseline to flag
  const REL_MIN_DIFF = 0.05;   // 5% relative gap vs baseline
  const MIN_DATES = 3;         // need at least this many dates to judge a route

  let periodMode = 'all'; // all | day | week | month
  let selectedDay = null;
  let selectedWeek = null;
  let selectedMonth = null;
  let scope = 'ALL';
  let legType = 'ALL'; // ALL | DIRECT | MULTIDROP
  let regionFilter = 'ALL';
  let searchRoute = '';
  let selectedRoute = null;
  let chartPlan = null;
  let lastAgg = [];

  function pad2(n) { return String(n).padStart(2, '0'); }

  function weekKey(dk) {
    if (typeof MttUtils !== 'undefined' && MttUtils.weekKey) return MttUtils.weekKey(dk);
    if (!dk) return null;
    const [y, m, d] = String(dk).split('-').map(Number);
    if (!y || !m || !d) return null;
    const dt = new Date(Date.UTC(y, m - 1, d));
    const day = dt.getUTCDay() || 7;
    dt.setUTCDate(dt.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((dt - yearStart) / 86400000) + 1) / 7);
    return dt.getUTCFullYear() + '-W' + pad2(weekNo);
  }
  function monthKey(dk) {
    return dk ? String(dk).slice(0, 7) : null;
  }

  /** 3+ numeric legs or TWO DROP / BACKLOAD keywords */
  function isMultiDropRoute(route) {
    const s = String(route || '').trim().toUpperCase();
    if (!s || s === '(BLANK)' || s === 'BLANK') return false;
    const parts = s.split(/[-–—_/\s]+/).map(function (x) { return x.trim(); }).filter(Boolean);
    if (parts.length >= 3) {
      const numericish = parts.filter(function (p) { return /^\d{2,}$/.test(p); });
      if (numericish.length >= 3) return true;
      return true;
    }
    if (s.indexOf('TWO DROP') >= 0 || s.indexOf('2 DROP') >= 0 || s.indexOf('TWODROP') >= 0) return true;
    return false;
  }

  function isBackloadRegion(reg) {
    const u = String(reg || '').trim().toUpperCase();
    return u === 'BACKLOAD' || u === 'BACK LOAD' || u === 'TWO DROPS' || u === 'TWODROPS' || u === 'TWO-DROPS';
  }

  function matchesLegType(r) {
    if (legType === 'ALL') return true;
    const multi = isMultiDropRoute(r.route) || isBackloadRegion(r.region);
    if (legType === 'DIRECT') return !multi;
    if (legType === 'MULTIDROP') return multi;
    return true;
  }

  /** Prefer time-of-day from scheduled departure string */
  function scheduleTimeOnly(val) {
    if (!val) return '';
    const s = String(val).trim();
    // "2026-09-16 13:00:00" or "13:00:00"
    const m = s.match(/(\d{1,2}:\d{2}(?::\d{2})?)/);
    if (m) {
      const parts = m[1].split(':');
      const hh = String(parseInt(parts[0], 10)).padStart(2, '0');
      const mm = parts[1] || '00';
      return hh + ':' + mm;
    }
    return s;
  }

  function getAllRows() {
    if (typeof MttFileProcessor === 'undefined') return [];
    return (MttFileProcessor.getState().storedRows || []).slice();
  }

  function filteredRows() {
    let rows = getAllRows();
    if (scope === 'LUZON') rows = rows.filter(r => r.routeType === 'LUZON');
    else if (scope === 'VISMIN') rows = rows.filter(r => r.routeType === 'VISMIN');

    if (regionFilter && regionFilter !== 'ALL') {
      rows = rows.filter(r => String(r.region || '').trim() === regionFilter);
    }

    rows = rows.filter(matchesLegType);

    if (periodMode === 'day' && selectedDay) {
      rows = rows.filter(r => r.dateKey === selectedDay);
    } else if (periodMode === 'week' && selectedWeek) {
      rows = rows.filter(r => weekKey(r.dateKey) === selectedWeek);
    } else if (periodMode === 'month' && selectedMonth) {
      rows = rows.filter(r => monthKey(r.dateKey) === selectedMonth);
    }

    const q = String(searchRoute || '').trim().toLowerCase();
    if (q) {
      rows = rows.filter(r =>
        String(r.route || '').toLowerCase().includes(q) ||
        String(r.region || '').toLowerCase().includes(q)
      );
    }
    return rows;
  }

  /** Typical plan TT for a list of plan values (median) */
  function median(nums) {
    const a = nums.filter(v => v != null && !isNaN(v) && v > 0).slice().sort((x, y) => x - y);
    if (!a.length) return null;
    const mid = Math.floor(a.length / 2);
    return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
  }

  /** Mode (most frequent rounded plan) — fallback for stability */
  function modePlan(nums) {
    const map = new Map();
    nums.forEach(v => {
      if (v == null || isNaN(v) || v <= 0) return;
      const k = Math.round(v * 10) / 10;
      map.set(k, (map.get(k) || 0) + 1);
    });
    let best = null, bestN = 0;
    map.forEach((n, k) => {
      if (n > bestN || (n === bestN && (best == null || k > best))) {
        best = k;
        bestN = n;
      }
    });
    return best;
  }

  function isAbnormal(plan, baseline) {
    if (plan == null || baseline == null || baseline <= 0) return false;
    const abs = Math.abs(plan - baseline);
    const rel = abs / baseline;
    return abs >= ABS_MIN_DIFF || rel >= REL_MIN_DIFF;
  }

  /**
   * Per route:
   *  - collect unique dates → representative plan TT that day (median of trips)
   *  - baseline = median of daily plan values across the full history of the route
   *    (always use all-time baseline so period filter still shows true drift)
   *  - flag days in the filtered set where plan ≠ baseline by threshold
   */
  function analyze(allRows, filtered) {
    // Full history per route for baseline
    const hist = new Map();
    allRows.forEach(r => {
      const route = (r.route || '(blank)').trim() || '(blank)';
      const plan = Number(r.planTT);
      if (!plan || plan <= 0) return;
      if (!hist.has(route)) {
        hist.set(route, {
          route,
          region: r.region || '(blank)',
          type: r.routeType || 'OTHER',
          byDate: new Map(),
          schedTimes: []
        });
      }
      const e = hist.get(route);
      if (e.region === '(blank)' && r.region) e.region = r.region;
      if (!e.byDate.has(r.dateKey)) e.byDate.set(r.dateKey, []);
      e.byDate.get(r.dateKey).push(plan);
      const st = scheduleTimeOnly(r.scheduledDeparture);
      if (st) e.schedTimes.push(st);
    });

    // Filtered trips per route (for which dates we report)
    const filtDates = new Map();
    filtered.forEach(r => {
      const route = (r.route || '(blank)').trim() || '(blank)';
      const plan = Number(r.planTT);
      if (!plan || plan <= 0) return;
      if (!filtDates.has(route)) filtDates.set(route, new Map());
      const by = filtDates.get(route);
      if (!by.has(r.dateKey)) by.set(r.dateKey, []);
      by.get(r.dateKey).push(plan);
    });

    const out = [];
    hist.forEach((e, route) => {
      const dailyPlans = [];
      const series = [];
      [...e.byDate.keys()].sort().forEach(dk => {
        const dayPlans = e.byDate.get(dk);
        const dayPlan = median(dayPlans);
        if (dayPlan == null) return;
        dailyPlans.push(dayPlan);
        series.push({ date: dk, plan: dayPlan, trips: dayPlans.length });
      });

      if (series.length < MIN_DATES) return;

      const baseline = median(dailyPlans);
      const mode = modePlan(dailyPlans);
      if (baseline == null) return;

      const distinctPlans = [...new Set(dailyPlans.map(v => Math.round(v * 10) / 10))];
      const filtBy = filtDates.get(route) || new Map();
      const abnormals = [];
      series.forEach(pt => {
        // Only list abnormalities that fall inside the current filter window
        if (periodMode !== 'all' && !filtBy.has(pt.date)) return;
        if (isAbnormal(pt.plan, baseline)) {
          abnormals.push({
            date: pt.date,
            plan: pt.plan,
            baseline,
            diff: pt.plan - baseline,
            trips: pt.trips
          });
        }
      });

      // Skip routes with no abnormal days in the current filter
      if (periodMode !== 'all' && !abnormals.length && !filtBy.size) return;
      if (periodMode !== 'all' && !filtBy.size) return;

      // Most common scheduled departure time for this route
      let scheduleDepart = '';
      if (e.schedTimes && e.schedTimes.length) {
        const cnt = new Map();
        e.schedTimes.forEach(function (tm) {
          cnt.set(tm, (cnt.get(tm) || 0) + 1);
        });
        let best = '', bestN = 0;
        cnt.forEach(function (n, tm) {
          if (n > bestN) { bestN = n; best = tm; }
        });
        scheduleDepart = best;
        // also collect unique times if few
        const uniq = [...cnt.keys()].sort();
        if (uniq.length > 1 && uniq.length <= 4) {
          scheduleDepart = uniq.join(' / ');
        }
      }

      out.push({
        route,
        region: e.region,
        type: e.type,
        baseline,
        mode,
        scheduleDepart,
        dateCount: series.length,
        distinctPlans: distinctPlans.length,
        minPlan: Math.min(...dailyPlans),
        maxPlan: Math.max(...dailyPlans),
        series,
        abnormals,
        abnormalCount: abnormals.length,
        severity: abnormals.reduce((s, a) => s + Math.abs(a.diff), 0)
      });
    });

    // Sort: most abnormal first
    out.sort((a, b) => b.abnormalCount - a.abnormalCount || b.severity - a.severity || a.route.localeCompare(b.route));
    return out;
  }

  function fmtHms(mins) {
    if (mins == null || isNaN(mins)) return '—';
    const totalSec = Math.max(0, Math.round(Number(mins) * 60));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }
  function fmtHmsSigned(mins) {
    if (mins == null || isNaN(mins)) return '—';
    const sign = mins > 0.0005 ? '+' : (mins < -0.0005 ? '−' : '');
    return sign + fmtHms(Math.abs(mins));
  }
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function populatePeriodSelectors(allRows) {
    const days = [...new Set(allRows.map(r => r.dateKey).filter(Boolean))].sort();
    const weeks = [...new Set(allRows.map(r => weekKey(r.dateKey)).filter(Boolean))].sort();
    const months = [...new Set(allRows.map(r => monthKey(r.dateKey)).filter(Boolean))].sort();

    const selD = document.getElementById('paDay');
    const selW = document.getElementById('paWeek');
    const selM = document.getElementById('paMonth');

    if (selD) {
      const prev = selectedDay || selD.value;
      selD.innerHTML = days.map(d => '<option value="' + d + '">' + d + '</option>').join('');
      if (prev && days.includes(prev)) selectedDay = prev;
      else selectedDay = days.length ? days[days.length - 1] : null;
      if (selectedDay) selD.value = selectedDay;
    }
    if (selW) {
      const prev = selectedWeek || selW.value;
      selW.innerHTML = weeks.map(w => '<option value="' + w + '">' + w + '</option>').join('');
      if (prev && weeks.includes(prev)) selectedWeek = prev;
      else selectedWeek = weeks.length ? weeks[weeks.length - 1] : null;
      if (selectedWeek) selW.value = selectedWeek;
    }
    if (selM) {
      const prev = selectedMonth || selM.value;
      selM.innerHTML = months.map(m => '<option value="' + m + '">' + m + '</option>').join('');
      if (prev && months.includes(prev)) selectedMonth = prev;
      else selectedMonth = months.length ? months[months.length - 1] : null;
      if (selectedMonth) selM.value = selectedMonth;
    }
  }

  function renderMetrics(agg) {
    const el = document.getElementById('paMetrics');
    if (!el) return;
    const withAbn = agg.filter(r => r.abnormalCount > 0);
    const totalAbn = withAbn.reduce((s, r) => s + r.abnormalCount, 0);
    const biggest = withAbn[0];
    el.innerHTML =
      '<div class="pf-metric pf-m-routes">' +
        '<div class="pf-m-label">Routes scanned</div>' +
        '<div class="pf-m-value">' + agg.length + '</div>' +
        '<div class="pf-m-sub">≥ ' + MIN_DATES + ' days of plan data</div>' +
      '</div>' +
      '<div class="pf-metric ' + (withAbn.length ? 'pf-m-problem' : 'pf-m-okroutes') + '">' +
        '<div class="pf-m-label">Routes with abnormalities</div>' +
        '<div class="pf-m-value">' + withAbn.length + '</div>' +
        '<div class="pf-m-sub">plan TT drifted vs baseline</div>' +
      '</div>' +
      '<div class="pf-metric pf-m-overtrips">' +
        '<div class="pf-m-label">Abnormal date-points</div>' +
        '<div class="pf-m-value">' + totalAbn + '</div>' +
        '<div class="pf-m-sub">days where plan ≠ usual</div>' +
      '</div>' +
      '<div class="pf-metric pf-m-plan">' +
        '<div class="pf-m-label">Rule</div>' +
        '<div class="pf-m-value" style="font-size:1rem;">±' + ABS_MIN_DIFF + ' min</div>' +
        '<div class="pf-m-sub">or ≥' + Math.round(REL_MIN_DIFF * 100) + '% vs median plan</div>' +
      '</div>' +
      (biggest
        ? '<div class="pf-metric pf-m-late">' +
            '<div class="pf-m-label">Most affected</div>' +
            '<div class="pf-m-value" style="font-size:0.95rem;">' + escapeHtml(biggest.route) + '</div>' +
            '<div class="pf-m-sub">' + biggest.abnormalCount + ' abnormal day(s)</div>' +
          '</div>'
        : '');
  }

  function renderTable(agg) {
    const body = document.getElementById('paTableBody');
    const count = document.getElementById('paTableCount');
    if (!body) return;
    const show = agg.filter(r => r.abnormalCount > 0);
    if (count) count.textContent = show.length + ' route(s) with plan changes';

    if (!show.length) {
      body.innerHTML = '<tr><td colspan="11">No plan travel-time abnormalities found for the current filters.</td></tr>';
      return;
    }

    body.innerHTML = show.map((r, i) => {
      const drop = r.abnormals.filter(a => a.diff < 0).length;
      const rise = r.abnormals.filter(a => a.diff > 0).length;
      const sel = selectedRoute === r.route ? ' pa-row-selected' : '';
      return '<tr class="pa-route-row' + sel + '" data-pa-route="' + escapeHtml(r.route) + '" title="Click to chart this route">' +
        '<td>' + (i + 1) + '</td>' +
        '<td><strong>' + escapeHtml(r.route) + '</strong></td>' +
        '<td>' + escapeHtml(r.region) + '</td>' +
        '<td><span class="pf-type-pill">' + escapeHtml(r.type) + '</span></td>' +
        '<td class="pf-time-cell">' + (r.scheduleDepart ? escapeHtml(r.scheduleDepart) : '—') + '</td>' +
        '<td class="pf-time-cell">' + fmtHms(r.baseline) + '</td>' +
        '<td class="pf-time-cell">' + fmtHms(r.minPlan) + '</td>' +
        '<td class="pf-time-cell">' + fmtHms(r.maxPlan) + '</td>' +
        '<td>' + r.dateCount + '</td>' +
        '<td class="pf-late-cell"><strong>' + r.abnormalCount + '</strong>' +
          (drop || rise ? ' <span class="pa-dir-hint">(' +
            (drop ? '↓' + drop : '') +
            (drop && rise ? ' ' : '') +
            (rise ? '↑' + rise : '') + ')</span>' : '') +
        '</td>' +
        '<td><button type="button" class="wm-mini-btn pa-chart-btn" data-pa-route="' +
          escapeHtml(r.route) + '">Chart</button></td>' +
      '</tr>';
    }).join('');

    body.querySelectorAll('[data-pa-route]').forEach(el => {
      el.addEventListener('click', function (ev) {
        const route = el.getAttribute('data-pa-route');
        if (!route) return;
        selectedRoute = route;
        const sel = document.getElementById('paRouteSelect');
        if (sel) {
          // ensure option exists
          let found = false;
          for (let i = 0; i < sel.options.length; i++) {
            if (sel.options[i].value === route) { found = true; break; }
          }
          if (!found) {
            const o = document.createElement('option');
            o.value = route;
            o.textContent = route;
            sel.appendChild(o);
          }
          sel.value = route;
        }
        renderDetail(route);
        renderChart(route);
        // refresh selection highlight
        body.querySelectorAll('tr').forEach(tr => {
          tr.classList.toggle('pa-row-selected', tr.getAttribute('data-pa-route') === route);
        });
      });
    });
  }

  function fillRegionSelect(allRows) {
    const sel = document.getElementById('paRegion');
    if (!sel) return;
    const prev = regionFilter || sel.value || 'ALL';
    let rows = allRows || getAllRows();
    if (scope === 'LUZON') rows = rows.filter(r => r.routeType === 'LUZON');
    else if (scope === 'VISMIN') rows = rows.filter(r => r.routeType === 'VISMIN');
    // still apply leg type so region list matches visible routes
    rows = rows.filter(matchesLegType);
    const regs = [...new Set(rows.map(r => String(r.region || '').trim() || '(blank)'))]
      .filter(Boolean)
      .sort(function (a, b) { return a.localeCompare(b); });
    sel.innerHTML = '<option value="ALL">All regions</option>' +
      regs.map(function (r) {
        return '<option value="' + escapeHtml(r) + '">' + escapeHtml(r) + '</option>';
      }).join('');
    if (prev && (prev === 'ALL' || regs.indexOf(prev) >= 0)) {
      regionFilter = prev;
      sel.value = prev;
    } else {
      regionFilter = 'ALL';
      sel.value = 'ALL';
    }
  }

  function fillRouteSelect(agg) {
    const sel = document.getElementById('paRouteSelect');
    if (!sel) return;
    const prev = selectedRoute || sel.value;
    const routes = agg.map(r => r.route).sort();
    sel.innerHTML = '<option value="">— Select route —</option>' +
      routes.map(r => '<option value="' + escapeHtml(r) + '">' + escapeHtml(r) + '</option>').join('');
    if (prev && routes.indexOf(prev) >= 0) {
      selectedRoute = prev;
      sel.value = prev;
    } else {
      selectedRoute = null;
      sel.value = '';
    }
  }

  function renderDetail(route) {
    const el = document.getElementById('paDetail');
    if (!el) return;
    const item = lastAgg.find(r => r.route === route);
    if (!item) {
      el.innerHTML = '<p class="section-note">Select a route to see abnormal plan dates.</p>';
      return;
    }
    let h = '<div class="pa-detail-head">';
    h += '<div><strong>' + escapeHtml(item.route) + '</strong>';
    h += ' <span class="pf-type-pill">' + escapeHtml(item.type) + '</span>';
    h += ' · ' + escapeHtml(item.region);
    if (item.scheduleDepart) {
      h += ' · Sched. depart <strong>' + escapeHtml(item.scheduleDepart) + '</strong>';
    }
    h += '</div>';
    h += '<div class="pa-baseline">Usual plan (median): <strong>' + fmtHms(item.baseline) + '</strong>';
    if (item.mode != null && Math.abs(item.mode - item.baseline) > 0.05) {
      h += ' · mode ' + fmtHms(item.mode);
    }
    h += ' · range ' + fmtHms(item.minPlan) + ' – ' + fmtHms(item.maxPlan) + '</div></div>';

    if (!item.abnormals.length) {
      h += '<div class="ok-panel pf-ok-panel">✓ No abnormal plan days in the current filter for this route.</div>';
      el.innerHTML = h;
      return;
    }

    h += '<div class="table-scroll pa-detail-scroll"><table class="pf-table"><thead><tr>';
    h += '<th>Date</th><th>Plan TT</th><th>Usual</th><th>Diff</th><th>Trips that day</th><th>Note</th>';
    h += '</tr></thead><tbody>';
    item.abnormals.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).forEach(a => {
      const dir = a.diff < 0 ? 'Dropped' : 'Raised';
      const cls = a.diff < 0 ? 'neg' : 'pos';
      h += '<tr class="' + (a.diff < 0 ? 'late-row' : '') + '">';
      h += '<td>' + escapeHtml(a.date) + '</td>';
      h += '<td class="pf-time-cell"><strong>' + fmtHms(a.plan) + '</strong></td>';
      h += '<td class="pf-time-cell">' + fmtHms(a.baseline) + '</td>';
      h += '<td class="pf-time-cell ' + cls + '">' + fmtHmsSigned(a.diff) + '</td>';
      h += '<td>' + a.trips + '</td>';
      h += '<td>' + dir + ' vs usual plan</td>';
      h += '</tr>';
    });
    h += '</tbody></table></div>';
    el.innerHTML = h;
  }

  function renderChart(route) {
    const canvas = document.getElementById('paChart');
    const titleEl = document.getElementById('paChartTitle');
    const card = document.getElementById('paChartCard');
    if (!canvas || typeof Chart === 'undefined') return;

    if (chartPlan) {
      try { chartPlan.destroy(); } catch (e) {}
      chartPlan = null;
    }

    const item = lastAgg.find(r => r.route === route);
    if (!item || !item.series.length) {
      if (card) card.classList.add('hidden');
      if (titleEl) titleEl.textContent = 'Plan TT over time';
      return;
    }
    if (card) card.classList.remove('hidden');
    if (titleEl) titleEl.textContent = 'Plan TT · ' + route;

    const labels = item.series.map(p => p.date);
    const plans = item.series.map(p => +(Number(p.plan).toFixed(2)));
    const baseline = item.baseline;
    const abnormalSet = new Set(item.abnormals.map(a => a.date));

    const pointBg = item.series.map(p =>
      abnormalSet.has(p.date) ? '#E60012' : '#1565C0'
    );
    const pointR = item.series.map(p => abnormalSet.has(p.date) ? 6 : 3);

    chartPlan = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Plan TT (min)',
            data: plans,
            borderColor: '#1565C0',
            backgroundColor: 'rgba(21,101,192,0.08)',
            borderWidth: 2.5,
            tension: 0.15,
            spanGaps: false,
            pointBackgroundColor: pointBg,
            pointBorderColor: pointBg,
            pointRadius: pointR,
            pointHoverRadius: 7,
            fill: false
          },
          {
            label: 'Usual (median) ' + fmtHms(baseline),
            data: labels.map(() => baseline),
            borderColor: '#2E7D32',
            borderWidth: 2,
            borderDash: [6, 4],
            pointRadius: 0,
            tension: 0,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { boxWidth: 12, font: { size: 11, weight: '600' } }
          },
          tooltip: {
            callbacks: {
              title: items => {
                const i = items[0] && items[0].dataIndex;
                return labels[i] || '';
              },
              label: ctx => {
                if (ctx.datasetIndex === 1) {
                  return ' Usual plan: ' + fmtHms(baseline);
                }
                const i = ctx.dataIndex;
                const v = ctx.parsed.y;
                const abn = abnormalSet.has(labels[i]);
                let line = ' Plan: ' + fmtHms(v);
                if (baseline != null && v != null) {
                  line += ' · vs usual ' + fmtHmsSigned(v - baseline);
                }
                if (abn) line += ' · ABNORMAL';
                return line;
              }
            }
          }
        },
        scales: {
          x: {
            ticks: {
              maxRotation: 45,
              autoSkip: true,
              maxTicksLimit: 20,
              font: { size: 10 }
            },
            grid: { display: false }
          },
          y: {
            title: { display: true, text: 'Plan travel time', font: { size: 11 } },
            ticks: {
              callback: v => fmtHms(v),
              font: { size: 10 }
            },
            grid: { color: '#F0F0F0' }
          }
        }
      }
    });
  }

  function syncPeriodUI() {
    const d = document.getElementById('paDayWrap');
    const w = document.getElementById('paWeekWrap');
    const m = document.getElementById('paMonthWrap');
    if (d) d.classList.toggle('hidden', periodMode !== 'day');
    if (w) w.classList.toggle('hidden', periodMode !== 'week');
    if (m) m.classList.toggle('hidden', periodMode !== 'month');
  }

  function run() {
    const all = getAllRows();
    if (!all.length) {
      const body = document.getElementById('paTableBody');
      if (body) body.innerHTML = '<tr><td colspan="11">Upload a Mainline workbook first.</td></tr>';
      return;
    }
    populatePeriodSelectors(all);
    const filtered = filteredRows();
    // Baseline from full history with same scope / leg / region filters
    let histRows = getAllRows();
    if (scope === 'LUZON') histRows = histRows.filter(r => r.routeType === 'LUZON');
    else if (scope === 'VISMIN') histRows = histRows.filter(r => r.routeType === 'VISMIN');
    if (regionFilter && regionFilter !== 'ALL') {
      histRows = histRows.filter(r => String(r.region || '').trim() === regionFilter);
    }
    histRows = histRows.filter(matchesLegType);

    lastAgg = analyze(histRows, filtered);
    fillRegionSelect(getAllRows());
    fillRouteSelect(lastAgg);
    renderMetrics(lastAgg);
    renderTable(lastAgg);

    const info = document.getElementById('paInfo');
    if (info) {
      const periodLabel = periodMode === 'day'
        ? (selectedDay || '—')
        : (periodMode === 'week'
          ? (selectedWeek || '—')
          : (periodMode === 'month' ? (selectedMonth || '—') : 'All dates'));
      const legLabel = legType === 'DIRECT' ? 'Direct (2-leg)'
        : (legType === 'MULTIDROP' ? 'Two drops / Backload (3+)' : 'All trip types');
      const regLabel = regionFilter && regionFilter !== 'ALL' ? regionFilter : 'All regions';
      info.innerHTML = 'Scope <span class="badge">' + scope +
        '</span> · Trip type <span class="badge">' + legLabel +
        '</span> · Region <span class="badge">' + escapeHtml(regLabel) +
        '</span> · Period <span class="badge">' + periodLabel +
        '</span> · Flag if plan differs by ≥' + ABS_MIN_DIFF + ' min or ≥' +
        Math.round(REL_MIN_DIFF * 100) + '% from the route’s median plan';
    }

    if (selectedRoute) {
      renderDetail(selectedRoute);
      renderChart(selectedRoute);
    } else {
      const detail = document.getElementById('paDetail');
      if (detail) detail.innerHTML = '<p class="section-note">Click a route row or use the selector to chart plan TT over time. Red points = abnormal vs usual plan.</p>';
      const card = document.getElementById('paChartCard');
      if (card) card.classList.add('hidden');
    }
  }

  function onDataReady() {
    const all = getAllRows();
    if (!all.length) return;
    populatePeriodSelectors(all);
    run();
  }

  function init() {
    document.querySelectorAll('[data-pa-period]').forEach(b => {
      b.addEventListener('click', () => {
        periodMode = b.getAttribute('data-pa-period') || 'all';
        document.querySelectorAll('[data-pa-period]').forEach(x => {
          x.classList.toggle('active', x === b);
        });
        syncPeriodUI();
        run();
      });
    });

    const scopeSel = document.getElementById('paScope');
    if (scopeSel) {
      scopeSel.addEventListener('change', () => {
        scope = scopeSel.value || 'ALL';
        regionFilter = 'ALL';
        run();
      });
    }

    const legSel = document.getElementById('paLegType');
    if (legSel) {
      legSel.addEventListener('change', () => {
        legType = legSel.value || 'ALL';
        regionFilter = 'ALL';
        run();
      });
    }

    const regSel = document.getElementById('paRegion');
    if (regSel) {
      regSel.addEventListener('change', () => {
        regionFilter = regSel.value || 'ALL';
        run();
      });
    }

    const search = document.getElementById('paSearchRoute');
    if (search) {
      let t;
      search.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => {
          searchRoute = search.value || '';
          run();
        }, 200);
      });
    }

    ['paDay', 'paWeek', 'paMonth'].forEach(id => {
      const sel = document.getElementById(id);
      if (!sel) return;
      sel.addEventListener('change', () => {
        if (id === 'paDay') selectedDay = sel.value;
        if (id === 'paWeek') selectedWeek = sel.value;
        if (id === 'paMonth') selectedMonth = sel.value;
        run();
      });
    });

    const routeSel = document.getElementById('paRouteSelect');
    if (routeSel) {
      routeSel.addEventListener('change', () => {
        selectedRoute = routeSel.value || null;
        if (selectedRoute) {
          renderDetail(selectedRoute);
          renderChart(selectedRoute);
          const body = document.getElementById('paTableBody');
          if (body) {
            body.querySelectorAll('tr').forEach(tr => {
              tr.classList.toggle('pa-row-selected', tr.getAttribute('data-pa-route') === selectedRoute);
            });
          }
        } else {
          run();
        }
      });
    }

    const btnRun = document.getElementById('btnPaRun');
    if (btnRun) btnRun.addEventListener('click', run);

    const clear = document.getElementById('paClear');
    if (clear) {
      clear.addEventListener('click', () => {
        searchRoute = '';
        scope = 'ALL';
        legType = 'ALL';
        regionFilter = 'ALL';
        periodMode = 'all';
        selectedRoute = null;
        if (search) search.value = '';
        if (scopeSel) scopeSel.value = 'ALL';
        const legSel2 = document.getElementById('paLegType');
        if (legSel2) legSel2.value = 'ALL';
        const regSel2 = document.getElementById('paRegion');
        if (regSel2) regSel2.value = 'ALL';
        if (routeSel) routeSel.value = '';
        document.querySelectorAll('[data-pa-period]').forEach(x => {
          x.classList.toggle('active', x.getAttribute('data-pa-period') === 'all');
        });
        syncPeriodUI();
        run();
      });
    }

    syncPeriodUI();
  }

  return { init, onDataReady, run };
})();
