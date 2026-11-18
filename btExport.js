/* ==========================================================================
   MODULE: BT EXPORT — styled Excel workbook + chart images
   ========================================================================== */
const BtExport = (() => {

  const RED = 'E60012';
  const RED_DARK = 'B8000E';
  const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE60012' } };
  const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' };
  const TITLE_FONT = { bold: true, size: 16, color: { argb: 'FFE60012' }, name: 'Calibri' };
  const SUB_FONT = { size: 10, color: { argb: 'FF757575' }, name: 'Calibri' };
  const THIN = { style: 'thin', color: { argb: 'FFE0E0E0' } };
  const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };

  const DETAIL_COLS = [
    { key: 'dateKey', header: 'Entry Date', width: 12 },
    { key: 'month', header: 'Month', width: 12 },
    { key: 'trucker', header: 'Trucker', width: 18 },
    { key: 'plate', header: 'Plate #', width: 12 },
    { key: 'taskPlan', header: 'Task Plan', width: 14 },
    { key: 'destination', header: 'Destination', width: 18 },
    { key: 'location', header: 'Location', width: 18 },
    { key: 'downtimeRaw', header: 'Downtime', width: 16 },
    { key: 'reason', header: 'Reason', width: 28 },
    { key: 'reasonGroup', header: 'Reason Group', width: 20 },
    { key: 'status', header: 'Status', width: 14 },
    { key: 'rescue', header: 'Rescue Truck', width: 12 },
    { key: 'remarks', header: 'Remarks', width: 16 },
    { key: 'isBackload', header: 'Backload', width: 10 }
  ];

  function cellVal(row, key) {
    if (key === 'isBackload') return row.isBackload ? 'YES' : 'NO';
    if (key === 'downtimeRaw') {
      return row.downtimeRaw || BtUtils.formatHours(row.downtimeHrs) || '';
    }
    const v = row[key];
    return v == null ? '' : String(v);
  }

  function styleHeaderRow(ws, rowNum, colCount) {
    const row = ws.getRow(rowNum);
    for (let c = 1; c <= colCount; c++) {
      const cell = row.getCell(c);
      cell.fill = HEADER_FILL;
      cell.font = HEADER_FONT;
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = BORDER;
    }
    row.height = 22;
  }

  function styleDataRow(row, colCount, alt) {
    for (let c = 1; c <= colCount; c++) {
      const cell = row.getCell(c);
      cell.border = BORDER;
      cell.font = { size: 10, name: 'Calibri' };
      cell.alignment = { vertical: 'middle', wrapText: true };
      if (alt) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF5F5' } };
      }
    }
  }

  function addTitleBlock(ws, title, subtitle) {
    ws.mergeCells(1, 1, 1, Math.min(8, DETAIL_COLS.length));
    const t = ws.getCell(1, 1);
    t.value = title;
    t.font = TITLE_FONT;
    t.alignment = { vertical: 'middle' };
    ws.getRow(1).height = 28;

    ws.mergeCells(2, 1, 2, Math.min(8, DETAIL_COLS.length));
    const s = ws.getCell(2, 1);
    s.value = subtitle;
    s.font = SUB_FONT;
    ws.getRow(2).height = 18;
  }

  function writeDetailSheet(wb, name, rows) {
    const safeName = String(name).replace(/[\\/?*[\]]/g, ' ').slice(0, 31) || 'Sheet';
    const ws = wb.addWorksheet(safeName, {
      views: [{ state: 'frozen', ySplit: 4 }]
    });

    addTitleBlock(
      ws,
      'Broken Truck — ' + name,
      'All rows are broken truck incidents · Generated ' + new Date().toLocaleString()
    );

    const headerRow = 4;
    DETAIL_COLS.forEach((col, i) => {
      ws.getColumn(i + 1).width = col.width;
      ws.getCell(headerRow, i + 1).value = col.header;
    });
    styleHeaderRow(ws, headerRow, DETAIL_COLS.length);

    rows.forEach((r, idx) => {
      const rowNum = headerRow + 1 + idx;
      const excelRow = ws.getRow(rowNum);
      DETAIL_COLS.forEach((col, i) => {
        excelRow.getCell(i + 1).value = cellVal(r, col.key);
      });
      styleDataRow(excelRow, DETAIL_COLS.length, idx % 2 === 1);
    });

    // Summary footer
    const foot = headerRow + 1 + rows.length + 1;
    ws.getCell(foot, 1).value = 'Total broken trucks:';
    ws.getCell(foot, 1).font = { bold: true, size: 10 };
    ws.getCell(foot, 2).value = rows.length;
    ws.getCell(foot, 2).font = { bold: true, color: { argb: 'FFE60012' }, size: 11 };

    return ws;
  }

  function writeSummarySheet(wb, overview, filterNote) {
    const ws = wb.addWorksheet('Summary', { views: [{ state: 'frozen', ySplit: 4 }] });
    addTitleBlock(
      ws,
      'Broken Truck Analyzer — Summary',
      (filterNote || 'All loaded data') + ' · ' + new Date().toLocaleString()
    );

    const s = overview.overall;
    const kpis = [
      ['Total broken trucks', s.total],
      ['Avg downtime', BtUtils.formatHours(s.avgHours)],
      ['Transfers', s.transfers],
      ['Repairs', s.repairs],
      ['Accidents', s.accidents]
    ];
    ws.getCell(4, 1).value = 'Metric';
    ws.getCell(4, 2).value = 'Value';
    styleHeaderRow(ws, 4, 2);
    ws.getColumn(1).width = 24;
    ws.getColumn(2).width = 18;
    kpis.forEach((pair, i) => {
      const r = ws.getRow(5 + i);
      r.getCell(1).value = pair[0];
      r.getCell(2).value = pair[1];
      styleDataRow(r, 2, i % 2 === 1);
    });

    let row = 12;
    ws.getCell(row, 1).value = 'By Month';
    ws.getCell(row, 1).font = { bold: true, size: 12, color: { argb: 'FFE60012' } };
    row++;
    ['Month', 'Broken', 'Avg DT (hrs)', 'Transfer', 'Repair', 'Accident'].forEach((h, i) => {
      ws.getCell(row, i + 1).value = h;
    });
    styleHeaderRow(ws, row, 6);
    [14, 10, 14, 10, 10, 10].forEach((w, i) => { ws.getColumn(i + 1).width = Math.max(ws.getColumn(i + 1).width || 10, w); });
    overview.monthly.forEach((m, idx) => {
      row++;
      const r = ws.getRow(row);
      r.getCell(1).value = m.key;
      r.getCell(2).value = m.total;
      r.getCell(3).value = m.avgHours != null ? +m.avgHours.toFixed(2) : '';
      r.getCell(4).value = m.transfers;
      r.getCell(5).value = m.repairs;
      r.getCell(6).value = m.accidents;
      styleDataRow(r, 6, idx % 2 === 1);
    });

    row += 2;
    ws.getCell(row, 1).value = 'By Trucker';
    ws.getCell(row, 1).font = { bold: true, size: 12, color: { argb: 'FFE60012' } };
    row++;
    ['Trucker', 'Broken', 'Avg DT (hrs)', 'Transfer'].forEach((h, i) => {
      ws.getCell(row, i + 1).value = h;
    });
    styleHeaderRow(ws, row, 4);
    overview.byTrucker.forEach((t, idx) => {
      row++;
      const r = ws.getRow(row);
      r.getCell(1).value = t.key;
      r.getCell(2).value = t.total;
      r.getCell(3).value = t.avgHours != null ? +t.avgHours.toFixed(2) : '';
      r.getCell(4).value = t.transfers;
      styleDataRow(r, 4, idx % 2 === 1);
    });

    row += 2;
    ws.getCell(row, 1).value = 'By Reason Group';
    ws.getCell(row, 1).font = { bold: true, size: 12, color: { argb: 'FFE60012' } };
    row++;
    ['Reason Group', 'Broken'].forEach((h, i) => {
      ws.getCell(row, i + 1).value = h;
    });
    styleHeaderRow(ws, row, 2);
    overview.byReason.forEach((g, idx) => {
      row++;
      const r = ws.getRow(row);
      r.getCell(1).value = g.key;
      r.getCell(2).value = g.total;
      styleDataRow(r, 2, idx % 2 === 1);
    });

    return ws;
  }

  /** Polished single-sheet executive summary (Summary export mode) */
  function writeExecutiveSummary(wb, overview, filterNote, repeats) {
    const ws = wb.addWorksheet('Executive Summary', {
      views: [{ state: 'frozen', ySplit: 3 }],
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
    });

    const COLS = 8;
    for (let c = 1; c <= COLS; c++) {
      ws.getColumn(c).width = c === 1 ? 18 : (c === 2 ? 14 : 12);
    }
    ws.getColumn(1).width = 20;
    ws.getColumn(2).width = 16;
    ws.getColumn(3).width = 14;
    ws.getColumn(4).width = 14;
    ws.getColumn(5).width = 14;
    ws.getColumn(6).width = 14;
    ws.getColumn(7).width = 18;
    ws.getColumn(8).width = 14;

    // Banner row 1–2
    ws.mergeCells(1, 1, 1, COLS);
    const title = ws.getCell(1, 1);
    title.value = 'J&T EXPRESS  ·  BROKEN TRUCK SUMMARY REPORT';
    title.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' }, name: 'Calibri' };
    title.fill = HEADER_FILL;
    title.alignment = { vertical: 'middle', horizontal: 'center' };
    ws.getRow(1).height = 32;

    ws.mergeCells(2, 1, 2, COLS);
    const sub = ws.getCell(2, 1);
    sub.value = (filterNote || 'All data') + '  |  Generated ' + new Date().toLocaleString();
    sub.font = { size: 10, color: { argb: 'FFFFFFFF' }, name: 'Calibri' };
    sub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB8000E' } };
    sub.alignment = { vertical: 'middle', horizontal: 'center' };
    ws.getRow(2).height = 20;

    // KPI band
    const s = overview.overall;
    const kpiDefs = [
      { label: 'TOTAL BROKEN', value: s.total },
      { label: 'AVG DOWNTIME', value: BtUtils.formatHours(s.avgHours) },
      { label: 'TRANSFERS', value: s.transfers },
      { label: 'REPAIRS', value: s.repairs },
      { label: 'ACCIDENTS', value: s.accidents },
      { label: 'REPEAT PLATES', value: (repeats || []).length }
    ];
    let col = 1;
    kpiDefs.forEach((k, i) => {
      // use 1 col each for 6 KPIs in row 4-5; merge pairs if needed - simple 6 cells across
      const c = i + 1;
      const lab = ws.getCell(4, c);
      lab.value = k.label;
      lab.font = { bold: true, size: 8, color: { argb: 'FF757575' }, name: 'Calibri' };
      lab.alignment = { horizontal: 'center' };
      lab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF5F5' } };
      lab.border = BORDER;
      const val = ws.getCell(5, c);
      val.value = k.value;
      val.font = { bold: true, size: 14, color: { argb: 'FFE60012' }, name: 'Calibri' };
      val.alignment = { horizontal: 'center', vertical: 'middle' };
      val.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF5F5' } };
      val.border = BORDER;
    });
    ws.getRow(5).height = 26;

    // Section: Monthly
    let row = 7;
    ws.mergeCells(row, 1, row, COLS);
    ws.getCell(row, 1).value = '1. BROKEN TRUCKS BY MONTH';
    ws.getCell(row, 1).font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' }, name: 'Calibri' };
    ws.getCell(row, 1).fill = HEADER_FILL;
    ws.getCell(row, 1).alignment = { vertical: 'middle' };
    ws.getRow(row).height = 20;
    row++;
    const monthHeaders = ['Month', 'Broken', 'Avg DT (hrs)', 'Transfer', 'Repair', 'Accident', '', ''];
    monthHeaders.forEach((h, i) => {
      if (!h) return;
      ws.getCell(row, i + 1).value = h;
    });
    styleHeaderRow(ws, row, 6);
    overview.monthly.forEach((m, idx) => {
      row++;
      const r = ws.getRow(row);
      r.getCell(1).value = m.key;
      r.getCell(2).value = m.total;
      r.getCell(3).value = m.avgHours != null ? +m.avgHours.toFixed(2) : '';
      r.getCell(4).value = m.transfers;
      r.getCell(5).value = m.repairs;
      r.getCell(6).value = m.accidents;
      styleDataRow(r, 6, idx % 2 === 1);
    });

    // Top truckers
    row += 2;
    ws.mergeCells(row, 1, row, COLS);
    ws.getCell(row, 1).value = '2. TOP TRUCKERS';
    ws.getCell(row, 1).font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' }, name: 'Calibri' };
    ws.getCell(row, 1).fill = HEADER_FILL;
    row++;
    ['Trucker', 'Broken', 'Avg DT (hrs)', 'Transfer'].forEach((h, i) => {
      ws.getCell(row, i + 1).value = h;
    });
    styleHeaderRow(ws, row, 4);
    (overview.byTrucker || []).slice(0, 12).forEach((t, idx) => {
      row++;
      const r = ws.getRow(row);
      r.getCell(1).value = t.key;
      r.getCell(2).value = t.total;
      r.getCell(3).value = t.avgHours != null ? +t.avgHours.toFixed(2) : '';
      r.getCell(4).value = t.transfers;
      styleDataRow(r, 4, idx % 2 === 1);
    });

    // Reasons
    row += 2;
    ws.mergeCells(row, 1, row, COLS);
    ws.getCell(row, 1).value = '3. REASON GROUPS';
    ws.getCell(row, 1).font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' }, name: 'Calibri' };
    ws.getCell(row, 1).fill = HEADER_FILL;
    row++;
    ['Reason Group', 'Broken', '% of total'].forEach((h, i) => {
      ws.getCell(row, i + 1).value = h;
    });
    styleHeaderRow(ws, row, 3);
    const tot = s.total || 1;
    (overview.byReason || []).forEach((g, idx) => {
      row++;
      const r = ws.getRow(row);
      r.getCell(1).value = g.key;
      r.getCell(2).value = g.total;
      r.getCell(3).value = ((g.total / tot) * 100).toFixed(1) + '%';
      styleDataRow(r, 3, idx % 2 === 1);
    });

    // Repeat offenders
    row += 2;
    ws.mergeCells(row, 1, row, COLS);
    ws.getCell(row, 1).value = '4. REPEAT OFFENDERS (plates broken 2+ times)';
    ws.getCell(row, 1).font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' }, name: 'Calibri' };
    ws.getCell(row, 1).fill = HEADER_FILL;
    row++;
    ['#', 'Plate', 'Times', 'Trucker(s)', 'Months', 'Avg DT', 'Top reason', 'Last date'].forEach((h, i) => {
      ws.getCell(row, i + 1).value = h;
    });
    styleHeaderRow(ws, row, 8);
    const rep = (repeats || []).slice(0, 25);
    if (!rep.length) {
      row++;
      ws.getCell(row, 1).value = 'None for current filters';
      ws.getCell(row, 1).font = SUB_FONT;
    } else {
      rep.forEach((p, idx) => {
        row++;
        const r = ws.getRow(row);
        r.getCell(1).value = idx + 1;
        r.getCell(2).value = p.plate;
        r.getCell(3).value = p.times;
        r.getCell(4).value = p.truckerLabel;
        r.getCell(5).value = p.monthLabel;
        r.getCell(6).value = p.avgHours != null ? BtUtils.formatHours(p.avgHours) : '';
        r.getCell(7).value = p.topReason;
        r.getCell(8).value = p.lastDate;
        styleDataRow(r, 8, idx % 2 === 1);
      });
    }

    // Footer
    row += 2;
    ws.mergeCells(row, 1, row, COLS);
    ws.getCell(row, 1).value = '© J&T Express · Broken Truck Analyzer · Confidential';
    ws.getCell(row, 1).font = { size: 9, italic: true, color: { argb: 'FF9E9E9E' }, name: 'Calibri' };
    ws.getCell(row, 1).alignment = { horizontal: 'center' };

    return ws;
  }

  async function addChartImagesSheet(wb, images) {
    const ws = wb.addWorksheet('Charts');
    addTitleBlock(ws, 'Broken Truck — Charts', 'Embedded chart snapshots from the analyzer');
    ws.getColumn(1).width = 18;
    ws.getColumn(2).width = 60;

    const entries = [
      { key: 'monthly', label: 'By Month' },
      { key: 'trucker', label: 'By Trucker' },
      { key: 'reason', label: 'By Reason' },
      { key: 'status', label: 'By Status' }
    ];

    let row = 4;
    for (const e of entries) {
      const b64 = images[e.key] || (e.key === 'monthly' ? images.monthlyCharts : null);
      ws.getCell(row, 1).value = e.label;
      ws.getCell(row, 1).font = { bold: true, size: 12, color: { argb: 'FFE60012' } };
      row++;
      if (b64) {
        try {
          const imageId = wb.addImage({
            base64: b64,
            extension: 'png'
          });
          // approx size in Excel units
          ws.addImage(imageId, {
            tl: { col: 0, row: row - 1 },
            ext: { width: 520, height: 280 }
          });
          row += 16;
        } catch (err) {
          ws.getCell(row, 1).value = '(Could not embed image)';
          row += 2;
        }
      } else {
        ws.getCell(row, 1).value = '(Chart not available — open Charts tab once before export)';
        ws.getCell(row, 1).font = SUB_FONT;
        row += 2;
      }
      row += 1;
    }
  }

  function filterNoteFromFilters(filters) {
    const parts = [];
    if (filters.month && filters.month !== 'ALL') parts.push('Month: ' + filters.month);
    if (filters.trucker && filters.trucker !== 'ALL') parts.push('Trucker: ' + filters.trucker);
    if (filters.reasonGroup && filters.reasonGroup !== 'ALL') parts.push('Reason: ' + filters.reasonGroup);
    if (filters.status && filters.status !== 'ALL') parts.push('Status: ' + filters.status);
    if (filters.backload === 'FORWARD') parts.push('Forward only');
    else if (filters.backload === 'BACKLOAD') parts.push('Backload only');
    else if (filters.excludeBackload) parts.push('Forward only');
    if (filters.search) parts.push('Search: ' + filters.search);
    return parts.length ? parts.join(' · ') : 'No filters (all broken trucks)';
  }

  /**
   * @param {object} opts
   * @param {Array} opts.rows
   * @param {object} opts.overview
   * @param {object} opts.filters
   * @param {'summary'|'detailed'} opts.mode
   * @param {Array} opts.repeats
   */
  async function exportWorkbook(opts) {
    const { rows, overview, filters, mode, repeats } = opts;
    if (typeof ExcelJS === 'undefined') {
      alert('ExcelJS library not loaded. Cannot export.');
      return;
    }

    const btn = document.getElementById('btnExport');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Exporting…';
    }

    const isSummary = mode === 'summary';
    let chartsPanel = null;
    let wasHidden = false;

    try {
      if (!isSummary) {
        chartsPanel = document.getElementById('btChartsPanel');
        wasHidden = chartsPanel && chartsPanel.classList.contains('hidden');
        if (chartsPanel) chartsPanel.classList.remove('hidden');
        if (typeof BtApp !== 'undefined' && BtApp.applyFiltersAndRender) {
          BtApp.applyFiltersAndRender();
        }
        await new Promise(r => setTimeout(r, 350));
      }

      const wb = new ExcelJS.Workbook();
      wb.creator = 'Broken Truck Analyzer';
      wb.created = new Date();
      wb.company = 'J&T Express';

      const note = filterNoteFromFilters(filters || {});

      if (isSummary) {
        writeExecutiveSummary(wb, overview, note, repeats || []);
      } else {
        writeSummarySheet(wb, overview, note);
        // Repeat offenders sheet in detailed too
        const repSheet = wb.addWorksheet('Repeat Offenders');
        addTitleBlock(repSheet, 'Repeat Offenders', 'Plates broken 2+ times · ' + note);
        ['#', 'Plate', 'Times', 'Trucker(s)', 'Months', 'Total DT', 'Avg DT', 'Top reason', 'Last date'].forEach((h, i) => {
          repSheet.getCell(4, i + 1).value = h;
          repSheet.getColumn(i + 1).width = [6, 14, 8, 22, 18, 12, 12, 18, 12][i];
        });
        styleHeaderRow(repSheet, 4, 9);
        (repeats || []).forEach((p, idx) => {
          const r = repSheet.getRow(5 + idx);
          r.getCell(1).value = idx + 1;
          r.getCell(2).value = p.plate;
          r.getCell(3).value = p.times;
          r.getCell(4).value = p.truckerLabel;
          r.getCell(5).value = p.monthLabel;
          r.getCell(6).value = p.totalHours != null ? +p.totalHours.toFixed(1) : '';
          r.getCell(7).value = p.avgHours != null ? +p.avgHours.toFixed(1) : '';
          r.getCell(8).value = p.topReason;
          r.getCell(9).value = p.lastDate;
          styleDataRow(r, 9, idx % 2 === 1);
        });

        const byMonth = BtDataAnalyzer.byMonth(rows);
        if (byMonth.length) {
          byMonth.forEach(m => writeDetailSheet(wb, m.key, m.rows));
        } else {
          writeDetailSheet(wb, 'All Data', rows);
        }
        writeDetailSheet(wb, 'All Filtered', rows);

        const images = BtChartManager.getAllChartImages();
        await addChartImagesSheet(wb, images);
        if (chartsPanel && wasHidden) chartsPanel.classList.add('hidden');
      }

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 10);
      const suffix = isSummary ? 'Summary' : 'Detailed';
      a.href = URL.createObjectURL(blob);
      a.download = 'Broken_Truck_' + suffix + '_' + stamp + '.xlsx';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(a.href);
        a.remove();
      }, 1500);
    } catch (err) {
      console.error(err);
      if (chartsPanel && wasHidden) chartsPanel.classList.add('hidden');
      alert('Export failed: ' + (err.message || err));
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '⬇ Export Excel';
      }
    }
  }

  return { exportWorkbook, filterNoteFromFilters };
})();
