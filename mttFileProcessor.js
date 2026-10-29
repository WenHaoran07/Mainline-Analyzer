/* ==========================================================================
   MODULE: MTT FILE PROCESSOR (Excel upload & normalization)
   ========================================================================== */
const MttFileProcessor = (() => {
  let storedRows = null;
  let storedDates = [];
  let supervisorPack = null;
  let onReadyCallback = null;

  function getState() {
    return { storedRows, storedDates, supervisorPack };
  }

  function processDelaySheet(workbook) {
    if (typeof MttDelayReason !== 'undefined' && MttDelayReason.ingestWorkbook) {
      return MttDelayReason.ingestWorkbook(workbook);
    }
    return { count: 0 };
  }

  function handleFile(file) {
    const loading = document.getElementById('loading');
    const results = document.getElementById('results');
    if (loading) loading.classList.remove('hidden');
    if (results) results.classList.add('hidden');

    const reader = new FileReader();
    reader.onload = e => {
      try {
        const workbook = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: false, raw: true });
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
    let sheetName = workbook.SheetNames.includes('DATA') ? 'DATA' : null;
    if (!sheetName) {
      for (const n of workbook.SheetNames) {
        const sample = XLSX.utils.sheet_to_json(workbook.Sheets[n], { defval: null });
        if (sample.length && Object.keys(sample[0]).some(k => /wether on time|actual travel time/i.test(k))) {
          sheetName = n;
          break;
        }
      }
    }
    if (!sheetName) {
      alert('No DATA sheet found with travel-time columns.');
      if (loading) loading.classList.add('hidden');
      return;
    }

    // Array-of-arrays so duplicate "route" headers are not collapsed
    const aoa = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: null, raw: true });
    if (!aoa.length) {
      alert('DATA sheet is empty.');
      if (loading) loading.classList.add('hidden');
      return;
    }

    const headers = aoa[0].map(h => (h == null ? '' : String(h)));
    const colMap = {};
    headers.forEach((h, i) => {
      const lower = h.toLowerCase().trim().replace(/\n/g, ' ');
      if (lower.includes('wether on time') || lower.includes('whether on time')) colMap.onTime = i;
      if (lower.includes('actual travel time')) colMap.actualTT = i;
      if (lower.includes('plan travel time')) colMap.planTT = i;
      if (lower === 'route label') colMap.routeLabel = i;
      if (lower === 'route') {
        if (colMap.routeType == null) colMap.routeType = i;
        else colMap.routeTypeAlt = i;
      }
      if (lower.includes('vehiclerier') || (lower.includes('trucker') && !lower.includes('name'))) colMap.truckerAbbr = i;
      if (lower.includes('trucker name')) colMap.truckerName = i;
      if (lower.includes('dc intended')) colMap.dcIntended = i;
      if (lower.includes('truck ownner') || lower.includes('carrier owner') || lower.includes('车辆归属')) colMap.owner = i;
      if (lower === 'region' || lower === 'region intended') colMap.region = i;
      if (lower.includes('actual arrival') || lower.includes('check in')) colMap.arrival = i;
      if (lower === 'date') colMap.date = i;
      if (lower.includes('task status')) colMap.status = i;
      if (lower.includes('number plate') || lower === 'plate' || lower.includes('plate number')) colMap.plate = i;
      if (lower === 'task id' || lower === 'taskid' || lower === 'task_id' ||
          lower === 'tasklist' || lower === 'task list' || lower.includes('task list')) colMap.taskId = i;
      if (lower.includes('supervisor') || lower.includes('incharge') || lower.includes('in charge')) colMap.supervisor = i;
    });

    function looksLikeRouteType(val) {
      const u = String(val || '').toUpperCase();
      return u.includes('LUZON ROUTE') || u.includes('VISMIN ROUTE') || u.includes('VISMIN TO');
    }
    let routeTypeIdx = colMap.routeType;
    if (routeTypeIdx != null) {
      const sample = aoa.slice(1, 80).map(r => r[routeTypeIdx]);
      const hits = sample.filter(looksLikeRouteType).length;
      if (hits < 3 && colMap.routeTypeAlt != null) {
        const sample2 = aoa.slice(1, 80).map(r => r[colMap.routeTypeAlt]);
        if (sample2.filter(looksLikeRouteType).length > hits) routeTypeIdx = colMap.routeTypeAlt;
      }
    }

    const { parseDateKey, classifyRouteType } = MttUtils;

    const normalized = aoa.slice(1).map(r => {
      const arrivalVal = (colMap.arrival != null ? r[colMap.arrival] : null) ?? (colMap.date != null ? r[colMap.date] : null);
      const dateKey = parseDateKey(arrivalVal);
      const owner = String((colMap.owner != null ? r[colMap.owner] : '') || '').toUpperCase().trim();
      const status = String((colMap.status != null ? r[colMap.status] : '') || '').trim();
      const routeTypeRaw = routeTypeIdx != null ? r[routeTypeIdx] : null;
      const get = (idx) => (idx != null ? r[idx] : null);
      // Supervisor: raw + optional next columns (W/X style split names)
      const supervisorRaw = String(get(colMap.supervisor) || '').trim();
      const colW = colMap.supervisor != null && r.length > colMap.supervisor + 1
        ? String(r[colMap.supervisor + 1] || '').trim() : '';
      const colX = colMap.supervisor != null && r.length > colMap.supervisor + 2
        ? String(r[colMap.supervisor + 2] || '').trim() : '';
      let supervisors = [];
      if (colW || colX) {
        if (colW) supervisors.push(colW);
        if (colX && colX !== colW) supervisors.push(colX);
      }
      if (!supervisors.length && supervisorRaw) {
        supervisors = supervisorRaw.split(/\s*[&/,+]\s*|\s+and\s+/i).map(s => s.trim()).filter(Boolean);
      }
      if (!supervisors.length) supervisors = ['Unassigned'];
      const supervisor = supervisors[0] || 'Unassigned';
      return {
        dateKey,
        taskId: String(get(colMap.taskId) || '').trim(),
        plate: String(get(colMap.plate) || '').trim(),
        supervisor,
        supervisors,
        supervisorRaw: supervisorRaw || supervisor,
        onTime: String(get(colMap.onTime) || '').toUpperCase().trim(),
        actualTT: parseFloat(get(colMap.actualTT)) || 0,
        planTT: parseFloat(get(colMap.planTT)) || 0,
        route: String(get(colMap.routeLabel) || '').trim() || '(blank)',
        routeType: classifyRouteType(routeTypeRaw),
        routeTypeRaw: String(routeTypeRaw || '').trim(),
        trucker: String(get(colMap.truckerName) || get(colMap.truckerAbbr) || '').trim() || '(blank)',
        dcIntended: String(get(colMap.dcIntended) || '').trim() || '(blank)',
        region: String(get(colMap.region) || '').trim() || '(blank)',
        owner, status
      };
    }).filter(r => r.dateKey);

    const slu = normalized.filter(r => {
      if (r.owner !== 'SLU') return false;
      if (!r.status) return true;
      const s = r.status.toLowerCase();
      return s.includes('completed') || s.includes('on the way');
    });

    const dates = [...new Set(slu.map(r => r.dateKey))].filter(Boolean).sort();
    if (!dates.length) {
      alert('No SLU (Truck Owner) trips with valid arrival dates found.');
      if (loading) loading.classList.add('hidden');
      return;
    }

    storedRows = slu;
    storedDates = dates;

    const selPrev = document.getElementById('selectPrev');
    const selLatest = document.getElementById('selectLatest');
    if (selPrev) selPrev.innerHTML = dates.map(d => '<option value="'+d+'">'+d+'</option>').join('');
    if (selLatest) selLatest.innerHTML = dates.map(d => '<option value="'+d+'">'+d+'</option>').join('');
    const latest = dates[dates.length - 1];
    const prev = dates.length >= 2 ? dates[dates.length - 2] : dates[0];
    if (selPrev) selPrev.value = prev;
    if (selLatest) selLatest.value = latest;

    // Also parse Delay Reason sheet (optional — does not block travel-time analysis)
    processDelaySheet(workbook);
    // Supervisor performance sheets (3PL Supervisor, Luzon Own, Vismin Own, Luzon 3PL, Vismin 3PL)
    if (typeof MttSupervisor !== 'undefined' && MttSupervisor.ingestWorkbook) {
      try { supervisorPack = MttSupervisor.ingestWorkbook(workbook); }
      catch (e) { console.warn('Supervisor sheets parse failed', e); supervisorPack = null; }
    } else {
      supervisorPack = null;
    }

    if (onReadyCallback) onReadyCallback(prev, latest, 'ALL');
  }

  function init(onReady) {
    onReadyCallback = onReady;
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    if (!dropZone || !fileInput) return;

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', e => {
      if (e.target.files.length) handleFile(e.target.files[0]);
    });
  }

  return { init, getState, handleFile };
})();
