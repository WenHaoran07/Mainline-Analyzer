/* ==========================================================================
   MODULE: WFD UTILS (Waiting for Departure shared helpers)
   ========================================================================== */
const WfdUtils = (() => {
  const TARGET = 0.97;           // 97% overall on-time target (Day Comparison)
  const THRESHOLD_MIN = 30;      // minutes: Finish Loading / Sealing → ATD

  const CANON_NAME = 'Cañon Christopher John';
  const BONGOSIA_NAME = 'Bongosia Katrina';

  /** Per-supervisor targets from Excel Sheet2 (Cañon & Bongosia separate) */
  const SUPERVISOR_TARGETS = {
    'Caranguian Julius': 0.98,
    'Hajan Haber': 0.99,
    'Lizardo Dennis': 0.99,
    'Reanzares Eddrian': 0.99,
    'Tagsa Jeffrey': 0.99,
    'Trinos Marvin': 0.98,
    [CANON_NAME]: 0.98,
    [BONGOSIA_NAME]: 0.98,
    'SLU': 0.98
  };

  const SUPERVISOR_ORDER = [
    'Caranguian Julius',
    'Hajan Haber',
    'Lizardo Dennis',
    'Reanzares Eddrian',
    'Tagsa Jeffrey',
    'Trinos Marvin',
    CANON_NAME,
    BONGOSIA_NAME,
    'SLU'
  ];

  function supervisorTarget(name) {
    if (name && SUPERVISOR_TARGETS[name] != null) return SUPERVISOR_TARGETS[name];
    return 0.98;
  }

  /** Canonical single name (no merge of Cañon/Bongosia) */
  function normalizeSupervisorName(raw) {
    const s = safeStr(raw);
    if (!s) return 'Unassigned';
    const lower = s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (/bongosia/.test(lower) && !/ca[nñ]on|canon/.test(lower)) return BONGOSIA_NAME;
    if (/ca[nñ]on|canon/.test(lower) && !/bongosia/.test(lower)) return CANON_NAME;
    return s;
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  /**
   * Calendar day key YYYY-MM-DD from Excel serials / SheetJS Date / strings.
   * Avoids timezone off-by-one.
   */
  function parseDateKey(val) {
    if (val == null || val === '') return null;

    if (val instanceof Date && !isNaN(val.getTime())) {
      const adjusted = new Date(val.getTime() + val.getTimezoneOffset() * 60000);
      return adjusted.getFullYear() + '-' + pad2(adjusted.getMonth() + 1) + '-' + pad2(adjusted.getDate());
    }

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

  function formatDateLabel(key) {
    if (!key) return '—';
    const parts = key.split('-');
    if (parts.length !== 3) return key;
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const mi = parseInt(parts[1], 10) - 1;
    return (months[mi] || parts[1]) + ' ' + parseInt(parts[2], 10);
  }

  function pct(n, digits = 1) {
    if (n == null || isNaN(n)) return '—';
    return (n * 100).toFixed(digits) + '%';
  }

  function num(n, digits = 1) {
    if (n == null || isNaN(n)) return '—';
    return Number(n).toFixed(digits);
  }

  function rateClass(rate) {
    if (rate == null || isNaN(rate)) return '';
    if (rate >= TARGET) return 'rate-good';
    if (rate >= TARGET - 0.03) return 'rate-warn';
    return 'rate-bad';
  }

  function isOnTime(intervalMin, whether) {
    if (whether != null && String(whether).trim().toUpperCase() === 'YES') return true;
    if (whether != null && String(whether).trim().toUpperCase() === 'NO') return false;
    if (intervalMin == null || isNaN(intervalMin)) return null;
    return Number(intervalMin) <= THRESHOLD_MIN;
  }

  function normalizeHeader(h) {
    return String(h || '')
      .replace(/\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  /** Map flexible column names from DATA / TEMPLATE sheets */
  function findColMap(headers) {
    const norm = headers.map(normalizeHeader);
    const find = (...patterns) => {
      for (const p of patterns) {
        const i = norm.findIndex(h => p.test(h));
        if (i >= 0) return i;
      }
      return -1;
    };
    return {
      date: find(/operational\s*date/, /发车日期/, /^date$/),
      region: find(/depature\s*region/, /departure\s*region/, /始发区域/),
      taskId: find(/task\s*list\s*no/, /task\s*id/),
      status: find(/task\s*status/),
      routeLine: find(/route\s*line\s*name/),
      business: find(/business\s*attributes/),
      depStation: find(/departure\s*station/),
      routeName: find(/route\s*name/),
      plate: find(/vehicle\s*plate/, /plate\s*no/),
      carrierAbbr: find(/vehiclerier/, /carrier\s*abbr/, /abbreviation/),
      vehicleType: find(/types?\s*of\s*vehicle/, /vehicle\s*type/),
      unloadStation: find(/unloding\s*station/, /unloading\s*station/),
      atd: find(/actual\s*departure/, /\batd\b/),
      sealing: find(/vehicle\s*sealing/, /load\s*finish/, /sealing\s*time/),
      threshold: find(/interval\s*minutes\s*loading/, /30\s*minutes/),
      interval: find(/interval\s*time/, /finish\s*loading\s*to\s*atd/),
      onTime: find(/whether\s*on\s*time/, /on\s*time/),
      truckOwner: find(/truck\s*owner/),
      carrier: find(/^carrier$/),
      dcName: find(/departure\s*dc\s*name/, /dc\s*name/),
      dcCode: find(/dc\s*intended/, /^dc\s*code$/),
      supervisor: find(/supervisor\s*incharge/, /supervisor/),
      remarks: find(/remarks/)
    };
  }

  /**
   * Expand to individual supervisor names (Sheet2 style).
   * "Cañon Christopher John, Bongosia Katrina" → both rows separately.
   * Prefer W/X split columns when present; else split col V.
   */
  function expandSupervisors(supervisorRaw, colW, colX) {
    const a = safeStr(colW);
    const b = safeStr(colX);
    if (a || b) {
      const names = [];
      if (a) names.push(normalizeSupervisorName(a));
      if (b && normalizeSupervisorName(b) !== (a ? normalizeSupervisorName(a) : '')) {
        names.push(normalizeSupervisorName(b));
      }
      if (names.length) return names;
    }
    const raw = safeStr(supervisorRaw);
    if (!raw) return ['Unassigned'];
    const lower = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const hasCanon = /ca[nñ]on|canon/.test(lower);
    const hasBong = /bongosia/.test(lower);
    if (hasCanon && hasBong) return [CANON_NAME, BONGOSIA_NAME];
    if (hasCanon) return [CANON_NAME];
    if (hasBong) return [BONGOSIA_NAME];
    return raw.split(/[,;]/).map(s => normalizeSupervisorName(s)).filter(Boolean);
  }

  function resolveSupervisor(supervisorRaw, colW, colX) {
    return expandSupervisors(supervisorRaw, colW, colX)[0] || 'Unassigned';
  }

  function safeStr(v) {
    if (v == null) return '';
    return String(v).trim();
  }

  function avg(arr) {
    const nums = arr.filter(x => x != null && !isNaN(x));
    if (!nums.length) return null;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  }

  return {
    TARGET,
    THRESHOLD_MIN,
    CANON_NAME,
    BONGOSIA_NAME,
    SUPERVISOR_TARGETS,
    SUPERVISOR_ORDER,
    supervisorTarget,
    normalizeSupervisorName,
    resolveSupervisor,
    parseDateKey,
    formatDateLabel,
    pct,
    num,
    rateClass,
    isOnTime,
    normalizeHeader,
    findColMap,
    expandSupervisors,
    safeStr,
    avg,
    pad2
  };
})();
