/* ==========================================================================
   MODULE: FILE PROCESSOR & UPLOAD CONTROLLER
   ========================================================================== */
const FileProcessor = (() => {
  let storedAllRows = null;
  let storedSlu = null;
  let storedColMap = null;
  let storedDates = [];

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
    return { storedAllRows, storedSlu, storedColMap, storedDates };
  }

  return { init, getState };
})();