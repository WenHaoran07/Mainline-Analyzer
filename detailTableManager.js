/* ==========================================================================
   MODULE: DETAIL TABLE MANAGER
   Trip-level data + TaskID search + Date filter + LT/Date sort
   ========================================================================== */
const DetailTableManager = (() => {
  let currentRows = [];
  let sortField = 'lt';   // 'lt' | 'date'
  let sortDir = 'desc';    // 'asc' | 'desc'
  let searchQuery = '';
  let dateFilter = 'ALL';  // 'ALL' or yyyy-mm-dd

  function val(row, key, colMap) {
    const col = colMap[key];
    if (!col) return '';
    const v = row[col];
    return v === null || v === undefined ? '' : v;
  }

  function toSortKey(v) {
    if (v === null || v === undefined || v === '') return 0;
    if (v instanceof Date && !isNaN(v.getTime())) return v.getTime();
    if (typeof v === 'number' && isFinite(v)) {
      if (v > 20000 && v < 100000) {
        return Date.UTC(1899, 11, 30) + Math.round(v) * 86400000;
      }
      return v;
    }
    const s = String(v).trim();
    if (/^\d+(\.\d+)?$/.test(s)) {
      const n = parseFloat(s);
      if (n > 20000 && n < 100000) {
        return Date.UTC(1899, 11, 30) + Math.round(n) * 86400000;
      }
    }
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return Date.UTC(+iso[1], +iso[2] - 1, +iso[3]);
    const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (dmy) return Date.UTC(+dmy[3], +dmy[2] - 1, +dmy[1]);
    const t = Date.parse(s);
    return isNaN(t) ? 0 : t;
  }

  function toYmd(v) {
    const sk = toSortKey(v);
    if (!sk) {
      const s = String(v || '');
      return s.length >= 10 ? s.substring(0, 10) : '';
    }
    const d = new Date(sk);
    return d.getUTCFullYear() + '-' +
      String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
      String(d.getUTCDate()).padStart(2, '0');
  }

  function formatDate(v) {
    if (v === null || v === undefined || v === '') return '—';

    if (v instanceof Date && !isNaN(v.getTime())) {
      const dd = String(v.getDate()).padStart(2, '0');
      const mm = String(v.getMonth() + 1).padStart(2, '0');
      const yyyy = v.getFullYear();
      return dd + '/' + mm + '/' + yyyy;
    }

    if (typeof v === 'number' && isFinite(v)) {
      const epoch = Date.UTC(1899, 11, 30);
      const ms = epoch + Math.round(v) * 86400000;
      const d = new Date(ms);
      if (!isNaN(d.getTime())) {
        const dd = String(d.getUTCDate()).padStart(2, '0');
        const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
        const yyyy = d.getUTCFullYear();
        return dd + '/' + mm + '/' + yyyy;
      }
    }

    const s = String(v).trim();

    if (/^\d+(\.\d+)?$/.test(s)) {
      const n = parseFloat(s);
      if (n > 20000 && n < 100000) {
        const epoch = Date.UTC(1899, 11, 30);
        const ms = epoch + Math.round(n) * 86400000;
        const d = new Date(ms);
        if (!isNaN(d.getTime())) {
          const dd = String(d.getUTCDate()).padStart(2, '0');
          const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
          const yyyy = d.getUTCFullYear();
          return dd + '/' + mm + '/' + yyyy;
        }
      }
    }

    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return iso[3] + '/' + iso[2] + '/' + iso[1];

    if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(s)) return s.substring(0, 10);

    return s.length >= 10 ? s.substring(0, 10) : s;
  }

  function ymdToDisplay(ymd) {
    const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return ymd;
    return m[3] + '/' + m[2] + '/' + m[1];
  }

  function buildRows(sluRows, colMap, datePrev, dateLatest, routeGroup) {
    function isTargetGroup(routeCode, filterType) {
      if (!filterType || filterType === 'ALL') return true;
      const parts = String(routeCode || '').split('-');
      if (parts.length < 2) return true;
      const destCode = parseInt(parts[parts.length - 1], 10);
      if (isNaN(destCode)) return true;
      const isVisMin = (destCode >= 300 && destCode <= 399) ||
                       (destCode >= 500 && destCode <= 599) ||
                       (destCode >= 600 && destCode <= 699) ||
                       (destCode >= 800 && destCode <= 899);
      return filterType === 'VISMIN' ? isVisMin : !isVisMin;
    }

    const dates = [datePrev, dateLatest].filter(Boolean);
    let rows = (sluRows || []).filter(r => {
      const dateRaw = val(r, 'date', colMap);
      const dateKey = toYmd(dateRaw) || String(dateRaw).substring(0, 10);
      if (dates.length && !dates.includes(dateKey)) return false;
      if (!isTargetGroup(val(r, 'route', colMap), routeGroup)) return false;
      return true;
    });

    rows = rows.map(r => {
      const checkoutRaw = val(r, 'checkout', colMap) || val(r, 'date', colMap);
      const dateRaw = val(r, 'date', colMap);
      const dateKey = toYmd(dateRaw) || toYmd(checkoutRaw);
      return {
        shipmentNo: val(r, 'shipmentNo', colMap) || '—',
        checkout: formatDate(checkoutRaw),
        dateSortKey: toSortKey(checkoutRaw),
        dateKey: dateKey,
        routeOwner: val(r, 'routeOwner', colMap) || '—',
        plateNo: val(r, 'plateNo', colMap) || '—',
        actualSize: val(r, 'actualSize', colMap) || '—',
        planningSize: val(r, 'planningSize', colMap) || '—',
        shipBranch: val(r, 'branch', colMap) || '—',
        destBranch: val(r, 'destBranch', colMap) || '—',
        vehicleCarrier: val(r, 'vehicleCarrier', colMap) || '—',
        carrier: val(r, 'carrier', colMap) || '—',
        wheels: val(r, 'wheels', colMap) || '—',
        lt: parseFloat(val(r, 'lt', colMap)) || 0,
        region: val(r, 'region', colMap) || '—',
        route: val(r, 'route', colMap) || '—'
      };
    });

    return rows;
  }

  function populateDateFilter(rows, datePrev, dateLatest) {
    const sel = document.getElementById('detailDateFilter');
    if (!sel) return;

    const set = new Set();
    (rows || []).forEach(r => { if (r.dateKey) set.add(r.dateKey); });
    if (datePrev) set.add(datePrev);
    if (dateLatest) set.add(dateLatest);
    const list = [...set].filter(Boolean).sort();

    const prev = dateFilter;
    sel.innerHTML = `<option value="ALL">All dates</option>` +
      list.map(d => `<option value="${d}">${ymdToDisplay(d)}</option>`).join('');

    if (prev && (prev === 'ALL' || list.includes(prev))) {
      sel.value = prev;
      dateFilter = prev;
    } else {
      sel.value = 'ALL';
      dateFilter = 'ALL';
    }
  }

  function sortRows(rows) {
    const sorted = [...rows];
    sorted.sort((a, b) => {
      let av, bv;
      if (sortField === 'date') {
        av = a.dateSortKey || 0;
        bv = b.dateSortKey || 0;
      } else {
        av = a.lt || 0;
        bv = b.lt || 0;
      }
      if (av === bv) return 0;
      if (sortDir === 'asc') return av < bv ? -1 : 1;
      return av > bv ? -1 : 1;
    });
    return sorted;
  }

  function filterRows(rows) {
    let out = rows;
    if (dateFilter && dateFilter !== 'ALL') {
      out = out.filter(r => r.dateKey === dateFilter);
    }
    const q = String(searchQuery || '').trim().toLowerCase();
    if (q) {
      out = out.filter(r => String(r.shipmentNo).toLowerCase().includes(q));
    }
    return out;
  }

  function getVisibleRows() {
    return sortRows(filterRows(currentRows));
  }

  function sortLabelText() {
    if (sortField === 'date') {
      return sortDir === 'desc' ? 'Date (Newest → Oldest)' : 'Date (Oldest → Newest)';
    }
    return sortDir === 'desc' ? 'Loading Tickets (High → Low)' : 'Loading Tickets (Low → High)';
  }

  function renderTable(rows) {
    const body = document.getElementById('detailTableBody');
    const countEl = document.getElementById('detailTableCount');
    if (!body) return;

    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="14">No matching trip-level data.</td></tr>';
      if (countEl) countEl.textContent = '0 rows';
      return;
    }

    body.innerHTML = rows.map(r => `
      <tr>
        <td>${escapeHtml(r.shipmentNo)}</td>
        <td>${escapeHtml(r.checkout)}</td>
        <td>${escapeHtml(String(r.routeOwner))}</td>
        <td>${escapeHtml(String(r.plateNo))}</td>
        <td>${escapeHtml(String(r.actualSize))}</td>
        <td>${escapeHtml(String(r.planningSize))}</td>
        <td>${escapeHtml(String(r.shipBranch))}</td>
        <td>${escapeHtml(String(r.destBranch))}</td>
        <td>${escapeHtml(String(r.vehicleCarrier))}</td>
        <td>${escapeHtml(String(r.carrier))}</td>
        <td>${escapeHtml(String(r.wheels))}</td>
        <td style="text-align:right;font-weight:600;">${Math.round(r.lt).toLocaleString()}</td>
        <td>${escapeHtml(String(r.region))}</td>
        <td><strong>${escapeHtml(String(r.route))}</strong></td>
      </tr>
    `).join('');

    if (countEl) {
      const parts = [`${rows.length.toLocaleString()} of ${currentRows.length.toLocaleString()} rows`];
      if (dateFilter && dateFilter !== 'ALL') parts.push('Date: ' + ymdToDisplay(dateFilter));
      const q = String(searchQuery || '').trim();
      if (q) parts.push('TaskID: "' + q + '"');
      parts.push(sortLabelText());
      countEl.textContent = parts.join(' · ');
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function refresh() {
    renderTable(getVisibleRows());
  }

  function render(sluRows, colMap, datePrev, dateLatest, routeGroup = 'ALL') {
    currentRows = buildRows(sluRows, colMap, datePrev, dateLatest, routeGroup);
    populateDateFilter(currentRows, datePrev, dateLatest);

    const search = document.getElementById('detailTaskSearch');
    if (search) search.value = searchQuery;

    const legacy = document.getElementById('detailLtSort');
    if (legacy) {
      if (sortField === 'lt' && sortDir === 'desc') legacy.value = 'lt-desc';
      else if (sortField === 'lt' && sortDir === 'asc') legacy.value = 'lt-asc';
      else if (sortField === 'date' && sortDir === 'desc') legacy.value = 'date-desc';
      else legacy.value = 'date-asc';
    }

    refresh();
  }

  function applySortFromLegacy(value) {
    if (value === 'lt-asc') { sortField = 'lt'; sortDir = 'asc'; }
    else if (value === 'date-desc') { sortField = 'date'; sortDir = 'desc'; }
    else if (value === 'date-asc') { sortField = 'date'; sortDir = 'asc'; }
    else { sortField = 'lt'; sortDir = 'desc'; }
  }

  function init() {
    const dateSel = document.getElementById('detailDateFilter');
    if (dateSel) {
      dateSel.addEventListener('change', () => {
        dateFilter = dateSel.value || 'ALL';
        refresh();
      });
    }

    const legacy = document.getElementById('detailLtSort');
    if (legacy) {
      if (![...legacy.options].some(o => String(o.value).includes('date'))) {
        legacy.innerHTML = `
          <option value="lt-desc">Loading Tickets (High → Low)</option>
          <option value="lt-asc">Loading Tickets (Low → High)</option>
          <option value="date-desc">Date (Newest → Oldest)</option>
          <option value="date-asc">Date (Oldest → Newest)</option>`;
      }
      legacy.addEventListener('change', () => {
        applySortFromLegacy(legacy.value);
        refresh();
      });
    }

    const search = document.getElementById('detailTaskSearch');
    if (search) {
      search.addEventListener('input', () => {
        searchQuery = search.value || '';
        refresh();
      });
    }

    const clearBtn = document.getElementById('detailTaskSearchClear');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        searchQuery = '';
        dateFilter = 'ALL';
        if (search) search.value = '';
        if (dateSel) dateSel.value = 'ALL';
        refresh();
      });
    }
  }

  return { render, init };
})();
