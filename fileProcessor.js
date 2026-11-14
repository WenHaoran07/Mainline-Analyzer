/* ==========================================================================
   MODULE: FILE PROCESSOR & UPLOAD CONTROLLER
   ========================================================================== */
const FileProcessor = (() => {
  let storedAllRows = null;
  let storedSlu = null;
  let storedColMap = null;
  let storedDates = [];
  let storedRouteSummary = [];

  function handleFile(file, onComplete) {
    const loading = document.getElementById('loading');
    const results = document.getElementById('results');
    
    loading.classList.remove('hidden');
    results.classList.add('hidden');

    const startTime = Date.now();
    const reader = new FileReader();

    reader.onload = function(e) {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });

        const elapsedTime = Date.now() - startTime;
        const remainingTime = Math.max(0, 8000 - elapsedTime);

        setTimeout(() => {
          parseWorkbook(workbook, onComplete);
        }, remainingTime);

      } catch (err) {
        alert('Error reading file: ' + err.message);
        loading.classList.add('hidden');
      }
    };
    reader.readAsArrayBuffer(file);
  }


  function parseRouteSummarySheet(workbook) {
    try {
      const names = workbook.SheetNames || [];
      const name = names.find(n => /per\s*route\s*summary/i.test(String(n)))
        || names.find(n => /route\s*summary/i.test(String(n)))
        || names.find(n => /summary/i.test(String(n)) && /route/i.test(String(n)));
      if (!name) {
        console.warn('[LR] PER ROUTE SUMMARY sheet not found. Sheets:', names);
        return [];
      }
      const sheet = workbook.Sheets[name];
      // Build dense matrix (preserve empty cells)
      const ref = sheet['!ref'] || 'A1';
      const range = XLSX.utils.decode_range(ref);
      const matrix = [];
      for (let R = range.s.r; R <= range.e.r; R++) {
        const row = [];
        for (let C = range.s.c; C <= Math.min(range.e.c, 40); C++) {
          const addr = XLSX.utils.encode_cell({ r: R, c: C });
          const cell = sheet[addr];
          row.push(cell ? (cell.v != null ? cell.v : null) : null);
        }
        matrix.push(row);
      }

      const routeRe = /^\d{3,4}-\d{3,4}(?:\/\d{3,4})?(?:-\d{3,4})?$/;
      const out = [];
      let section = 'UNKNOWN';
      let group = '';
      let targetCol = -1;
      let achCol = -1;
      let monthCols = [];

      function num(v) {
        if (v == null || v === '' || v === '-') return null;
        if (typeof v === 'number' && isFinite(v)) return v;
        const n = parseFloat(String(v).replace(/,/g, '').replace(/%/g, ''));
        return isNaN(n) ? null : n;
      }

      for (let r = 0; r < matrix.length; r++) {
        const row = matrix[r] || [];

        for (let c = 0; c < Math.min(row.length, 5); c++) {
          const t = row[c] != null ? String(row[c]).trim() : '';
          if (/VISMIN/i.test(t) && /Average|Loading/i.test(t)) { section = 'VISMIN'; group = ''; }
          if (/LUZON/i.test(t) && /Average|Loading/i.test(t)) { section = 'LUZON'; group = ''; }
          if (/^(WVA|BSL|CDO|DVO)$/i.test(t)) group = t.toUpperCase();
          if (/\d{3,4}-Luzon/i.test(t)) group = t;
        }

        // Header detection
        let sawRoute = false;
        let tc = -1, ac = -1, mc = [];
        for (let c = 0; c < row.length; c++) {
          const t = row[c] != null ? String(row[c]).trim().toLowerCase() : '';
          if (t === 'route') sawRoute = true;
          if (t === 'target') tc = c;
          if (t.indexOf('achiv') >= 0 || t.indexOf('achiev') >= 0) ac = c;
          if (/^(january|february|march|april|may|june|july|august|september|october|november|december)$/i.test(t)) mc.push(c);
        }
        if (sawRoute && (tc >= 0 || ac >= 0)) {
          targetCol = tc;
          achCol = ac;
          monthCols = mc;
          continue;
        }

        // Route cell
        let route = null;
        for (let c = 0; c < row.length; c++) {
          const t = row[c] != null ? String(row[c]).trim() : '';
          if (routeRe.test(t)) { route = t; break; }
        }
        if (!route) continue;

        const target = targetCol >= 0 ? num(row[targetCol]) : null;
        let achievement = achCol >= 0 ? num(row[achCol]) : null;
        if (achievement != null && achievement > 1.5) achievement = achievement / 100;

        const monthNums = monthCols.map(c => num(row[c])).filter(v => v != null && v >= 50);
        const latestMonth = monthNums.length ? monthNums[monthNums.length - 1] : null;
        const prevMonth = monthNums.length >= 2 ? monthNums[monthNums.length - 2] : null;

        const dailyVals = [];
        const startDaily = Math.max(achCol >= 0 ? achCol + 1 : 0, targetCol >= 0 ? targetCol + 2 : 0);
        for (let c = startDaily; c < row.length; c++) {
          const v = num(row[c]);
          if (v != null && v >= 50 && v < 100000) dailyVals.push(v);
        }
        const dailyDrop = dailyVals.length >= 2
          ? dailyVals[dailyVals.length - 1] - dailyVals[dailyVals.length - 2]
          : null;

        let ach = achievement;
        if (ach == null && target && latestMonth != null && target > 0) ach = latestMonth / target;

        const underTarget = (ach != null && ach < 1) || (target != null && latestMonth != null && latestMonth < target - 0.5);

        out.push({
          route, section, group, target,
          achievement: ach,
          latestMonth, prevMonth,
          monthDiff: (latestMonth != null && prevMonth != null) ? latestMonth - prevMonth : null,
          dailyVals, dailyDrop, underTarget
        });
      }
      console.log('[LR] PER ROUTE SUMMARY parsed:', out.length, 'routes, under target:', out.filter(r => r.underTarget).length);
      return out;
    } catch (err) {
      console.error('[LR] parseRouteSummarySheet failed:', err);
      return [];
    }
  }

  function parseWorkbook(workbook, onComplete) {
    const loading = document.getElementById('loading');
    if (!workbook.SheetNames.includes('Mainline')) {
      alert('Mainline sheet not found in the file.');
      loading.classList.add('hidden');
      return;
    }

    const sheet = workbook.Sheets['Mainline'];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
    const colMap = {};

    if (rows.length > 0) {
      Object.keys(rows[0]).forEach(k => {
        const lower = k.toLowerCase().trim();
        if (lower.includes('loading tickets')) colMap.lt = k;
        if (lower.includes('装车包数') || lower.includes('packages')) colMap.pkgs = k;
        if (lower === 'route') colMap.route = k;
        if (lower.includes('shipping branch')) colMap.branch = k;
        if (lower === 'date') colMap.date = k;
        if (lower === 'region') colMap.region = k;
        // Detail table fields
        if (lower === 'shipmentno' || lower === 'shipment no') colMap.shipmentNo = k;
        if (lower === 'check-out' || lower === 'check out' || lower === 'checkout') colMap.checkout = k;
        if (lower === 'route owner') colMap.routeOwner = k;
        if (lower.includes('vehicle plate')) colMap.plateNo = k;
        if (lower === 'actual size') colMap.actualSize = k;
        if (lower.includes('planning truck')) colMap.planningSize = k;
        if (lower === 'destination branch') colMap.destBranch = k;
        if (lower === 'shipping region') colMap.shipRegion = k;
        if (lower === 'destination region') colMap.destRegion = k;
        if (lower.includes('vehicle carrier')) colMap.vehicleCarrier = k;
        if (lower === 'carrier') colMap.carrier = k;
        if (lower === 'wheels') colMap.wheels = k;
      });
    }

    const slu = rows.filter(r => String(r[colMap.region] || '').toUpperCase().trim() === 'SLU');
    const dates = [...new Set(slu.map(r => String(r[colMap.date]).substring(0, 10)))]
      .filter(d => d && d !== 'null' && d !== 'undefined').sort();

    if (dates.length < 2) {
      alert('Need at least 2 days of SLU data. Found: ' + dates.join(', '));
      loading.classList.add('hidden');
      return;
    }

    storedAllRows = rows;
    storedSlu = slu;
    storedColMap = colMap;
    storedDates = dates;
    storedRouteSummary = parseRouteSummarySheet(workbook);

    const selPrev = document.getElementById('selectPrev');
    const selLatest = document.getElementById('selectLatest');
    selPrev.innerHTML = dates.map(d => `<option value="${d}">${d}</option>`).join('');
    selLatest.innerHTML = dates.map(d => `<option value="${d}">${d}</option>`).join('');
    selPrev.value = dates[dates.length - 2];
    selLatest.value = dates[dates.length - 1];

    onComplete(dates[dates.length - 2], dates[dates.length - 1], 'ALL');
  }

  function init(onFileParsed) {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0], onFileParsed);
    });
    fileInput.addEventListener('change', e => {
      if (e.target.files.length) handleFile(e.target.files[0], onFileParsed);
    });
  }

  function getState() {
    return { storedAllRows, storedSlu, storedColMap, storedDates, storedRouteSummary };
  }

  return { init, getState };
})();
