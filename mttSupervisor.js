/* ==========================================================================
   MODULE: MTT SUPERVISOR PERFORMANCE
   DATA only · Own = SELU/SWL · rest = Third party
   Supervisor names = fixed DC + Carrier map (only mapped DCs are counted)
   Supervisor tab = all mapped trips · other tabs = route + fleet slice
   ========================================================================== */
const MttSupervisor = (() => {
  const SHEET_DEFS = [
    { id: '3plSup', label: 'Supervisor', kind: 'supervisorHub', target: 0.96 },
    { id: 'luzonOwn', label: 'Luzon Own', kind: 'trips', target: 0.97, carrier: 'Own', scope: 'LUZON' },
    { id: 'visminOwn', label: 'Vismin Own', kind: 'trips', target: 0.85, carrier: 'Own', scope: 'VISMIN' },
    { id: 'luzon3pl', label: 'Luzon 3PL', kind: 'trips', target: 0.97, carrier: 'Third party', scope: 'LUZON' },
    { id: 'vismin3pl', label: 'Vismin 3PL', kind: 'trips', target: 0.85, carrier: 'Third party', scope: 'VISMIN' }
  ];

  const DC_NAME_MAP = {
    '490': 'Laguna DC1', '492': 'Laguna DC2', '430': 'Batangas DC1',
    '460': 'Cavite DC1', '9071': 'DW-Taytay 888', '907': 'DW-Taytay 888', '470': 'Lucena'
  };

  const SUPERVISOR_MAP = {
    '490': { 'Own': ['Trinos Marvin'], 'Third party': ['Cañon Christopher John', 'Bongosia Katrina'] },
    '492': { 'Own': ['Hajan Haber'], 'Third party': ['Hajan Haber'] },
    '430': { 'Own': ['Lizardo Dennis'], 'Third party': ['Lizardo Dennis'] },
    '460': { 'Own': ['Caranguian Julius'], 'Third party': ['Caranguian Julius'] },
    '9071': { 'Own': ['Reanzares Eddrian'], 'Third party': ['Reanzares Eddrian'] },
    '907': { 'Own': ['Reanzares Eddrian'], 'Third party': ['Reanzares Eddrian'] },
    '470': { 'Own': ['Tagsa Jeffrey'], 'Third party': ['Tagsa Jeffrey'] }
  };

  let activeId = 'overview';
  let pack = null;
  let periodMode = 'all';
  let periodKey = '';

  function pct(v, d) {
    if (v == null || isNaN(v)) return '—';
    return (v * 100).toFixed(d == null ? 2 : d) + '%';
  }
  function weekKey(dateKey) {
    return (typeof MttUtils !== 'undefined' && MttUtils.weekKey) ? MttUtils.weekKey(dateKey) : null;
  }
  function weekNum(dateKey) {
    return (typeof MttUtils !== 'undefined' && MttUtils.excelWeekNum) ? MttUtils.excelWeekNum(dateKey) : null;
  }
  function monthKey(d) { return d ? String(d).slice(0, 7) : null; }

  function resolveDcCode(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    const digits = s.replace(/\.0+$/, '').replace(/[^0-9]/g, '');
    if (digits && SUPERVISOR_MAP[digits]) return digits;
    if (SUPERVISOR_MAP[s]) return s;
    const up = s.toUpperCase().replace(/\s+/g, '');
    for (const code of Object.keys(DC_NAME_MAP)) {
      const nm = DC_NAME_MAP[code].toUpperCase().replace(/\s+/g, '');
      if (up === nm || up.indexOf(nm) >= 0 || nm.indexOf(up) >= 0) return code;
    }
    return '';
  }

  function resolveDcName(code) {
    if (code && DC_NAME_MAP[code]) return DC_NAME_MAP[code];
    return code || '(blank)';
  }

  function classifyCarrier(trucker) {
    const t = String(trucker || '').toUpperCase().replace(/\s+/g, '');
    if (t === 'SELU' || t === 'SWL' || t.indexOf('SELU') >= 0 || t.indexOf('SWL') >= 0) return 'Own';
    return 'Third party';
  }

  function resolveSupervisors(dcCode, carrier) {
    const m = SUPERVISOR_MAP[dcCode];
    if (!m) return null; // unmapped — skip
    const key = carrier === 'Own' ? 'Own' : 'Third party';
    const list = (m[key] && m[key].length) ? m[key] : null;
    return list ? list.slice() : null;
  }

  function dataRows() {
    if (typeof MttFileProcessor === 'undefined') return [];
    return MttFileProcessor.getState().storedRows || [];
  }

  /**
   * Only trips with:
   *  - valid mapped DC in SUPERVISOR_MAP
   *  - route type LUZON or VISMIN
   * Supervisor from map only (not free-text DATA column)
   */
  function normalizeFromData() {
    const out = [];
    dataRows().forEach(function (r) {
      const routeType = r.routeType;
      if (routeType !== 'LUZON' && routeType !== 'VISMIN') return;

      const code = resolveDcCode(r.dcIntended);
      if (!code || !SUPERVISOR_MAP[code]) return; // not in supervisor table → skip

      const carrier = classifyCarrier(r.trucker);
      const supervisors = resolveSupervisors(code, carrier);
      if (!supervisors || !supervisors.length) return;

      out.push({
        dateKey: r.dateKey,
        onTime: String(r.onTime || '').toUpperCase() === 'YES' ? 'YES' : 'NO',
        dc: resolveDcName(code),
        code: code,
        carrier: carrier,
        supervisors: supervisors,
        supervisor: supervisors.join(', '),
        region: r.region || '',
        route: r.route || '',
        routeType: routeType,
        trucker: r.trucker || '',
        taskId: r.taskId || '',
        plate: r.plate || ''
      });
    });
    return out.filter(function (r) { return !!r.dateKey; });
  }

  function filterScopeCarrier(list, scope, carrier) {
    return list.filter(function (r) {
      if (scope === 'LUZON' && r.routeType !== 'LUZON') return false;
      if (scope === 'VISMIN' && r.routeType !== 'VISMIN') return false;
      if (carrier && r.carrier !== carrier) return false;
      return true;
    });
  }

  function summarize(rows) {
    let yes = 0, no = 0;
    rows.forEach(function (r) { if (r.onTime === 'YES') yes++; else no++; });
    const total = yes + no;
    return { total: total, followed: yes, notFollowed: no, rate: total ? yes / total : null };
  }

  function aggregateByDc(rows) {
    const map = new Map();
    rows.forEach(function (r) {
      const key = r.code || r.dc;
      if (!map.has(key)) {
        map.set(key, {
          dc: r.dc, code: r.code || '', supervisor: r.supervisor || '',
          total: 0, followed: 0, notFollowed: 0
        });
      }
      const c = map.get(key);
      c.total++;
      if (r.onTime === 'YES') c.followed++; else c.notFollowed++;
      if (!c.supervisor && r.supervisor) c.supervisor = r.supervisor;
    });
    return [...map.values()].map(function (c) {
      c.rate = c.total ? c.followed / c.total : null;
      return c;
    }).sort(function (a, b) {
      return b.total - a.total || String(a.dc).localeCompare(String(b.dc));
    });
  }

  /** Dual supervisors each get full credit (by-supervisor table only) */
  function aggregateBySupervisor(rows) {
    const map = new Map();
    rows.forEach(function (r) {
      const names = (r.supervisors && r.supervisors.length)
        ? r.supervisors : [r.supervisor || 'Unassigned'];
      names.forEach(function (name) {
        if (!map.has(name)) {
          map.set(name, { supervisor: name, total: 0, followed: 0, notFollowed: 0 });
        }
        const c = map.get(name);
        c.total++;
        if (r.onTime === 'YES') c.followed++; else c.notFollowed++;
      });
    });
    return [...map.values()].map(function (c) {
      c.rate = c.total ? c.followed / c.total : null;
      return c;
    }).sort(function (a, b) {
      return b.total - a.total || String(a.supervisor).localeCompare(String(b.supervisor));
    });
  }

  function buildPackFromData() {
    const all = normalizeFromData();
    if (!all.length) return null;
    const sheets = {};
    SHEET_DEFS.forEach(function (def) {
      const rows = def.kind === 'supervisorHub'
        ? all.slice()
        : filterScopeCarrier(all, def.scope, def.carrier);
      sheets[def.id] = {
        id: def.id,
        label: def.label,
        kind: def.kind,
        target: def.target,
        carrier: def.carrier || '',
        scope: def.scope || '',
        rows: rows,
        byDc: aggregateByDc(rows),
        bySupervisor: aggregateBySupervisor(rows),
        overall: summarize(rows),
        missing: false
      };
    });
    return { source: 'DATA', sheets: sheets, totalRows: all.length };
  }

  function ingestWorkbook() {
    pack = buildPackFromData();
    return pack;
  }

  function allDateKeysFromPack() {
    if (!pack || !pack.sheets) return [];
    const set = new Set();
    Object.keys(pack.sheets).forEach(function (id) {
      (pack.sheets[id].rows || []).forEach(function (r) {
        if (r.dateKey) set.add(r.dateKey);
      });
    });
    return [...set].sort();
  }

  function availableWeeks() {
    const map = new Map();
    allDateKeysFromPack().forEach(function (dk) {
      const wk = weekKey(dk);
      if (!wk) return;
      if (!map.has(wk)) {
        const wn = weekNum(dk);
        map.set(wk, { key: wk, label: (wn != null ? ('WK ' + wn) : wk) });
      }
    });
    return [...map.entries()].sort(function (a, b) { return a[0].localeCompare(b[0]); })
      .map(function (e) { return e[1]; });
  }

  function availableMonths() {
    const set = new Map();
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    allDateKeysFromPack().forEach(function (dk) {
      const mk = monthKey(dk);
      if (!mk) return;
      const parts = mk.split('-');
      set.set(mk, months[parseInt(parts[1], 10) - 1] + ' ' + parts[0]);
    });
    return [...set.entries()].sort(function (a, b) { return a[0].localeCompare(b[0]); })
      .map(function (e) { return { key: e[0], label: e[1] }; });
  }

  function filterRowsByPeriod(rows) {
    if (!rows || !rows.length) return [];
    if (periodMode === 'all' || !periodKey) return rows;
    if (periodMode === 'week') return rows.filter(function (r) { return weekKey(r.dateKey) === periodKey; });
    if (periodMode === 'month') return rows.filter(function (r) { return monthKey(r.dateKey) === periodKey; });
    return rows;
  }

  function sheetView(id) {
    if (!pack || !pack.sheets[id]) return null;
    const s = pack.sheets[id];
    const rows = filterRowsByPeriod(s.rows || []);
    return {
      id: s.id, label: s.label, kind: s.kind, target: s.target,
      carrier: s.carrier, scope: s.scope,
      overall: summarize(rows),
      byDc: aggregateByDc(rows),
      bySupervisor: aggregateBySupervisor(rows),
      rows: rows, rowCount: rows.length, missing: false
    };
  }

  function periodLabel() {
    if (periodMode === 'all' || !periodKey) return 'All dates';
    if (periodMode === 'week') {
      const w = availableWeeks().find(function (x) { return x.key === periodKey; });
      return w ? w.label : periodKey;
    }
    if (periodMode === 'month') {
      const m = availableMonths().find(function (x) { return x.key === periodKey; });
      return m ? m.label : periodKey;
    }
    return periodKey;
  }

  function syncPeriodSelects() {
    const modeSel = document.getElementById('supPeriodMode');
    const weekSel = document.getElementById('supPeriodWeek');
    const monthSel = document.getElementById('supPeriodMonth');
    const weekWrap = document.getElementById('supPeriodWeekWrap');
    const monthWrap = document.getElementById('supPeriodMonthWrap');
    const badge = document.getElementById('supPeriodBadge');

    if (modeSel) modeSel.value = periodMode;
    if (weekSel) {
      const weeks = availableWeeks();
      const cur = weekSel.value;
      weekSel.innerHTML = weeks.length
        ? weeks.map(function (w) { return '<option value="' + w.key + '">' + w.label + '</option>'; }).join('')
        : '<option value="">No weeks</option>';
      if (periodMode === 'week' && periodKey && weeks.some(function (w) { return w.key === periodKey; })) weekSel.value = periodKey;
      else if (weeks.length) {
        if (weeks.some(function (w) { return w.key === cur; })) weekSel.value = cur;
        else weekSel.value = weeks[weeks.length - 1].key;
      }
    }
    if (monthSel) {
      const months = availableMonths();
      const cur = monthSel.value;
      monthSel.innerHTML = months.length
        ? months.map(function (m) { return '<option value="' + m.key + '">' + m.label + '</option>'; }).join('')
        : '<option value="">No months</option>';
      if (periodMode === 'month' && periodKey && months.some(function (m) { return m.key === periodKey; })) monthSel.value = periodKey;
      else if (months.length) {
        if (months.some(function (m) { return m.key === cur; })) monthSel.value = cur;
        else monthSel.value = months[months.length - 1].key;
      }
    }
    if (weekWrap) weekWrap.classList.toggle('hidden', periodMode !== 'week');
    if (monthWrap) monthWrap.classList.toggle('hidden', periodMode !== 'month');
    if (badge) badge.textContent = periodLabel();
  }

  function rateClass(rate, target) {
    if (rate == null) return '';
    if (target != null && rate >= target) return 'ok';
    if (rate >= 0.95) return 'ok';
    if (rate >= 0.90) return 'mid';
    return 'bad';
  }

  function metricCards(overall) {
    const o = overall || {};
    let h = '<div class="sup-kpi-row">';
    h += '<div class="sup-kpi"><div class="sup-kpi-ico muted">📦</div><div class="sup-kpi-body">';
    h += '<div class="sup-kpi-k">Total arrival</div><div class="sup-kpi-v">' + (o.total || 0).toLocaleString() + '</div></div></div>';
    h += '<div class="sup-kpi ok"><div class="sup-kpi-ico ok">✓</div><div class="sup-kpi-body">';
    h += '<div class="sup-kpi-k">Followed plan TT</div><div class="sup-kpi-v pos">' + (o.followed || 0).toLocaleString() + '</div></div></div>';
    h += '<div class="sup-kpi bad"><div class="sup-kpi-ico bad">✕</div><div class="sup-kpi-body">';
    h += '<div class="sup-kpi-k">Not followed</div><div class="sup-kpi-v neg">' + (o.notFollowed || 0).toLocaleString() + '</div></div></div>';
    h += '</div>';
    return h;
  }

  function heroBlock(label, overall, target) {
    const o = overall || {};
    const hit = o.rate != null && target != null && o.rate >= target;
    const gap = (o.rate != null && target != null) ? (o.rate - target) * 100 : null;
    let h = '<div class="sup-hero ' + (hit ? 'is-ok' : 'is-bad') + '">';
    h += '<div class="sup-hero-kicker">' + label + '</div>';
    h += '<div class="sup-hero-rate">' + pct(o.rate) + '</div>';
    h += '<div class="sup-hero-tgt">Target ' + pct(target, 0);
    if (gap != null) {
      h += ' · <span class="' + (gap >= 0 ? 'up' : 'down') + '">' +
        (gap >= 0 ? '+' : '') + gap.toFixed(2) + ' pp vs target</span>';
    }
    h += '</div></div>';
    return h;
  }

  function expandBtn(title) {
    return '<button type="button" class="mr-expand-btn sup-expand-btn" title="Expand table" data-mtt-sup-expand="' +
      String(title).replace(/"/g, '&quot;') + '">⛶</button>';
  }

  function tableBySupervisor(list, target) {
    if (!list || !list.length) return '<p class="section-note">No supervisor rows.</p>';
    let h = '<div class="sup-table-block">';
    h += '<div class="sup-table-head">';
    h += '<h4 class="sup-section-title">By Supervisor In-charge</h4>';
    h += expandBtn('By Supervisor In-charge');
    h += '</div>';
    h += '<div class="sup-table-wrap"><table class="sup-grid"><thead><tr>';
    h += '<th>Supervisor In-charge</th><th>Total arrival</th><th>Followed</th><th>Not followed</th><th>Target</th><th>Rate</th>';
    h += '</tr></thead><tbody>';
    list.forEach(function (r) {
      const rc = rateClass(r.rate, target);
      h += '<tr>';
      h += '<td class="left"><strong>' + (r.supervisor || '—') + '</strong></td>';
      h += '<td>' + (r.total || 0).toLocaleString() + '</td>';
      h += '<td class="pos">' + (r.followed || 0).toLocaleString() + '</td>';
      h += '<td class="' + (r.notFollowed ? 'neg' : '') + '">' + (r.notFollowed || 0).toLocaleString() + '</td>';
      h += '<td>' + pct(target, 0) + '</td>';
      h += '<td class="rate-cell ' + rc + '">' + pct(r.rate) + '</td>';
      h += '</tr>';
    });
    h += '</tbody></table></div></div>';
    return h;
  }

  function tableByDc(list, target) {
    if (!list || !list.length) return '<p class="section-note">No DC rows.</p>';
    let h = '<div class="sup-table-block">';
    h += '<div class="sup-table-head">';
    h += '<h4 class="sup-section-title">By DC Intended</h4>';
    h += expandBtn('By DC Intended');
    h += '</div>';
    h += '<div class="sup-table-wrap"><table class="sup-grid"><thead><tr>';
    h += '<th>DC Name</th><th>Supervisor In-charge</th><th>Total arrival</th><th>Followed</th><th>Not followed</th><th>Target</th><th>Rate</th>';
    h += '</tr></thead><tbody>';
    list.forEach(function (r) {
      const rc = rateClass(r.rate, target);
      h += '<tr>';
      h += '<td class="left"><strong>' + (r.dc || '—') + '</strong>';
      if (r.code) h += ' <span class="sup-dc-chip">' + r.code + '</span>';
      h += '</td>';
      h += '<td class="left">' + (r.supervisor || '—') + '</td>';
      h += '<td>' + (r.total || 0).toLocaleString() + '</td>';
      h += '<td class="pos">' + (r.followed || 0).toLocaleString() + '</td>';
      h += '<td class="' + (r.notFollowed ? 'neg' : '') + '">' + (r.notFollowed || 0).toLocaleString() + '</td>';
      h += '<td>' + pct(target, 0) + '</td>';
      h += '<td class="rate-cell ' + rc + '">' + pct(r.rate) + '</td>';
      h += '</tr>';
    });
    h += '</tbody></table></div></div>';
    return h;
  }

  function showingLine(s) {
    const o = s.overall || {};
    return '<div class="sup-showing">Showing: <strong>' + periodLabel() + '</strong> · ' +
      (o.total || 0).toLocaleString() + ' trips</div>';
  }

  function renderOverview() {
    if (!pack) {
      return '<div class="sup-empty-state"><div class="sup-empty-ico">👤</div>' +
        '<div class="sup-empty-title">No supervisor data</div>' +
        '<p>Upload a Mainline DATA file with SLU trips.</p></div>';
    }
    let h = '<div class="sup-overview-grid">';
    SHEET_DEFS.forEach(function (def) {
      const s = sheetView(def.id);
      if (!s || !s.overall || !s.overall.total) {
        h += '<div class="sup-overview-card is-missing"><div class="sup-ov-top">' +
          '<span class="sup-ov-title">' + def.label + '</span>' +
          '<span class="sup-badge muted">Empty</span></div>' +
          '<div class="sup-ov-miss">No matching trips</div></div>';
        return;
      }
      const o = s.overall;
      const hit = o.rate != null && s.target != null && o.rate >= s.target;
      const gap = (o.rate != null && s.target != null) ? (o.rate - s.target) * 100 : null;
      h += '<button type="button" class="sup-overview-card ' + (hit ? 'is-ok' : 'is-bad') + '" data-sup-goto="' + def.id + '">';
      h += '<div class="sup-ov-top"><span class="sup-ov-title">' + def.label + '</span>';
      h += '<span class="sup-badge ' + (hit ? 'ok' : 'bad') + '">' + (hit ? 'On target' : 'Below') + '</span></div>';
      h += '<div class="sup-ov-rate ' + (hit ? 'ok' : 'bad') + '">' + pct(o.rate) + '</div>';
      h += '<div class="sup-ov-tgt">Target ' + pct(s.target, 0);
      if (gap != null) h += ' · <span class="' + (gap >= 0 ? 'up' : 'down') + '">' + (gap >= 0 ? '+' : '') + gap.toFixed(1) + ' pp</span>';
      h += '</div>';
      h += '<div class="sup-ov-stats">';
      h += '<div class="sup-ov-stat"><span class="k">Total</span><span class="v">' + (o.total || 0).toLocaleString() + '</span></div>';
      h += '<div class="sup-ov-stat"><span class="k">Followed</span><span class="v pos">' + (o.followed || 0).toLocaleString() + '</span></div>';
      h += '<div class="sup-ov-stat"><span class="k">Late</span><span class="v neg">' + (o.notFollowed || 0).toLocaleString() + '</span></div>';
      h += '</div></button>';
    });
    h += '</div>';
    return h;
  }

  function renderSheet(id) {
    const s = sheetView(id);
    if (!s) return '<p class="section-note">No trips for this view.</p>';

    let h = showingLine(s);
    h += '<div class="sup-top-row">';
    h += heroBlock(s.label, s.overall, s.target);
    h += metricCards(s.overall);
    h += '</div>';

    // Match screenshot order: for scope tabs DC first; for Supervisor hub, supervisor first
    if (s.kind === 'supervisorHub') {
      h += tableBySupervisor(s.bySupervisor, s.target);
      h += '<div style="margin-top:18px;"></div>';
      h += tableByDc(s.byDc, s.target);
    } else {
      h += tableByDc(s.byDc, s.target);
      h += '<div style="margin-top:18px;"></div>';
      h += tableBySupervisor(s.bySupervisor, s.target);
    }
    return h;
  }

  function openExpand(btn) {
    const block = btn.closest('.sup-table-block');
    if (!block) return;
    const table = block.querySelector('table');
    if (!table) return;
    const title = btn.getAttribute('data-mtt-sup-expand') || 'Expanded table';
    const overlay = document.getElementById('mrTableExpandOverlay');
    const body = document.getElementById('mrTableExpandBody');
    const titleEl = document.getElementById('mrTableExpandTitle');
    if (!overlay || !body) return;
    if (titleEl) titleEl.textContent = title + ' · ' + periodLabel();
    body.innerHTML = '';
    const clone = table.cloneNode(true);
    clone.classList.add('sup-grid');
    body.appendChild(clone);
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('mr-expand-open');
  }

  function closeExpand() {
    const overlay = document.getElementById('mrTableExpandOverlay');
    const body = document.getElementById('mrTableExpandBody');
    if (overlay) {
      overlay.classList.add('hidden');
      overlay.setAttribute('aria-hidden', 'true');
    }
    if (body) body.innerHTML = '';
    document.body.classList.remove('mr-expand-open');
  }

  function bindExpand() {
    const host = document.getElementById('mttSupView');
    if (!host) return;
    host.querySelectorAll('[data-mtt-sup-expand]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        openExpand(btn);
      });
    });
  }

  /* ---------- Excel export ---------- */
  function loadExcelJS() {
    return new Promise(function (resolve, reject) {
      if (window.ExcelJS) { resolve(window.ExcelJS); return; }
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
      s.onload = function () { resolve(window.ExcelJS); };
      s.onerror = function () { reject(new Error('Failed to load ExcelJS')); };
      document.head.appendChild(s);
    });
  }
  function thinBorder() {
    const e = { style: 'thin', color: { argb: 'FFBDBDBD' } };
    return { top: e, left: e, bottom: e, right: e };
  }
  function fill(argb) {
    return { type: 'pattern', pattern: 'solid', fgColor: { argb: argb } };
  }
  function font(opts) {
    return Object.assign({ name: 'Calibri', size: 10 }, opts || {});
  }
  function rateFillArgb(rate, target) {
    if (rate == null) return 'FFFFFFFF';
    if (target != null && rate >= target) return 'FFC6EFCE';
    if (rate >= 0.95) return 'FFC6EFCE';
    if (rate >= 0.90) return 'FFFFE699';
    return 'FFFFC7CE';
  }
  function rateFontArgb(rate, target) {
    if (rate == null) return 'FF9E9E9E';
    if (target != null && rate >= target) return 'FF006100';
    if (rate >= 0.95) return 'FF006100';
    if (rate >= 0.90) return 'FFE65100';
    return 'FF9C0006';
  }
  function styleHeaderRow(ws, rowIdx, colCount) {
    for (let c = 1; c <= colCount; c++) {
      const cell = ws.getCell(rowIdx, c);
      cell.font = font({ bold: true, size: 9, color: { argb: 'FFFFFFFF' } });
      cell.fill = fill('FFB71C1C');
      cell.border = thinBorder();
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    }
    ws.getRow(rowIdx).height = 20;
  }
  function writeTitle(ws, titleText, subText, colCount) {
    ws.mergeCells(1, 1, 1, colCount);
    const title = ws.getCell(1, 1);
    title.value = titleText;
    title.font = font({ bold: true, size: 14, color: { argb: 'FFFFFFFF' } });
    title.fill = fill('FFC00000');
    title.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 26;
    ws.mergeCells(2, 1, 2, colCount);
    const sub = ws.getCell(2, 1);
    sub.value = subText;
    sub.font = font({ bold: true, size: 10, color: { argb: 'FF5D4037' } });
    sub.fill = fill('FFFFF8E1');
    sub.alignment = { horizontal: 'center' };
  }
  function writeSupervisorSheet(ws, list, sheetLabel, target) {
    const headers = ['#', 'Supervisor In-charge', 'Total', 'Followed', 'Not followed', 'Target', 'Rate'];
    writeTitle(ws, 'SLU Mainline · Supervisor Performance', sheetLabel + ' · ' + periodLabel(), headers.length);
    styleHeaderRow(ws, 3, headers.length);
    headers.forEach(function (h, i) { ws.getCell(3, i + 1).value = h; });
    list.forEach(function (r, idx) {
      const rowIdx = 4 + idx;
      const vals = [idx + 1, r.supervisor || '—', r.total || 0, r.followed || 0, r.notFollowed || 0, target, r.rate];
      vals.forEach(function (v, i) {
        const cell = ws.getCell(rowIdx, i + 1);
        cell.border = thinBorder();
        cell.alignment = { horizontal: i === 1 ? 'left' : 'center', vertical: 'middle' };
        if (i === 5 || i === 6) {
          cell.value = v;
          cell.numFmt = '0.00%';
          if (i === 6) {
            cell.fill = fill(rateFillArgb(v, target));
            cell.font = font({ bold: true, color: { argb: rateFontArgb(v, target) } });
          } else cell.font = font({ bold: true });
        } else {
          cell.value = v;
          if (i === 3) cell.font = font({ bold: true, color: { argb: 'FF006100' } });
          if (i === 4 && v) cell.font = font({ bold: true, color: { argb: 'FF9C0006' } });
        }
        if (idx % 2 === 1 && i !== 6) cell.fill = fill('FFFFF5F5');
      });
    });
    [6, 32, 12, 12, 14, 10, 12].forEach(function (w, i) { ws.getColumn(i + 1).width = w; });
  }
  function writeDcSheet(ws, list, sheetLabel, target) {
    const headers = ['#', 'DC Name', 'Code', 'Supervisor In-charge', 'Total', 'Followed', 'Not followed', 'Target', 'Rate'];
    writeTitle(ws, 'SLU Mainline · Supervisor Performance · By DC', sheetLabel + ' · ' + periodLabel(), headers.length);
    styleHeaderRow(ws, 3, headers.length);
    headers.forEach(function (h, i) { ws.getCell(3, i + 1).value = h; });
    list.forEach(function (r, idx) {
      const rowIdx = 4 + idx;
      const vals = [idx + 1, r.dc || '—', r.code || '', r.supervisor || '—', r.total || 0, r.followed || 0, r.notFollowed || 0, target, r.rate];
      vals.forEach(function (v, i) {
        const cell = ws.getCell(rowIdx, i + 1);
        cell.border = thinBorder();
        cell.alignment = { horizontal: (i === 1 || i === 3) ? 'left' : 'center', vertical: 'middle' };
        if (i === 7 || i === 8) {
          cell.value = v;
          cell.numFmt = '0.00%';
          if (i === 8) {
            cell.fill = fill(rateFillArgb(v, target));
            cell.font = font({ bold: true, color: { argb: rateFontArgb(v, target) } });
          } else cell.font = font({ bold: true });
        } else {
          cell.value = v;
          if (i === 5) cell.font = font({ bold: true, color: { argb: 'FF006100' } });
          if (i === 6 && v) cell.font = font({ bold: true, color: { argb: 'FF9C0006' } });
        }
        if (idx % 2 === 1 && i !== 8) cell.fill = fill('FFFFF5F5');
      });
    });
    [6, 24, 10, 32, 12, 12, 14, 10, 12].forEach(function (w, i) { ws.getColumn(i + 1).width = w; });
  }
  function writeOverviewSheet(ws) {
    const headers = ['Sheet', 'Total', 'Followed', 'Not followed', 'Target', 'Rate', 'vs Target (pp)', 'Status'];
    writeTitle(ws, 'SLU Mainline · Supervisor Performance · Overview', periodLabel(), headers.length);
    styleHeaderRow(ws, 3, headers.length);
    headers.forEach(function (h, i) { ws.getCell(3, i + 1).value = h; });
    SHEET_DEFS.forEach(function (def, idx) {
      const s = sheetView(def.id);
      const o = (s && s.overall) || {};
      const rate = o.rate;
      const target = def.target;
      const gap = rate != null && target != null ? (rate - target) * 100 : null;
      const hit = rate != null && target != null && rate >= target;
      const rowIdx = 4 + idx;
      const vals = [def.label, o.total || 0, o.followed || 0, o.notFollowed || 0, target, rate, gap, hit ? 'On target' : 'Below'];
      vals.forEach(function (v, i) {
        const cell = ws.getCell(rowIdx, i + 1);
        cell.border = thinBorder();
        cell.alignment = { horizontal: i === 0 ? 'left' : 'center', vertical: 'middle' };
        if (i === 4 || i === 5) {
          cell.value = v;
          cell.numFmt = '0.00%';
          if (i === 5) {
            cell.fill = fill(rateFillArgb(v, target));
            cell.font = font({ bold: true, color: { argb: rateFontArgb(v, target) } });
          }
        } else if (i === 6) {
          if (v == null) cell.value = '—';
          else {
            cell.value = v;
            cell.numFmt = '0.00';
            cell.fill = fill(v >= 0 ? 'FFC6EFCE' : 'FFFFC7CE');
            cell.font = font({ bold: true, color: { argb: v >= 0 ? 'FF006100' : 'FF9C0006' } });
          }
        } else if (i === 7) {
          cell.value = v;
          cell.fill = fill(hit ? 'FFC6EFCE' : 'FFFFC7CE');
          cell.font = font({ bold: true, color: { argb: hit ? 'FF006100' : 'FF9C0006' } });
        } else {
          cell.value = v;
          if (i === 2) cell.font = font({ bold: true, color: { argb: 'FF006100' } });
          if (i === 3 && v) cell.font = font({ bold: true, color: { argb: 'FF9C0006' } });
        }
      });
    });
    [16, 12, 12, 14, 10, 12, 14, 12].forEach(function (w, i) { ws.getColumn(i + 1).width = w; });
  }

  async function exportExcel() {
    if (!pack) ensurePack();
    if (!pack) {
      alert('No supervisor data to export. Upload a workbook first.');
      return;
    }
    const btn = document.getElementById('mttSupExport');
    if (btn) { btn.disabled = true; btn.textContent = 'Exporting…'; }
    try {
      const ExcelJS = await loadExcelJS();
      const wb = new ExcelJS.Workbook();
      wb.creator = 'Mainline Travel Time Analyzer';
      wb.created = new Date();
      const overviewWs = wb.addWorksheet('Overview', { views: [{ state: 'frozen', ySplit: 3 }] });
      writeOverviewSheet(overviewWs);
      SHEET_DEFS.forEach(function (def) {
        const s = sheetView(def.id);
        if (!s) return;
        const bySup = wb.addWorksheet(def.label + ' · Sup', { views: [{ state: 'frozen', ySplit: 3 }] });
        writeSupervisorSheet(bySup, s.bySupervisor || [], def.label, def.target);
        const byDc = wb.addWorksheet(def.label + ' · DC', { views: [{ state: 'frozen', ySplit: 3 }] });
        writeDcSheet(byDc, s.byDc || [], def.label, def.target);
      });
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = URL.createObjectURL(blob);
      a.download = 'MTT_Supervisor_Performance_' + stamp + '.xlsx';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
    } catch (err) {
      console.error(err);
      alert('Export failed: ' + (err && err.message ? err.message : err));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Export Excel'; }
    }
  }

  function ensurePack() {
    pack = buildPackFromData();
    if (typeof MttFileProcessor !== 'undefined') {
      const st = MttFileProcessor.getState();
      if (st) st.supervisorPack = pack;
    }
  }

  function render() {
    const host = document.getElementById('mttSupView');
    if (!host) return;
    if (!pack) ensurePack();
    syncPeriodSelects();
    host.innerHTML = activeId === 'overview' ? renderOverview() : renderSheet(activeId);
    host.querySelectorAll('[data-sup-goto]').forEach(function (btn) {
      btn.addEventListener('click', function () { setActive(btn.getAttribute('data-sup-goto')); });
    });
    bindExpand();
  }

  function setActive(id) {
    activeId = id || 'overview';
    document.querySelectorAll('.mtt-sup-subtab').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.supSheet === activeId);
    });
    render();
  }

  function onDataReady() { ensurePack(); render(); }

  function applyPeriodFromUI() {
    const modeSel = document.getElementById('supPeriodMode');
    const weekSel = document.getElementById('supPeriodWeek');
    const monthSel = document.getElementById('supPeriodMonth');
    periodMode = (modeSel && modeSel.value) || 'all';
    if (periodMode === 'week') {
      periodKey = (weekSel && weekSel.value) || '';
      if (!periodKey) {
        const weeks = availableWeeks();
        periodKey = weeks.length ? weeks[weeks.length - 1].key : '';
      }
    } else if (periodMode === 'month') {
      periodKey = (monthSel && monthSel.value) || '';
      if (!periodKey) {
        const months = availableMonths();
        periodKey = months.length ? months[months.length - 1].key : '';
      }
    } else periodKey = '';
    render();
  }

  function init() {
    document.querySelectorAll('.mtt-sup-subtab').forEach(function (btn) {
      btn.addEventListener('click', function () { setActive(btn.dataset.supSheet); });
    });
    const modeSel = document.getElementById('supPeriodMode');
    const weekSel = document.getElementById('supPeriodWeek');
    const monthSel = document.getElementById('supPeriodMonth');
    if (modeSel) modeSel.addEventListener('change', applyPeriodFromUI);
    if (weekSel) weekSel.addEventListener('change', applyPeriodFromUI);
    if (monthSel) monthSel.addEventListener('change', applyPeriodFromUI);
    const exp = document.getElementById('mttSupExport');
    if (exp) exp.addEventListener('click', exportExcel);
    const closeBtn = document.getElementById('mrTableExpandClose');
    if (closeBtn && !closeBtn._mttSupBound) {
      closeBtn.addEventListener('click', closeExpand);
      closeBtn._mttSupBound = true;
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeExpand();
    });
  }

  return { init, render, onDataReady, ingestWorkbook, setActive, exportExcel };
})();
