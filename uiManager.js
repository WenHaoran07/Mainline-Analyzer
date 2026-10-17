/* ==========================================================================
   MODULE: UI RENDERER & DOM BUILDER
   ========================================================================== */
const UIManager = (() => {
  function diffHtml(val) {
    if (Math.abs(val) < 0.5) return `<span class="diff neutral">${val >= 0 ? '+' : ''}${Math.round(val)}</span>`;
    const cls = val > 0 ? 'up' : 'down';
    return `<span class="diff ${cls}">${val > 0 ? '+' : ''}${Math.round(val)}</span>`;
  }

  // Calculates a smooth Red-Yellow-Green Heatmap color string based on value ratio
  function getHeatmapColor(value, min, max) {
    if (value === null || value === undefined || isNaN(value)) {
      return 'background-color: #F1F5F9; color: #94A3B8; text-align: center;'; // Neutral grey for #N/A
    }
    if (min === max) return 'background-color: #FEF08A; color: #1E293B; text-align: right;';

    const ratio = Math.max(0, Math.min(1, (value - min) / (max - min)));
    let r, g, b;

    if (ratio < 0.5) {
      // Red to Yellow (0.0 to 0.5)
      const subRatio = ratio * 2;
      r = 248;
      g = Math.round(113 + (110 * subRatio));
      b = 113;
    } else {
      // Yellow to Green (0.5 to 1.0)
      const subRatio = (ratio - 0.5) * 2;
      r = Math.round(253 - (120 * subRatio));
      g = Math.round(224 - (30 * subRatio));
      b = 138;
    }

    return `background-color: rgb(${r}, ${g}, ${b}); color: #0F172A; text-align: right; font-weight: 600;`;
  }

  function renderComparisonView(data, routeGroup) {
    document.getElementById('datePrev').textContent = data.datePrev + (routeGroup !== 'ALL' ? ` (${routeGroup})` : '');
    document.getElementById('dateLatest').textContent = data.dateLatest + (routeGroup !== 'ALL' ? ` (${routeGroup})` : '');

    // Metrics
    document.getElementById('metrics').innerHTML = `
      <div class="metric">
        <div class="label">Trips</div>
        <div class="value">${data.latestTrips}</div>
        ${diffHtml(data.latestTrips - data.prevTrips)}
      </div>
      <div class="metric">
        <div class="label">Packages</div>
        <div class="value">${Math.round(data.latestPkgs).toLocaleString()}</div>
        ${diffHtml(data.latestPkgs - data.prevPkgs)}
      </div>
      <div class="metric ${data.avgDiff < -30 ? 'highlight-down' : ''}">
        <div class="label">Avg Loading Qty</div>
        <div class="value">${Math.round(data.latestAvg).toLocaleString()}</div>
        ${diffHtml(data.avgDiff)}
      </div>
      <div class="metric">
        <div class="label">Previous Avg</div>
        <div class="value" style="font-size:1.15rem">${Math.round(data.prevAvg).toLocaleString()}</div>
        <div class="diff neutral">${data.datePrev}</div>
      </div>
    `;

    // Total Loading Tickets diff line (chart is rendered by ChartManager)
    const prevTotalLT = (data.prevAvg || 0) * (data.prevTrips || 0);
    const latestTotalLT = (data.latestAvg || 0) * (data.latestTrips || 0);
    const totalDiff = latestTotalLT - prevTotalLT;
    const elDiff = document.getElementById('totalLtDiff');
    if (elDiff) {
      const sign = totalDiff > 0 ? '+' : '';
      elDiff.textContent = `Difference: ${sign}${Math.round(totalDiff).toLocaleString()}`;
      elDiff.className = 'total-lt-diff ' + (totalDiff > 0 ? 'up' : (totalDiff < 0 ? 'down' : 'neutral'));
    }

    // Culprit Box
    const culpritEl = document.getElementById('culpritBox');
    if (data.topCulprit && data.avgDiff < -30) {
      const avgD = (data.topCulprit.lAvg || 0) - (data.topCulprit.pAvg || 0);
      culpritEl.innerHTML = `
        <div class="culprit-box">
          <div class="alert-icon">⚠</div>
          <div>
            <div class="culprit-title">Top contributor to the drop: ${data.topCulprit.route}</div>
            <div class="culprit-detail">
              Impact: <strong>${data.topCulprit.contrib.toFixed(0)}</strong> points ·
              Trips: ${data.topCulprit.pTrips} → ${data.topCulprit.lTrips} ·
              Avg LT: ${data.topCulprit.pAvg ? Math.round(data.topCulprit.pAvg).toLocaleString() : '—'} → ${data.topCulprit.lAvg ? Math.round(data.topCulprit.lAvg).toLocaleString() : '—'}
              ${data.topCulprit.pAvg && data.topCulprit.lAvg ? `(${avgD > 0 ? '+' : ''}${Math.round(avgD)})` : ''} ·
              Packages : ${data.topCulprit.pkgsDiff > 0 ? '+' : ''}${Math.round(data.topCulprit.pkgsDiff)}
            </div>
          </div>
        </div>`;
    } else {
      culpritEl.innerHTML = '';
    }

    // Positive booster box (when average went up)
    if (data.topBooster && data.avgDiff > 30) {
      const avgD = (data.topBooster.lAvg || 0) - (data.topBooster.pAvg || 0);
      const boosterHtml = `
        <div class="booster-box">
          <div class="boost-icon">▲</div>
          <div>
            <div class="booster-title">Top contributor to the increase: ${data.topBooster.route}</div>
            <div class="booster-detail">
              Impact: <strong>+${data.topBooster.contrib.toFixed(0)}</strong> points ·
              Trips: ${data.topBooster.pTrips} → ${data.topBooster.lTrips} ·
              Avg LT: ${data.topBooster.pAvg ? Math.round(data.topBooster.pAvg).toLocaleString() : '—'} → ${data.topBooster.lAvg ? Math.round(data.topBooster.lAvg).toLocaleString() : '—'}
              ${data.topBooster.pAvg && data.topBooster.lAvg ? `(${avgD > 0 ? '+' : ''}${Math.round(avgD)})` : ''} ·
              Packages: ${data.topBooster.pkgsDiff > 0 ? '+' : ''}${Math.round(data.topBooster.pkgsDiff)}
            </div>
          </div>
        </div>`;
      culpritEl.innerHTML = (culpritEl.innerHTML || '') + boosterHtml;
    }

    // Summary Text
    let summary = '';
    if (data.avgDiff < -50) {
      summary = `Average Loading Qty dropped by <strong>${Math.abs(Math.round(data.avgDiff))}</strong> points. `;
      if (data.latestPkgs >= data.prevPkgs - 50) {
        summary += `Packages stayed similar, so the drop is mainly from a weaker trip mix (high-load routes ran lower or less).`;
      } else {
        summary += `Packages also decreased, which contributed to the lower average.`;
      }
      if (data.topCulprit) summary += ` Biggest drag: <strong>${data.topCulprit.route}</strong>.`;
    } else if (data.avgDiff > 50) {
      summary = `Average Loading Qty improved by <strong>${Math.round(data.avgDiff)}</strong> points.`;
      if (data.topBooster) summary += ` Biggest lift: <strong>${data.topBooster.route}</strong> (+${Math.round(data.topBooster.contrib)}).`;
    } else {
      summary = `Average Loading Qty is roughly stable (change of ${Math.round(data.avgDiff)}).`;
    }
    document.getElementById('summaryText').innerHTML = summary;

    // Routes Table
    document.getElementById('routesBody').innerHTML = data.topNeg.map((r, i) => {
      const avgD = (r.lAvg || 0) - (r.pAvg || 0);
      const avgDiffStr = r.pAvg && r.lAvg ? ((avgD > 0 ? '+' : '') + Math.round(avgD)) : '—';
      const avgDiffClass = !r.pAvg || !r.lAvg ? '' : (avgD < 0 ? 'neg' : (avgD > 0 ? 'pos' : ''));
      return `<tr class="${i === 0 ? 'top-culprit' : ''}">
        <td><strong>${r.route}</strong></td>
        <td>${r.pTrips}</td>
        <td>${r.lTrips}</td>
        <td>${r.pAvg ? Math.round(r.pAvg).toLocaleString() : '—'}</td>
        <td>${r.lAvg ? Math.round(r.lAvg).toLocaleString() : '—'}</td>
        <td class="${avgDiffClass}">${avgDiffStr}</td>
        <td class="${r.pkgsDiff < 0 ? 'neg' : 'pos'}">${r.pkgsDiff > 0 ? '+' : ''}${Math.round(r.pkgsDiff)}</td>
        <td class="neg">${Math.round(r.contrib)}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="8">No significant negative routes found.</td></tr>';

    // Branches Table
    document.getElementById('branchBody').innerHTML = data.branchStats.slice(0, 15).map((b, i) => `
      <tr class="${i === 0 && b.contrib < -30 ? 'top-culprit' : ''}">
        <td><strong>${b.branch}</strong></td>
        <td>${b.pTrips}</td>
        <td>${b.lTrips}</td>
        <td>${b.pAvg ? Math.round(b.pAvg).toLocaleString() : '—'}</td>
        <td>${b.lAvg ? Math.round(b.lAvg).toLocaleString() : '—'}</td>
        <td>${Math.round(b.pPkgs).toLocaleString()}</td>
        <td>${Math.round(b.lPkgs).toLocaleString()}</td>
        <td class="${b.contrib < 0 ? 'neg' : 'pos'}">${b.contrib > 0 ? '+' : ''}${Math.round(b.contrib)}</td>
      </tr>
    `).join('');

    // Positive routes table
    const posBody = document.getElementById('routesPosBody');
    if (posBody) {
      const topPos = data.topPos || [];
      posBody.innerHTML = topPos.map((r, i) => {
        const avgD = (r.lAvg || 0) - (r.pAvg || 0);
        const avgDiffStr = r.pAvg && r.lAvg ? ((avgD > 0 ? '+' : '') + Math.round(avgD)) : '—';
        const avgDiffClass = !r.pAvg || !r.lAvg ? '' : (avgD < 0 ? 'neg' : (avgD > 0 ? 'pos' : ''));
        return `<tr class="${i === 0 ? 'top-booster' : ''}">
          <td><strong>${r.route}</strong></td>
          <td>${r.pTrips}</td>
          <td>${r.lTrips}</td>
          <td>${r.pAvg ? Math.round(r.pAvg).toLocaleString() : '—'}</td>
          <td>${r.lAvg ? Math.round(r.lAvg).toLocaleString() : '—'}</td>
          <td class="${avgDiffClass}">${avgDiffStr}</td>
          <td class="${r.pkgsDiff < 0 ? 'neg' : 'pos'}">${r.pkgsDiff > 0 ? '+' : ''}${Math.round(r.pkgsDiff)}</td>
          <td class="pos">+${Math.round(r.contrib)}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="8">No significant positive routes found.</td></tr>';
    }

    // Positive branches (top lifts)
    const posBranchBody = document.getElementById('branchPosBody');
    if (posBranchBody) {
      const posBranches = [...(data.branchStats || [])].filter(b => b.contrib > 10).sort((a, b) => b.contrib - a.contrib).slice(0, 10);
      posBranchBody.innerHTML = posBranches.map((b, i) => `
        <tr class="${i === 0 ? 'top-booster' : ''}">
          <td><strong>${b.branch}</strong></td>
          <td>${b.pTrips}</td>
          <td>${b.lTrips}</td>
          <td>${b.pAvg ? Math.round(b.pAvg).toLocaleString() : '—'}</td>
          <td>${b.lAvg ? Math.round(b.lAvg).toLocaleString() : '—'}</td>
          <td>${Math.round(b.pPkgs).toLocaleString()}</td>
          <td>${Math.round(b.lPkgs).toLocaleString()}</td>
          <td class="pos">+${Math.round(b.contrib)}</td>
        </tr>
      `).join('') || '<tr><td colspan="8">No significant positive branches found.</td></tr>';
    }

    // More Trips Table
    document.getElementById('moreTripsBody').innerHTML = data.moreTrips.slice(0, 15).map(r => `
      <tr>
        <td><strong>${r.route}</strong></td>
        <td>${r.pTrips}</td>
        <td>${r.lTrips}</td>
        <td class="pos">+${r.lTrips - r.pTrips}</td>
      </tr>
    `).join('') || '<tr><td colspan="4">No routes with increased trips.</td></tr>';

    // Render Daily Trend Pivot Table
    if (data.dailyTrendMatrix) {
      renderTrendMatrix(data.dailyTrendMatrix);
    }
  }

  function renderTrendMatrix(trendData) {
    const { dates, rows, globalMin, globalMax } = trendData;

    // Header
    let headHtml = `<tr>
      <th style="min-width: 160px;">Departure DC</th>
      <th style="min-width: 80px; text-align: center;">DC CODE</th>
      <th style="min-width: 110px; text-align: right;">Accumulated</th>`;
    
    dates.forEach(d => {
      headHtml += `<th style="min-width: 100px; text-align: center;">${d}</th>`;
    });
    headHtml += `</tr>`;
    document.getElementById('trendTableHead').innerHTML = headHtml;

    // Body
    let bodyHtml = '';
    rows.forEach(r => {
      bodyHtml += `<tr>
        <td><strong>${r.branch}</strong></td>
        <td style="text-align: center; color: var(--muted); font-weight: 600;">${r.dcCode}</td>
        <td style="text-align: right; font-weight: 700;">${Math.round(r.accumulated).toLocaleString()}</td>`;
      
      dates.forEach(d => {
        const val = r.daily[d];
        const style = getHeatmapColor(val, globalMin, globalMax);
        const displayVal = (val !== null && val !== undefined) ? Math.round(val).toLocaleString() : '#N/A';
        bodyHtml += `<td style="${style}">${displayVal}</td>`;
      });

      bodyHtml += `</tr>`;
    });

    document.getElementById('trendTableBody').innerHTML = bodyHtml || '<tr><td colspan="100%">No daily trend data available.</td></tr>';
  }

  return { renderComparisonView };
})();