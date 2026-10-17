/* ==========================================================================
   MODULE: MTT DELAY REASON / DAILY PROBLEM ENCOUNTERED
   Parses "Delay Reason" sheet and builds Luzon / VisMin daily + weekly reports
   ========================================================================== */
const MttDelayReason = (() => {
  let delayRows = [];
  let delayDates = [];

  function getState() {
    return { delayRows, delayDates };
  }

  function parseDateKey(val) {
    return MttUtils.parseDateKey(val);
  }

  function classifySide(routeGroup) {
    const u = String(routeGroup || '').toUpperCase();
    if (u.includes('LUZON') && !u.includes('VISMIN')) return 'LUZON';
    if (u.includes('VISMIN')) return 'VISMIN';
    return 'OTHER';
  }

  function formatDateLong(dateKey) {
    if (!dateKey) return '';
    const d = new Date(dateKey + 'T00:00:00');
    if (isNaN(d)) return dateKey;
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    return months[d.getMonth()].toUpperCase() + ' ' +
      String(d.getDate()).padStart(2, '0') + ' (' + days[d.getDay()] + ')';
  }

  /**
   * Week info for a YYYY-MM-DD date key.
   * Operational week = Sunday → Saturday (not ISO Monday–Sunday).
   */
  function getIsoWeekInfo(dateKey) {
    const d = new Date(dateKey + 'T00:00:00');
    if (isNaN(d)) return null;

    const toKey = (dt) => dt.getUTCFullYear() + '-' +
      String(dt.getUTCMonth() + 1).padStart(2, '0') + '-' +
      String(dt.getUTCDate()).padStart(2, '0');

    // Sunday–Saturday bounds (UTC calendar day)
    const base = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dow = base.getUTCDay(); // 0=Sun … 6=Sat
    const sunday = new Date(base);
    sunday.setUTCDate(base.getUTCDate() - dow);
    const saturday = new Date(sunday);
    saturday.setUTCDate(sunday.getUTCDate() + 6);

    // Stable mid-week day (Wednesday) for month / WK label
    const mid = new Date(sunday);
    mid.setUTCDate(sunday.getUTCDate() + 3);
    const yearForLabel = mid.getUTCFullYear();
    const monthForLabel = mid.getUTCMonth();

    // Week number: count Sun–Sat weeks from the first Sunday on/before Jan 1 of that year
    const jan1 = new Date(Date.UTC(yearForLabel, 0, 1));
    const firstSunday = new Date(jan1);
    firstSunday.setUTCDate(1 - jan1.getUTCDay());
    const weekNo = Math.floor((sunday - firstSunday) / 86400000 / 7) + 1;

    // Week-of-month: first Sunday on/before the 1st of the label month
    const firstOfMonth = new Date(Date.UTC(yearForLabel, monthForLabel, 1));
    const firstSunOfMonth = new Date(firstOfMonth);
    firstSunOfMonth.setUTCDate(1 - firstOfMonth.getUTCDay());
    const weekOfMonth = Math.floor((sunday - firstSunOfMonth) / 86400000 / 7) + 1;

    const months = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    const monthName = months[monthForLabel];
    const id = yearForLabel + '-W' + String(weekNo).padStart(2, '0');
    const label = 'Week ' + weekOfMonth + ' (WK' + weekNo + ') · ' + monthName + ' ' + yearForLabel;
    const shortLabel = 'Week ' + weekOfMonth + ' (WK' + weekNo + ')';
    const headerLabel = monthName.toUpperCase() + ' PROBLEM ENCOUNTERED · WEEK ' +
      weekOfMonth + ' (WK' + weekNo + ')';

    return {
      id,
      isoYear: yearForLabel,
      weekNo,
      weekOfMonth,
      monthName,
      startKey: toKey(sunday),
      endKey: toKey(saturday),
      label,
      shortLabel,
      headerLabel
    };
  }

  function weekLabel(dateKey) {
    const info = getIsoWeekInfo(dateKey);
    return info ? info.headerLabel : '';
  }

  /** Unique weeks present in delay data, newest first */
  function listAvailableWeeks() {
    const map = {};
    delayDates.forEach(dk => {
      const info = getIsoWeekInfo(dk);
      if (!info) return;
      if (!map[info.id]) map[info.id] = info;
    });
    return Object.values(map).sort((a, b) => b.startKey.localeCompare(a.startKey));
  }

  /** Parse Delay Reason sheet from workbook (called by FileProcessor) */
  function ingestWorkbook(workbook) {
    delayRows = [];
    delayDates = [];
    const names = workbook.SheetNames || [];
    let sheetName = names.find(n => /delay\s*reason/i.test(n));
    if (!sheetName) {
      for (const n of names) {
        const sample = XLSX.utils.sheet_to_json(workbook.Sheets[n], { defval: null, header: 1 });
        if (sample.length && sample[0].some(c => /problem\s*encountered/i.test(String(c || '')))) {
          sheetName = n;
          break;
        }
      }
    }
    if (!sheetName) return { count: 0 };

    const aoa = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: null, raw: true });
    if (!aoa.length) return { count: 0 };
    const headers = aoa[0].map(h => String(h || '').trim().toUpperCase());
    const idx = {};
    headers.forEach((h, i) => {
      if (h === 'DATE') idx.date = i;
      if (h === 'ROUTE GROUP') idx.routeGroup = i;
      if (h === 'TASK ID') idx.taskId = i;
      if (h === 'PLATE NUMBER') idx.plate = i;
      if (h === 'TASK NAME') idx.taskName = i;
      if (h === 'ROUTE') idx.route = i;
      if (h === 'ACTUAL DEPARTURE') idx.dep = i;
      if (h === 'ACTUAL ARRIVAL') idx.arr = i;
      if (h === 'ACTUAL') idx.actual = i;
      if (h === 'PLANNED') idx.planned = i;
      if (h === 'TRUCKER') idx.trucker = i;
      if (h === 'LOCATION') idx.location = i;
      if (h === 'CATEGORY') idx.category = i;
      if (h === 'PROBLEM ENCOUNTERED') idx.problem = i;
      if (h === 'REMARKS') idx.remarks = i;
    });

    const get = (r, k) => (idx[k] != null && r[idx[k]] != null ? r[idx[k]] : '');

    delayRows = aoa.slice(1).map(r => {
      if (!r || !r.length) return null;
      const dateKey = parseDateKey(get(r, 'date'));
      if (!dateKey) return null;
      const routeGroup = String(get(r, 'routeGroup') || '').trim();
      const category = String(get(r, 'category') || '').trim();
      const problem = String(get(r, 'problem') || '').trim();
      const remarks = String(get(r, 'remarks') || '').trim();
      // Skip empty / NO IR placeholders from narrative reports (still show in table)
      return {
        dateKey,
        routeGroup,
        side: classifySide(routeGroup),
        taskId: String(get(r, 'taskId') || '').trim(),
        plate: String(get(r, 'plate') || '').trim(),
        taskName: String(get(r, 'taskName') || '').trim(),
        route: String(get(r, 'route') || '').trim(),
        actualDep: get(r, 'dep'),
        actualArr: get(r, 'arr'),
        actual: parseFloat(get(r, 'actual')) || 0,
        planned: parseFloat(get(r, 'planned')) || 0,
        trucker: String(get(r, 'trucker') || '').trim(),
        location: String(get(r, 'location') || '').trim(),
        category: category === 'None' || category === 'null' ? '' : category,
        problem: problem === 'None' || problem === 'null' || problem === 'NO IR' ? '' : problem,
        remarks: remarks === 'NO IR' || remarks === 'None' ? '' : remarks,
        hasIssue: !!(category && category !== 'None' && problem && problem !== 'None' && problem !== 'NO IR')
      };
    }).filter(Boolean);

    delayDates = [...new Set(delayRows.map(r => r.dateKey))].sort();
    return { count: delayRows.length, dates: delayDates };
  }

  function rowsForDate(dateKey) {
    return delayRows.filter(r => r.dateKey === dateKey);
  }

  function rowsInRange(startKey, endKey) {
    return delayRows.filter(r => r.dateKey >= startKey && r.dateKey <= endKey);
  }

  /** Group incidents into problem clusters for narrative report */
  function clusterProblems(rows) {
    const map = {};
    rows.filter(r => r.hasIssue).forEach(r => {
      const title = r.problem || r.category || 'Unspecified delay';
      const key = (r.category || '') + '||' + title + '||' + (r.location || '');
      if (!map[key]) {
        map[key] = {
          category: r.category,
          problem: title,
          location: r.location,
          remarks: r.remarks,
          items: []
        };
      }
      map[key].items.push(r);
      // Prefer longest remarks as narrative body
      if ((r.remarks || '').length > (map[key].remarks || '').length) {
        map[key].remarks = r.remarks;
      }
    });
    return Object.values(map).sort((a, b) => b.items.length - a.items.length);
  }

  function buildDailyReport(dateKey) {
    const dayRows = rowsForDate(dateKey);
    const luzon = clusterProblems(dayRows.filter(r => r.side === 'LUZON'));
    const vismin = clusterProblems(dayRows.filter(r => r.side === 'VISMIN'));
    return {
      dateKey,
      dateLabel: formatDateLong(dateKey),
      weekLabel: weekLabel(dateKey),
      luzon,
      vismin,
      tableRows: dayRows,
      totals: {
        all: dayRows.length,
        issues: dayRows.filter(r => r.hasIssue).length,
        luzon: dayRows.filter(r => r.side === 'LUZON' && r.hasIssue).length,
        vismin: dayRows.filter(r => r.side === 'VISMIN' && r.hasIssue).length
      }
    };
  }

  /**
   * Build weekly report for a selected week.
   * @param {string} weekId - e.g. "2026-W41" from listAvailableWeeks(), or omit to use endDateKey's week
   * @param {string} endDateKey - fallback date to derive week from
   */
  function buildWeeklyReport(weekId, endDateKey) {
    const TOP_N = 5; // only top contributors in the weekly narrative
    const weeks = listAvailableWeeks();
    let weekInfo = weekId ? weeks.find(w => w.id === weekId) : null;
    if (!weekInfo && endDateKey) weekInfo = getIsoWeekInfo(endDateKey);
    if (!weekInfo && weeks.length) weekInfo = weeks[0];
    if (!weekInfo) return null;

    const startKey = weekInfo.startKey;
    const endKey = weekInfo.endKey;
    const rangeRows = rowsInRange(startKey, endKey).filter(r => r.hasIssue);

    function topCounts(keyFn, limit) {
      const map = {};
      rangeRows.forEach(r => {
        const k = keyFn(r) || '(blank)';
        map[k] = (map[k] || 0) + 1;
      });
      return Object.entries(map)
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit || 10);
    }

    const byCategory = topCounts(r => r.category || 'Uncategorized', 10);
    const byProblem = topCounts(r => r.problem || 'Unspecified', 10);
    const byTrucker = topCounts(r => r.trucker, 10);
    const byRoute = topCounts(r => r.route || r.taskName, 10);
    const byPort = topCounts(r => r.location || '(no location)', 10);
    const bySide = topCounts(r => r.side, 5);

    // By Port — daily breakdown within the selected week
    const portDayMap = {};
    rangeRows.forEach(r => {
      const port = r.location || '(no location)';
      const key = r.dateKey + '||' + port;
      if (!portDayMap[key]) {
        portDayMap[key] = { date: r.dateKey, port, count: 0 };
      }
      portDayMap[key].count++;
    });
    const byPortDaily = Object.values(portDayMap)
      .sort((a, b) => a.date.localeCompare(b.date) || b.count - a.count);

    // Top problem clusters for the week (Luzon / VisMin) — ranked by count
    const luzonTop = clusterProblems(rangeRows.filter(r => r.side === 'LUZON')).slice(0, TOP_N);
    const visminTop = clusterProblems(rangeRows.filter(r => r.side === 'VISMIN')).slice(0, TOP_N);

    // Day-by-day summary of problems (rollup of each daily PE)
    const dayMap = {};
    rangeRows.forEach(r => {
      if (!dayMap[r.dateKey]) {
        dayMap[r.dateKey] = { date: r.dateKey, total: 0, luzon: 0, vismin: 0, rows: [] };
      }
      dayMap[r.dateKey].total++;
      dayMap[r.dateKey].rows.push(r);
      if (r.side === 'LUZON') dayMap[r.dateKey].luzon++;
      if (r.side === 'VISMIN') dayMap[r.dateKey].vismin++;
    });
    const daily = Object.values(dayMap)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(d => {
        const clusters = clusterProblems(d.rows);
        // top 3 problems that day for the digest
        const topProblems = clusters.slice(0, 3).map(c => ({
          problem: c.problem,
          category: c.category,
          location: c.location,
          count: c.items.length,
          side: c.items[0] ? c.items[0].side : ''
        }));
        return {
          date: d.date,
          dateLabel: formatDateLong(d.date),
          total: d.total,
          luzon: d.luzon,
          vismin: d.vismin,
          topProblems
        };
      });

    return {
      startKey,
      endKey,
      weekId: weekInfo.id,
      weekLabel: weekInfo.headerLabel,
      weekShort: weekInfo.shortLabel,
      weekDisplay: weekInfo.label,
      totalIssues: rangeRows.length,
      luzonCount: rangeRows.filter(r => r.side === 'LUZON').length,
      visminCount: rangeRows.filter(r => r.side === 'VISMIN').length,
      byCategory,
      byProblem,
      byTrucker,
      byRoute,
      byPort,
      byPortDaily,
      bySide,
      luzonTop,
      visminTop,
      daily
    };
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderDailyNarrative(report) {
    if (!report) return '<p class="section-note">No delay-reason data for this date.</p>';

    function section(title, clusters, cssClass) {
      let html = '<div class="pe-side ' + cssClass + '"><h3 class="pe-side-title">' + title + '</h3>';
      if (!clusters.length) {
        html += '<p class="section-note">No problem encountered recorded.</p></div>';
        return html;
      }
      clusters.forEach((c, i) => {
        const loc = c.location ? ' (' + escapeHtml(c.location) + ')' : '';
        const head = escapeHtml(c.problem) + loc;
        html += '<div class="pe-item">';
        html += '<div class="pe-item-title">' + (i + 1) + '. <span class="pe-highlight">' + head + '</span>';
        if (c.category) html += ' <span class="pe-cat">' + escapeHtml(c.category) + '</span>';
        html += '</div>';
        if (c.remarks) {
          html += '<p class="pe-narrative">' + escapeHtml(c.remarks) + '</p>';
        }
        html += '<div class="pe-meta">';
        c.items.forEach(it => {
          html += '<span class="pe-chip">' + escapeHtml(it.taskId || '—') +
            ' · ' + escapeHtml(it.plate || '—') +
            ' · ' + escapeHtml(it.route || it.taskName || '—') +
            ' · ' + escapeHtml(it.trucker || '—') + '</span>';
        });
        html += '</div></div>';
      });
      html += '</div>';
      return html;
    }

    let html = '<div class="pe-report">';
    html += '<div class="pe-header">';
    html += '<h2>Daily Problem Encountered</h2>';
    html += '<div class="pe-week">' + escapeHtml(report.weekLabel) + '</div>';
    html += '<div class="pe-date">' + escapeHtml(report.dateLabel) + '</div>';
    html += '<div class="pe-stats">' + report.totals.issues + ' issue(s) · Luzon ' +
      report.totals.luzon + ' · VisMin ' + report.totals.vismin +
      ' · ' + report.totals.all + ' delay-row(s)</div>';
    html += '</div>';
    html += section('Luzon', report.luzon, 'pe-luzon');
    html += section('VisMin', report.vismin, 'pe-vismin');
    html += '</div>';
    return html;
  }

  function renderWeekly(report) {
    if (!report) return '<p class="section-note">No delay-reason data for weekly summary.</p>';

    function listBlock(title, rows) {
      if (!rows.length) return '<p class="section-note">No data</p>';
      let h = '<table class="pe-week-table"><thead><tr><th>' + title +
        '</th><th>Count</th></tr></thead><tbody>';
      rows.forEach(r => {
        h += '<tr><td>' + escapeHtml(r.key) + '</td><td class="neg">' + r.count + '</td></tr>';
      });
      h += '</tbody></table>';
      return h;
    }

    /** Narrative section for top weekly contributors (Luzon / VisMin) */
    function topSection(title, clusters, cssClass) {
      let html = '<div class="pe-side ' + cssClass + '"><h3 class="pe-side-title">' + title +
        ' — Top Contributors</h3>';
      if (!clusters || !clusters.length) {
        html += '<p class="section-note">No problem encountered in this side for the week.</p></div>';
        return html;
      }
      clusters.forEach((c, i) => {
        const loc = c.location ? ' (' + escapeHtml(c.location) + ')' : '';
        const head = escapeHtml(c.problem) + loc;
        const count = c.items ? c.items.length : 0;
        // Unique days this problem appeared
        const daysHit = [...new Set((c.items || []).map(it => it.dateKey))].sort();
        html += '<div class="pe-item">';
        html += '<div class="pe-item-title">' + (i + 1) + '. <span class="pe-highlight">' + head + '</span>';
        if (c.category) html += ' <span class="pe-cat">' + escapeHtml(c.category) + '</span>';
        html += ' <span class="pe-count-badge">' + count + '× this week</span>';
        html += '</div>';
        if (c.remarks) {
          html += '<p class="pe-narrative">' + escapeHtml(c.remarks) + '</p>';
        }
        html += '<div class="pe-meta">';
        html += '<span class="pe-chip pe-chip-days">Days: ' + escapeHtml(daysHit.join(', ')) + '</span>';
        // Show up to 6 sample units
        (c.items || []).slice(0, 6).forEach(it => {
          html += '<span class="pe-chip">' + escapeHtml(it.taskId || '—') +
            ' · ' + escapeHtml(it.plate || '—') +
            ' · ' + escapeHtml(it.route || it.taskName || '—') +
            ' · ' + escapeHtml(it.trucker || '—') + '</span>';
        });
        if (count > 6) {
          html += '<span class="pe-chip">+' + (count - 6) + ' more</span>';
        }
        html += '</div></div>';
      });
      html += '</div>';
      return html;
    }

    let html = '<div class="pe-report">';
    html += '<div class="pe-header">';
    html += '<h2>Weekly Problem Encountered</h2>';
    html += '<div class="pe-week">' + escapeHtml(report.weekLabel) + '</div>';
    html += '<div class="pe-date">' + escapeHtml(report.weekDisplay || report.weekShort) +
      ' · ' + escapeHtml(report.startKey) + ' → ' + escapeHtml(report.endKey) + '</div>';
    html += '<div class="pe-stats"><strong>' + report.totalIssues + '</strong> issue(s) this week · Luzon ' +
      (report.luzonCount || 0) + ' · VisMin ' + (report.visminCount || 0) +
      ' · showing <strong>top 5</strong> contributors per side</div>';
    html += '</div>';

    // 1) Top contributors narrative (summary of the week)
    html += topSection('Luzon', report.luzonTop, 'pe-luzon');
    html += topSection('VisMin', report.visminTop, 'pe-vismin');

    // 2) Day-by-day digest (summarizes each daily PE)
    if (report.daily && report.daily.length) {
      html += '<h3 class="pe-digest-title">Daily summary (week roll-up)</h3>';
      html += '<div class="pe-digest">';
      report.daily.forEach(d => {
        html += '<div class="pe-digest-day">';
        html += '<div class="pe-digest-date">' + escapeHtml(d.dateLabel) +
          ' <span class="pe-cat">' + d.total + ' issue(s) · L' + d.luzon + ' / V' + d.vismin + '</span></div>';
        if (d.topProblems && d.topProblems.length) {
          html += '<ul class="pe-digest-list">';
          d.topProblems.forEach(p => {
            const loc = p.location ? ' @ ' + escapeHtml(p.location) : '';
            html += '<li><span class="pe-highlight">' + escapeHtml(p.problem) + loc + '</span>';
            if (p.category) html += ' <span class="pe-cat">' + escapeHtml(p.category) + '</span>';
            html += ' <span class="pe-count-badge">' + p.count + '×</span>';
            if (p.side) html += ' <span class="pe-cat">' + escapeHtml(p.side) + '</span>';
            html += '</li>';
          });
          html += '</ul>';
        } else {
          html += '<p class="section-note">No top problems listed.</p>';
        }
        html += '</div>';
      });
      html += '</div>';
    }

    // 3) Ranking tables (top contributors by dimension)
    html += '<h3 class="pe-digest-title">Top contributors by dimension</h3>';
    html += '<div class="pe-week-grid">';
    html += '<div class="pe-week-card"><h3>By Category</h3>' + listBlock('Category', report.byCategory) + '</div>';
    html += '<div class="pe-week-card"><h3>By Problem</h3>' + listBlock('Problem', report.byProblem) + '</div>';
    html += '<div class="pe-week-card"><h3>By Trucker</h3>' + listBlock('Trucker', report.byTrucker) + '</div>';
    html += '<div class="pe-week-card"><h3>By Route</h3>' + listBlock('Route', report.byRoute) + '</div>';
    html += '</div>';

    // 4) By Port — daily + weekly side by side
    html += '<h3 class="pe-digest-title">By Port / Location</h3>';
    html += '<div class="pe-week-grid">';

    // Daily table
    html += '<div class="pe-week-card"><h3>By Port (Daily)</h3>';
    if (report.byPortDaily && report.byPortDaily.length) {
      html += '<table class="pe-week-table"><thead><tr><th>Date</th><th>Port / Location</th><th>Count</th></tr></thead><tbody>';
      report.byPortDaily.forEach(r => {
        html += '<tr><td>' + escapeHtml(r.date) + '</td><td>' + escapeHtml(r.port) +
          '</td><td class="neg">' + r.count + '</td></tr>';
      });
      html += '</tbody></table>';
    } else {
      html += '<p class="section-note">No port/location data</p>';
    }
    html += '</div>';

    // Weekly table
    html += '<div class="pe-week-card"><h3>By Port (Weekly)</h3>' +
      listBlock('Port / Location', report.byPort || []) + '</div>';

    html += '</div>';

    html += '</div>';
    return html;
  }

  function renderTable(rows) {
    if (!rows || !rows.length) {
      return '<p class="section-note">No Delay Reason rows for this date. Upload a file that includes a <strong>Delay Reason</strong> sheet.</p>';
    }
    let html = '<div class="table-scroll pe-table-scroll"><table><thead><tr>' +
      '<th>Date</th><th>Route Group</th><th>Task ID</th><th>Plate</th><th>Task Name</th><th>Route</th>' +
      '<th>Actual</th><th>Planned</th><th>Trucker</th><th>Location</th><th>Category</th><th>Problem Encountered</th>' +
      '</tr></thead><tbody>';
    rows.forEach(r => {
      const cls = r.hasIssue ? 'late-row' : '';
      html += '<tr class="' + cls + '">' +
        '<td>' + escapeHtml(r.dateKey) + '</td>' +
        '<td>' + escapeHtml(r.routeGroup) + '</td>' +
        '<td>' + escapeHtml(r.taskId) + '</td>' +
        '<td>' + escapeHtml(r.plate) + '</td>' +
        '<td>' + escapeHtml(r.taskName) + '</td>' +
        '<td>' + escapeHtml(r.route) + '</td>' +
        '<td>' + (r.actual || '—') + '</td>' +
        '<td>' + (r.planned || '—') + '</td>' +
        '<td>' + escapeHtml(r.trucker) + '</td>' +
        '<td>' + escapeHtml(r.location) + '</td>' +
        '<td>' + escapeHtml(r.category) + '</td>' +
        '<td>' + escapeHtml(r.problem) + '</td>' +
        '</tr>';
    });
    html += '</tbody></table></div>';
    return html;
  }

  function render(dateKey) {
    const host = document.getElementById('delayReasonPanel');
    if (!host) return;

    if (!delayRows.length) {
      host.innerHTML = '<p class="section-note">No <strong>Delay Reason</strong> sheet found in the uploaded file. ' +
        'Add a sheet named <em>Delay Reason</em> with columns: DATE, ROUTE GROUP, TASK ID, PLATE NUMBER, TASK NAME, ROUTE, ' +
        'ACTUAL DEPARTURE, ACTUAL ARRIVAL, ACTUAL, PLANNED, TRUCKER, LOCATION, CATEGORY, PROBLEM ENCOUNTERED, REMARKS.</p>';
      return;
    }

    const focus = dateKey || (document.getElementById('selectDelayDate') && document.getElementById('selectDelayDate').value) || delayDates[delayDates.length - 1];
    const daily = buildDailyReport(focus);

    // Populate date select (for Daily + Table)
    const sel = document.getElementById('selectDelayDate');
    if (sel) {
      const prev = sel.value;
      sel.innerHTML = delayDates.map(d =>
        '<option value="' + d + '"' + (d === focus ? ' selected' : '') + '>' + d + '</option>'
      ).join('');
      if (prev && delayDates.includes(prev) && !dateKey) sel.value = prev;
    }

    // Populate week select (for Weekly PE)
    const weeks = listAvailableWeeks();
    const weekSel = document.getElementById('selectDelayWeek');
    let weekId = weekSel ? weekSel.value : '';
    if (weekSel) {
      const prevW = weekSel.value;
      // Default: week containing focus date, else newest week
      const focusWeek = getIsoWeekInfo(focus);
      const defaultId = (prevW && weeks.some(w => w.id === prevW))
        ? prevW
        : (focusWeek ? focusWeek.id : (weeks[0] && weeks[0].id));
      weekSel.innerHTML = weeks.map(w =>
        '<option value="' + w.id + '"' + (w.id === defaultId ? ' selected' : '') + '>' +
        w.label + ' · ' + w.startKey.slice(5) + '–' + w.endKey.slice(5) + '</option>'
      ).join('');
      weekId = weekSel.value || defaultId;
    }

    const weekly = buildWeeklyReport(weekId, focus);

    const sub = document.querySelector('.pe-subtab.active');
    const view = sub ? sub.dataset.peView : 'daily';

    // Show/hide date vs week filters by active view
    const dateWrap = document.getElementById('peDateFilterWrap');
    const weekWrap = document.getElementById('peWeekFilterWrap');
    if (dateWrap) dateWrap.style.display = (view === 'weekly') ? 'none' : '';
    if (weekWrap) weekWrap.style.display = (view === 'weekly') ? '' : 'none';

    const tableEl = document.getElementById('peTableView');
    const dailyEl = document.getElementById('peDailyView');
    const weeklyEl = document.getElementById('peWeeklyView');
    if (tableEl) tableEl.innerHTML = renderTable(daily.tableRows);
    if (dailyEl) dailyEl.innerHTML = renderDailyNarrative(daily);
    if (weeklyEl) weeklyEl.innerHTML = renderWeekly(weekly);

    // Show active sub-view
    ['table', 'daily', 'weekly'].forEach(v => {
      const el = document.getElementById('pe' + v.charAt(0).toUpperCase() + v.slice(1) + 'View');
      if (el) el.classList.toggle('hidden', view !== v);
    });
  }

  function init() {
    document.querySelectorAll('.pe-subtab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.pe-subtab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const view = tab.dataset.peView;
        ['table', 'daily', 'weekly'].forEach(v => {
          const el = document.getElementById('pe' + v.charAt(0).toUpperCase() + v.slice(1) + 'View');
          if (el) el.classList.toggle('hidden', view !== v);
        });
        // Toggle filters + re-render so week list is ready
        const dateWrap = document.getElementById('peDateFilterWrap');
        const weekWrap = document.getElementById('peWeekFilterWrap');
        if (dateWrap) dateWrap.style.display = (view === 'weekly') ? 'none' : '';
        if (weekWrap) weekWrap.style.display = (view === 'weekly') ? '' : 'none';
        render();
      });
    });
    const sel = document.getElementById('selectDelayDate');
    if (sel) {
      sel.addEventListener('change', () => render(sel.value));
    }
    const weekSel = document.getElementById('selectDelayWeek');
    if (weekSel) {
      weekSel.addEventListener('change', () => render());
    }
  }


  /**
   * Historical delay patterns used to forecast causes for a target day
   * (when Delay Reason sheet is 1 day behind travel-time data).
   */
  function forecastDelayCauses(targetDateKey) {
    if (!delayRows.length) {
      return { hasDelaySheet: false, hasDayData: false, targetDateKey, patterns: [] };
    }
    const dayRows = delayRows.filter(r => r.dateKey === targetDateKey && r.hasIssue);
    if (dayRows.length) {
      // Actual data exists for that day
      const byCat = {};
      const byPort = {};
      const bySide = { LUZON: 0, VISMIN: 0 };
      dayRows.forEach(r => {
        byCat[r.category || 'Uncategorized'] = (byCat[r.category || 'Uncategorized'] || 0) + 1;
        byPort[r.location || '(unknown)'] = (byPort[r.location || '(unknown)'] || 0) + 1;
        if (r.side === 'LUZON' || r.side === 'VISMIN') bySide[r.side]++;
      });
      return {
        hasDelaySheet: true,
        hasDayData: true,
        targetDateKey,
        issueCount: dayRows.length,
        byCategory: Object.entries(byCat).map(([k, c]) => ({ key: k, count: c })).sort((a, b) => b.count - a.count),
        byPort: Object.entries(byPort).map(([k, c]) => ({ key: k, count: c })).sort((a, b) => b.count - a.count),
        bySide,
        note: 'Delay Reason already recorded for this day.'
      };
    }

    // No delay rows for target day → build forecast from recent history
    const prior = delayRows.filter(r => r.hasIssue && r.dateKey < targetDateKey);
    if (!prior.length) {
      return { hasDelaySheet: true, hasDayData: false, targetDateKey, patterns: [], note: 'No prior delay history to forecast from.' };
    }

    // Prefer same weekday in history + last 7 days with data
    const targetDow = new Date(targetDateKey + 'T00:00:00').getDay();
    const sameDow = prior.filter(r => new Date(r.dateKey + 'T00:00:00').getDay() === targetDow);
    const recentDates = [...new Set(prior.map(r => r.dateKey))].sort().slice(-7);
    const recent = prior.filter(r => recentDates.includes(r.dateKey));
    const pool = recent.length ? recent : prior;

    function top(arr, keyFn, limit) {
      const map = {};
      arr.forEach(r => {
        const k = keyFn(r) || '(blank)';
        map[k] = (map[k] || 0) + 1;
      });
      return Object.entries(map)
        .map(([key, count]) => ({ key, count, pct: count / arr.length }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit || 5);
    }

    const byCategory = top(pool, r => r.category || 'Uncategorized', 5);
    const byPort = top(pool, r => r.location || '(unknown)', 5);
    const byProblem = top(pool, r => r.problem || 'Unspecified', 5);
    const bySide = top(pool, r => r.side, 3);
    const byRoute = top(pool, r => r.route || r.taskName, 5);

    // Same weekday emphasis
    const dowCat = sameDow.length ? top(sameDow, r => r.category || 'Uncategorized', 3) : [];
    const avgPerDay = pool.length / Math.max(1, recentDates.length);

    return {
      hasDelaySheet: true,
      hasDayData: false,
      targetDateKey,
      issueCount: 0,
      predictedIssues: Math.round(avgPerDay),
      basedOnDays: recentDates.length,
      byCategory,
      byPort,
      byProblem,
      bySide,
      byRoute,
      sameWeekdayCategory: dowCat,
      note: 'Delay Reason not yet available for this day (typically 1-day lag). Forecast from last ' +
        recentDates.length + ' day(s) of delay history' +
        (sameDow.length ? ' and same weekday patterns.' : '.')
    };
  }

  return {
    ingestWorkbook,
    getState,
    buildDailyReport,
    buildWeeklyReport,
    forecastDelayCauses,
    render,
    init
  };
})();

