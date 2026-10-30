/* ==========================================================================
   MODULE: MTT RATE MATRIX
   Heat matrix matching Travel Time Weekly/Monthly Comparison layout:
     MAINLINE TRAVEL TIME / OVERALL
     LUZON ROUTE
     VISMIN ROUTE
   Truck Owner = SLU (FileProcessor). Rate = YES ÷ trips in period.
   Week = Excel WEEKNUM (Sunday→Saturday) via MttUtils — same as Weekly tab.
   ========================================================================== */
const MttRateMatrix = (() => {
  const TARGET = { ALL: 0.96, LUZON: 0.97, VISMIN: 0.85 };
  const REGION_LABEL = 'SLU';

  const SCOPES = [
    { id: 'ALL', title: 'OVERALL', head: 'MAINLINE TRAVEL TIME', target: TARGET.ALL },
    { id: 'LUZON', title: 'LUZON ROUTE', head: 'LUZON ROUTE', target: TARGET.LUZON },
    { id: 'VISMIN', title: 'VISMIN ROUTE', head: 'VISMIN ROUTE', target: TARGET.VISMIN }
  ];

  let mode = 'weekly'; // 'weekly' | 'monthly'

  function pad2(n) { return String(n).padStart(2, '0'); }

  /** Sunday → Saturday (shared with Weekly tab via MttUtils) */
  function excelWeekNum(dateKey) {
    return (typeof MttUtils !== 'undefined' && MttUtils.excelWeekNum)
      ? MttUtils.excelWeekNum(dateKey)
      : null;
  }

  function weekKey(dateKey) {
    if (typeof MttUtils !== 'undefined' && MttUtils.weekKey) return MttUtils.weekKey(dateKey);
    return null;
  }

  function monthKey(dateKey) {
    return dateKey ? dateKey.slice(0, 7) : null;
  }

  function periodKey(dateKey) {
    return mode === 'weekly' ? weekKey(dateKey) : monthKey(dateKey);
  }

  function periodLabel(key) {
    return labelFor(key, mode);
  }

  function getRows(forMode) {
    const m = forMode || mode;
    if (typeof MttFileProcessor === 'undefined') return [];
    const st = MttFileProcessor.getState();
    const pkFn = m === 'weekly' ? weekKey : monthKey;
    return (st.storedRows || []).map(r => Object.assign({}, r, {
      period: r.dateKey ? pkFn(r.dateKey) : null
    }));
  }

  function labelFor(key, forMode) {
    const m = forMode || mode;
    if (m === 'weekly') {
      const mm = String(key).match(/W(\d+)/i);
      return mm ? ('WK ' + parseInt(mm[1], 10) + ' RATE') : key;
    }
    if (!key || key.length < 7) return key;
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
      'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const mi = parseInt(key.slice(5, 7), 10) - 1;
    return (months[mi] || key.slice(5)) + ' ' + key.slice(0, 4);
  }

  function stats(list) {
    if (!list || !list.length) return { total: 0, yes: 0, no: 0, rate: null };
    const yes = list.filter(r => String(r.onTime || '').toUpperCase() === 'YES').length;
    const total = list.length;
    return { total, yes, no: total - yes, rate: yes / total };
  }

  function filterScope(list, scope) {
    if (scope === 'LUZON') return list.filter(r => r.routeType === 'LUZON');
    if (scope === 'VISMIN') return list.filter(r => r.routeType === 'VISMIN');
    return list;
  }

  function periodKeys(rows) {
    const set = new Set(rows.map(r => r.period).filter(Boolean));
    return [...set].sort();
  }

  function fmtPct(v) {
    if (v == null || isNaN(v)) return '—';
    return (v * 100).toFixed(2) + '%';
  }

  function rateColor(rate, target) {
    if (rate == null || isNaN(rate)) {
      return { bg: 'ECEFF1', fg: '78909C', cssBg: '#ECEFF1', cssFg: '#78909C' };
    }
    const pct = rate * 100;
    const t = (target || 0.96) * 100;
    if (pct >= t) return { bg: 'A5D6A7', fg: '1B5E20', cssBg: '#A5D6A7', cssFg: '#1B5E20' };
    if (pct >= t - 2) return { bg: 'C5E1A5', fg: '33691E', cssBg: '#C5E1A5', cssFg: '#33691E' };
    if (pct >= t - 5) return { bg: 'FFF59D', fg: 'F57F17', cssBg: '#FFF59D', cssFg: '#F57F17' };
    if (pct >= t - 10) return { bg: 'FFCC80', fg: 'E65100', cssBg: '#FFCC80', cssFg: '#E65100' };
    return { bg: 'EF9A9A', fg: 'B71C1C', cssBg: '#EF9A9A', cssFg: '#B71C1C' };
  }

  function sparklineSvg(rates) {
    const vals = rates.filter(v => v != null && !isNaN(v));
    if (vals.length < 2) return '<span class="rm-spark-empty">—</span>';
    const w = 72, h = 22, pad = 2;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const span = max - min || 0.01;
    const pts = vals.map((v, i) => {
      const x = pad + (i / (vals.length - 1)) * (w - pad * 2);
      const y = h - pad - ((v - min) / span) * (h - pad * 2);
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
    const stroke = vals[vals.length - 1] >= vals[0] ? '#2E7D32' : '#E60012';
    return '<svg class="rm-spark" width="' + w + '" height="' + h +
      '" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true">' +
      '<polyline fill="none" stroke="' + stroke + '" stroke-width="1.6" points="' + pts + '"/>' +
      '</svg>';
  }

  function buildMatrix(allRows, scopeId) {
    const scoped = filterScope(allRows, scopeId);
    const periods = periodKeys(scoped);
    const rates = {};
    periods.forEach(pk => {
      rates[pk] = stats(scoped.filter(r => r.period === pk)).rate;
    });
    return { periods, rates };
  }

  function renderBlock(scope, matrix) {
    const { periods, rates } = matrix;
    let h = '<div class="rm-block">';
    h += '<div class="rm-block-head">';
    h += '<div class="rm-block-title">' + scope.head + '</div>';
    if (scope.id === 'ALL') {
      h += '<div class="rm-block-sub">' + scope.title +
        ' <span class="rm-target">Target ' + Math.round(scope.target * 100) + '%</span></div>';
    } else {
      h += '<div class="rm-block-sub"><span class="rm-target">Target ' +
        Math.round(scope.target * 100) + '%</span></div>';
    }
    h += '</div>';

    if (!periods.length) {
      h += '<p class="section-note">No data for this scope.</p></div>';
      return h;
    }

    const trendLabelTxt = mode === 'weekly' ? 'Weekly Trend' : 'Monthly Trend';
    h += '<div class="rm-table-wrap"><table class="rm-table"><thead><tr>';
    h += '<th class="rm-th-region">REGION</th>';
    periods.forEach(pk => { h += '<th>' + periodLabel(pk) + '</th>'; });
    h += '<th class="rm-th-trend">' + trendLabelTxt + '</th>';
    h += '</tr></thead><tbody><tr>';
    h += '<td class="rm-region">' + REGION_LABEL + '</td>';
    const series = periods.map(pk => rates[pk]);
    periods.forEach(pk => {
      const rate = rates[pk];
      const c = rateColor(rate, scope.target);
      h += '<td class="rm-rate" style="background:' + c.cssBg + ';color:' + c.cssFg + '">' +
        fmtPct(rate) + '</td>';
    });
    h += '<td class="rm-trend">' + sparklineSvg(series) + '</td>';
    h += '</tr></tbody></table></div></div>';
    return h;
  }

  function render() {
    const el = document.getElementById('rmView');
    if (!el) return;
    const rows = getRows();
    if (!rows.length) {
      el.innerHTML = '<p class="section-note">No SLU truck-owner rows found. Upload a Mainline workbook first.</p>';
      return;
    }
    const periods = periodKeys(rows);
    let html = '<div class="rm-meta">';
    html += '</div>';
    SCOPES.forEach(scope => {
      html += renderBlock(scope, buildMatrix(rows, scope.id));
    });
    el.innerHTML = html;
  }

  /* ---------- Export: Weekly + Monthly (no black-square glyphs) ---------- */

  /** Trend text safe for Excel — plain ASCII only */
  function trendText(series) {
    const nums = series.filter(v => v != null && !isNaN(v));
    if (nums.length < 2) return '-';
    const d = nums[nums.length - 1] - nums[0];
    const pp = (d * 100).toFixed(2);
    if (d > 0.0005) return 'UP +' + pp + 'pp';
    if (d < -0.0005) return 'DOWN ' + pp + 'pp';
    return 'FLAT 0.00pp';
  }

  function buildSheetAoA(forMode) {
    const rows = getRows(forMode);
    const aoa = [];
    const merges = [];
    const styles = {};

    function setS(r, c, s) { styles[r + '_' + c] = s; }

    const titleStyle = {
      fill: { patternType: 'solid', fgColor: { rgb: 'E60012' } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 13, name: 'Calibri' },
      alignment: { horizontal: 'center', vertical: 'center' }
    };
    const headStyle = {
      fill: { patternType: 'solid', fgColor: { rgb: 'FFEBEE' } },
      font: { bold: true, color: { rgb: 'B8000E' }, sz: 10, name: 'Calibri' },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true }
    };
    const regionStyle = {
      font: { bold: true, sz: 11, name: 'Calibri' },
      alignment: { horizontal: 'center', vertical: 'center' },
      fill: { patternType: 'solid', fgColor: { rgb: 'FAFAFA' } }
    };

    SCOPES.forEach((scope, si) => {
      if (si > 0) {
        aoa.push([]);
        aoa.push([]);
      }
      const scoped = filterScope(rows, scope.id);
      const periods = periodKeys(scoped);
      const rates = {};
      periods.forEach(pk => {
        rates[pk] = stats(scoped.filter(r => r.period === pk)).rate;
      });
      const series = periods.map(pk => rates[pk]);
      const colCount = Math.max(periods.length + 2, 3);

      const titleRow = aoa.length;
      const titleCells = [scope.head];
      for (let i = 1; i < colCount; i++) titleCells.push('');
      aoa.push(titleCells);
      merges.push({ s: { r: titleRow, c: 0 }, e: { r: titleRow, c: colCount - 1 } });
      for (let c = 0; c < colCount; c++) setS(titleRow, c, titleStyle);

      const subRow = aoa.length;
      const subText = scope.id === 'ALL'
        ? (scope.title + '  ·  Target ' + Math.round(scope.target * 100) + '%')
        : ('Target ' + Math.round(scope.target * 100) + '%');
      const sub = [subText];
      for (let i = 1; i < colCount; i++) sub.push('');
      aoa.push(sub);
      merges.push({ s: { r: subRow, c: 0 }, e: { r: subRow, c: colCount - 1 } });
      for (let c = 0; c < colCount; c++) setS(subRow, c, titleStyle);

      const headRow = aoa.length;
      const head = ['REGION'].concat(periods.map(pk => labelFor(pk, forMode)));
      head.push(forMode === 'weekly' ? 'Weekly Trend' : 'Monthly Trend');
      while (head.length < colCount) head.push('');
      aoa.push(head);
      for (let c = 0; c < head.length; c++) setS(headRow, c, headStyle);

      const dataRow = aoa.length;
      const rowVals = [REGION_LABEL];
      periods.forEach(pk => {
        const rate = rates[pk];
        rowVals.push(rate == null ? null : rate);
      });
      // Plain text only — no unicode blocks (they become black squares in Excel)
      rowVals.push(trendText(series));
      aoa.push(rowVals);

      setS(dataRow, 0, regionStyle);
      periods.forEach((pk, i) => {
        const rate = rates[pk];
        const c = rateColor(rate, scope.target);
        setS(dataRow, i + 1, {
          fill: { patternType: 'solid', fgColor: { rgb: c.bg } },
          font: { bold: true, sz: 10, name: 'Calibri', color: { rgb: c.fg } },
          alignment: { horizontal: 'center', vertical: 'center' },
          numFmt: '0.00%'
        });
      });
      const tStyle = {
        font: { bold: true, sz: 10, name: 'Calibri' },
        alignment: { horizontal: 'center', vertical: 'center' }
      };
      const nums = series.filter(v => v != null && !isNaN(v));
      if (nums.length >= 2) {
        const d = nums[nums.length - 1] - nums[0];
        if (d > 0.0005) tStyle.font.color = { rgb: '2E7D32' };
        else if (d < -0.0005) tStyle.font.color = { rgb: 'C62828' };
      }
      setS(dataRow, periods.length + 1, tStyle);
    });

    return { aoa: aoa, merges: merges, styles: styles, periods: periodKeys(rows) };
  }

  function applySheetStyles(ws, pack) {
    ws['!merges'] = pack.merges;
    const maxCols = Math.max(10, (pack.periods || []).length + 2);
    ws['!cols'] = [{ wch: 12 }].concat(Array(maxCols).fill({ wch: 12 })).concat([{ wch: 16 }]);
    Object.keys(pack.styles).forEach(key => {
      const parts = key.split('_');
      const r = +parts[0], c = +parts[1];
      const addr = XLSX.utils.encode_cell({ r: r, c: c });
      if (!ws[addr]) ws[addr] = { t: 's', v: '' };
      ws[addr].s = pack.styles[key];
      if (typeof ws[addr].v === 'number' && ws[addr].v >= 0 && ws[addr].v <= 1) {
        ws[addr].t = 'n';
        ws[addr].z = '0.00%';
      }
    });
    Object.keys(ws).forEach(addr => {
      if (addr[0] === '!') return;
      const cell = ws[addr];
      if (cell && typeof cell.v === 'number' && cell.v > 0 && cell.v <= 1) {
        cell.t = 'n';
        cell.z = '0.00%';
      }
    });
  }

  /**
   * Off-screen Chart.js line → PNG.
   * Rate labels: ABOVE the point if rate >= target, BELOW if under target.
   */
  function lineChartPng(labels, rates, targetPct, color, title) {
    if (typeof Chart === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 720;
    canvas.height = 320;
    canvas.style.cssText = 'position:fixed;left:-9999px;top:-9999px;';
    document.body.appendChild(canvas);
    const pct = rates.map(r => r == null ? null : +(r * 100).toFixed(2));

    // Draw % labels above (hit) or below (miss) each rate point
    const labelPlugin = {
      id: 'ratePointLabels',
      afterDatasetsDraw: function (chart) {
        const meta = chart.getDatasetMeta(0);
        if (!meta || !meta.data) return;
        const ctx = chart.ctx;
        ctx.save();
        ctx.font = 'bold 10px Calibri, Segoe UI, Arial, sans-serif';
        ctx.textAlign = 'center';
        meta.data.forEach(function (pt, i) {
          const v = pct[i];
          if (v == null || isNaN(v) || !pt || pt.skip) return;
          const hit = v >= targetPct;
          const text = v.toFixed(2) + '%';
          const x = pt.x;
          // Hit target → label above point; miss → label below
          const y = hit ? (pt.y - 10) : (pt.y + 14);
          ctx.textBaseline = hit ? 'bottom' : 'top';
          ctx.fillStyle = hit ? '#1B5E20' : '#C62828';
          // slight outline for readability on colored bg
          ctx.strokeStyle = 'rgba(255,255,255,0.9)';
          ctx.lineWidth = 3;
          ctx.strokeText(text, x, y);
          ctx.fillText(text, x, y);
        });
        ctx.restore();
      }
    };

    const chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Rate %',
            data: pct,
            borderColor: color,
            backgroundColor: color,
            borderWidth: 2.5,
            tension: 0.3,
            spanGaps: true,
            fill: false,
            pointRadius: 4,
            pointBackgroundColor: '#fff',
            pointBorderColor: color,
            pointBorderWidth: 2,
            pointStyle: 'rect'
          },
          {
            label: 'Target ' + targetPct + '%',
            data: labels.map(function () { return targetPct; }),
            borderColor: '#9E9E9E',
            borderDash: [6, 4],
            borderWidth: 1.5,
            pointRadius: 0,
            tension: 0,
            fill: false
          }
        ]
      },
      options: {
        responsive: false,
        animation: false,
        layout: { padding: { top: 18, bottom: 8 } },
        plugins: {
          title: { display: true, text: title, font: { size: 13, weight: 'bold' }, color: '#212121' },
          legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } }
        },
        scales: {
          y: { min: 40, max: 120, title: { display: true, text: 'Rate %' } },
          x: { ticks: { maxRotation: 40, font: { size: 9 } } }
        }
      },
      plugins: [labelPlugin]
    });
    chart.update();
    const url = canvas.toDataURL('image/png');
    chart.destroy();
    canvas.remove();
    return url;
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async function ensureExcelJS() {
    if (typeof ExcelJS !== 'undefined') return;
    await loadScript('https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js');
  }

  function matrixBlocks(forMode) {
    const rows = getRows(forMode);
    return SCOPES.map(scope => {
      const scoped = filterScope(rows, scope.id);
      const periods = periodKeys(scoped);
      const series = periods.map(pk => stats(scoped.filter(r => r.period === pk)).rate);
      return {
        scope: scope,
        periods: periods,
        labels: periods.map(pk => labelFor(pk, forMode)),
        series: series
      };
    });
  }

  async function exportExcel() {
    const base = getRows('weekly');
    if (!base.length) {
      alert('No SLU data to export.');
      return;
    }

    try {
      await ensureExcelJS();
    } catch (e) {
      alert('Could not load ExcelJS for chart export. Falling back to plain XLSX.');
      exportExcelPlain();
      return;
    }

    const colors = ['E60012', '1565C0', '6A1B9A'];
    const colorCss = ['#E60012', '#1565C0', '#6A1B9A'];
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Mainline Travel Time Analyzer';

    async function fillSheet(sheetName, forMode) {
      const ws = wb.addWorksheet(sheetName, {
        views: [{ showGridLines: false }]
      });
      const blocks = matrixBlocks(forMode);
      let row = 1;

      for (let bi = 0; bi < blocks.length; bi++) {
        const b = blocks[bi];
        const colCount = Math.max(b.labels.length + 2, 3);
        const tPct = Math.round(b.scope.target * 100);

        // Title
        ws.mergeCells(row, 1, row, colCount);
        const titleCell = ws.getCell(row, 1);
        titleCell.value = b.scope.head;
        titleCell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 13, name: 'Calibri' };
        titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE60012' } };
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        ws.getRow(row).height = 22;
        row++;

        // Subtitle
        ws.mergeCells(row, 1, row, colCount);
        const sub = ws.getCell(row, 1);
        sub.value = (b.scope.id === 'ALL' ? (b.scope.title + ' · ') : '') + 'Target ' + tPct + '%';
        sub.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' };
        sub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE60012' } };
        sub.alignment = { horizontal: 'center', vertical: 'middle' };
        row++;

        // Header
        const headers = ['REGION'].concat(b.labels).concat([forMode === 'weekly' ? 'Weekly Trend' : 'Monthly Trend']);
        headers.forEach((h, i) => {
          const cell = ws.getCell(row, i + 1);
          cell.value = h;
          cell.font = { bold: true, color: { argb: 'FFB8000E' }, size: 10, name: 'Calibri' };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEBEE' } };
          cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFBDBDBD' } },
            left: { style: 'thin', color: { argb: 'FFBDBDBD' } },
            bottom: { style: 'thin', color: { argb: 'FFBDBDBD' } },
            right: { style: 'thin', color: { argb: 'FFBDBDBD' } }
          };
        });
        row++;

        // Data row
        const regionCell = ws.getCell(row, 1);
        regionCell.value = REGION_LABEL;
        regionCell.font = { bold: true, size: 11 };
        regionCell.alignment = { horizontal: 'center' };
        regionCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFAFA' } };

        b.series.forEach((rate, i) => {
          const cell = ws.getCell(row, i + 2);
          if (rate == null) {
            cell.value = '-';
          } else {
            cell.value = rate;
            cell.numFmt = '0.00%';
          }
          const c = rateColor(rate, b.scope.target);
          cell.font = { bold: true, size: 10, color: { argb: 'FF' + c.fg } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + c.bg } };
          cell.alignment = { horizontal: 'center' };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFBDBDBD' } },
            left: { style: 'thin', color: { argb: 'FFBDBDBD' } },
            bottom: { style: 'thin', color: { argb: 'FFBDBDBD' } },
            right: { style: 'thin', color: { argb: 'FFBDBDBD' } }
          };
        });

        const trendCell = ws.getCell(row, b.series.length + 2);
        trendCell.value = trendText(b.series);
        trendCell.font = { bold: true, size: 10 };
        trendCell.alignment = { horizontal: 'center' };
        const nums = b.series.filter(v => v != null && !isNaN(v));
        if (nums.length >= 2) {
          const d = nums[nums.length - 1] - nums[0];
          if (d > 0.0005) trendCell.font.color = { argb: 'FF2E7D32' };
          else if (d < -0.0005) trendCell.font.color = { argb: 'FFC62828' };
        }
        row++;

        // Line chart image under the table
        const png = lineChartPng(
          b.labels,
          b.series,
          tPct,
          colorCss[bi],
          b.scope.head + (b.scope.id === 'ALL' ? ' · OVERALL' : '')
        );
        if (png) {
          row += 1; // spacer
          const base64 = png.replace(/^data:image\/png;base64,/, '');
          const imgId = wb.addImage({
            base64: base64,
            extension: 'png'
          });
          // Place chart spanning several columns
          const chartRow = row;
          ws.addImage(imgId, {
            tl: { col: 0, row: chartRow - 1 },
            ext: { width: 720, height: 300 }
          });
          // Reserve vertical space for the image (~15 Excel rows)
          row += 16;
        } else {
          row += 2;
        }

        row += 1; // gap between scopes
      }

      ws.getColumn(1).width = 12;
      for (let c = 2; c <= 20; c++) ws.getColumn(c).width = 12;
    }

    await fillSheet('Weekly', 'weekly');
    await fillSheet('Monthly', 'monthly');

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'TRAVEL_TIME_WEEKLY_MONTHLY_COMPARISON.xlsx';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 800);
  }

  /** Fallback without charts if ExcelJS fails */
  function exportExcelPlain() {
    if (typeof XLSX === 'undefined') {
      alert('XLSX library not loaded.');
      return;
    }
    const wb = XLSX.utils.book_new();
    const weeklyPack = buildSheetAoA('weekly');
    const wsW = XLSX.utils.aoa_to_sheet(weeklyPack.aoa);
    applySheetStyles(wsW, weeklyPack);
    XLSX.utils.book_append_sheet(wb, wsW, 'Weekly');
    const monthlyPack = buildSheetAoA('monthly');
    const wsM = XLSX.utils.aoa_to_sheet(monthlyPack.aoa);
    applySheetStyles(wsM, monthlyPack);
    XLSX.utils.book_append_sheet(wb, wsM, 'Monthly');
    XLSX.writeFile(wb, 'TRAVEL_TIME_WEEKLY_MONTHLY_COMPARISON.xlsx');
  }

  function setMode(next) {
    mode = next === 'monthly' ? 'monthly' : 'weekly';
    document.querySelectorAll('.rm-subtab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.rmMode === mode);
    });
    render();
  }

  function init() {
    document.querySelectorAll('.rm-subtab').forEach(btn => {
      btn.addEventListener('click', () => setMode(btn.dataset.rmMode));
    });
    const exp = document.getElementById('btnRmExport');
    if (exp) exp.addEventListener('click', exportExcel);
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        if (tab.dataset.tab === 'tabRateMatrix') setTimeout(render, 40);
      });
    });
  }

  function onDataReady() { render(); }

  return { init, render, onDataReady, exportExcel };
})();
