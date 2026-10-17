/* ==========================================================================
   MODULE: WFD FILE PROCESSOR (Excel upload & normalization)
   ========================================================================== */
const WfdFileProcessor = (() => {
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

  function processWorkbook(workbook) {
    const loading = document.getElementById('loading');

    // Prefer DATA sheet; fallback to TEMPLATE or any sheet with interval / on-time columns
    let sheetName = workbook.SheetNames.includes('DATA') ? 'DATA' : null;
    if (!sheetName && workbook.SheetNames.includes('TEMPLATE')) sheetName = 'TEMPLATE';
    if (!sheetName) {
      for (const n of workbook.SheetNames) {
        const sample = XLSX.utils.sheet_to_json(workbook.Sheets[n], { defval: null, header: 1 });
        if (sample.length > 1) {
          const hdr = (sample[0] || []).map(h => String(h || '').toLowerCase()).join(' ');
          if (/whether on time|interval time|actual departure|finish loading/.test(hdr)) {
            sheetName = n;
            break;
          }
        }
      }
    }
    if (!sheetName) {
      alert('No DATA / TEMPLATE sheet found with Waiting-for-Departure columns.');
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
    const col = WfdUtils.findColMap(headers);
    if (col.interval < 0 && col.onTime < 0) {
      alert('Could not find Interval Time or Whether-on-time columns.');
      if (loading) loading.classList.add('hidden');
      return;
    }

    const rows = [];
    const dateSet = new Set();

    for (let r = 1; r < aoa.length; r++) {
      const row = aoa[r];
      if (!row || !row.length) continue;

      const dateKey = WfdUtils.parseDateKey(col.date >= 0 ? row[col.date] : null);
      if (!dateKey) continue;

      let interval = col.interval >= 0 ? row[col.interval] : null;
      if (typeof interval === 'string') interval = parseFloat(interval);
      if (interval != null && isNaN(interval)) interval = null;

      const whether = col.onTime >= 0 ? row[col.onTime] : null;
      const onTime = WfdUtils.isOnTime(interval, whether);
      if (onTime == null && interval == null) continue;

      const dcName = WfdUtils.safeStr(
        (col.dcName >= 0 && row[col.dcName]) ||
        (col.truckOwner >= 0 && row[col.truckOwner]) ||
        ''
      ) || 'Unknown';

      const supervisorRaw = WfdUtils.safeStr(col.supervisor >= 0 ? row[col.supervisor] : '');
      // Split combined supervisors "A, B" into primary for grouping; keep full for display
      const supervisor = supervisorRaw || 'Unassigned';

      const region = WfdUtils.safeStr(col.region >= 0 ? row[col.region] : '') || 'SLU';
      const routeName = WfdUtils.safeStr(col.routeName >= 0 ? row[col.routeName] : '') ||
        WfdUtils.safeStr(col.routeLine >= 0 ? row[col.routeLine] : '');
      const plate = WfdUtils.safeStr(col.plate >= 0 ? row[col.plate] : '');
      const carrier = WfdUtils.safeStr(
        (col.carrier >= 0 && row[col.carrier]) ||
        (col.carrierAbbr >= 0 && row[col.carrierAbbr]) ||
        ''
      );
      const taskId = WfdUtils.safeStr(col.taskId >= 0 ? row[col.taskId] : '');
      const status = WfdUtils.safeStr(col.status >= 0 ? row[col.status] : '');
      const depStation = WfdUtils.safeStr(col.depStation >= 0 ? row[col.depStation] : '');
      const unload = WfdUtils.safeStr(col.unloadStation >= 0 ? row[col.unloadStation] : '');
      const vehicleType = WfdUtils.safeStr(col.vehicleType >= 0 ? row[col.vehicleType] : '');
      const business = WfdUtils.safeStr(col.business >= 0 ? row[col.business] : '');
      const truckOwner = WfdUtils.safeStr(col.truckOwner >= 0 ? row[col.truckOwner] : '');
      const dcCode = WfdUtils.safeStr(col.dcCode >= 0 ? row[col.dcCode] : '') || depStation;

      rows.push({
        dateKey,
        region,
        taskId,
        status,
        routeName,
        plate,
        carrier,
        vehicleType,
        depStation,
        unload,
        interval: interval != null ? Number(interval) : null,
        onTime: !!onTime,
        truckOwner,
        dcName,
        dcCode,
        supervisor,
        business
      });
      dateSet.add(dateKey);
    }

    if (!rows.length) {
      alert('No valid departure records found after parsing.');
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
    handleFile,
    processWorkbook,
    getState,
    setOnReady
  };
})();
