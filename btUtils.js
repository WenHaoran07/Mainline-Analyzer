/* ==========================================================================
   MODULE: BT UTILS (Broken Truck Analyzer shared helpers)
   ========================================================================== */
const BtUtils = (() => {

  function pad2(n) { return String(n).padStart(2, '0'); }

  function safeStr(v) {
    if (v == null || v === '') return '';
    return String(v).trim();
  }

  /**
   * Calendar day key YYYY-MM-DD from Excel serials / SheetJS Date / strings.
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
    // ISO-ish
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return m[1] + '-' + pad2(+m[2]) + '-' + pad2(+m[3]);

    // M/D/YYYY or D/M/YYYY (prefer US-style when ambiguous)
    m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (m) {
      const a = +m[1], b = +m[2], y = +m[3];
      // if first > 12 treat as D/M/Y else M/D/Y
      if (a > 12) return y + '-' + pad2(b) + '-' + pad2(a);
      return y + '-' + pad2(a) + '-' + pad2(b);
    }

    // Excel serial as string
    if (/^\d+(\.\d+)?$/.test(s)) {
      const n = parseFloat(s);
      if (n > 40000 && n < 60000) return parseDateKey(n);
    }

    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    }
    return null;
  }

  function parseMonthLabel(val, fallbackDateKey) {
    const s = safeStr(val).toUpperCase();
    const map = {
      JAN: 'January', JANUARY: 'January',
      FEB: 'February', FEBRUARY: 'February',
      MAR: 'March', MARCH: 'March',
      APR: 'April', APRIL: 'April',
      MAY: 'May',
      JUN: 'June', JUNE: 'June',
      JUL: 'July', JULY: 'July',
      AUG: 'August', AUGUST: 'August',
      SEP: 'September', SEPT: 'September', SEPTEMBER: 'September',
      OCT: 'October', OCTOBER: 'October',
      NOV: 'November', NOVEMBER: 'November',
      DEC: 'December', DECEMBER: 'December'
    };
    if (map[s]) return map[s];
    if (fallbackDateKey) {
      const parts = fallbackDateKey.split('-');
      if (parts.length === 3) {
        const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        const mi = parseInt(parts[1], 10) - 1;
        if (mi >= 0 && mi < 12) return months[mi];
      }
    }
    return s || 'Unknown';
  }

  const MONTH_ORDER = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December'
  ];

  function monthIndex(name) {
    const i = MONTH_ORDER.findIndex(m => m.toLowerCase() === String(name || '').toLowerCase());
    return i >= 0 ? i : 99;
  }

  /** Parse downtime text like "22 hours, 19 minutes" or "#Num" → hours (float) or null */
  function parseDowntimeHours(val) {
    if (val == null || val === '') return null;
    if (typeof val === 'number' && !isNaN(val)) return val;
    const s = String(val).trim();
    if (/#num|#ref|#value|n\/a|na/i.test(s)) return null;
    // pure number
    if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
    let hours = 0, minutes = 0;
    const hm = s.match(/(\d+)\s*hours?/i);
    const mm = s.match(/(\d+)\s*min/i);
    if (hm) hours = parseInt(hm[1], 10);
    if (mm) minutes = parseInt(mm[1], 10);
    if (hm || mm) return hours + minutes / 60;
    // "20 hours," incomplete
    const onlyH = s.match(/(\d+)\s*hour/i);
    if (onlyH) return parseInt(onlyH[1], 10);
    return null;
  }

  function formatHours(h) {
    if (h == null || isNaN(h)) return '—';
    const totalMin = Math.round(h * 60);
    const hrs = Math.floor(totalMin / 60);
    const mins = totalMin % 60;
    if (hrs === 0) return mins + ' min';
    if (mins === 0) return hrs + ' hr';
    return hrs + ' hr ' + mins + ' min';
  }

  function normalizeTrucker(raw) {
    const s = safeStr(raw).toUpperCase();
    if (!s) return 'Unknown';
    if (/YUNYI/.test(s)) return 'YUNYI';
    if (/SLU\s*TRUCK|SELU/.test(s)) return 'SLU TRUCK';
    if (/CJ\s*SMART|CJSMART/.test(s)) return 'CJ SMART';
    if (/CCJ/.test(s)) return 'CCJ LOGISTICS';
    if (/FAST.?EASY|888FAST/.test(s)) return 'FASTEASY';
    if (/GREAT.?WILL|GREATWILL/.test(s)) return 'GREATWILL';
    if (/JAMILINES/.test(s)) return 'JAMILINES';
    if (/HILLSTER/.test(s)) return 'HILLSTER';
    if (/GPC/.test(s)) return 'GPC';
    if (/PESIG/.test(s)) return 'PESIG';
    if (/ROBLES|R\.\s*ROBLES/.test(s)) return 'R. ROBLES';
    if (/THADDEUS|R\.?D\.?\s*THADDEUS/.test(s)) return 'RD THADDEUS';
    if (/ALFONSO/.test(s)) return 'ALFONSO';
    if (/Z.?KNIGHT/.test(s)) return 'ZKNIGHTS';
    if (/PRIME\s*UPLAND/.test(s)) return 'PRIME UPLAND';
    if (/WVA/.test(s)) return 'WVA FLEET';
    if (/ELIJAH/.test(s)) return 'ELIJAH';
    if (/PEDRAJA/.test(s)) return 'PEDRAJA';
    if (/OWN/.test(s)) return 'OWN';
    return safeStr(raw) || 'Unknown';
  }

  function normalizeReason(raw) {
    const s = safeStr(raw).toUpperCase();
    if (!s) return 'Unspecified';
    if (/ACCIDENT|INVOLVED IN/.test(s)) return 'Accident';
    if (/CLUTCH/.test(s)) return 'Clutch / Clutch Lining';
    if (/BRAKE|BREAK\b|BREAK PAD|BREAK DRUM|AIR BRAKE/.test(s)) return 'Brake System';
    if (/TRANSMISSION|GEAR|SHIFT|DIFFERENTIAL|V-?ROD|TORQUE/.test(s)) return 'Transmission / Gear';
    if (/LOW\s*POWER|OVERHEAT/.test(s)) return 'Low Power / Overheat';
    if (/TIRE|TYRE|FLAT/.test(s)) return 'Tire';
    if (/BATTERY|ALTERNATOR|ELECTRICAL|WIRING|STARTER|IGNITION|HEADLIGHT|LIGHT/.test(s)) return 'Electrical / Battery';
    if (/INJECTOR|INJECTION\s*PUMP|DIESEL|FUEL/.test(s)) return 'Fuel / Injector';
    if (/WATER\s*PUMP|RADIATOR|FAN.?BELT|COOLANT/.test(s)) return 'Cooling System';
    if (/PROPELLER|CENTER\s*BEARING|SHAFT|U-?BOLT|SLACK/.test(s)) return 'Driveline / Propeller';
    if (/STEERING/.test(s)) return 'Steering';
    return safeStr(raw).slice(0, 60) || 'Other';
  }

  function normalizeStatus(raw) {
    const s = safeStr(raw).toUpperCase();
    if (!s) return 'Unknown';
    if (/DONE\s*TRANSFER|TRANSFER/.test(s)) return 'Done Transfer';
    if (/DONE\s*REPAIR|REPAIR/.test(s)) return 'Done Repair';
    if (/DONE\s*SETTLED|SETTLED/.test(s)) return 'Done Settled';
    if (/DONE\s*SERIES|SERIES/.test(s)) return 'Done Series';
    if (/FOR\s*REPAIR/.test(s)) return 'For Repair';
    return safeStr(raw) || 'Unknown';
  }

  function findColMap(headers) {
    const lower = (headers || []).map(h => safeStr(h).toLowerCase());
    const find = (...needles) => {
      for (let i = 0; i < lower.length; i++) {
        const h = lower[i];
        if (!h) continue;
        for (const n of needles) {
          if (h === n || h.includes(n)) return i;
        }
      }
      return -1;
    };
    return {
      entryDate: find('entry date', 'entrydate', 'date'),
      month: find('month'),
      trucker: find('trucker', 'carrier', 'supplier'),
      plate: find('plate #', 'plate', 'plate no', 'plate number'),
      taskPlan: find('task  plan', 'task plan', 'task', 'task id'),
      destination: find('destination', 'backload from'),
      depTime: find('departure time from dc', 'departure time'),
      timeReported: find('time reported'),
      location: find('exact location', 'location'),
      downtime: find('no. of hours downtime', 'hours downtime', 'downtime'),
      resumeTime: find('actual time of resume', 'time of resume'),
      reason: find('reason'),
      broken: find('broken?'),
      rescue: find('rescue truck'),
      status: find('status'),
      persons: find('how many person', 'person need'),
      amount: find('total amount'),
      remarks: find('remarks'),
      email: find('email')
    };
  }

  function avg(arr) {
    const nums = (arr || []).filter(x => x != null && !isNaN(x));
    if (!nums.length) return null;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  return {
    pad2, safeStr, parseDateKey, parseMonthLabel, MONTH_ORDER, monthIndex,
    parseDowntimeHours, formatHours, normalizeTrucker, normalizeReason, normalizeStatus,
    findColMap, avg, escapeHtml
  };
})();
