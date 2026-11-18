/* ==========================================================================
   MODULE: BT FILE PROCESSOR (Excel upload & normalization)
   ========================================================================== */
const BtFileProcessor = (() => {
  let storedRows = null;
  let storedMonths = [];
  let onReadyCallback = null;

  function getState() {
    return { storedRows, storedMonths };
  }

  function setOnReady(cb) {
    onReadyCallback = cb;
  }

  function handleFile(file) {
    const loading = document.getElementById('loading');
    const results = document.getElementById('results');
    if (loading) loading.classList.remove('hidden');
    if (results) results.classList.add('hidden');

    const reader = new FileReader();
    reader.onload = e => {
      try {
        const workbook = XLSX.read(new Uint8Array(e.target.result), {
          type: 'array',
          cellDates: false,
          raw: true
        });
        processWorkbook(workbook);
      } catch (err) {
        alert('Error reading file: ' + err.message);
        if (loading) loading.classList.add('hidden');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function isHeaderRow(row) {
    if (!row || !row.length) return false;
    const joined = row.map(c => String(c || '').toLowerCase()).join(' ');
    return /entry\s*date/.test(joined) && (/trucker|plate/.test(joined));
  }

  function parseSheetRows(aoa, sheetNameHint) {
    if (!aoa || aoa.length < 2) return [];

    // Find header row (may not be first)
    let headerIdx = -1;
    for (let i = 0; i < Math.min(aoa.length, 15); i++) {
      if (isHeaderRow(aoa[i])) {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx < 0) return [];

    const headers = aoa[headerIdx];
    const col = BtUtils.findColMap(headers);
    if (col.plate < 0 && col.trucker < 0 && col.entryDate < 0) return [];

    const rows = [];
    const isBackload = /backload/i.test(sheetNameHint || '');

    for (let r = headerIdx + 1; r < aoa.length; r++) {
      const row = aoa[r];
      if (!row || !row.length) continue;

      const plate = BtUtils.safeStr(col.plate >= 0 ? row[col.plate] : '');
      const truckerRaw = BtUtils.safeStr(col.trucker >= 0 ? row[col.trucker] : '');
      const entryRaw = col.entryDate >= 0 ? row[col.entryDate] : null;
      const dateKey = BtUtils.parseDateKey(entryRaw);

      // Skip empty / footer rows
      if (!plate && !truckerRaw && !dateKey) continue;
      if (!plate && !truckerRaw) continue;

      const monthRaw = col.month >= 0 ? row[col.month] : null;
      const month = BtUtils.parseMonthLabel(monthRaw, dateKey);

      const downtimeRaw = col.downtime >= 0 ? row[col.downtime] : null;
      const downtimeHrs = BtUtils.parseDowntimeHours(downtimeRaw);

      const reasonRaw = BtUtils.safeStr(col.reason >= 0 ? row[col.reason] : '');
      const statusRaw = BtUtils.safeStr(col.status >= 0 ? row[col.status] : '');

      rows.push({
        id: rows.length,
        dateKey: dateKey || '',
        month,
        trucker: BtUtils.normalizeTrucker(truckerRaw),
        truckerRaw,
        plate: plate || '—',
        taskPlan: BtUtils.safeStr(col.taskPlan >= 0 ? row[col.taskPlan] : ''),
        destination: BtUtils.safeStr(col.destination >= 0 ? row[col.destination] : ''),
        depTime: col.depTime >= 0 ? row[col.depTime] : null,
        timeReported: col.timeReported >= 0 ? row[col.timeReported] : null,
        location: BtUtils.safeStr(col.location >= 0 ? row[col.location] : ''),
        downtimeRaw: downtimeRaw != null ? String(downtimeRaw) : '',
        downtimeHrs,
        resumeTime: col.resumeTime >= 0 ? row[col.resumeTime] : null,
        reason: reasonRaw,
        reasonGroup: BtUtils.normalizeReason(reasonRaw),
        broken: BtUtils.safeStr(col.broken >= 0 ? row[col.broken] : ''),
        rescue: BtUtils.safeStr(col.rescue >= 0 ? row[col.rescue] : ''),
        status: BtUtils.normalizeStatus(statusRaw),
        statusRaw,
        persons: col.persons >= 0 ? row[col.persons] : null,
        amount: col.amount >= 0 ? row[col.amount] : null,
        remarks: BtUtils.safeStr(col.remarks >= 0 ? row[col.remarks] : ''),
        email: BtUtils.safeStr(col.email >= 0 ? row[col.email] : ''),
        isBackload,
        sheet: sheetNameHint || ''
      });
    }
    return rows;
  }

  function processWorkbook(workbook) {
    const loading = document.getElementById('loading');
    const names = workbook.SheetNames || [];

    // Prefer Consolidation sheet; also collect monthly + backload
    let allRows = [];
    const seen = new Set(); // plate|dateKey|task to dedupe

    const preferred = names.filter(n => /consolidat/i.test(n));
    const monthSheets = names.filter(n =>
      /january|february|march|april|may|june|july|august|september|october|november|december/i.test(n)
    );
    const backloadSheets = names.filter(n => /backload/i.test(n));
    const other = names.filter(n =>
      !preferred.includes(n) && !monthSheets.includes(n) && !backloadSheets.includes(n) &&
      !/own\s*truck|summary/i.test(n)
    );

    const order = [...preferred, ...monthSheets, ...backloadSheets, ...other];

    for (const name of order) {
      const aoa = XLSX.utils.sheet_to_json(workbook.Sheets[name], {
        header: 1,
        defval: null,
        raw: true
      });
      const parsed = parseSheetRows(aoa, name);
      for (const r of parsed) {
        const key = (r.plate + '|' + r.dateKey + '|' + r.taskPlan).toUpperCase();
        if (seen.has(key) && r.dateKey) continue;
        if (r.dateKey || r.plate) seen.add(key);
        allRows.push(r);
      }
    }

    // If nothing found, try every sheet
    if (!allRows.length) {
      for (const name of names) {
        const aoa = XLSX.utils.sheet_to_json(workbook.Sheets[name], {
          header: 1, defval: null, raw: true
        });
        allRows = allRows.concat(parseSheetRows(aoa, name));
      }
    }

    if (!allRows.length) {
      alert('No broken-truck rows found. Expect columns: Entry Date, Trucker, Plate #, Reason, Status…');
      if (loading) loading.classList.add('hidden');
      return;
    }

    // Sort by date
    allRows.sort((a, b) => {
      if (a.dateKey && b.dateKey) return a.dateKey.localeCompare(b.dateKey);
      if (a.dateKey) return -1;
      if (b.dateKey) return 1;
      return BtUtils.monthIndex(a.month) - BtUtils.monthIndex(b.month);
    });
    allRows.forEach((r, i) => { r.id = i; });

    storedRows = allRows;
    const monthSet = new Set(allRows.map(r => r.month).filter(Boolean));
    storedMonths = BtUtils.MONTH_ORDER.filter(m => monthSet.has(m));
    // append any non-standard months
    monthSet.forEach(m => {
      if (!storedMonths.includes(m)) storedMonths.push(m);
    });

    if (loading) loading.classList.add('hidden');
    if (typeof onReadyCallback === 'function') {
      onReadyCallback(storedRows, storedMonths);
    }
  }

  return { getState, setOnReady, handleFile, processWorkbook };
})();
