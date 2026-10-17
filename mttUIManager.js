/* ==========================================================================
   MODULE: MTT UI MANAGER (DOM rendering)
   ========================================================================== */
const MttUIManager = (() => {
  const { fmtPct, fmtNum, fmtPp, TARGET_LUZON, TARGET_VISMIN } = MttUtils;

  function render(data) {
    const {
      datePrev, dateLatest, routeFilter, filterLabel, target, targetPct,
      overall, overallPrev, luzon, luzonPrev, vismin, visminPrev, rateDiff,
      regionLateList, routeLateList, regRows, dcRows, tRows, routeRows,
      lateDetail, histRows,
      histOverall, histLuzon, histVismin, forecast
    } = data;

    document.getElementById('datePrev').textContent = datePrev;
    document.getElementById('dateLatest').textContent = dateLatest;

    const filterBadge = document.getElementById('filterBadge');
    if (filterBadge) {
      filterBadge.textContent = filterLabel;
      filterBadge.style.background = routeFilter === 'LUZON' ? '#1565C0' : routeFilter === 'VISMIN' ? '#6A1B9A' : '#E60012';
    }
    const targetBadge = document.getElementById('targetBadgeText');
    if (targetBadge) targetBadge.textContent = 'Target ' + targetPct + '%';

    const splitRow = document.querySelector('.split-row');
    if (splitRow) splitRow.style.display = routeFilter === 'ALL' ? '' : 'none';

    const rateDown = rateDiff != null && rateDiff < -0.005;
    const rateUp = rateDiff != null && rateDiff > 0.005;

    document.getElementById('metricsOverall').innerHTML =
      '<div class="metric '+(rateDown?'highlight-down':rateUp?'highlight-up':'')+'"><div class="label">Achievement Rate</div><div class="value">'+fmtPct(overall.rate)+'</div><div class="diff '+(rateDown?'down':rateUp?'up':'neutral')+'">'+fmtPp(rateDiff)+' vs prev</div></div>' +
      '<div class="metric"><div class="label">Total Arrivals</div><div class="value">'+overall.total+'</div><div class="diff neutral">'+overallPrev.total+' prev</div></div>' +
      '<div class="metric"><div class="label">On Time</div><div class="value pos">'+overall.yes+'</div></div>' +
      '<div class="metric '+(overall.no>0?'highlight-down':'')+'"><div class="label">Late</div><div class="value '+(overall.no?'neg':'')+'">'+overall.no+'</div><div class="diff neutral">'+overallPrev.no+' prev</div></div>' +
      '<div class="metric"><div class="label">Prev Rate</div><div class="value">'+fmtPct(overallPrev.rate)+'</div></div>' +
      '<div class="metric '+(overall.rate!=null&&overall.rate<target?'highlight-down':'highlight-up')+'"><div class="label">vs Target '+targetPct+'%</div><div class="value">'+(overall.rate!=null?(overall.rate>=target?'✓':'✗'):'—')+'</div></div>';

    let summary = 'Filter: <strong>'+filterLabel+'</strong> · Focus day <strong>'+dateLatest+'</strong>: '+overall.total+' SLU arrivals, <strong>'+fmtPct(overall.rate)+'</strong> on time';
    if (overall.no > 0) summary += ', <strong style="color:#E60012">'+overall.no+' late</strong>';
    summary += ' (target '+targetPct+'%).';
    if (routeFilter === 'ALL') summary += ' Luzon '+fmtPct(luzon.rate)+' (97%) · VisMin '+fmtPct(vismin.rate)+' (85%).';
    if (rateDiff != null) {
      if (rateDiff < -0.01) summary += ' Rate <strong>down '+fmtPp(rateDiff)+'</strong> vs '+datePrev+'.';
      else if (rateDiff > 0.01) summary += ' Rate <strong>up '+fmtPp(rateDiff)+'</strong> vs '+datePrev+'.';
    }
    document.getElementById('summaryText').innerHTML = summary;

    const lzDiff = (luzon.rate != null && luzonPrev.rate != null) ? luzon.rate - luzonPrev.rate : null;
    const vmDiff = (vismin.rate != null && visminPrev.rate != null) ? vismin.rate - visminPrev.rate : null;

    document.getElementById('metricsLuzon').innerHTML =
      '<div class="metric '+(luzon.rate!=null&&luzon.rate<TARGET_LUZON?'highlight-down':'highlight-up')+'"><div class="label">Rate</div><div class="value">'+fmtPct(luzon.rate)+'</div><div class="diff '+(lzDiff<0?'down':lzDiff>0?'up':'neutral')+'">'+fmtPp(lzDiff)+'</div></div>' +
      '<div class="metric"><div class="label">Total</div><div class="value">'+luzon.total+'</div></div>' +
      '<div class="metric"><div class="label">Late</div><div class="value '+(luzon.no?'neg':'')+'">'+luzon.no+'</div></div>';
    document.getElementById('lateLuzonNote').textContent = luzon.no ? (luzon.no+' late trip(s) on Luzon routes') : (luzon.total ? 'All Luzon trips on time ✓' : 'No Luzon trips this day');

    document.getElementById('metricsVismin').innerHTML =
      '<div class="metric '+(vismin.rate!=null&&vismin.rate<TARGET_VISMIN?'highlight-down':'highlight-up')+'"><div class="label">Rate</div><div class="value">'+fmtPct(vismin.rate)+'</div><div class="diff '+(vmDiff<0?'down':vmDiff>0?'up':'neutral')+'">'+fmtPp(vmDiff)+'</div></div>' +
      '<div class="metric"><div class="label">Total</div><div class="value">'+vismin.total+'</div></div>' +
      '<div class="metric"><div class="label">Late</div><div class="value '+(vismin.no?'neg':'')+'">'+vismin.no+'</div></div>';
    document.getElementById('lateVisminNote').textContent = vismin.no ? (vismin.no+' late trip(s) on VisMin routes') : (vismin.total ? 'All VisMin trips on time ✓' : 'No VisMin trips this day');

    // Late regions & routes panels
    if (!regionLateList.length && !routeLateList.length) {
      document.getElementById('lateRegionsPanel').innerHTML = '';
      document.getElementById('lateRoutesPanel').innerHTML = '';
      document.getElementById('noLatePanel').classList.remove('hidden');
      document.getElementById('noLatePanel').innerHTML = '<div class="ok-panel">No late trips on focus day — all SLU arrivals followed plan travel time.</div>';
    } else {
      document.getElementById('noLatePanel').classList.add('hidden');
      document.getElementById('lateRegionsPanel').innerHTML =
        '<div class="late-panel"><h3>Late Regions ('+regionLateList.length+')</h3><div class="late-chips">' +
        regionLateList.map(r => '<div class="late-chip"><strong>'+r.region+'</strong><div class="sub">'+r.late+' late / '+r.total+' · '+fmtPct(r.rate)+'</div></div>').join('') +
        '</div></div>';
      document.getElementById('lateRoutesPanel').innerHTML =
        '<div class="late-panel" style="margin-top:10px;"><h3>Late Routes ('+routeLateList.length+')</h3><div class="late-chips">' +
        routeLateList.map(r => '<div class="late-chip"><strong>'+r.route+'</strong><div class="sub">'+r.type+' · '+r.region+' · '+r.late+' late / '+r.total+' · '+fmtPct(r.rate)+'</div></div>').join('') +
        '</div></div>';
    }

    document.getElementById('routesBody').innerHTML = routeRows.map(r =>
      '<tr class="'+(r.no>0?'late-row':'')+'"><td>'+r.type+'</td><td>'+r.region+'</td><td>'+r.key+'</td><td>'+r.total+'</td><td class="pos">'+r.yes+'</td><td class="'+(r.no?'neg':'')+'">'+r.no+'</td><td class="'+(r.rate!=null&&r.rate<(r.target||target)?'neg':'pos')+'">'+fmtPct(r.rate)+'</td><td>'+fmtPct(r.prevRate)+'</td><td class="'+(r.delta<0?'neg':r.delta>0?'pos':'')+'">'+fmtPp(r.delta)+'</td><td class="muted-cell">'+((r.target||target)*100).toFixed(0)+'%</td></tr>'
    ).join('');

    const rowHtml = (r) =>
      '<tr class="'+(r.no>0?'late-row':'')+'"><td>'+r.key+'</td><td>'+r.total+'</td><td class="pos">'+r.yes+'</td><td class="'+(r.no?'neg':'')+'">'+r.no+'</td><td class="'+(r.rate!=null&&r.rate<target?'neg':'pos')+'">'+fmtPct(r.rate)+'</td><td>'+fmtPct(r.prevRate)+'</td><td class="'+(r.delta<0?'neg':r.delta>0?'pos':'')+'">'+fmtPp(r.delta)+'</td></tr>';

    document.getElementById('regionsBody').innerHTML = regRows.map(rowHtml).join('');
    document.getElementById('dcBody').innerHTML = dcRows.map(rowHtml).join('');
    document.getElementById('truckerBody').innerHTML = tRows.map(rowHtml).join('');

    document.getElementById('lateBody').innerHTML = lateDetail.length
      ? lateDetail.map(t =>
          '<tr class="late-row"><td>'+(t.taskId || '—')+'</td><td>'+t.route+'</td><td>'+t.type+'</td><td>'+t.region+'</td><td>'+t.trucker+'</td><td>'+t.dc+'</td><td>'+fmtNum(t.actualTT)+'</td><td>'+fmtNum(t.planTT)+'</td><td class="neg">+'+fmtNum(t.overrun)+'</td></tr>'
        ).join('')
      : '<tr><td colspan="9" style="text-align:center;color:#757575;">No late trips</td></tr>';

    document.getElementById('historyNote').textContent =
      'Daily achievement rate — ' + filterLabel + ' only (target ' + targetPct + '%)';
    document.getElementById('historyHead').innerHTML =
      '<tr><th>Date</th><th>Total</th><th>' + filterLabel + ' Rate</th><th>Late</th></tr>';
    document.getElementById('historyBody').innerHTML = histRows.map(h =>
      '<tr class="'+(h.late>0?'late-row':'')+'"><td>'+h.date+'</td><td>'+h.total+'</td><td class="'+(h.rate!=null&&h.rate<target?'neg':'pos')+'">'+fmtPct(h.rate)+'</td><td class="'+(h.late?'neg':'')+'">'+h.late+'</td></tr>'
    ).join('');

    MttChartManager.render(
      regionLateList,
      routeLateList,
      tRows.filter(t => t.no > 0).slice(0, 10),
      dcRows.filter(d => d.no > 0).slice(0, 8),
      histRows,
      targetPct,
      filterLabel
    );

    if (MttChartManager.renderTrends) {
      MttChartManager.renderTrends(histOverall || [], histLuzon || [], histVismin || []);
    }

    // Graphs tab summary cards: latest-day rates vs comparison day
    const gm = document.getElementById('graphsMetrics');
    const gn = document.getElementById('graphsNote');
    if (gn) {
      gn.textContent = 'Current day ' + dateLatest + ' vs ' + datePrev +
        ' · Overall / Luzon / VisMin achievement rates';
    }
    if (gm) {
      function gCard(label, cur, prev, targetVal) {
        const rate = cur && cur.rate != null ? cur.rate : null;
        const prevR = prev && prev.rate != null ? prev.rate : null;
        const delta = (rate != null && prevR != null) ? rate - prevR : null;
        const rateDown = delta != null && delta < -0.005;
        const rateUp = delta != null && delta > 0.005;
        const below = rate != null && rate < targetVal;
        const cls = below ? 'highlight-down' : (rateUp ? 'highlight-up' : '');
        const diffCls = rateDown ? 'down' : rateUp ? 'up' : 'neutral';
        return '<div class="metric ' + cls + '">' +
          '<div class="label">' + label + '</div>' +
          '<div class="value">' + fmtPct(rate) + '</div>' +
          '<div class="diff ' + diffCls + '">' + fmtPp(delta) + ' vs ' + datePrev + '</div>' +
          '<div class="diff neutral" style="font-weight:500;margin-top:2px;">' +
            (cur ? cur.total : 0) + ' trips · ' + (cur ? cur.no : 0) + ' late · tgt ' +
            Math.round(targetVal * 100) + '%</div>' +
          '</div>';
      }
      gm.innerHTML =
        gCard('Overall', overall, overallPrev, 0.96) +
        gCard('Luzon Route', luzon, luzonPrev, 0.97) +
        gCard('VisMin Route', vismin, visminPrev, 0.85);
    }

    const loading = document.getElementById('loading');
    const loadingCompare = document.getElementById('loadingCompare');
    if (loading) loading.classList.add('hidden');
    if (loadingCompare) loadingCompare.classList.add('hidden');
    document.getElementById('results').classList.remove('hidden');
  }

  function initTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const panel = document.getElementById(tab.dataset.tab);
        if (panel) panel.classList.add('active');
      });
    });
  }

  return { render, initTabs };
})();
