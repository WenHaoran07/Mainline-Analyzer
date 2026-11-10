/* ==========================================================================
   MODULE: MTT PLAN FEASIBILITY
   Average Actual Travel Time vs Plan Travel Time by route
   Filters: route search · on-time · scope · week / month
   Highlights most problematic (over-plan) routes
   ========================================================================== */
const MttPlanFeasibility = (() => {
  let periodMode = 'all'; // all | week | month
  let scope = 'ALL';
  let onTimeFilter = 'ALL';
  let searchRoute = '';
  let sortMode = 'overrun-desc';
  let selectedWeek = null;
  let selectedMonth = null;
  let chartTop = null;
  let chartScatter = null;
  let lastRows = [];

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

  function getAllRows() {
    if (typeof MttFileProcessor === 'undefined') return [];
    const st = MttFileProcessor.getState();
    return (st.storedRows || []).slice();
  }

  function filteredBase() {
    let rows = getAllRows();
    if (scope === 'LUZON') rows = rows.filter(r => r.routeType === 'LUZON');
    else if (scope === 'VISMIN') rows = rows.filter(r => r.routeType === 'VISMIN');

    if (onTimeFilter === 'YES') rows = rows.filter(r => r.onTime === 'YES');
    else if (onTimeFilter === 'NO') rows = rows.filter(r => r.onTime === 'NO');

    if (periodMode === 'week' && selectedWeek) {
      rows = rows.filter(r => weekKey(r.dateKey) === selectedWeek);
    } else if (periodMode === 'month' && selectedMonth) {
      rows = rows.filter(r => monthKey(r.dateKey) === selectedMonth);
    }

    const q = String(searchRoute || '').trim().toLowerCase();
    if (q) {
      rows = rows.filter(r =>
        String(r.route || '').toLowerCase().includes(q) ||
        String(r.region || '').toLowerCase().includes(q) ||
        String(r.dcIntended || '').toLowerCase().includes(q)
      );
    }
    return rows;
  }

  function aggregateByRoute(rows) {
    const map = {};
    rows.forEach(r => {
      const key = (r.route || '(blank)').trim() || '(blank)';
      if (!map[key]) {
        map[key] = {
          route: key,
          region: r.region || '(blank)',
          type: r.routeType || 'OTHER',
          trips: 0,
          onTime: 0,
          late: 0,
          sumActual: 0,
          sumPlan: 0,
          overPlan: 0,
          underPlan: 0,
          sumOverrun: 0
        };
      }
      const a = map[key];
      const actual = Number(r.actualTT) || 0;
      const plan = Number(r.planTT) || 0;
      a.trips += 1;
      if (r.onTime === 'YES') a.onTime += 1;
      else if (r.onTime === 'NO') a.late += 1;
      a.sumActual += actual;
      a.sumPlan += plan;
      if (plan > 0 && actual > plan) {
        a.overPlan += 1;
        a.sumOverrun += (actual - plan);
      } else if (plan > 0 && actual <= plan) {
        a.underPlan += 1;
      }
      if (a.region === '(blank)' && r.region) a.region = r.region;
    });

    return Object.values(map).map(a => {
      const avgActual = a.trips ? a.sumActual / a.trips : 0;
      const avgPlan = a.trips ? a.sumPlan / a.trips : 0;
      const avgDiff = avgActual - avgPlan;
      const pctOver = a.trips ? a.overPlan / a.trips : 0;
      const lateRate = a.trips ? a.late / a.trips : 0;
      const avgOverrunWhenLate = a.overPlan ? a.sumOverrun / a.overPlan : 0;
      // Feasibility score: lower is worse (more over plan)
      const feasible = avgPlan > 0 ? avgActual / avgPlan : null;
      return {
        route: a.route,
        region: a.region,
        type: a.type,
        trips: a.trips,
        onTime: a.onTime,
        late: a.late,
        lateRate,
        avgActual,
        avgPlan,
        avgDiff,
        pctOver,
        overPlan: a.overPlan,
        underPlan: a.underPlan,
        avgOverrunWhenLate,
        feasible,
        problemScore: (pctOver * 100) + Math.max(0, avgDiff) * 0.5 + (lateRate * 20)
      };
    });
  }

  function sortRows(list) {
    const arr = list.slice();
    switch (sortMode) {
      case 'overrun-asc':
        arr.sort((a, b) => a.avgDiff - b.avgDiff);
        break;
      case 'pct-desc':
        arr.sort((a, b) => b.pctOver - a.pctOver || b.avgDiff - a.avgDiff);
        break;
      case 'late-desc':
        arr.sort((a, b) => b.lateRate - a.lateRate || b.avgDiff - a.avgDiff);
        break;
      case 'trips-desc':
        arr.sort((a, b) => b.trips - a.trips);
        break;
      case 'route-asc':
        arr.sort((a, b) => a.route.localeCompare(b.route));
        break;
      case 'overrun-desc':
      default:
        arr.sort((a, b) => b.problemScore - a.problemScore);
        break;
    }
    return arr;
  }

  function populatePeriodSelectors(allRows) {
    const weeks = [...new Set(allRows.map(r => weekKey(r.dateKey)).filter(Boolean))].sort();
    const months = [...new Set(allRows.map(r => monthKey(r.dateKey)).filter(Boolean))].sort();
    const selW = document.getElementById('pfWeek');
    const selM = document.getElementById('pfMonth');
    if (selW) {
      const prev = selectedWeek || selW.value;
      selW.innerHTML = weeks.map(w => `<option value="${w}">${w}</option>`).join('');
      if (prev && weeks.includes(prev)) selectedWeek = prev;
      else selectedWeek = weeks.length ? weeks[weeks.length - 1] : null;
      if (selectedWeek) selW.value = selectedWeek;
    }
    if (selM) {
      const prev = selectedMonth || selM.value;
      selM.innerHTML = months.map(m => `<option value="${m}">${m}</option>`).join('');
      if (prev && months.includes(prev)) selectedMonth = prev;
      else selectedMonth = months.length ? months[months.length - 1] : null;
      if (selectedMonth) selM.value = selectedMonth;
    }
  }

  /** Format minutes (number) as H:MM:SS */
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
  function fmtMin(v) { return fmtHms(v); }
  function fmtPct(v) {
    if (v == null || isNaN(v)) return '—';
    return (v * 100).toFixed(1) + '%';
  }
  function fmtNum(v) {
    if (v == null || isNaN(v)) return '—';
    return Math.round(v).toLocaleString();
  }
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function diffCls(v) {
    if (v == null || isNaN(v)) return '';
    if (v > 5) return 'neg';
    if (v < -5) return 'pos';
    return '';
  }
  function statusBadge(r) {
    if (r.avgDiff > 15 || r.pctOver >= 0.4) {
      return '<span class="pf-badge pf-badge-bad">Hard to achieve</span>';
    }
    if (r.avgDiff > 5 || r.pctOver >= 0.25) {
      return '<span class="pf-badge pf-badge-warn">Tight vs plan</span>';
    }
    if (r.avgDiff <= 0) {
      return '<span class="pf-badge pf-badge-ok">Plan achievable</span>';
    }
    return '<span class="pf-badge pf-badge-mid">Near plan</span>';
  }

  function renderMetrics(agg, baseRows) {
    const el = document.getElementById('pfMetrics');
    if (!el) return;
    const trips = baseRows.length;
    const routes = agg.length;
    const onTime = baseRows.filter(r => r.onTime === 'YES').length;
    const late = baseRows.filter(r => r.onTime === 'NO').length;
    const overPlanTrips = baseRows.filter(r => {
      const a = Number(r.actualTT) || 0;
      const p = Number(r.planTT) || 0;
      return p > 0 && a > p;
    }).length;
    const avgActual = trips ? baseRows.reduce((s, r) => s + (Number(r.actualTT) || 0), 0) / trips : 0;
    const avgPlan = trips ? baseRows.reduce((s, r) => s + (Number(r.planTT) || 0), 0) / trips : 0;
    const avgDiff = avgActual - avgPlan;
    const problemRoutes = agg.filter(r => r.avgDiff > 0 || r.pctOver >= 0.3).length;

    el.innerHTML = `
      <div class="pf-metric pf-m-routes">
        <div class="pf-m-label">Routes</div>
        <div class="pf-m-value">${fmtNum(routes)}</div>
        <div class="pf-m-sub">${fmtNum(trips)} total trips</div>
      </div>
      <div class="pf-metric pf-m-ontime">
        <div class="pf-m-label">On Time</div>
        <div class="pf-m-value">${fmtNum(onTime)}</div>
        <div class="pf-m-sub">${fmtPct(trips ? onTime / trips : 0)} of trips</div>
      </div>
      <div class="pf-metric pf-m-late">
        <div class="pf-m-label">Not On Time</div>
        <div class="pf-m-value">${fmtNum(late)}</div>
        <div class="pf-m-sub">${fmtPct(trips ? late / trips : 0)} of trips</div>
      </div>
      <div class="pf-metric pf-m-plan">
        <div class="pf-m-label">Avg Plan TT</div>
        <div class="pf-m-value pf-time">${fmtHms(avgPlan)}</div>
        <div class="pf-m-sub">target travel time</div>
      </div>
      <div class="pf-metric pf-m-actual">
        <div class="pf-m-label">Avg Actual TT</div>
        <div class="pf-m-value pf-time">${fmtHms(avgActual)}</div>
        <div class="pf-m-sub">what really happened</div>
      </div>
      <div class="pf-metric ${avgDiff > 5 ? 'pf-m-over' : (avgDiff < -5 ? 'pf-m-under' : 'pf-m-flat')}">
        <div class="pf-m-label">Avg vs Plan</div>
        <div class="pf-m-value pf-time">${fmtHmsSigned(avgDiff)}</div>
        <div class="pf-m-sub">${avgDiff > 0.5 ? 'slower than plan' : (avgDiff < -0.5 ? 'faster than plan' : 'about on plan')}</div>
      </div>
      <div class="pf-metric pf-m-overtrips">
        <div class="pf-m-label">Trips Over Plan</div>
        <div class="pf-m-value">${fmtNum(overPlanTrips)}</div>
        <div class="pf-m-sub">${fmtPct(trips ? overPlanTrips / trips : 0)} exceeded plan TT</div>
      </div>
      <div class="pf-metric ${problemRoutes ? 'pf-m-problem' : 'pf-m-okroutes'}">
        <div class="pf-m-label">Problem Routes</div>
        <div class="pf-m-value">${fmtNum(problemRoutes)}</div>
        <div class="pf-m-sub">slower than plan on average</div>
      </div>`;
  }

  function renderTopProblems(agg) {
    const el = document.getElementById('pfTopProblems');
    if (!el) return;
    const top = agg.filter(r => r.avgDiff > 0 || r.pctOver >= 0.25).slice(0, 8);
    if (!top.length) {
      el.innerHTML = '<div class="ok-panel pf-ok-panel">✓ All filtered routes look achievable vs plan — no major overruns.</div>';
      return;
    }
    el.innerHTML = `
      <div class="pf-problem-panel">
        <div class="pf-problem-head">
          <div>
            <h3>⚠ Routes that struggle vs plan</h3>
            <p class="pf-problem-note">These routes often take <strong>longer than the planned travel time</strong>. Review plan TT or operations.</p>
          </div>
          <span class="pf-problem-count">${top.length} flagged</span>
        </div>
        <div class="pf-problem-grid">
          ${top.map((r, i) => {
            const severity = (r.avgDiff > 15 || r.pctOver >= 0.4) ? 'bad' : 'warn';
            return `
            <div class="pf-problem-card pf-sev-${severity}">
              <div class="pf-problem-rank">#${i + 1}</div>
              <div class="pf-problem-main">
                <div class="pf-problem-route">${escapeHtml(r.route)}</div>
                <div class="pf-problem-meta">${escapeHtml(r.region)} · ${r.type} · ${r.trips} trips</div>
                <div class="pf-problem-times">
                  <div class="pf-pt"><span>Plan</span><strong>${fmtHms(r.avgPlan)}</strong></div>
                  <div class="pf-pt-arrow">→</div>
                  <div class="pf-pt"><span>Actual</span><strong>${fmtHms(r.avgActual)}</strong></div>
                  <div class="pf-pt pf-pt-diff"><span>Diff</span><strong class="${diffCls(r.avgDiff)}">${fmtHmsSigned(r.avgDiff)}</strong></div>
                </div>
                <div class="pf-problem-stats">
                  <span class="pf-stat pf-stat-ok">On time <b>${r.onTime}</b></span>
                  <span class="pf-stat pf-stat-late">Not on time <b>${r.late}</b></span>
                  <span class="pf-stat pf-stat-over" title="Share of trips where actual travel time was longer than plan travel time">Slower than plan <b>${fmtPct(r.pctOver)}</b></span>
                </div>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>`;
  }

  function renderTable(agg) {
    const body = document.getElementById('pfTableBody');
    const count = document.getElementById('pfTableCount');
    if (!body) return;
    if (!agg.length) {
      body.innerHTML = '<tr><td colspan="12">No routes match the current filters.</td></tr>';
      if (count) count.textContent = '0 routes';
      return;
    }
    body.innerHTML = agg.map((r, i) => {
      const bad = r.avgDiff > 15 || r.pctOver >= 0.4;
      const warn = !bad && (r.avgDiff > 5 || r.pctOver >= 0.25);
      const rowCls = bad ? 'late-row' : (warn ? 'pf-warn-row' : '');
      return `<tr class="${rowCls}">
        <td>${i + 1}</td>
        <td><strong>${escapeHtml(r.route)}</strong></td>
        <td>${escapeHtml(r.region)}</td>
        <td><span class="pf-type-pill">${r.type}</span></td>
        <td>${r.trips}</td>
        <td class="pf-ontime-cell">${r.onTime}</td>
        <td class="pf-late-cell">${r.late}</td>
        <td class="pf-time-cell">${fmtHms(r.avgPlan)}</td>
        <td class="pf-time-cell">${fmtHms(r.avgActual)}</td>
        <td class="pf-time-cell ${diffCls(r.avgDiff)}">${fmtHmsSigned(r.avgDiff)}</td>
        <td>${fmtPct(r.pctOver)}</td>
        <td>${statusBadge(r)}</td>
      </tr>`;
    }).join('');
    if (count) count.textContent = `${agg.length.toLocaleString()} routes`;
  }

  function yMaxPad(values) {
    const nums = (values || []).map(Number).filter(v => !isNaN(v));
    if (!nums.length) return 1;
    const m = Math.max(...nums, 0);
    return m <= 0 ? 1 : m * 1.15 + 1;
  }

  function renderCharts(agg) {
    if (typeof Chart === 'undefined') return;
    if (chartTop) try { chartTop.destroy(); } catch (e) {}
    if (chartScatter) try { chartScatter.destroy(); } catch (e) {}
    chartScatter = null;

    const el1 = document.getElementById('pfChartOverrun');
    const titleEl = document.getElementById('pfChartTitle');
    const card = document.getElementById('pfChartCard');
    if (!el1) return;

    // Single route → trip-level Actual vs Plan line chart
    if (agg.length === 1) {
      const route = agg[0].route;
      const trips = (lastRows || [])
        .filter(r => (r.route || '(blank)').trim() === route)
        .slice()
        .sort((a, b) => String(a.dateKey || '').localeCompare(String(b.dateKey || '')) || String(a.taskId || '').localeCompare(String(b.taskId || '')));

      if (titleEl) titleEl.textContent = 'Trip detail · ' + route;
      if (card) card.classList.remove('hidden');

      if (!trips.length) {
        if (chartTop) try { chartTop.destroy(); } catch (e) {}
        chartTop = null;
        return;
      }

      const labels = trips.map((r, i) => {
        const dk = r.dateKey ? String(r.dateKey).slice(5) : '';
        const tid = r.taskId ? String(r.taskId).slice(-4) : String(i + 1);
        return dk ? (dk + ' ·' + tid) : ('#' + (i + 1));
      });
      const actual = trips.map(r => +(Number(r.actualTT) || 0).toFixed(2));
      const plan = trips.map(r => +(Number(r.planTT) || 0).toFixed(2));

      chartTop = new Chart(el1, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Actual TT',
              data: actual,
              borderColor: '#E60012',
              backgroundColor: 'rgba(230,0,18,0.08)',
              borderWidth: 2.5,
              pointRadius: 3,
              pointBackgroundColor: '#E60012',
              tension: 0.2,
              spanGaps: false
            },
            {
              label: 'Plan TT',
              data: plan,
              borderColor: '#1565C0',
              backgroundColor: 'transparent',
              borderWidth: 2,
              borderDash: [6, 4],
              pointRadius: 0,
              tension: 0.15,
              spanGaps: false
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              display: true,
              position: 'bottom',
              labels: { boxWidth: 12, font: { size: 11, weight: '600' } }
            },
            tooltip: {
              callbacks: {
                title: items => {
                  const i = items[0] && items[0].dataIndex;
                  const t = trips[i];
                  if (!t) return '';
                  return (t.dateKey || '') + (t.taskId ? ' · ' + t.taskId : '');
                },
                label: ctx => {
                  const v = ctx.parsed.y;
                  return ' ' + ctx.dataset.label + ': ' + fmtHms(v);
                },
                afterBody: items => {
                  const i = items[0] && items[0].dataIndex;
                  const t = trips[i];
                  if (!t) return [];
                  const diff = (Number(t.actualTT) || 0) - (Number(t.planTT) || 0);
                  const ot = t.onTime === 'YES' ? 'On time' : (t.onTime === 'NO' ? 'Not on time' : t.onTime || '—');
                  return [' Diff: ' + fmtHmsSigned(diff), ' ' + ot];
                }
              }
            }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: {
                font: { size: 9 },
                maxRotation: 45,
                autoSkip: true,
                maxTicksLimit: 16
              }
            },
            y: {
              title: { display: true, text: 'Travel time', font: { size: 11 } },
              grid: { color: '#F0F0F0' },
              ticks: {
                callback: v => fmtHms(v),
                font: { size: 10 }
              }
            }
          }
        }
      });
      return;
    }

    // Multi-route → avg overrun bars
    if (titleEl) titleEl.textContent = 'Avg time vs plan';
    const top = agg.slice(0, 12);
    if (!top.length) {
      if (card) card.classList.add('hidden');
      return;
    }
    if (card) card.classList.remove('hidden');

    const labels = top.map(r => r.route.length > 16 ? r.route.slice(0, 14) + '…' : r.route);
    const data = top.map(r => Math.round(r.avgDiff));
    chartTop = new Chart(el1, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Avg Actual − Plan',
          data,
          backgroundColor: data.map(v => v > 0 ? '#E60012' : '#2E7D32'),
          borderRadius: 5,
          maxBarThickness: 18
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
              label: ctx => {
                const mins = Number(ctx.raw);
                return ' ' + fmtHmsSigned(mins);
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: '#F0F0F0' },
            ticks: { callback: v => fmtHms(Math.abs(v)) }
          },
          y: { grid: { display: false }, ticks: { font: { size: 10, weight: '600' } } }
        }
      }
    });
  }

  function renderInsight(agg) {
    const el = document.getElementById('pfInsight');
    if (!el) return;
    if (!agg.length) {
      el.innerHTML = '';
      return;
    }
    const over = agg.filter(r => r.avgDiff > 0);
    const worst = agg[0];
    const tight = agg.filter(r => r.avgDiff <= 0 && r.trips >= 3).slice(0, 3);
    let html = '<div class="summary-box pf-insight-box">';
    if (worst && (worst.avgDiff > 0 || worst.pctOver >= 0.25)) {
      html += `<strong>${escapeHtml(worst.route)}</strong> is hardest vs plan: actual <strong>${fmtHms(worst.avgActual)}</strong> vs plan <strong>${fmtHms(worst.avgPlan)}</strong> (${fmtHmsSigned(worst.avgDiff)}). On time <strong>${worst.onTime}</strong> · Not on time <strong>${worst.late}</strong> · <strong>${fmtPct(worst.pctOver)}</strong> of its trips were slower than plan.`;
    } else {
      html += 'Filtered routes are largely within plan travel time — plans look achievable.';
    }
    if (over.length) html += ` · <strong>${over.length}</strong> route(s) average above plan.`;
    if (tight.length) {
      html += ` · Often beating plan: ${tight.map(r => escapeHtml(r.route)).join(', ')}.`;
    }
    html += '</div>';
    el.innerHTML = html;
  }

  function run() {
    const all = getAllRows();
    if (!all.length) {
      const body = document.getElementById('pfTableBody');
      if (body) body.innerHTML = '<tr><td colspan="12">Upload a Mainline workbook first.</td></tr>';
      return;
    }
    populatePeriodSelectors(all);
    const base = filteredBase();
    lastRows = base;
    let agg = aggregateByRoute(base);
    agg = sortRows(agg);

    const info = document.getElementById('pfInfo');
    if (info) {
      const periodLabel = periodMode === 'week'
        ? (selectedWeek || '—')
        : (periodMode === 'month' ? (selectedMonth || '—') : 'All dates');
      info.innerHTML = `Scope <span class="badge">${scope}</span> · Period <span class="badge">${periodLabel}</span> · On-time <span class="badge">${onTimeFilter}</span>`;
    }

    renderMetrics(agg, base);
    renderTopProblems(agg);
    renderInsight(agg);
    renderTable(agg);
    renderCharts(agg);
  }

  function syncPeriodUI() {
    const w = document.getElementById('pfWeekWrap');
    const m = document.getElementById('pfMonthWrap');
    if (w) w.classList.toggle('hidden', periodMode !== 'week');
    if (m) m.classList.toggle('hidden', periodMode !== 'month');
  }

  function onDataReady() {
    const all = getAllRows();
    if (!all.length) return;
    populatePeriodSelectors(all);
    run();
  }

  function init() {
    const btnRun = document.getElementById('btnPfRun');
    if (btnRun) btnRun.addEventListener('click', run);

    document.querySelectorAll('[data-pf-period]').forEach(b => {
      b.addEventListener('click', () => {
        periodMode = b.getAttribute('data-pf-period') || 'all';
        document.querySelectorAll('[data-pf-period]').forEach(x => {
          x.classList.toggle('active', x === b);
        });
        syncPeriodUI();
        run();
      });
    });

    const scopeSel = document.getElementById('pfScope');
    if (scopeSel) {
      scopeSel.addEventListener('change', () => {
        scope = scopeSel.value || 'ALL';
        run();
      });
    }

    const ot = document.getElementById('pfOnTime');
    if (ot) {
      ot.addEventListener('change', () => {
        onTimeFilter = ot.value || 'ALL';
        run();
      });
    }

    const search = document.getElementById('pfSearchRoute');
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

    const sortSel = document.getElementById('pfSort');
    if (sortSel) {
      sortSel.addEventListener('change', () => {
        sortMode = sortSel.value || 'overrun-desc';
        run();
      });
    }

    const selW = document.getElementById('pfWeek');
    if (selW) {
      selW.addEventListener('change', () => {
        selectedWeek = selW.value;
        run();
      });
    }
    const selM = document.getElementById('pfMonth');
    if (selM) {
      selM.addEventListener('change', () => {
        selectedMonth = selM.value;
        run();
      });
    }

    const clear = document.getElementById('pfClear');
    if (clear) {
      clear.addEventListener('click', () => {
        searchRoute = '';
        onTimeFilter = 'ALL';
        scope = 'ALL';
        sortMode = 'overrun-desc';
        periodMode = 'all';
        if (search) search.value = '';
        if (ot) ot.value = 'ALL';
        if (scopeSel) scopeSel.value = 'ALL';
        if (sortSel) sortSel.value = 'overrun-desc';
        document.querySelectorAll('[data-pf-period]').forEach(x => {
          x.classList.toggle('active', x.getAttribute('data-pf-period') === 'all');
        });
        syncPeriodUI();
        run();
      });
    }


    syncPeriodUI();
  }

  return { init, onDataReady, run };
})();
