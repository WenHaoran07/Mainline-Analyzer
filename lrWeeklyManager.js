/* ==========================================================================
   MODULE: LOADING RATE WEEKLY COMPARISON
   SLU overall · by Shipping Region · per DC (Shipping Branch)
   ========================================================================== */
const LrWeeklyManager = (() => {
  let chartTrend = null;
  let chartCompare = null;
  let chartEntityTrend = null;
    let viewMode = 'SLU'; // SLU | REGION | DC
  let weekPrev = null;
  let weekLatest = null;

  function pad2(n) { return String(n).padStart(2, '0'); }

  // Draw numeric values on line/bar points
  const valueLabelPlugin = {
    id: 'lrValueLabels',
    afterDatasetsDraw(chart) {
      const ctx = chart.ctx;
      ctx.save();
      ctx.font = '600 10px Segoe UI, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      chart.data.datasets.forEach((ds, di) => {
        const meta = chart.getDatasetMeta(di);
        if (meta.hidden) return;
        meta.data.forEach((el, i) => {
          const raw = ds.data[i];
          if (raw === null || raw === undefined || isNaN(raw)) return;
          const pos = el.tooltipPosition ? el.tooltipPosition() : { x: el.x, y: el.y };
          const label = Number(raw).toLocaleString();
          // outline for readability
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(255,255,255,0.9)';
          ctx.strokeText(label, pos.x, pos.y - 4);
          ctx.fillStyle = ds.borderColor || ds.backgroundColor || '#212121';
          if (typeof ctx.fillStyle === 'object') ctx.fillStyle = '#212121';
          ctx.fillText(label, pos.x, pos.y - 4);
        });
      });
      ctx.restore();
    }
  };

  function lineChartOptions(extra = {}) {
    return Object.assign({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const v = ctx.parsed.y;
              return ' ' + (ctx.dataset.label || '') + ': ' + (v == null ? '—' : Number(v).toLocaleString());
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: false,
          grid: { color: '#F0F0F0' },
          ticks: { font: { size: 10 }, callback: v => Number(v).toLocaleString() }
        },
        x: {
          grid: { display: false },
          ticks: { font: { size: 10 }, maxRotation: 45 }
        }
      }
    }, extra);
  }


  function toYmd(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date && !isNaN(v.getTime())) {
      return v.getFullYear() + '-' + pad2(v.getMonth() + 1) + '-' + pad2(v.getDate());
    }
    if (typeof v === 'number' && isFinite(v) && v > 20000 && v < 100000) {
      const ms = Date.UTC(1899, 11, 30) + Math.round(v) * 86400000;
      const d = new Date(ms);
      return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
    }
    const s = String(v).trim();
    if (/^\d+(\.\d+)?$/.test(s)) {
      const n = parseFloat(s);
      if (n > 20000 && n < 100000) {
        const ms = Date.UTC(1899, 11, 30) + Math.round(n) * 86400000;
        const d = new Date(ms);
        return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
      }
    }
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return iso[1] + '-' + iso[2] + '-' + iso[3];
    return s.length >= 10 ? s.substring(0, 10) : null;
  }

  function weekKey(dateKey) {
    if (!dateKey) return null;
    const [y, m, d] = dateKey.split('-').map(Number);
    if (!y || !m || !d) return null;
    const dt = new Date(Date.UTC(y, m - 1, d));
    const day = dt.getUTCDay() || 7; // Mon=1 .. Sun=7
    dt.setUTCDate(dt.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((dt - yearStart) / 86400000) + 1) / 7);
    return dt.getUTCFullYear() + '-W' + pad2(weekNo);
  }

  function ymdToDisplay(ymd) {
    const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return ymd || '—';
    return m[3] + '/' + m[2] + '/' + m[1];
  }

  function weekLabel(wk) {
    return wk || '—';
  }

  function getLt(r, colMap) {
    return parseFloat(r[colMap.lt]) || 0;
  }
  function getPkgs(r, colMap) {
    return parseFloat(r[colMap.pkgs]) || 0;
  }

  function normalizeRows(slu, colMap) {
    return (slu || []).map(r => {
      const dateKey = toYmd(r[colMap.date]);
      return {
        raw: r,
        dateKey,
        week: weekKey(dateKey),
        lt: getLt(r, colMap),
        pkgs: getPkgs(r, colMap),
        branch: String(r[colMap.branch] || '').trim() || '(blank)',
        shipRegion: String(r[colMap.shipRegion] || r[colMap.region] || '').trim() || '(blank)',
        route: String(r[colMap.route] || '').trim()
      };
    }).filter(r => r.dateKey && r.week);
  }

  function stats(list) {
    if (!list || !list.length) {
      return { trips: 0, pkgs: 0, totalLt: 0, avgLt: 0 };
    }
    const trips = list.length;
    const pkgs = list.reduce((s, r) => s + r.pkgs, 0);
    const totalLt = list.reduce((s, r) => s + r.lt, 0);
    return { trips, pkgs, totalLt, avgLt: totalLt / trips };
  }

  function groupBy(list, keyFn) {
    const map = {};
    list.forEach(r => {
      const k = keyFn(r) || '(blank)';
      if (!map[k]) map[k] = [];
      map[k].push(r);
    });
    return map;
  }

  function populateWeekSelectors(rows) {
    const weeks = [...new Set(rows.map(r => r.week).filter(Boolean))].sort();
    const selPrev = document.getElementById('lrWeekPrev');
    const selLatest = document.getElementById('lrWeekLatest');
    if (!selPrev || !selLatest) return weeks;

    const opts = weeks.map(w => `<option value="${w}">${w}</option>`).join('');
    selPrev.innerHTML = opts;
    selLatest.innerHTML = opts;

    if (weeks.length >= 2) {
      weekPrev = weeks[weeks.length - 2];
      weekLatest = weeks[weeks.length - 1];
    } else if (weeks.length === 1) {
      weekPrev = weeks[0];
      weekLatest = weeks[0];
    }
    if (weekPrev) selPrev.value = weekPrev;
    if (weekLatest) selLatest.value = weekLatest;
    return weeks;
  }

  function renderMetrics(prevS, latestS) {
    const el = document.getElementById('lrWeekMetrics');
    if (!el) return;
    const avgDiff = latestS.avgLt - prevS.avgLt;
    const tripDiff = latestS.trips - prevS.trips;
    const pkgDiff = latestS.pkgs - prevS.pkgs;
    const fmt = n => Math.round(n).toLocaleString();
    const diffCls = v => Math.abs(v) < 0.5 ? 'neutral' : (v > 0 ? 'up' : 'down');
    const diffTxt = (v, isInt) => {
      const n = isInt ? Math.round(v) : Math.round(v);
      return (n > 0 ? '+' : '') + n.toLocaleString();
    };

    el.innerHTML = `
      <div class="metric">
        <div class="label">Trips (week)</div>
        <div class="value">${fmt(latestS.trips)}</div>
        <div class="diff ${diffCls(tripDiff)}">${diffTxt(tripDiff, true)}</div>
      </div>
      <div class="metric">
        <div class="label">Packages (week)</div>
        <div class="value">${fmt(latestS.pkgs)}</div>
        <div class="diff ${diffCls(pkgDiff)}">${diffTxt(pkgDiff, true)}</div>
      </div>
      <div class="metric ${avgDiff < -30 ? 'highlight-down' : ''}">
        <div class="label">Avg Loading Qty</div>
        <div class="value">${fmt(latestS.avgLt)}</div>
        <div class="diff ${diffCls(avgDiff)}">${diffTxt(avgDiff, false)}</div>
      </div>
      <div class="metric">
        <div class="label">Prev Week Avg</div>
        <div class="value" style="font-size:1.15rem">${fmt(prevS.avgLt)}</div>
        <div class="diff neutral">${weekPrev || '—'}</div>
      </div>`;
  }

  function buildEntityRows(prevList, latestList) {
    let keys;
    if (viewMode === 'REGION') {
      keys = new Set([
        ...Object.keys(groupBy(prevList, r => r.shipRegion)),
        ...Object.keys(groupBy(latestList, r => r.shipRegion))
      ]);
    } else if (viewMode === 'DC') {
      keys = new Set([
        ...Object.keys(groupBy(prevList, r => r.branch)),
        ...Object.keys(groupBy(latestList, r => r.branch))
      ]);
    } else {
      return [{
        name: 'SLU (All)',
        prev: stats(prevList),
        latest: stats(latestList)
      }];
    }

    const keyFn = viewMode === 'REGION' ? (r => r.shipRegion) : (r => r.branch);
    const prevMap = groupBy(prevList, keyFn);
    const latestMap = groupBy(latestList, keyFn);

    return [...keys].sort().map(name => {
      const p = stats(prevMap[name] || []);
      const l = stats(latestMap[name] || []);
      return { name, prev: p, latest: l, avgDiff: l.avgLt - p.avgLt };
    }).sort((a, b) => a.avgDiff - b.avgDiff);
  }

  function renderTable(entities) {
    const body = document.getElementById('lrWeekTableBody');
    const headName = document.getElementById('lrWeekEntityCol');
    if (headName) {
      headName.textContent = viewMode === 'REGION' ? 'Shipping Region' : (viewMode === 'DC' ? 'Departure DC' : 'Scope');
    }
    if (!body) return;

    if (!entities.length) {
      body.innerHTML = '<tr><td colspan="8">No weekly data for selection.</td></tr>';
      return;
    }

    body.innerHTML = entities.map((e, i) => {
      const avgDiff = e.latest.avgLt - e.prev.avgLt;
      const tripDiff = e.latest.trips - e.prev.trips;
      const cls = avgDiff < -30 ? 'top-culprit' : (avgDiff > 30 ? 'top-booster' : '');
      const avgCls = avgDiff < 0 ? 'neg' : (avgDiff > 0 ? 'pos' : '');
      return `<tr class="${cls}">
        <td><strong>${e.name}</strong></td>
        <td>${e.prev.trips}</td>
        <td>${e.latest.trips}</td>
        <td>${Math.round(e.prev.avgLt).toLocaleString()}</td>
        <td>${Math.round(e.latest.avgLt).toLocaleString()}</td>
        <td class="${avgCls}">${avgDiff > 0 ? '+' : ''}${Math.round(avgDiff)}</td>
        <td>${Math.round(e.prev.pkgs).toLocaleString()}</td>
        <td>${Math.round(e.latest.pkgs).toLocaleString()}</td>
      </tr>`;
    }).join('');
  }

  function renderCharts(allRows, prevList, latestList, entities) {
    const byWeek = groupBy(allRows, r => r.week);
    const weekKeys = Object.keys(byWeek).sort();

    // --- Left chart: overall weekly trend (SLU always) ---
    const trendVals = weekKeys.map(w => Math.round(stats(byWeek[w]).avgLt));
    if (chartTrend) try { chartTrend.destroy(); } catch (e) {}
    const elT = document.getElementById('lrWeekChartTrend');
    const titleT = document.getElementById('lrWeekTrendTitle');
    if (titleT) titleT.textContent = 'Weekly SLU Avg Loading Tickets Trend';
    if (elT) {
      chartTrend = new Chart(elT, {
        type: 'line',
        data: {
          labels: weekKeys,
          datasets: [{
            label: 'SLU Avg LT',
            data: trendVals,
            borderColor: '#E60012',
            backgroundColor: 'rgba(230,0,18,0.12)',
            fill: true,
            tension: 0.25,
            pointRadius: 4,
            pointHoverRadius: 5
          }]
        },
        options: lineChartOptions(),
        plugins: [valueLabelPlugin]
      });
    }

    // --- Right chart: SLU = weekly trips + total Loading Qty; Region/DC = WoW Avg Δ ---
    if (chartCompare) try { chartCompare.destroy(); } catch (e) {}
    const elC = document.getElementById('lrWeekChartCompare');
    const titleC = document.getElementById('lrWeekCompareTitle');
    const noteC = document.getElementById('lrWeekCompareNote');

    if (elC) {
      if (viewMode === 'SLU') {
        const qtyVals = weekKeys.map(w => Math.round(stats(byWeek[w]).totalLt));
        const tripVals = weekKeys.map(w => stats(byWeek[w]).trips);
        if (titleC) titleC.textContent = 'Weekly Trips & Loading Qty';
        if (noteC) noteC.textContent = 'Trips and total Loading Tickets each week (SLU overall)';
        chartCompare = new Chart(elC, {
          type: 'bar',
          data: {
            labels: weekKeys,
            datasets: [
              {
                type: 'bar',
                label: 'Trips',
                data: tripVals,
                backgroundColor: '#90A4AE',
                borderRadius: 4,
                yAxisID: 'yTrips',
                order: 2,
                maxBarThickness: 36
              },
              {
                type: 'line',
                label: 'Total Loading Qty',
                data: qtyVals,
                borderColor: '#E60012',
                backgroundColor: 'rgba(230,0,18,0.12)',
                tension: 0.25,
                pointRadius: 4,
                pointHoverRadius: 5,
                yAxisID: 'yQty',
                order: 1,
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
                display: true,
                position: 'bottom',
                labels: { boxWidth: 12, font: { size: 10 } }
              },
              tooltip: {
                callbacks: {
                  label: ctx => {
                    const v = ctx.parsed.y;
                    return ' ' + ctx.dataset.label + ': ' + (v == null ? '—' : Number(v).toLocaleString());
                  }
                }
              }
            },
            scales: {
              x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 45 } },
              yTrips: {
                type: 'linear',
                position: 'left',
                beginAtZero: true,
                title: { display: true, text: 'Trips', font: { size: 10 } },
                grid: { color: '#F0F0F0' },
                ticks: { font: { size: 10 }, callback: v => Number(v).toLocaleString() }
              },
              yQty: {
                type: 'linear',
                position: 'right',
                beginAtZero: true,
                title: { display: true, text: 'Loading Qty', font: { size: 10 } },
                grid: { drawOnChartArea: false },
                ticks: { font: { size: 10 }, callback: v => Number(v).toLocaleString() }
              }
            }
          },
          plugins: [valueLabelPlugin]
        });
      } else {
        let list = entities.filter(e => e.name !== 'SLU (All)');
        if (!list.length) list = entities;
        list = [...list].sort((a, b) => Math.abs(b.avgDiff || 0) - Math.abs(a.avgDiff || 0)).slice(0, 10);
        const labels = list.map(e => e.name.length > 18 ? e.name.slice(0, 16) + '…' : e.name);
        const data = list.map(e => Math.round(e.avgDiff != null ? e.avgDiff : (e.latest.avgLt - e.prev.avgLt)));
        if (titleC) titleC.textContent = 'Week-over-Week Avg ';
        if (noteC) noteC.textContent = 'Avg Loading Tickets change between the two selected weeks';
        chartCompare = new Chart(elC, {
          type: 'bar',
          data: {
            labels,
            datasets: [{
              label: 'Avg LT ',
              data,
              backgroundColor: data.map(v => v < 0 ? '#E60012' : '#2E7D32'),
              borderRadius: 6
            }]
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: { callbacks: { label: ctx => '' + (ctx.raw > 0 ? '+' : '') + Number(ctx.raw).toLocaleString() } }
            },
            scales: {
              x: { grid: { color: '#F0F0F0' }, ticks: { callback: v => Number(v).toLocaleString() } },
              y: { grid: { display: false } }
            }
          },
          plugins: [valueLabelPlugin]
        });
      }
    }

    // --- Full-width multi-line: Region or Per DC weekly trend ---
    if (chartEntityTrend) try { chartEntityTrend.destroy(); } catch (e) {}
    const elE = document.getElementById('lrWeekChartEntityTrend');
    const wrapE = document.getElementById('lrWeekEntityTrendCard');
    const titleE = document.getElementById('lrWeekEntityTrendTitle');
    const noteE = document.getElementById('lrWeekEntityTrendNote');

    if (viewMode === 'SLU') {
      if (wrapE) wrapE.classList.add('hidden');
      return;
    }

    if (wrapE) wrapE.classList.remove('hidden');

    const keyFn = viewMode === 'REGION' ? (r => r.shipRegion) : (r => r.branch);
    const entityMap = groupBy(allRows, keyFn);
    let entityNames = Object.keys(entityMap).sort((a, b) => entityMap[b].length - entityMap[a].length);
    const maxLines = viewMode === 'REGION' ? 12 : 8;
    entityNames = entityNames.slice(0, maxLines);

    if (titleE) {
      titleE.textContent = viewMode === 'REGION'
        ? 'Weekly Avg Loading Tickets by Region'
        : 'Weekly Avg Loading Tickets per DC';
    }
    if (noteE) {
      noteE.textContent = viewMode === 'REGION'
        ? 'Line chart of average Loading Tickets each week by Shipping Region'
        : 'Line chart of average Loading Tickets each week by Departure DC';
    }

    const palette = [
      '#E60012', '#1565C0', '#2E7D32', '#F9A825', '#6A1B9A',
      '#00838F', '#EF6C00', '#AD1457', '#4527A0', '#558B2F',
      '#C62828', '#0277BD'
    ];

    const datasets = entityNames.map((name, i) => {
      const rowsFor = entityMap[name] || [];
      const byW = groupBy(rowsFor, r => r.week);
      const data = weekKeys.map(w => {
        const list = byW[w];
        if (!list || !list.length) return null;
        return Math.round(stats(list).avgLt);
      });
      const color = palette[i % palette.length];
      return {
        label: name.length > 22 ? name.slice(0, 20) + '…' : name,
        data,
        borderColor: color,
        backgroundColor: color,
        fill: false,
        tension: 0.25,
        pointRadius: 3,
        pointHoverRadius: 5,
        spanGaps: true,
        borderWidth: 2
      };
    });

    if (elE) {
      chartEntityTrend = new Chart(elE, {
        type: 'line',
        data: { labels: weekKeys, datasets },
        options: lineChartOptions({
          plugins: {
            legend: {
              display: true,
              position: 'bottom',
              labels: { boxWidth: 12, font: { size: 10 } }
            },
            tooltip: {
              callbacks: {
                label: ctx => {
                  const v = ctx.parsed.y;
                  return ' ' + ctx.dataset.label + ': ' + (v == null ? '—' : Number(v).toLocaleString());
                }
              }
            }
          }
        }),
        plugins: [valueLabelPlugin]
      });
    }
  }

  function run() {
    const { storedSlu, storedColMap } = FileProcessor.getState();
    if (!storedSlu || !storedColMap) {
      alert('Please upload an Excel file first.');
      return;
    }

    const rows = normalizeRows(storedSlu, storedColMap);
    if (!rows.length) {
      alert('No SLU rows with valid dates found.');
      return;
    }

    const selPrev = document.getElementById('lrWeekPrev');
    const selLatest = document.getElementById('lrWeekLatest');
    weekPrev = selPrev ? selPrev.value : weekPrev;
    weekLatest = selLatest ? selLatest.value : weekLatest;

    const prevList = rows.filter(r => r.week === weekPrev);
    const latestList = rows.filter(r => r.week === weekLatest);

    const prevS = stats(prevList);
    const latestS = stats(latestList);

    const info = document.getElementById('lrWeekInfo');
    if (info) {
      info.innerHTML = `Comparing <span class="badge">${weekLabel(weekPrev)}</span> vs <span class="badge">${weekLabel(weekLatest)}</span> · View: <strong>${viewMode}</strong>`;
    }

    renderMetrics(prevS, latestS);
    const entities = buildEntityRows(prevList, latestList);
    // attach avgDiff
    entities.forEach(e => { e.avgDiff = e.latest.avgLt - e.prev.avgLt; });
    renderTable(entities);
    renderCharts(rows, prevList, latestList, entities);

    const panel = document.getElementById('lrWeeklyPanel');
    if (panel) panel.classList.remove('hidden');
  }

  function onFileReady() {
    const { storedSlu, storedColMap } = FileProcessor.getState();
    if (!storedSlu || !storedColMap) return;
    const rows = normalizeRows(storedSlu, storedColMap);
    populateWeekSelectors(rows);
  }

  function switchMainTab(tab) {
    const dayPanel = document.getElementById('lrDayPanel');
    const weekPanel = document.getElementById('lrWeeklyPanel');
    const btnDay = document.getElementById('tabLrDay');
    const btnWeek = document.getElementById('tabLrWeek');
    if (tab === 'week') {
      if (dayPanel) dayPanel.classList.add('hidden');
      if (weekPanel) weekPanel.classList.remove('hidden');
      if (btnDay) btnDay.classList.remove('active');
      if (btnWeek) btnWeek.classList.add('active');
      onFileReady();
      run();
    } else {
      if (weekPanel) weekPanel.classList.add('hidden');
      if (dayPanel) dayPanel.classList.remove('hidden');
      if (btnWeek) btnWeek.classList.remove('active');
      if (btnDay) btnDay.classList.add('active');
    }
  }

  function init() {
    const btnDay = document.getElementById('tabLrDay');
    const btnWeek = document.getElementById('tabLrWeek');
    if (btnDay) btnDay.addEventListener('click', () => switchMainTab('day'));
    if (btnWeek) btnWeek.addEventListener('click', () => switchMainTab('week'));

    const btn = document.getElementById('btnLrWeekCompare');
    if (btn) btn.addEventListener('click', run);

    document.querySelectorAll('[data-lr-week-view]').forEach(b => {
      b.addEventListener('click', () => {
        viewMode = b.getAttribute('data-lr-week-view') || 'SLU';
        document.querySelectorAll('[data-lr-week-view]').forEach(x => x.classList.toggle('active', x === b));
        run();
      });
    });
  }

  return { init, onFileReady, run, switchMainTab };
})();
