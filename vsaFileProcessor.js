/* ==========================================================================
   MODULE: VSA FILE PROCESSOR (Excel upload & normalization)
   ========================================================================== */
const VsaFileProcessor = (() => {
  let storedRows = null;
  let storedDates = [];
  let onReadyCallback = null;

  function getState() {
    return { storedRows, storedDates };
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

  function pickDataSheet(workbook) {
    // Prefer GENERATED (full YES/NO dump), then any sheet with SAME? + size columns
    if (workbook.SheetNames.includes('GENERATED')) return 'GENERATED';

    for (const n of workbook.SheetNames) {
      const sample = XLSX.utils.sheet_to_json(workbook.Sheets[n], { defval: null, header: 1 });
      if (sample.length < 2) continue;
      const hdr = (sample[0] || []).map(h => String(h || '').toLowerCase()).join(' ');
      if (/same\?/.test(hdr) && (/actual size/.test(hdr) || /planning truck size/.test(hdr))) {
        return n;
      }
    }
    // Fallback: any sheet with SAME?
    for (const n of workbook.SheetNames) {
      const sample = XLSX.utils.sheet_to_json(workbook.Sheets[n], { defval: null, header: 1 });
      if (sample.length < 2) continue;
      const hdr = (sample[0] || []).map(h => String(h || '').toLowerCase()).join(' ');
      if (/same\?/.test(hdr) || /is it consistent/.test(hdr)) return n;
    }
    return null;
  }

  function processWorkbook(workbook) {
    const loading = document.getElementById('loading');
    const sheetName = pickDataSheet(workbook);

    if (!sheetName) {
      alert('No data sheet found. Expected a sheet named GENERATED (or any sheet with SAME? / Actual size / Planning Truck Size columns).');
      if (loading) loading.classList.add('hidden');
      return;
    }

    const aoa = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      defval: null,
      raw: true
    });
    if (!aoa.length) {
      alert('Selected sheet is empty.');
      if (loading) loading.classList.add('hidden');
      return;
    }

    const headers = aoa[0];
    const col = VsaUtils.findColMap(headers);
    if (col.same < 0 && col.actualSize < 0) {
      alert('Could not find SAME? or Actual size columns in sheet "' + sheetName + '".');
      if (loading) loading.classList.add('hidden');
      return;
    }

    const rows = [];
    const dateSet = new Set();

    for (let r = 1; r < aoa.length; r++) {
      const row = aoa[r];
      if (!row || !row.length) continue;

      const sameRaw = col.same >= 0 ? row[col.same] : null;
      const same = VsaUtils.normalizeSame(sameRaw);
      // Skip rows with no usable consistency flag (blank / #VALUE! / empty)
      if (same == null) continue;

      const dateKey = VsaUtils.parseDateKey(col.date >= 0 ? row[col.date] : null);
      if (!dateKey) continue;

      const actualSize = VsaUtils.normalizeSize(col.actualSize >= 0 ? row[col.actualSize] : '');
      const plannedSize = VsaUtils.normalizeSize(col.plannedSize >= 0 ? row[col.plannedSize] : '');

      // If both sizes present but SAME not set, derive it
      let isMatch = same === 'YES';
      if (same == null && actualSize && plannedSize) {
        isMatch = actualSize === plannedSize;
      }

      const area = VsaUtils.safeStr(col.area >= 0 ? row[col.area] : '') ||
        VsaUtils.safeStr(col.shippingRegion >= 0 ? row[col.shippingRegion] : '') ||
        'Unknown';

      const route = VsaUtils.safeStr(col.route >= 0 ? row[col.route] : '') || '—';
      const plate = VsaUtils.safeStr(col.plate >= 0 ? row[col.plate] : '');
      const shippingBranch = VsaUtils.safeStr(col.shippingBranch >= 0 ? row[col.shippingBranch] : '') ||
        VsaUtils.safeStr(col.routeOwner >= 0 ? row[col.routeOwner] : '') || '—';
      const destBranch = VsaUtils.safeStr(col.destBranch >= 0 ? row[col.destBranch] : '');
      const carrier = VsaUtils.safeStr(
        (col.carrier >= 0 && row[col.carrier]) ||
        (col.carrierName >= 0 && row[col.carrierName]) ||
        ''
      ) || '—';
      const shipmentNo = VsaUtils.safeStr(col.shipmentNo >= 0 ? row[col.shipmentNo] : '');
      const mission = VsaUtils.safeStr(col.mission >= 0 ? row[col.mission] : '');
      const status = VsaUtils.safeStr(col.status >= 0 ? row[col.status] : '');
      const wheels = VsaUtils.safeStr(col.wheels >= 0 ? row[col.wheels] : '');
      const driver = VsaUtils.safeStr(col.driver >= 0 ? row[col.driver] : '');
      const aa = VsaUtils.safeStr(col.aa >= 0 ? row[col.aa] : '');

      // Prefer AA=INCLUDED when present; otherwise keep all
      if (aa && aa.toUpperCase() !== 'INCLUDED' && aa.toUpperCase() !== 'YES') {
        // still include but flag
      }

      rows.push({
        dateKey,
        route,
        area,
        same,           // 'YES' | 'NO'
        isMatch,        // boolean
        shipmentNo,
        mission,
        status,
        plate,
        actualSize,
        plannedSize,
        shippingBranch,
        destBranch,
        carrier,
        wheels,
        driver,
        aa: aa || 'INCLUDED'
      });
      dateSet.add(dateKey);
    }

    if (!rows.length) {
      alert('No valid rows with SAME? = YES/NO and a valid DATE found in "' + sheetName + '".');
      if (loading) loading.classList.add('hidden');
      return;
    }

    storedRows = rows;
    storedDates = Array.from(dateSet).sort();

    if (loading) loading.classList.add('hidden');
    if (typeof onReadyCallback === 'function') {
      onReadyCallback(storedRows, storedDates);
    }
  }

  return {
    getState,
    setOnReady,
    handleFile
  };
})();
