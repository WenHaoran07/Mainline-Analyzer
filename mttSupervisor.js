/* ==========================================================================
   MODULE: MTT SUPERVISOR PERFORMANCE
   Sheets: 3PL Supervisor · Luzon Own · Vismin Own · Luzon 3PL · Vismin 3PL

   - Supervisor in-charge is resolved by DC code + Own / Third party mapping
     from the "3PL Supervisor" sheet.
   - "3PL Supervisor" tab = ALL trips (Own + 3PL, Luzon + VisMin) attributed
     to each supervisor.
   - Luzon/Vismin Own & 3PL tabs show the same metrics with supervisor column.
   ========================================================================== */
const MttSupervisor = (() => {
  const SHEET_DEFS = [
    { id: '3plSup', keys: ['3pl supervisor'], label: '3PL Supervisor', kind: 'supervisorHub', target: 0.96 },
    { id: 'luzonOwn', keys: ['luzon own'], label: 'Luzon Own', kind: 'trips', target: 0.97, carrier: 'Own', scope: 'LUZON' },
    { id: 'visminOwn', keys: ['vismin own'], label: 'Vismin Own', kind: 'trips', target: 0.85, carrier: 'Own', scope: 'VISMIN' },
    { id: 'luzon3pl', keys: ['luzon 3pl'], label: 'Luzon 3PL', kind: 'trips', target: 0.97, carrier: 'Third party', scope: 'LUZON' },
    { id: 'vismin3pl', keys: ['vismin 3pl'], label: 'Vismin 3PL', kind: 'trips', target: 0.85, carrier: 'Third party', scope: 'VISMIN' }
  ];

  /** Official DC code → display name */
  const DC_NAME_MAP = {
    '490': 'Laguna DC1',
    '492': 'Laguna DC2',
    '430': 'Batangas DC1',
    '460': 'Cavite DC1',
    '9071': 'DW-Taytay 888',
    '907': 'DW-Taytay 888',
    '470': 'Lucena'
  };

  let activeId = 'overview';
  let pack = null;

  function pct(v, d) {
    if (v == null || isNaN(v)) return '—';
    return (v * 100).toFixed(d == null ? 2 : d) + '%';
  }

  function normalizeDcCode(raw) {
    if (raw == null || raw === '') return '';
    const s = String(raw).trim().replace(/\.0+$/, '');
    if (DC_NAME_MAP[s]) return s;
    const only = s.replace(/[^0-9]/g, '');
    // prefer 9071 over 907 when both possible
    if (only === '907' && DC_NAME_MAP['9071']) return '9071';
    return only || s;
  }

  function resolveDcName(codeOrName) {
    if (codeOrName == null || codeOrName === '') return '(blank)';
    const raw = String(codeOrName).trim();
    const code = normalizeDcCode(raw);
    if (DC_NAME_MAP[code]) return DC_NAME_MAP[code];
    if (DC_NAME_MAP[raw]) return DC_NAME_MAP[raw];
    return raw;
  }

  function normalizeCarrier(raw) {
    const s = String(raw || '').toLowerCase();
    if (!s) return '';
    if (s.includes('third') || s.includes('3pl') || s.includes('3 pl')) return 'Third party';
    if (s.includes('own')) return 'Own';
    return String(raw).trim();
  }

  /** Split dual supervisors e.g. "Cañon ..., Bongosia ..." */
  function expandSupervisorNames(raw) {
    const s = String(raw || '').trim();
    if (!s) return [];
    return s.split(/\s*,\s*|\s+&\s+|\s+and\s+/i).map(x => x.trim()).filter(Boolean);
  }

  function findSheetName(names, keys) {
    for (const k of keys) {
      const hit = names.find(n => String(n).toLowerCase().trim() === k);
      if (hit) return hit;
    }
    for (const k of keys) {
      const hit = names.find(n => String(n).toLowerCase().includes(k));
      if (hit) return hit;
    }
    return null;
  }

  function mapTripCols(headers) {
    const col = {};
    headers.forEach((h, i) => {
      const lower = String(h || '').toLowerCase().trim().replace(/\n/g, ' ');
      if (lower.includes('wether on time') || lower.includes('whether on time')) col.onTime = i;
      if (lower === 'route label') col.route = i;
      if (lower.includes('dc intended')) col.dc = i;
      if (lower === 'region') col.region = i;
      if (lower.includes('trucker name')) col.trucker = i;
      if (lower.includes('tasklist') || lower === 'task list') col.taskId = i;
      if (lower.includes('number plate') || lower === 'plate') col.plate = i;
      if (lower.includes('actual arrival') || lower.includes('check in')) col.arrival = i;
      if (lower === 'date') col.date = i;
      if (lower.includes('truck ownner') || lower.includes('carrier owner') || lower.includes('车辆归属')) col.owner = i;
      if (lower.includes('operating mode')) col.mode = i;
    });
    return col;
  }

  /**
   * Parse supervisor map from "3PL Supervisor" sheet:
   * Carrier · DEPARTURE DC · DC INTENDED · SUPERVISOR INCHARGE
   * Returns: { byCode: { '490': { Own: ['Trinos Marvin'], 'Third party': ['Cañon...','Bongosia...'] } } }
   */
  function parseSupervisorMap(aoa) {
    const byCode = {};
    let headerRow = -1;
    let iCarrier = -1, iDep = -1, iCode = -1, iSup = -1;

    for (let r = 0; r < Math.min(20, aoa.length); r++) {
      const row = aoa[r] || [];
      for (let c = 0; c < row.length; c++) {
        const v = String(row[c] || '').toLowerCase().replace(/\n/g, ' ');
        if (v.includes('supervisor incharge') || v === 'supervisor in charge') {
          headerRow = r;
          iSup = c;
        }
      }
      if (headerRow >= 0) {
        const row = aoa[headerRow] || [];
        for (let c = 0; c < row.length; c++) {
          const v = String(row[c] || '').toLowerCase().replace(/\n/g, ' ');
          if (v === 'carrier') iCarrier = c;
          if (v.includes('departure dc')) iDep = c;
          if (v.includes('dc intended')) iCode = c;
          if (v.includes('supervisor')) iSup = c;
        }
        break;
      }
    }

    if (headerRow < 0 || iSup < 0) return { byCode, flat: [] };

    const flat = [];
    for (let r = headerRow + 1; r < aoa.length; r++) {
      const row = aoa[r] || [];
      const supRaw = row[iSup];
      if (supRaw == null || String(supRaw).trim() === '') continue;
      if (String(supRaw).toLowerCase().includes('supervisor')) continue;
      const carrier = normalizeCarrier(iCarrier >= 0 ? row[iCarrier] : '');
      const code = normalizeDcCode(iCode >= 0 ? row[iCode] : '');
      const dep = iDep >= 0 ? String(row[iDep] || '').trim() : '';
      const names = expandSupervisorNames(supRaw);
      if (!code || !names.length) continue;

      if (!byCode[code]) byCode[code] = { Own: [], 'Third party': [], Any: [] };
      const bucket = carrier === 'Own' || carrier === 'Third party' ? carrier : 'Any';
      names.forEach(n => {
        if (!byCode[code][bucket].includes(n)) byCode[code][bucket].push(n);
        if (!byCode[code].Any.includes(n)) byCode[code].Any.push(n);
      });
      flat.push({
        carrier: carrier || 'Any',
        departureDc: dep,
        dcCode: code,
        dcName: resolveDcName(code),
        supervisor: names.join(', '),
        supervisors: names
      });
    }
    return { byCode, flat };
  }

  /** Resolve supervisor name(s) for a DC + carrier (Own / Third party) */
  function resolveSupervisors(dcCode, carrier, mapByCode) {
    const code = normalizeDcCode(dcCode);
    const m = mapByCode && mapByCode[code];
    if (!m) return ['Unassigned'];
    const kind = normalizeCarrier(carrier) || 'Any';
    let list = [];
    if (kind === 'Own' && m.Own && m.Own.length) list = m.Own;
    else if ((kind === 'Third party' || kind === '3pl') && m['Third party'] && m['Third party'].length) list = m['Third party'];
    else if (m.Any && m.Any.length) list = m.Any;
    else if (m.Own && m.Own.length) list = m.Own;
    else if (m['Third party'] && m['Third party'].length) list = m['Third party'];
    return list.length ? list : ['Unassigned'];
  }

  function parseTripSheet(aoa, carrierHint, mapByCode) {
    if (!aoa || !aoa.length) return { rows: [], byDc: [], bySupervisor: [], overall: null };
    const headers = (aoa[0] || []).map(h => (h == null ? '' : String(h)));
    const col = mapTripCols(headers);
    const parseDateKey = (typeof MttUtils !== 'undefined' && MttUtils.parseDateKey)
      ? MttUtils.parseDateKey
      : (v) => (v == null ? null : String(v).slice(0, 10));

    const rows = [];
    for (let i = 1; i < aoa.length; i++) {
      const r = aoa[i] || [];
      const onTime = String(col.onTime != null ? r[col.onTime] : '').toUpperCase().trim();
      if (onTime !== 'YES' && onTime !== 'NO') continue;
      const dcRaw = String(col.dc != null ? r[col.dc] : '').trim();
      const dcCode = normalizeDcCode(dcRaw);
      const carrier = carrierHint || normalizeCarrier(col.owner != null ? r[col.owner] : '');
      const supervisors = resolveSupervisors(dcCode, carrier, mapByCode);
      const arrivalVal = (col.arrival != null ? r[col.arrival] : null) ?? (col.date != null ? r[col.date] : null);
      rows.push({
        onTime,
        dc: resolveDcName(dcCode || dcRaw),
        code: dcCode || dcRaw,
        carrier: carrier || '',
        supervisors,
        supervisor: supervisors.join(', '),
        region: String(col.region != null ? r[col.region] : '').trim(),
        route: String(col.route != null ? r[col.route] : '').trim(),
        trucker: String(col.trucker != null ? r[col.trucker] : '').trim(),
        taskId: String(col.taskId != null ? r[col.taskId] : '').trim(),
        plate: String(col.plate != null ? r[col.plate] : '').trim(),
        dateKey: parseDateKey(arrivalVal)
      });
    }

    return {
      rows,
      byDc: aggregateByDc(rows),
      bySupervisor: aggregateBySupervisor(rows),
      overall: summarize(rows)
    };
  }

  function summarize(rows) {
    let yes = 0, no = 0;
    rows.forEach(r => { if (r.onTime === 'YES') yes++; else no++; });
    const total = yes + no;
    return { total, followed: yes, notFollowed: no, rate: total ? yes / total : null };
  }

  function aggregateByDc(rows) {
    const map = new Map();
    rows.forEach(r => {
      const key = r.code || r.dc;
      if (!map.has(key)) {
        map.set(key, {
          dc: r.dc,
          code: r.code || '',
          supervisor: r.supervisor || '',
          total: 0,
          followed: 0,
          notFollowed: 0
        });
      }
      const c = map.get(key);
      c.total++;
      if (r.onTime === 'YES') c.followed++; else c.notFollowed++;
      if (!c.supervisor && r.supervisor) c.supervisor = r.supervisor;
    });
    return [...map.values()].map(c => {
      c.rate = c.total ? c.followed / c.total : null;
      return c;
    }).sort((a, b) => b.total - a.total || String(a.dc).localeCompare(String(b.dc)));
  }

  /** Dual supervisors each get full credit for the trip (WFD style) */
  function aggregateBySupervisor(rows) {
    const map = new Map();
    rows.forEach(r => {
      const names = (r.supervisors && r.supervisors.length) ? r.supervisors : [r.supervisor || 'Unassigned'];
      names.forEach(name => {
        if (!map.has(name)) map.set(name, { supervisor: name, total: 0, followed: 0, notFollowed: 0 });
        const c = map.get(name);
        c.total++;
        if (r.onTime === 'YES') c.followed++; else c.notFollowed++;
      });
    });
    return [...map.values()].map(c => {
      c.rate = c.total ? c.followed / c.total : null;
      return c;
    }).sort((a, b) => b.total - a.total || String(a.supervisor).localeCompare(String(b.supervisor)));
  }

  function ingestWorkbook(workbook) {
    const names = workbook.SheetNames || [];
    const sheets = {};

    // 1) Supervisor map from 3PL Supervisor sheet
    const supSheetName = findSheetName(names, ['3pl supervisor']);
    let mapByCode = {};
    let mapFlat = [];
    if (supSheetName) {
      const aoaMap = XLSX.utils.sheet_to_json(workbook.Sheets[supSheetName], { header: 1, defval: null, raw: true });
      const parsed = parseSupervisorMap(aoaMap);
      mapByCode = parsed.byCode;
      mapFlat = parsed.flat;
    }

    // 2) Trip sheets
    const tripBuckets = [];
    SHEET_DEFS.forEach(def => {
      if (def.kind !== 'trips') return;
      const sn = findSheetName(names, def.keys);
      if (!sn) {
        sheets[def.id] = { id: def.id, label: def.label, missing: true, target: def.target };
        return;
      }
      const aoa = XLSX.utils.sheet_to_json(workbook.Sheets[sn], { header: 1, defval: null, raw: true });
      const parsed = parseTripSheet(aoa, def.carrier, mapByCode);
      sheets[def.id] = {
        id: def.id,
        label: def.label,
        sheetName: sn,
        kind: 'trips',
        target: def.target,
        carrier: def.carrier,
        overall: parsed.overall,
        byDc: parsed.byDc,
        bySupervisor: parsed.bySupervisor,
        rows: parsed.rows,
        rowCount: parsed.rows.length
      };
      tripBuckets.push(parsed.rows);
    });

    // 3) 3PL Supervisor hub = ALL trips (Own + 3PL, Luzon + VisMin)
    const allRows = [].concat.apply([], tripBuckets);
    sheets['3plSup'] = {
      id: '3plSup',
      label: '3PL Supervisor',
      sheetName: supSheetName || '',
      kind: 'supervisorHub',
      target: 0.96,
      overall: summarize(allRows),
      byDc: aggregateByDc(allRows),
      bySupervisor: aggregateBySupervisor(allRows),
      rows: allRows,
      rowCount: allRows.length,
      missing: allRows.length === 0 && !supSheetName
    };

    pack = { sheets, mapByCode, mapFlat };
    return pack;
  }

  function metricCards(overall, target, label) {
    if (!overall || !overall.total) {
      return '<div class="sup-empty">No rows in this sheet.</div>';
    }
    const hit = overall.rate != null && target != null && overall.rate >= target;
    const gap = (overall.rate != null && target != null) ? ((overall.rate - target) * 100) : null;
    const gapTxt = gap == null ? '' :
      ('<span class="sup-gap ' + (gap >= 0 ? 'up' : 'down') + '">' +
        (gap >= 0 ? '+' : '') + gap.toFixed(2) + ' pp vs target</span>');

    return '<div class="sup-detail-hero">' +
      '<div class="sup-detail-hero-left">' +
        '<div class="sup-detail-kicker">' + (label || 'Performance') + '</div>' +
        '<div class="sup-detail-rate ' + (hit ? 'ok' : 'bad') + '">' + pct(overall.rate) + '</div>' +
        '<div class="sup-detail-target">Target ' + pct(target, 0) + ' ' + gapTxt + '</div>' +
      '</div>' +
      '<div class="sup-metrics">' +
        '<div class="sup-metric">' +
          '<div class="sup-metric-ico">📦</div>' +
          '<div><div class="lbl">Total Arrival</div><div class="val">' + overall.total.toLocaleString() + '</div></div>' +
        '</div>' +
        '<div class="sup-metric ok">' +
          '<div class="sup-metric-ico">✓</div>' +
          '<div><div class="lbl">Followed Plan TT</div><div class="val">' + overall.followed.toLocaleString() + '</div></div>' +
        '</div>' +
        '<div class="sup-metric ' + (overall.notFollowed ? 'bad' : 'ok') + '">' +
          '<div class="sup-metric-ico">✕</div>' +
          '<div><div class="lbl">Not Followed</div><div class="val">' + overall.notFollowed.toLocaleString() + '</div></div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function dcTable(byDc, target, showSupervisor) {
    if (!byDc || !byDc.length) {
      return '<p class="section-note">No DC breakdown available.</p>';
    }
    let h = '<div class="table-scroll sup-dc-scroll"><table class="sup-dc-table"><thead><tr>' +
      '<th>DC Name</th>' +
      (showSupervisor ? '<th>Supervisor In-charge</th>' : '') +
      '<th>Total Arrival</th><th>Followed</th><th>Not Followed</th><th>Target</th><th>Rate</th>' +
      '</tr></thead><tbody>';

    byDc.forEach(r => {
      const tgt = r.target != null ? r.target : target;
      const rate = r.rate;
      const hit = rate != null && tgt != null && rate >= tgt;
      const dcLabel = resolveDcName(r.code || r.dc);
      const codeBadge = normalizeDcCode(r.code || r.dc);
      const showCode = codeBadge && DC_NAME_MAP[codeBadge];
      h += '<tr>' +
        '<td class="sup-dc-name"><strong>' + (dcLabel || r.dc || '') + '</strong>' +
        (showCode ? ' <span class="sup-code">' + codeBadge + '</span>' : '') + '</td>' +
        (showSupervisor ? '<td class="sup-name-cell">' + (r.supervisor || '—') + '</td>' : '') +
        '<td>' + (r.total || 0).toLocaleString() + '</td>' +
        '<td class="pos">' + (r.followed || 0).toLocaleString() + '</td>' +
        '<td class="' + (r.notFollowed ? 'neg' : '') + '">' + (r.notFollowed || 0).toLocaleString() + '</td>' +
        '<td>' + pct(tgt, 0) + '</td>' +
        '<td class="' + (hit ? 'cell-ok' : 'cell-warn') + '"><strong>' + pct(rate) + '</strong></td>' +
        '</tr>';
    });
    h += '</tbody></table></div>';
    return h;
  }

  function supervisorTable(bySupervisor, target) {
    if (!bySupervisor || !bySupervisor.length) {
      return '<p class="section-note">No supervisor breakdown. Check DC → supervisor mapping on the 3PL Supervisor sheet.</p>';
    }
    let h = '<div class="table-scroll sup-dc-scroll"><table class="sup-dc-table"><thead><tr>' +
      '<th>Supervisor In-charge</th>' +
      '<th>Total Arrival</th><th>Followed</th><th>Not Followed</th><th>Target</th><th>Rate</th>' +
      '</tr></thead><tbody>';

    bySupervisor.forEach(r => {
      const tgt = target;
      const hit = r.rate != null && tgt != null && r.rate >= tgt;
      h += '<tr>' +
        '<td class="sup-dc-name"><strong>' + (r.supervisor || '—') + '</strong></td>' +
        '<td>' + (r.total || 0).toLocaleString() + '</td>' +
        '<td class="pos">' + (r.followed || 0).toLocaleString() + '</td>' +
        '<td class="' + (r.notFollowed ? 'neg' : '') + '">' + (r.notFollowed || 0).toLocaleString() + '</td>' +
        '<td>' + pct(tgt, 0) + '</td>' +
        '<td class="' + (hit ? 'cell-ok' : 'cell-warn') + '"><strong>' + pct(r.rate) + '</strong></td>' +
        '</tr>';
    });
    h += '</tbody></table></div>';
    return h;
  }

  function renderOverview() {
    if (!pack) {
      return '<div class="sup-empty-state">' +
        '<div class="sup-empty-ico">👤</div>' +
        '<div class="sup-empty-title">No supervisor sheets loaded</div>' +
        '<p>Upload a Mainline workbook that includes <strong>3PL Supervisor</strong>, <strong>Luzon Own</strong>, <strong>Vismin Own</strong>, <strong>Luzon 3PL</strong>, and <strong>Vismin 3PL</strong>.</p>' +
        '</div>';
    }

    let h = '<div class="sup-overview-intro">' +
      '</div>';
    h += '<div class="sup-overview-grid">';

    SHEET_DEFS.forEach(def => {
      const s = pack.sheets[def.id];
      if (!s || s.missing) {
        h += '<div class="sup-overview-card is-missing">' +
          '<div class="sup-ov-top"><span class="sup-ov-title">' + def.label + '</span>' +
          '<span class="sup-badge muted">Missing</span></div>' +
          '<div class="sup-ov-miss">Sheet not found in file</div></div>';
        return;
      }
      const o = s.overall || {};
      const hit = o.rate != null && s.target != null && o.rate >= s.target;
      const gap = (o.rate != null && s.target != null) ? (o.rate - s.target) * 100 : null;
      h += '<button type="button" class="sup-overview-card ' + (hit ? 'is-ok' : 'is-bad') + '" data-sup-goto="' + def.id + '">' +
        '<div class="sup-ov-top">' +
          '<span class="sup-ov-title">' + def.label + '</span>' +
          '<span class="sup-badge ' + (hit ? 'ok' : 'bad') + '">' + (hit ? 'On target' : 'Below target') + '</span>' +
        '</div>' +
        '<div class="sup-ov-rate ' + (hit ? 'ok' : 'bad') + '">' + pct(o.rate) + '</div>' +
        (s.target != null
          ? ('<div class="sup-ov-tgt">Target ' + pct(s.target, 0) +
            (gap != null ? (' · <span class="' + (gap >= 0 ? 'up' : 'down') + '">' +
              (gap >= 0 ? '+' : '') + gap.toFixed(2) + ' pp</span>') : '') +
            '</div>')
          : '') +
        '<div class="sup-ov-stats">' +
          '<div class="sup-ov-stat"><span class="k">Total</span><span class="v">' + (o.total || 0).toLocaleString() + '</span></div>' +
          '<div class="sup-ov-stat"><span class="k">Followed</span><span class="v pos">' + (o.followed || 0).toLocaleString() + '</span></div>' +
          '<div class="sup-ov-stat"><span class="k">Not followed</span><span class="v ' + (o.notFollowed ? 'neg' : '') + '">' + (o.notFollowed || 0).toLocaleString() + '</span></div>' +
        '</div>' +
        '<div class="sup-ov-cta">View breakdown →</div>' +
        '</button>';
    });
    h += '</div>';
    return h;
  }

  function renderSheet(id) {
    if (!pack || !pack.sheets[id]) {
      return '<p class="section-note">Sheet not loaded.</p>';
    }
    const s = pack.sheets[id];
    if (s.missing) {
      return '<p class="section-note">Sheet <strong>' + s.label + '</strong> was not found in the uploaded workbook.</p>';
    }
    let h = '';
    h += metricCards(s.overall, s.target, s.label);

    if (id === '3plSup') {
      h += '<div class="sup-section-bar"><h3 class="sup-section-title">By Supervisor In-charge</h3>' +
        '<span class="sup-section-hint">All Own + 3PL trips · dual names each get credit</span></div>';
      h += supervisorTable(s.bySupervisor, s.target);
      h += '<div class="sup-section-bar"><h3 class="sup-section-title">By DC Intended</h3></div>';
      h += dcTable(s.byDc, s.target, true);
    } else {
      h += '<div class="sup-section-bar"><h3 class="sup-section-title">By DC Intended</h3>' +
        '<span class="sup-section-hint">Supervisor from DC + ' + (s.carrier || 'fleet') + ' mapping</span></div>';
      h += dcTable(s.byDc, s.target, true);
      if (s.bySupervisor && s.bySupervisor.length) {
        h += '<div class="sup-section-bar"><h3 class="sup-section-title">By Supervisor In-charge</h3></div>';
        h += supervisorTable(s.bySupervisor, s.target);
      }
    }

    if (pack.mapFlat && pack.mapFlat.length && id === '3plSup') {
      h += '<div class="sup-section-bar"><h3 class="sup-section-title">DC → Supervisor mapping</h3></div>';
      h += '<div class="table-scroll sup-dc-scroll"><table class="sup-dc-table"><thead><tr>' +
        '<th>Carrier</th><th>DC Name</th><th>DC Code</th><th>Supervisor In-charge</th></tr></thead><tbody>';
      pack.mapFlat.forEach(m => {
        h += '<tr><td>' + (m.carrier || '—') + '</td><td>' + (m.dcName || m.departureDc || '—') +
          '</td><td><span class="sup-code">' + (m.dcCode || '—') + '</span></td><td class="sup-name-cell"><strong>' +
          (m.supervisor || '—') + '</strong></td></tr>';
      });
      h += '</tbody></table></div>';
    }
    return h;
  }

  function render() {
    const host = document.getElementById('mttSupView');
    if (!host) return;

    if (!pack && typeof MttFileProcessor !== 'undefined') {
      const st = MttFileProcessor.getState();
      if (st.supervisorPack) pack = st.supervisorPack;
    }

    host.innerHTML = activeId === 'overview' ? renderOverview() : renderSheet(activeId);

    host.querySelectorAll('[data-sup-goto]').forEach(btn => {
      btn.addEventListener('click', () => setActive(btn.getAttribute('data-sup-goto')));
    });
  }

  function setActive(id) {
    activeId = id || 'overview';
    document.querySelectorAll('.mtt-sup-subtab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.supSheet === activeId);
    });
    render();
  }

  function onDataReady() {
    if (typeof MttFileProcessor !== 'undefined') {
      const st = MttFileProcessor.getState();
      if (st.supervisorPack) pack = st.supervisorPack;
    }
    render();
  }

  function init() {
    document.querySelectorAll('.mtt-sup-subtab').forEach(btn => {
      btn.addEventListener('click', () => setActive(btn.dataset.supSheet));
    });
  }

  return { init, render, onDataReady, ingestWorkbook, setActive };
})();
