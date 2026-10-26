/* ==========================================================================
   MODULE: MTT PROBLEM REPORT (Auto Daily / Weekly PE narrative)
   Separate tab — does not replace existing Delay Reason views.
   Reads rows from MttDelayReason.getState() after upload.
   ========================================================================== */
const MttProblemReport = (() => {

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtNum(v) {
    if (v == null || isNaN(v) || v === 0) return '—';
    return Number(v).toFixed(1);
  }

  /** Official MTT region codes (same as Regions filter in the app) */
  const OFFICIAL_REGIONS = [
    'BACKLOAD', 'BSL', 'CDO', 'DVO', 'NCR', 'NEL', 'NWL', 'SLU', 'TWO DROPS', 'WVA'
  ];

  function getRows() {
    if (typeof MttDelayReason === 'undefined') return [];
    const st = MttDelayReason.getState();
    return (st && st.delayRows) || [];
  }

  function getDates() {
    if (typeof MttDelayReason === 'undefined') return [];
    const st = MttDelayReason.getState();
    return (st && st.delayDates) || [];
  }

  /** Build Task ID → REGION map from main DATA sheet (source of truth for region filter) */
  function taskRegionMap() {
    const map = {};
    if (typeof MttFileProcessor === 'undefined') return map;
    const st = MttFileProcessor.getState();
    const rows = (st && st.storedRows) || [];
    rows.forEach(r => {
      const id = String(r.taskId || '').trim();
      const reg = String(r.region || '').trim().toUpperCase();
      if (id && reg && reg !== '(BLANK)') map[id] = reg;
    });
    return map;
  }

  /** Normalize any region string to an official code when possible */
  function normalizeRegion(raw) {
    if (!raw) return '';
    const u = String(raw).trim().toUpperCase().replace(/\s+/g, ' ');
    if (!u || u === 'NONE' || u === '-' || u === '(BLANK)') return '';
    // Exact official match
    for (let i = 0; i < OFFICIAL_REGIONS.length; i++) {
      if (OFFICIAL_REGIONS[i] === u) return OFFICIAL_REGIONS[i];
    }
    // Common variants
    if (/TWO\s*DROP|2\s*DROP/.test(u)) return 'TWO DROPS';
    if (/BACK\s*LOAD|BACKLOAD/.test(u)) return 'BACKLOAD';
    if (/\bBSL\b|BICOL/.test(u)) return 'BSL';
    if (/\bWVA\b|WEST\s*VIS|CEBU|ILOILO|BACOLOD/.test(u)) return 'WVA';
    if (/\bDVO\b|DAVAO/.test(u)) return 'DVO';
    if (/\bCDO\b|CAGAYAN/.test(u)) return 'CDO';
    if (/\bNCR\b|MANILA|PARADA|PASIG/.test(u)) return 'NCR';
    if (/\bNEL\b|NORTH\s*EAST/.test(u)) return 'NEL';
    if (/\bNWL\b|NORTH\s*WEST/.test(u)) return 'NWL';
    if (/\bSLU\b|SOUTH\s*LUZON|BATANGAS|CAVITE|LAGUNA|LUCENA/.test(u)) return 'SLU';
    return u; // keep unknown as-is rather than OTHER
  }

  /**
   * Region priority (matches app Regions filter):
   * 1) Main DATA sheet REGION via Task ID match
   * 2) Delay Reason Col Z REGION / Col AB CHECKER REGION
   * 3) Heuristics from route / location / task name
   */
  function deriveRegion(r, dataRegionByTask) {
    // 1) DATA sheet by Task ID
    const tid = String(r.taskId || '').trim();
    if (tid && dataRegionByTask && dataRegionByTask[tid]) {
      return dataRegionByTask[tid];
    }

    // 2) Delay Reason sheet region columns
    const fromSheet = normalizeRegion(r.regionRaw || r.region || r.checkerRegion || '');
    if (fromSheet) return fromSheet;

    // 3) Heuristics
    const blob = [
      r.routeGroup || '', r.location || '', r.route || '',
      r.taskName || '', r.remarks || ''
    ].join(' ').toUpperCase();

    const guessed = normalizeRegion(blob);
    if (guessed && OFFICIAL_REGIONS.indexOf(guessed) >= 0) return guessed;

    if (/TWO\s*DROP|2\s*DROP/.test(blob)) return 'TWO DROPS';
    if (/BACK\s*LOAD|BACKLOAD/.test(blob)) return 'BACKLOAD';
    if (/\bBSL\b|BICOL|ALBAY|NAGA|LEYTE|TACLOBAN|MASBATE|SAMAR|ALLEN|CATBALOGAN/.test(blob)) return 'BSL';
    if (/\bWVA\b|CEBU|ILOILO|BACOLOD|KALIBO|TAGBILARAN|ORMOC/.test(blob)) return 'WVA';
    if (/\bDVO\b|DAVAO|GENSAN|TAGUM|BUTUAN|SURIGAO/.test(blob)) return 'DVO';
    if (/\bCDO\b|ZAMBOANGA|PAGADIAN|DIGOS|DIPOLOG|COTABATO/.test(blob)) return 'CDO';
    if (/\bNCR\b|MANILA|PASIG|PARADA|SAMPALOC|RIZAL/.test(blob)) return 'NCR';
    if (/\bNEL\b|SANTIAGO|BULACAN|CABANATUAN|MARILAO/.test(blob)) return 'NEL';
    if (/\bNWL\b|PAMPANGA|URDANETA|VIGAN/.test(blob)) return 'NWL';
    if (/\bSLU\b|BATANGAS|CAVITE|LUCENA|PALAWAN|CORON|LAGUNA|MINDORO/.test(blob)) return 'SLU';
    return 'OTHER';
  }

  function isPortRelated(title) {
    return /Port Waiting Time|port congest|barge delay|vessel avail|Limited Vessel/i.test(title || '');
  }

  function isBreakdown(title) {
    // Flat/burst tire is treated as truck breakdown (red highlight)
    return /Truck Breakdown|BREAKDOWN|mechanical|Flat\/Burst Tire|Burst Tire|Flat Tire/i.test(title || '');
  }

  /** Canonical cluster title: all port-related → one fixed title */
  function clusterTitle(stdTitle) {
    if (isPortRelated(stdTitle)) {
      return 'Extended Port Waiting Time due to Limited Vessel Availability, Barge Delay, and Port Congestion';
    }
    return stdTitle;
  }

  /** Map raw text → standardized title */
  function standardTitle(r) {
    if (r.stdTitle) return r.stdTitle;
    const blob = [
      r.problem || '', r.category || '', r.remarks || '', r.location || ''
    ].join(' ').toUpperCase();

    if (/PORT\s*CONGEST|LIMITED\s*VESSEL|VESSEL\s*AVAIL|BARGE\s*DELAY|FULLY\s*LOADED\s*VESSEL|LONG\s*QUEUE|TICKETING|BOARDING|PORT\s*WAIT|WAITING\s*TIME\s*AT\s*.*PORT/.test(blob)) {
      return 'Extended Port Waiting Time due to Limited Vessel Availability, Barge Delay, and Port Congestion';
    }
    if (/HEAVY\s*TRAFFIC|TRAFFIC\s*CONGEST|ROAD\s*CONGEST|TRAFFIC\s*ALONG/.test(blob)) {
      return 'Extended Travel Time due to Heavy Traffic / Traffic Congestion';
    }
    if (/BURST\s*TIRE|FLAT\s*TIRE|PUNCTURE|TIRE\s*REPLAC/.test(blob)) {
      return 'Extended Travel Time due to Flat/Burst Tire';
    }
    if (/BREAKDOWN|TRUCK\s*BREAK|MECHANICAL|ENGINE|BATTERY|WATER\s*PUMP|SPLITTER|HOSE|REPAIR|BOOSTER/.test(blob)) {
      return 'Extended Delivery Time due to Truck Breakdown';
    }
    if (/FLEET\s*CARD|FUEL\s*CARD|CARD\s*ISSUE|CARD\s*PROBLEM/.test(blob)) {
      return 'Extended Travel Time due to Fleet Card Issues';
    }
    if (/EARLY\s*DEPARTURE|DEPARTED\s*EARLY|LEFT\s*EARLY/.test(blob)) {
      return 'Late Arrival due to Early Departure';
    }
    if (/NON[\s-]*COMPLIANCE|REROUT|RE-ROUT|ADVISORY/.test(blob)) {
      return 'Extended Travel Time due to Non-Compliance with Rerouting Advisory';
    }
    if (/TRUCK\s*BAN|NUMBER\s*CODING|CODING\s*SCHEME|BAN\s*HOUR/.test(blob)) {
      return 'Extended Travel Time due to Truck Ban';
    }
    const p = String(r.problem || '').trim();
    if (p && p.length > 3 && !/^none$/i.test(p) && !/^no\s*ir$/i.test(p)) return p;
    const c = String(r.category || '').trim();
    if (c && c.length > 3) return c;
    return 'Operational Delay';
  }

  function enrich(r, dataRegionByTask) {
    const actual = r.actual || 0;
    const planned = r.planned || 0;
    const std = standardTitle(r);
    const region = deriveRegion(r, dataRegionByTask);
    return Object.assign({}, r, {
      region: region,
      stdTitle: std,
      clusterTitle: clusterTitle(std),
      isPort: isPortRelated(std),
      isBreakdown: isBreakdown(std),
      overrun: r.overrun != null ? r.overrun : Math.max(0, actual - planned),
      hasIssue: r.hasIssue != null ? r.hasIssue : !!(r.problem || (r.category && r.category !== 'None'))
    });
  }

  function enrichAll(rows) {
    const map = taskRegionMap();
    return rows.map(r => enrich(r, map));
  }

  function buildSummary(title, items, stripIds) {
    const n = items.length;
    const plural = n > 1;
    const locs = [...new Set(items.map(it => (it.location || '').trim()).filter(Boolean))];
    const remarks = items.map(it => (it.remarks || '').trim()).filter(Boolean);
    const longest = remarks.sort((a, b) => b.length - a.length)[0] || '';

    if (title.indexOf('Port Waiting Time') >= 0) {
      let s = (plural ? 'The units' : 'The unit') + ' experienced extended waiting time';
      if (locs.length) {
        s += ' at ' + locs.slice(0, 8).join(', ');
        if (locs.length > 8) s += ' and other ports';
      }
      s += ' due to limited vessel availability, barge delay, fully loaded vessels, high volume of trucks, long queues for ticketing, and significant port congestion. These issues caused prolonged port stays, delayed boarding, and delayed departures, resulting in late arrivals at the destination.';
      if (/traffic/i.test(longest) || items.some(it => /traffic/i.test(it.problem || ''))) {
        s += ' Additional delay was also encountered due to heavy traffic along the route on some units.';
      }
      return s;
    }
    if (title.indexOf('Heavy Traffic') >= 0 || title.indexOf('Traffic Congestion') >= 0) {
      let s = (plural ? 'The units' : 'The unit') + ' experienced heavy traffic';
      if (locs.length) s += ' along ' + locs.slice(0, 4).join(', ');
      else {
        const m = longest.match(/along\s+([^.,]+)/i);
        if (m) s += ' along ' + m[1].trim();
      }
      s += ', which resulted in late arrival at the destination. Continuous monitoring was done to ensure the truck’s movement despite the traffic situation.';
      return s;
    }
    if (title.indexOf('Flat/Burst Tire') >= 0 || title.indexOf('Burst Tire') >= 0) {
      let s = plural
        ? 'The units experienced breakdowns due to flat/burst tires'
        : 'The unit experienced a breakdown due to a burst tire';
      if (locs.length) s += ' while at ' + locs[0];
      s += '. The tire needed to be replaced before the unit' + (plural ? 's' : '') +
        ' could safely continue. This unexpected incident caused a delay in the scheduled trip.';
      return s;
    }
    if (title.indexOf('Truck Breakdown') >= 0) {
      let s = plural
        ? 'The units encountered mechanical breakdowns while in transit'
        : 'The unit encountered a mechanical breakdown while in transit';
      if (longest && longest.length < 180) s += ' (' + longest.replace(/\s+/g, ' ').trim() + ')';
      s += '. Loads were transferred or repairs performed as needed to continue the trips.';
      return s;
    }
    if (title.indexOf('Fleet Card') >= 0) {
      return (plural ? 'The units' : 'The unit') +
        ' experienced extended travel time due to fleet card issues that delayed fueling or payment processing along the route.';
    }
    if (title.indexOf('Early Departure') >= 0) {
      return (plural ? 'The units' : 'The unit') +
        ' departed earlier than the planned schedule, which contributed to a mismatch with the arrival window and was recorded as late against plan travel time.';
    }
    if (title.indexOf('Non-Compliance') >= 0) {
      return (plural ? 'The units' : 'The unit') +
        ' did not fully follow the rerouting advisory, resulting in extended travel time and late arrival at the destination.';
    }
    if (title.indexOf('Truck Ban') >= 0) {
      return (plural ? 'The units' : 'The unit') +
        ' were affected by truck ban / number-coding restrictions, which extended travel time and delayed arrival.';
    }
    if (longest && longest.length > 20 && longest.length < 320) {
      let s = longest.replace(/\s+/g, ' ').trim();
      if (stripIds) {
        s = s.replace(/\b[A-Z]{1,3}\d{6,}\b/g, '')
          .replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, '')
          .replace(/\s{2,}/g, ' ').trim();
      }
      if (s) return s;
    }
    return (plural ? 'The units' : 'The unit') +
      ' experienced ' + title.toLowerCase().replace(/^extended\s+/, '') +
      ', resulting in late arrival at the destination.';
  }

  /**
   * Daily: group by (clusterTitle + region).
   * All port-related rows in the same region → ONE report item.
   * Different regions stay separate (Col Z / AB).
   */
  function buildDailyClusters(rows) {
    const map = {};
    rows.filter(r => r.hasIssue).forEach(r => {
      const title = r.clusterTitle || clusterTitle(r.stdTitle);
      const region = r.region || 'OTHER';
      const key = title + '||' + region.toUpperCase();
      if (!map[key]) {
        map[key] = {
          title: title,
          region: region,
          side: r.side,
          isBreakdown: isBreakdown(title),
          isPort: isPortRelated(title),
          items: []
        };
      }
      map[key].items.push(r);
      if (r.isBreakdown) map[key].isBreakdown = true;
    });
    return Object.values(map)
      .map(c => {
        c.count = c.items.length;
        c.summary = buildSummary(c.title, c.items, false);
        c.sampleTaskIds = c.items.map(it => it.taskId).filter(Boolean).slice(0, 6);
        return c;
      })
      .sort((a, b) => {
        // Breakdown first for visibility, then by count
        if (a.isBreakdown !== b.isBreakdown) return a.isBreakdown ? -1 : 1;
        return (b.count - a.count) || a.title.localeCompare(b.title) || a.region.localeCompare(b.region);
      });
  }

  /**
   * Weekly: group by (clusterTitle + region) — same separation as daily.
   * All port-related in one region → one item; different regions stay separate.
   * Narratives strip task IDs / plates / exact times.
   */
  function buildWeeklyClusters(rows) {
    const map = {};
    rows.filter(r => r.hasIssue).forEach(r => {
      const title = r.clusterTitle || clusterTitle(r.stdTitle);
      const region = r.region || 'OTHER';
      const key = title + '||' + region.toUpperCase();
      if (!map[key]) {
        map[key] = {
          title: title,
          region: region,
          isBreakdown: isBreakdown(title),
          isPort: isPortRelated(title),
          items: []
        };
      }
      map[key].items.push(r);
      if (r.isBreakdown) map[key].isBreakdown = true;
    });
    return Object.values(map)
      .map(c => {
        c.count = c.items.length;
        c.summary = buildSummary(c.title, c.items, true);
        c.daysHit = [...new Set(c.items.map(it => it.dateKey))].sort();
        return c;
      })
      .sort((a, b) => {
        if (a.isBreakdown !== b.isBreakdown) return a.isBreakdown ? -1 : 1;
        const ra = (a.region || '').localeCompare(b.region || '');
        if (ra) return ra;
        return (b.count - a.count) || a.title.localeCompare(b.title);
      });
  }

  function weekInfo(dateKey) {
    if (typeof MttDelayReason !== 'undefined' && MttDelayReason.getState) {
      // reuse week logic if available via internal — fallback local
    }
    const d = new Date(dateKey + 'T00:00:00');
    if (isNaN(d)) return null;
    const toKey = (dt) => dt.getUTCFullYear() + '-' +
      String(dt.getUTCMonth() + 1).padStart(2, '0') + '-' +
      String(dt.getUTCDate()).padStart(2, '0');
    const base = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dow = base.getUTCDay();
    const sunday = new Date(base);
    sunday.setUTCDate(base.getUTCDate() - dow);
    const saturday = new Date(sunday);
    saturday.setUTCDate(sunday.getUTCDate() + 6);
    const mid = new Date(sunday);
    mid.setUTCDate(sunday.getUTCDate() + 3);
    const y = mid.getUTCFullYear();
    const m = mid.getUTCMonth();
    const jan1 = new Date(Date.UTC(y, 0, 1));
    const firstSun = new Date(jan1);
    firstSun.setUTCDate(1 - jan1.getUTCDay());
    const weekNo = Math.floor((sunday - firstSun) / 86400000 / 7) + 1;
    const firstOfMonth = new Date(Date.UTC(y, m, 1));
    const firstSunM = new Date(firstOfMonth);
    firstSunM.setUTCDate(1 - firstOfMonth.getUTCDay());
    const weekOfMonth = Math.floor((sunday - firstSunM) / 86400000 / 7) + 1;
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    return {
      id: y + '-W' + String(weekNo).padStart(2, '0'),
      startKey: toKey(sunday),
      endKey: toKey(saturday),
      label: 'Week ' + weekOfMonth + ' (WK' + weekNo + ') · ' + months[m] + ' ' + y,
      headerLabel: months[m].toUpperCase() + ' PROBLEM ENCOUNTERED · WEEK ' + weekOfMonth + ' (WK' + weekNo + ')'
    };
  }

  function listWeeks(dates) {
    const map = {};
    dates.forEach(dk => {
      const w = weekInfo(dk);
      if (w && !map[w.id]) map[w.id] = w;
    });
    return Object.values(map).sort((a, b) => b.startKey.localeCompare(a.startKey));
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

  /* ---------- RENDER ---------- */

  function renderDailyHtml(dateKey) {
    const all = enrichAll(getRows());
    let dayRows = all.filter(r => r.dateKey === dateKey && r.hasIssue);
    dayRows = filterByRegion(dayRows);
    if (!dayRows.length) {
      return '<p class="section-note">No problem-encountered rows for <strong>' +
        escapeHtml(dateKey) + '</strong>. Upload a workbook with a Delay Reason sheet.</p>';
    }
    const luzon = buildDailyClusters(dayRows.filter(r => r.side === 'LUZON'));
    const vismin = buildDailyClusters(dayRows.filter(r => r.side === 'VISMIN'));
    const other = buildDailyClusters(dayRows.filter(r => r.side !== 'LUZON' && r.side !== 'VISMIN'));
    const w = weekInfo(dateKey);

    function section(label, clusters, cls) {
      let h = '<div class="pr-side ' + cls + '"><h3 class="pr-side-title">' + label + '</h3>';
      if (!clusters.length) {
        h += '<p class="section-note">No problem encountered recorded.</p></div>';
        return h;
      }
      clusters.forEach((c, i) => {
        const taskHint = c.sampleTaskIds.length
          ? ' (' + c.sampleTaskIds.join(', ') + (c.count > c.sampleTaskIds.length ? ', …' : '') + ')'
          : '';
        const head = c.title + ' (' + c.region + ') – ' + c.count + taskHint;
        const itemCls = c.isBreakdown ? 'pr-item pr-breakdown' : 'pr-item';
        h += '<div class="' + itemCls + '">';
        h += '<div class="pr-item-title">' + (i + 1) + '. <span class="pr-highlight' +
          (c.isBreakdown ? ' pr-highlight-red' : '') + '">' +
          escapeHtml(head) + '</span>' +
          (c.isBreakdown ? ' <span class="pr-badge-breakdown">TRUCK BREAKDOWN</span>' : '') +
          '</div>';
        h += '<p class="pr-narrative">' + escapeHtml(c.summary) + '</p>';
        h += '<div class="pr-detail"><table class="pr-detail-table"><thead><tr>' +
          '<th>Task ID</th><th>Route</th><th>Trucker</th><th>Actual TT</th><th>Plan TT</th><th>Overrun</th>' +
          '</tr></thead><tbody>';
        c.items.forEach(it => {
          h += '<tr>' +
            '<td>' + escapeHtml(it.taskId || '—') + '</td>' +
            '<td>' + escapeHtml(it.route || it.taskName || '—') + '</td>' +
            '<td>' + escapeHtml(it.trucker || '—') + '</td>' +
            '<td>' + fmtNum(it.actual) + '</td>' +
            '<td>' + fmtNum(it.planned) + '</td>' +
            '<td class="neg">' + (it.overrun > 0 ? '+' + fmtNum(it.overrun) : '—') + '</td>' +
            '</tr>';
        });
        h += '</tbody></table></div></div>';
      });
      h += '</div>';
      return h;
    }

    let html = '<div class="pr-report">';
    html += '<div class="pr-header">';
    html += '<h2>Daily Problem Encountered</h2>';
    if (w) html += '<div class="pr-week">' + escapeHtml(w.headerLabel) + '</div>';
    html += '<div class="pr-date">' + escapeHtml(formatDateLong(dateKey)) + '</div>';
    html += '<div class="pr-stats">' + dayRows.length + ' issue(s) · Luzon ' +
      dayRows.filter(r => r.side === 'LUZON').length + ' · VisMin ' +
      dayRows.filter(r => r.side === 'VISMIN').length + '</div>';
    html += '</div>';
    html += section('LUZON ROUTE', luzon, 'pr-luzon');
    html += section('VISMIN ROUTE', vismin, 'pr-vismin');
    if (other.length) html += section('OTHER', other, 'pr-other');
    html += '</div>';
    return html;
  }

  function renderWeeklyHtml(weekId) {
    let all = enrichAll(getRows()).filter(r => r.hasIssue);
    all = filterByRegion(all);
    const weeks = listWeeks(getDates());
    let w = weeks.find(x => x.id === weekId) || weeks[0];
    if (!w) {
      return '<p class="section-note">No weeks available. Upload Delay Reason data first.</p>';
    }
    const range = all.filter(r => r.dateKey >= w.startKey && r.dateKey <= w.endKey);
    if (!range.length) {
      return '<p class="section-note">No issues in ' + escapeHtml(w.label) + '.</p>';
    }
    const luzon = buildWeeklyClusters(range.filter(r => r.side === 'LUZON'));
    const vismin = buildWeeklyClusters(range.filter(r => r.side === 'VISMIN'));

    function section(label, clusters, cls) {
      let h = '<div class="pr-side ' + cls + '"><h3 class="pr-side-title">' + label + '</h3>';
      if (!clusters.length) {
        h += '<p class="section-note">No problem encountered this week.</p></div>';
        return h;
      }
      clusters.forEach((c, i) => {
        const head = c.title + ' (' + (c.region || 'OTHER') + ') – ' + c.count;
        const wCls = c.isBreakdown ? 'pr-item pr-breakdown' : 'pr-item';
        h += '<div class="' + wCls + '">';
        h += '<div class="pr-item-title">' + (i + 1) + '. <span class="pr-highlight' +
          (c.isBreakdown ? ' pr-highlight-red' : '') + '">' +
          escapeHtml(head) + '</span>' +
          ' <span class="pr-count">' + c.count + '× this week</span>' +
          (c.isBreakdown ? ' <span class="pr-badge-breakdown">TRUCK BREAKDOWN</span>' : '') +
          '</div>';
        h += '<p class="pr-narrative">' + escapeHtml(c.summary) + '</p>';
        if (c.daysHit && c.daysHit.length) {
          h += '<div class="pr-meta"><span class="pr-chip">Days: ' +
            escapeHtml(c.daysHit.join(', ')) + '</span></div>';
        }
        h += '</div>';
      });
      h += '</div>';
      return h;
    }

    let html = '<div class="pr-report">';
    html += '<div class="pr-header">';
    html += '<h2>Weekly Problem Encountered</h2>';
    html += '<div class="pr-week">' + escapeHtml(w.headerLabel) + '</div>';
    html += '<div class="pr-date">' + escapeHtml(w.label) + ' · ' +
      escapeHtml(w.startKey) + ' → ' + escapeHtml(w.endKey) + '</div>';
    html += '<div class="pr-stats"><strong>' + range.length + '</strong> issue(s) · Luzon ' +
      range.filter(r => r.side === 'LUZON').length + ' · VisMin ' +
      range.filter(r => r.side === 'VISMIN').length +
      ' · similar issues combined</div>';
    html += '</div>';
    html += section('LUZON ROUTE', luzon, 'pr-luzon');
    html += section('VISMIN ROUTE', vismin, 'pr-vismin');
    html += '</div>';
    return html;
  }


  /* ---------- Region multi-select filter ---------- */
  let selectedRegions = null; // null = all; Set of region codes when filtered

  function collectAvailableRegions() {
    const rows = enrichAll(getRows());
    const set = {};
    rows.forEach(r => {
      const reg = (r.region || '').trim();
      if (reg) set[reg] = true;
    });
    // Prefer official order, then any extras
    const ordered = [];
    OFFICIAL_REGIONS.forEach(r => { if (set[r]) ordered.push(r); });
    Object.keys(set).sort().forEach(r => {
      if (ordered.indexOf(r) < 0) ordered.push(r);
    });
    return ordered;
  }

  function getSelectedRegions() {
    // null or empty Set treated as "all"
    if (selectedRegions == null) return null;
    if (selectedRegions.size === 0) return null;
    return selectedRegions;
  }

  function filterByRegion(rows) {
    const sel = getSelectedRegions();
    if (!sel) return rows;
    return rows.filter(r => sel.has(String(r.region || '').toUpperCase()) || sel.has(String(r.region || '')));
  }

  function updateRegionToggleLabel() {
    const btn = document.getElementById('prRegionToggle');
    if (!btn) return;
    const avail = collectAvailableRegions();
    const sel = getSelectedRegions();
    if (!sel || sel.size === 0 || sel.size >= avail.length) {
      btn.textContent = 'All regions ▾';
    } else if (sel.size === 1) {
      btn.textContent = [...sel][0] + ' ▾';
    } else {
      btn.textContent = sel.size + ' regions ▾';
    }
  }

  function buildRegionList() {
    const list = document.getElementById('prRegionList');
    if (!list) return;
    const avail = collectAvailableRegions();
    if (!avail.length) {
      list.innerHTML = '<span class="section-note">No regions yet — upload data first.</span>';
      return;
    }
    // Initialize selection to all if first time
    if (selectedRegions == null) {
      selectedRegions = new Set(avail);
    } else {
      // Drop regions no longer present; keep selection for still-available
      const next = new Set();
      avail.forEach(r => {
        if (selectedRegions.has(r) || selectedRegions.has(r.toUpperCase())) next.add(r);
      });
      // If user had nothing matching, default to all
      if (next.size === 0) avail.forEach(r => next.add(r));
      selectedRegions = next;
    }
    list.innerHTML = avail.map(r => {
      const checked = selectedRegions.has(r) ? ' checked' : '';
      return '<label><input type="checkbox" data-region="' + r + '"' + checked + '> ' + r + '</label>';
    }).join('');
    list.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        const reg = cb.getAttribute('data-region');
        if (cb.checked) selectedRegions.add(reg);
        else selectedRegions.delete(reg);
        updateRegionToggleLabel();
        render();
      });
    });
    updateRegionToggleLabel();
  }

  function initRegionFilter() {
    const toggle = document.getElementById('prRegionToggle');
    const panel = document.getElementById('prRegionPanel');
    const allBtn = document.getElementById('prRegionAll');
    const noneBtn = document.getElementById('prRegionNone');
    if (toggle && panel) {
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        panel.classList.toggle('hidden');
      });
      document.addEventListener('click', (e) => {
        const dd = document.getElementById('prRegionDd');
        if (dd && !dd.contains(e.target)) panel.classList.add('hidden');
      });
    }
    if (allBtn) {
      allBtn.addEventListener('click', () => {
        const avail = collectAvailableRegions();
        selectedRegions = new Set(avail);
        buildRegionList();
        render();
      });
    }
    if (noneBtn) {
      noneBtn.addEventListener('click', () => {
        selectedRegions = new Set();
        buildRegionList();
        render();
      });
    }
  }

    function fillSelects() {
    buildRegionList();
    const dates = getDates();
    const dateSel = document.getElementById('prSelectDate');
    const weekSel = document.getElementById('prSelectWeek');
    if (dateSel) {
      const prev = dateSel.value;
      dateSel.innerHTML = dates.map(d =>
        '<option value="' + d + '">' + d + '</option>').join('') ||
        '<option value="">No dates</option>';
      if (prev && dates.includes(prev)) dateSel.value = prev;
      else if (dates.length) dateSel.value = dates[dates.length - 1];
    }
    if (weekSel) {
      const weeks = listWeeks(dates);
      const prev = weekSel.value;
      weekSel.innerHTML = weeks.map(w =>
        '<option value="' + w.id + '">' + w.label + ' · ' +
        w.startKey.slice(5) + '–' + w.endKey.slice(5) + '</option>').join('') ||
        '<option value="">No weeks</option>';
      if (prev && weeks.some(w => w.id === prev)) weekSel.value = prev;
      else if (weeks.length) weekSel.value = weeks[0].id;
    }
  }

  function render() {
    const dailyEl = document.getElementById('prDailyView');
    const weeklyEl = document.getElementById('prWeeklyView');
    const dateSel = document.getElementById('prSelectDate');
    const weekSel = document.getElementById('prSelectWeek');
    fillSelects();
    const dateKey = dateSel ? dateSel.value : (getDates().slice(-1)[0] || '');
    const weekId = weekSel ? weekSel.value : '';
    if (dailyEl) dailyEl.innerHTML = dateKey
      ? renderDailyHtml(dateKey)
      : '<p class="section-note">Upload a file with a <strong>Delay Reason</strong> sheet first.</p>';
    if (weeklyEl) weeklyEl.innerHTML = weekId
      ? renderWeeklyHtml(weekId)
      : '<p class="section-note">Upload a file with a <strong>Delay Reason</strong> sheet first.</p>';
  }

  function init() {
    initRegionFilter();
    document.querySelectorAll('.pr-subtab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.pr-subtab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const view = tab.dataset.prView;
        const dailyWrap = document.getElementById('prDateFilterWrap');
        const weekWrap = document.getElementById('prWeekFilterWrap');
        if (dailyWrap) dailyWrap.style.display = view === 'weekly' ? 'none' : '';
        if (weekWrap) weekWrap.style.display = view === 'weekly' ? '' : 'none';
        const dailyEl = document.getElementById('prDailyView');
        const weeklyEl = document.getElementById('prWeeklyView');
        if (dailyEl) dailyEl.classList.toggle('hidden', view !== 'daily');
        if (weeklyEl) weeklyEl.classList.toggle('hidden', view !== 'weekly');
      });
    });
    const dateSel = document.getElementById('prSelectDate');
    if (dateSel) dateSel.addEventListener('change', render);
    const weekSel = document.getElementById('prSelectWeek');
    if (weekSel) weekSel.addEventListener('change', render);

    // Re-render when user opens this tab
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        if (tab.dataset.tab === 'tabProblemReport') setTimeout(render, 40);
      });
    });
  }

  return { init, render, fillSelects };
})();
