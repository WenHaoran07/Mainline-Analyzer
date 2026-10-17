/* ==========================================================================
   MODULE: WFD UTILS (Waiting for Departure shared helpers)
   ========================================================================== */
const WfdUtils = (() => {
  const TARGET = 0.97;           // 97% on-time target
  const THRESHOLD_MIN = 30;      // minutes: Finish Loading / Sealing → ATD

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
      supervisor: find(/supervisor/),
      remarks: find(/remarks/)
    };
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
    parseDateKey,
    formatDateLabel,
    pct,
    num,
    rateClass,
    isOnTime,
    normalizeHeader,
    findColMap,
    safeStr,
    avg,
    pad2
  };
})();
