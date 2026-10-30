/* ==========================================================================
   MODULE: MTT UTILS (shared helpers)
   ========================================================================== */
const MttUtils = (() => {
  const TARGET_ALL = 0.96, TARGET_LUZON = 0.97, TARGET_VISMIN = 0.85;

  function pad2(n) { return String(n).padStart(2, '0'); }

  /**
   * Excel WEEKNUM(date, 1) — week starts Sunday, ends Saturday.
   * Shared by Weekly tab + Rate Matrix so rates match.
   */
  function excelWeekNum(dateKey) {
    if (!dateKey) return null;
    const [y, m, d] = String(dateKey).split('-').map(Number);
    if (!y || !m || !d) return null;
    const date = new Date(Date.UTC(y, m - 1, d));
    const jan1 = new Date(Date.UTC(y, 0, 1));
    const dayOfYear = Math.floor((date - jan1) / 86400000) + 1;
    const jan1Dow = jan1.getUTCDay(); // 0=Sun .. 6=Sat
    return Math.floor((dayOfYear + jan1Dow - 1) / 7) + 1;
  }

  /** Period key e.g. 2026-W41 (calendar year of date + Excel week num) */
  function weekKey(dateKey) {
    if (!dateKey) return null;
    const wn = excelWeekNum(dateKey);
    if (wn == null) return null;
    const y = parseInt(String(dateKey).slice(0, 4), 10);
    return y + '-W' + pad2(wn);
  }

  /**
   * Calendar day key YYYY-MM-DD from Excel serials / SheetJS Date / strings.
   * Avoids timezone off-by-one (e.g. Oct 10 showing as Oct 9).
   */
  function parseDateKey(val) {
    if (val == null || val === '') return null;

    // SheetJS cellDates:true → Date. Undo local TZ shift so Excel calendar day is kept.
    if (val instanceof Date && !isNaN(val.getTime())) {
      const adjusted = new Date(val.getTime() + val.getTimezoneOffset() * 60000);
      return adjusted.getFullYear() + '-' + pad2(adjusted.getMonth() + 1) + '-' + pad2(adjusted.getDate());
    }

    // Raw Excel serial (integer or datetime with fraction) → UTC calendar day
    if (typeof val === 'number' && val > 40000 && val < 60000) {
      const daySerial = Math.floor(val + 1e-9);
      const epoch = Date.UTC(1899, 11, 30);
      const dt = new Date(epoch + daySerial * 86400000);
      return dt.getUTCFullYear() + '-' + pad2(dt.getUTCMonth() + 1) + '-' + pad2(dt.getUTCDate());
    }

    const s = String(val).trim();
    let m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
    m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return m[3] + '-' + pad2(m[1]) + '-' + pad2(m[2]);

    const n = parseFloat(s);
    if (!isNaN(n) && n > 40000 && n < 60000) {
      const daySerial = Math.floor(n + 1e-9);
      const epoch = Date.UTC(1899, 11, 30);
      const dt = new Date(epoch + daySerial * 86400000);
      return dt.getUTCFullYear() + '-' + pad2(dt.getUTCMonth() + 1) + '-' + pad2(dt.getUTCDate());
    }
    return null;
  }

  // Official VisMin report uses exact "VISMIN ROUTE" only
  function classifyRouteType(rt) {
    const u = String(rt || '').toUpperCase().trim();
    if (u === 'VISMIN ROUTE') return 'VISMIN';
    if (u === 'LUZON ROUTE') return 'LUZON';
    return 'OTHER';
  }

  function groupBy(arr, keyFn) {
    const map = {};
    arr.forEach(r => {
      const k = keyFn(r) || '(blank)';
      if (!map[k]) map[k] = [];
      map[k].push(r);
    });
    return map;
  }

  function stats(rows) {
    if (!rows || !rows.length) return { total: 0, yes: 0, no: 0, rate: null };
    const yes = rows.filter(r => r.onTime === 'YES').length;
    const no = rows.filter(r => r.onTime === 'NO').length;
    return { total: rows.length, yes, no, rate: yes / rows.length };
  }

  function fmtPct(v) { return (v == null || isNaN(v)) ? '—' : (v * 100).toFixed(1) + '%'; }
  function fmtNum(v, d) { return (v == null || isNaN(v)) ? '—' : Number(v).toFixed(d == null ? 1 : d); }
  function fmtPp(v) {
    if (v == null || isNaN(v)) return '—';
    return (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + ' pp';
  }

  function applyRouteFilter(rows, filter) {
    if (filter === 'LUZON') return rows.filter(r => r.routeType === 'LUZON');
    if (filter === 'VISMIN') return rows.filter(r => r.routeType === 'VISMIN');
    return rows;
  }

  function targetForFilter(filter) {
    if (filter === 'LUZON') return TARGET_LUZON;
    if (filter === 'VISMIN') return TARGET_VISMIN;
    return TARGET_ALL;
  }

  function labelForFilter(filter) {
    if (filter === 'LUZON') return 'Luzon Route';
    if (filter === 'VISMIN') return 'VisMin Route';
    return 'Overall';
  }

  return {
    TARGET_ALL, TARGET_LUZON, TARGET_VISMIN,
    parseDateKey,
    excelWeekNum,
    weekKey, classifyRouteType, groupBy, stats,
    fmtPct, fmtNum, fmtPp, applyRouteFilter, targetForFilter, labelForFilter
  };
})();
