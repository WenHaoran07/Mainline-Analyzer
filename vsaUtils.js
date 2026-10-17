/* ==========================================================================
   MODULE: VSA UTILS (Vehicle Size Accuracy shared helpers)
   ========================================================================== */
const VsaUtils = (() => {
  const TARGET = 0.97; // 97% accuracy target

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

  function num(n, digits = 0) {
    if (n == null || isNaN(n)) return '—';
    return Number(n).toFixed(digits);
  }

  function rateClass(rate) {
    if (rate == null || isNaN(rate)) return '';
    if (rate >= TARGET) return 'rate-good';
    if (rate >= TARGET - 0.03) return 'rate-warn';
    return 'rate-bad';
  }

  function normalizeHeader(h) {
    return String(h || '')
      .replace(/\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function safeStr(v) {
    if (v == null) return '';
    return String(v).trim();
  }

  /** Normalize SAME? → 'YES' | 'NO' | null (blank / #VALUE! / other) */
  function normalizeSame(val) {
    if (val == null || val === '') return null;
    const s = String(val).trim().toUpperCase();
    if (s === 'YES' || s === 'Y' || s === 'TRUE' || s === '1') return 'YES';
    if (s === 'NO' || s === 'N' || s === 'FALSE' || s === '0') return 'NO';
    return null; // BLANK, #VALUE!, #N/A, etc.
  }

  /** Clean vehicle size labels: "9.6M", "7.6M-6W", "9.6 M" → consistent */
  function normalizeSize(val) {
    if (val == null || val === '') return '';
    let s = String(val).trim().toUpperCase().replace(/\s+/g, '');
    // keep trailing wheel info if present
    return s;
  }

  function avg(arr) {
    if (!arr || !arr.length) return null;
    const nums = arr.filter(x => x != null && !isNaN(x));
    if (!nums.length) return null;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  }

  /**
   * Map header row → column indices for VSA fields.
   */
  function findColMap(headers) {
    const map = {
      date: -1, route: -1, area: -1, same: -1, shipmentNo: -1,
      mission: -1, status: -1, routeOwner: -1, plate: -1,
      actualSize: -1, plannedSize: -1, shippingBranch: -1, destBranch: -1,
      shippingRegion: -1, destRegion: -1, carrier: -1, carrierName: -1,
      wheels: -1, aa: -1, driver: -1
    };
    const h = (headers || []).map(normalizeHeader);

    const rules = [
      ['date', [/^\s*date\s*$/, /originating branch operation day/, /operation day/]],
      ['route', [/^route$/, /route name/, /reference line/]],
      ['area', [/^area$/, /shipping region/]],
      ['same', [/^same\?$/, /is it consistent/, /consistent/, /same\?/]],
      ['shipmentNo', [/shipmentno/, /shipment no/, /task order/, /shipment/]],
      ['mission', [/mission name/, /mission/]],
      ['status', [/task status/, /^status$/]],
      ['routeOwner', [/route owner/, /truck owner/]],
      ['plate', [/vehicle plate/, /plate no/, /^plate$/]],
      ['actualSize', [/actual size/, /actual truck size/]],
      ['plannedSize', [/planning truck size/, /planned size/, /planned truck size/]],
      ['shippingBranch', [/shipping branch/, /origin branch/]],
      ['destBranch', [/destination branch/, /dest branch/]],
      ['shippingRegion', [/shipping region/]],
      ['destRegion', [/destination region/]],
      ['carrier', [/^carrier$/]],
      ['carrierName', [/vehicle carrier name/, /carrier name/]],
      ['wheels', [/^wheels$/]],
      ['aa', [/^aa$/]],
      ['driver', [/^driver$/]]
    ];

    for (const [key, patterns] of rules) {
      for (let i = 0; i < h.length; i++) {
        if (patterns.some(re => re.test(h[i]))) {
          map[key] = i;
          break;
        }
      }
    }
    return map;
  }

  return {
    TARGET,
    parseDateKey,
    formatDateLabel,
    pct,
    num,
    rateClass,
    normalizeHeader,
    safeStr,
    normalizeSame,
    normalizeSize,
    avg,
    findColMap
  };
})();
