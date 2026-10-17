/* ==========================================================================
   MODULE: AI AUTOMATED REASONING ENGINE
   ========================================================================== */
const AiReasoningManager = (() => {
  let lastEnglishHtml = '';
  let lastChineseHtml = '';
  let showingChinese = false;

  function fmt(n) {
    return Math.round(n).toLocaleString();
  }

  function signFmt(n) {
    const v = Math.round(n);
    return (v > 0 ? '+' : '') + v.toLocaleString();
  }

  function routesWithFewerTrips(d) {
    const list = (d.topNeg || []).filter(r => (r.lTrips || 0) < (r.pTrips || 0));
    return list.slice(0, 5).map(r => {
      const drop = (r.pTrips || 0) - (r.lTrips || 0);
      return `${r.route} (−${drop} trip${drop > 1 ? 's' : ''})`;
    });
  }

  function buildEnglish(d, isDrop, tripDiff, pkgDiff) {
    const prevTotalLT = (d.prevAvg || 0) * (d.prevTrips || 0);
    const latestTotalLT = (d.latestAvg || 0) * (d.latestTrips || 0);
    const totalLtDiff = latestTotalLT - prevTotalLT;
    const fewerTripRoutes = routesWithFewerTrips(d);

    let html = `
        <div class="ai-header-bar">
          <strong class="ai-heading">🤖 AI Executive Summary Reasoning</strong>
          <div class="ai-header-actions">
            <button type="button" class="ai-translate-btn" id="btnTranslateAi">中文</button>
            <button type="button" class="ai-close-btn" id="btnCloseAi">✕ Close</button>
          </div>
        </div>
        <div class="ai-date-tag">📅 Comparison Window: ${d.datePrev} vs ${d.dateLatest}</div>
        <div id="aiReasoningBody">`;

    if (!isDrop) {
      let lead = `The improvement was mainly supported by a change of <strong>${signFmt(pkgDiff)} packages</strong> and <strong>${signFmt(totalLtDiff)} loading tickets</strong> across the region`;
      if (d.topBooster) {
        lead += `, with route <strong>${d.topBooster.route}</strong> having the biggest positive impact (<strong>+${fmt(d.topBooster.contrib)}</strong> points)`;
      }
      lead += `.`;
      if (tripDiff < 0) {
        lead += ` Overall trips decreased from <strong>${d.prevTrips}</strong> to <strong>${d.latestTrips}</strong> (−${Math.abs(tripDiff)}), which helped concentrate volume and improve average loading performance.`;
      } else if (tripDiff > 0) {
        lead += ` Overall trips increased from <strong>${d.prevTrips}</strong> to <strong>${d.latestTrips}</strong> (+${tripDiff}), while stronger load mix still lifted the average.`;
      }

      html += `<p>${lead}</p><ul>`;
      if (d.topBooster) {
        html += `<li><strong>Primary Lift Route (${d.topBooster.route}):</strong> Largest positive contributor (<strong>+${fmt(d.topBooster.contrib)} points</strong>); trips ${d.topBooster.pTrips} → ${d.topBooster.lTrips}; packages ${signFmt(d.topBooster.pkgsDiff)}.</li>`;
      }
      if (d.topPos && d.topPos.length > 1) {
        const secondary = d.topPos.slice(1, 4).map(r => r.route).join(', ');
        html += `<li><strong>Secondary Route Lifts:</strong> Additional gains from <strong>${secondary}</strong>.</li>`;
      }
      html += `<li><strong>Regional totals:</strong> Packages ${signFmt(pkgDiff)}; Total Loading Tickets ${signFmt(totalLtDiff)}; Trips ${d.prevTrips} → ${d.latestTrips} (${signFmt(tripDiff)}).</li>`;
      html += `</ul>`;
      html += `<div class="ai-paragraph-summary"><strong>Executive Takeaway:</strong> Average Loading Qty rose by <strong>+${fmt(d.avgDiff)}</strong> points (${fmt(d.prevAvg)} → ${fmt(d.latestAvg)})${d.topBooster ? `, led by ${d.topBooster.route}` : ''}. Regional package and loading-ticket movement supported higher per-trip performance.</div>`;
    } else {
      // Decline narrative — matches requested style
      let lead = `The decline was mainly due to a reduction of <strong>${fmt(Math.abs(Math.min(pkgDiff, 0)))} packages</strong>`;
      if (pkgDiff >= 0) {
        lead = `The decline occurred even though packages changed by <strong>${signFmt(pkgDiff)}</strong>`;
      }
      lead += ` and <strong>${signFmt(totalLtDiff)} loading tickets</strong> across the region`;
      if (d.topCulprit) {
        lead += `, with route <strong>${d.topCulprit.route}</strong> having the biggest impact (<strong>${fmt(d.topCulprit.contrib)}</strong> points)`;
      }
      lead += `.`;

      if (tripDiff < 0) {
        lead += ` Overall trips also decreased from <strong>${d.prevTrips}</strong> to <strong>${d.latestTrips}</strong> (−${Math.abs(tripDiff)} trips).`;
      } else if (tripDiff > 0) {
        lead += ` Overall trips increased from <strong>${d.prevTrips}</strong> to <strong>${d.latestTrips}</strong> (+${tripDiff}), which diluted average loading performance.`;
      }

      if (fewerTripRoutes.length) {
        lead += ` Some high-volume routes also had fewer trips than the previous day (${fewerTripRoutes.join(', ')}), contributing to lower loading performance.`;
      } else {
        lead += ` Weaker load mix on key routes contributed to lower loading performance.`;
      }

      html += `<p>${lead}</p><ul>`;

      if (pkgDiff < 0 && tripDiff >= 0) {
        html += `<li><strong>Volume vs trips:</strong> Packages dropped by ${fmt(Math.abs(pkgDiff))} while trips stayed high (${d.prevTrips} → ${d.latestTrips}), lowering utilization.</li>`;
      } else if (pkgDiff < 0 && tripDiff < 0) {
        html += `<li><strong>Regional volume drop:</strong> Packages −${fmt(Math.abs(pkgDiff))}; trips −${Math.abs(tripDiff)} (${d.prevTrips} → ${d.latestTrips}); total Loading Tickets ${signFmt(totalLtDiff)}.</li>`;
      } else {
        html += `<li><strong>Trip mix:</strong> Package volume ${signFmt(pkgDiff)}, but route scheduling diluted per-trip Loading Tickets (total LT ${signFmt(totalLtDiff)}).</li>`;
      }

      if (d.topCulprit) {
        const tDrop = (d.topCulprit.pTrips || 0) - (d.topCulprit.lTrips || 0);
        const tripNote = tDrop > 0 ? `, trips down by ${tDrop}` : `, trips ${d.topCulprit.pTrips} → ${d.topCulprit.lTrips}`;
        html += `<li><strong>Primary Impact Route (${d.topCulprit.route}):</strong> Largest drag (<strong>${fmt(d.topCulprit.contrib)} points</strong>)${tripNote}; packages ${signFmt(d.topCulprit.pkgsDiff)}.</li>`;
      }

      if (d.topNeg && d.topNeg.length > 1) {
        const secondaryRoutes = d.topNeg.slice(1, 4).map(r => {
          const td = (r.pTrips || 0) - (r.lTrips || 0);
          return td > 0 ? `${r.route} (−${td} trips)` : r.route;
        }).join(', ');
        html += `<li><strong>Secondary Route Drag:</strong> ${secondaryRoutes}.</li>`;
      }

      if (fewerTripRoutes.length) {
        html += `<li><strong>Fewer trips on key routes:</strong> ${fewerTripRoutes.join('; ')}.</li>`;
      }

      html += `</ul>`;

      const culpritText = d.topCulprit ? `driven mainly by ${d.topCulprit.route}` : 'driven by weaker trip mix across multiple routes';
      html += `<div class="ai-paragraph-summary">
          <strong>Executive Takeaway:</strong> Average Loading Qty dropped by <strong>${fmt(Math.abs(d.avgDiff))}</strong> points (${fmt(d.prevAvg)} → ${fmt(d.latestAvg)}), ${culpritText}. Region-wide packages ${signFmt(pkgDiff)}, total Loading Tickets ${signFmt(totalLtDiff)}, and trips ${d.prevTrips} → ${d.latestTrips} (${signFmt(tripDiff)}). Optimizing dispatch on high-impact routes can help protect fill rates.
        </div>`;
    }

    html += `</div>`;
    return html;
  }

  function buildChinese(d, isDrop, tripDiff, pkgDiff) {
    const prevTotalLT = (d.prevAvg || 0) * (d.prevTrips || 0);
    const latestTotalLT = (d.latestAvg || 0) * (d.latestTrips || 0);
    const totalLtDiff = latestTotalLT - prevTotalLT;
    const fewerTripRoutes = routesWithFewerTrips(d);

    let html = `
        <div class="ai-header-bar">
          <strong class="ai-heading">🤖 AI 执行摘要分析</strong>
          <div class="ai-header-actions">
            <button type="button" class="ai-translate-btn" id="btnTranslateAi">English</button>
            <button type="button" class="ai-close-btn" id="btnCloseAi">✕ 关闭</button>
          </div>
        </div>
        <div class="ai-date-tag">📅 对比区间：${d.datePrev} vs ${d.dateLatest}</div>
        <div id="aiReasoningBody">`;

    if (!isDrop) {
      let lead = `本次提升主要得益于区域包裹变化 <strong>${signFmt(pkgDiff)}</strong>、装载票（Loading Tickets）合计变化 <strong>${signFmt(totalLtDiff)}</strong>`;
      if (d.topBooster) {
        lead += `，其中线路 <strong>${d.topBooster.route}</strong> 正向贡献最大（<strong>+${fmt(d.topBooster.contrib)}</strong> 点）`;
      }
      lead += `。`;
      if (tripDiff < 0) {
        lead += ` 整体班次由 <strong>${d.prevTrips}</strong> 降至 <strong>${d.latestTrips}</strong>（−${Math.abs(tripDiff)}），有助于集中货量、提高平均装载。`;
      }
      html += `<p>${lead}</p><ul>`;
      if (d.topBooster) {
        html += `<li><strong>主要提升线路（${d.topBooster.route}）：</strong>贡献 <strong>+${fmt(d.topBooster.contrib)} 点</strong>；班次 ${d.topBooster.pTrips} → ${d.topBooster.lTrips}；包裹 ${signFmt(d.topBooster.pkgsDiff)}。</li>`;
      }
      html += `<li><strong>区域合计：</strong>包裹 ${signFmt(pkgDiff)}；Loading Tickets 合计 ${signFmt(totalLtDiff)}；班次 ${d.prevTrips} → ${d.latestTrips}（${signFmt(tripDiff)}）。</li>`;
      html += `</ul>`;
      html += `<div class="ai-paragraph-summary"><strong>执行结论：</strong>平均装载量上升 <strong>+${fmt(d.avgDiff)}</strong> 点（${fmt(d.prevAvg)} → ${fmt(d.latestAvg)}）${d.topBooster ? `，主要由 ${d.topBooster.route} 带动` : ''}。</div>`;
    } else {
      let lead = pkgDiff < 0
        ? `本次下降主要由于区域包裹减少 <strong>${fmt(Math.abs(pkgDiff))}</strong>、装载票（Loading Tickets）合计变化 <strong>${signFmt(totalLtDiff)}</strong>`
        : `本次下降发生在包裹变化 <strong>${signFmt(pkgDiff)}</strong>、装载票合计变化 <strong>${signFmt(totalLtDiff)}</strong> 的背景下`;
      if (d.topCulprit) {
        lead += `，其中线路 <strong>${d.topCulprit.route}</strong> 影响最大（<strong>${fmt(d.topCulprit.contrib)}</strong> 点）`;
      }
      lead += `。`;
      if (tripDiff < 0) {
        lead += ` 整体班次由 <strong>${d.prevTrips}</strong> 降至 <strong>${d.latestTrips}</strong>（−${Math.abs(tripDiff)} 班）。`;
      } else if (tripDiff > 0) {
        lead += ` 整体班次由 <strong>${d.prevTrips}</strong> 升至 <strong>${d.latestTrips}</strong>（+${tripDiff}），稀释了平均装载。`;
      }
      if (fewerTripRoutes.length) {
        lead += ` 部分高货量线路班次少于前一日（${fewerTripRoutes.join('、')}），也拉低了装载表现。`;
      }
      html += `<p>${lead}</p><ul>`;

      if (d.topCulprit) {
        const tDrop = (d.topCulprit.pTrips || 0) - (d.topCulprit.lTrips || 0);
        const tripNote = tDrop > 0 ? `，班次减少 ${tDrop}` : `，班次 ${d.topCulprit.pTrips} → ${d.topCulprit.lTrips}`;
        html += `<li><strong>主要影响线路（${d.topCulprit.route}）：</strong>拖累 <strong>${fmt(d.topCulprit.contrib)} 点</strong>${tripNote}；包裹 ${signFmt(d.topCulprit.pkgsDiff)}。</li>`;
      }
      if (d.topNeg && d.topNeg.length > 1) {
        const secondaryRoutes = d.topNeg.slice(1, 4).map(r => {
          const td = (r.pTrips || 0) - (r.lTrips || 0);
          return td > 0 ? `${r.route}（−${td} 班）` : r.route;
        }).join('、');
        html += `<li><strong>次要拖累线路：</strong>${secondaryRoutes}。</li>`;
      }
      if (fewerTripRoutes.length) {
        html += `<li><strong>班次减少的关键线路：</strong>${fewerTripRoutes.join('；')}。</li>`;
      }
      html += `<li><strong>区域合计：</strong>包裹 ${signFmt(pkgDiff)}；Loading Tickets 合计 ${signFmt(totalLtDiff)}；班次 ${d.prevTrips} → ${d.latestTrips}（${signFmt(tripDiff)}）。</li>`;
      html += `</ul>`;

      const culpritText = d.topCulprit ? `主要由 ${d.topCulprit.route} 带动` : '由多条线路装载结构变弱共同导致';
      html += `<div class="ai-paragraph-summary">
          <strong>执行结论：</strong>平均装载量下降 <strong>${fmt(Math.abs(d.avgDiff))}</strong> 点（${fmt(d.prevAvg)} → ${fmt(d.latestAvg)}），${culpritText}。建议针对高影响线路优化发车与配载，以维持更高满载率。
        </div>`;
    }

    html += `</div>`;
    return html;
  }

  function bindPanelButtons(box) {
    const closeBtn = document.getElementById('btnCloseAi');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => box.classList.add('hidden'));
    }
    const trBtn = document.getElementById('btnTranslateAi');
    if (trBtn) {
      trBtn.addEventListener('click', () => {
        showingChinese = !showingChinese;
        box.innerHTML = showingChinese ? lastChineseHtml : lastEnglishHtml;
        bindPanelButtons(box);
      });
    }
  }

  function generateReasoning(currentData) {
    const btn = document.getElementById('btnGenerateAi');
    const box = document.getElementById('aiReasoningBox');
    if (!currentData || !btn || !box) return;

    btn.disabled = true;
    btn.innerHTML = `<span class="ai-loader"></span> Generating AI reasoning...`;
    box.classList.add('hidden');
    showingChinese = false;

    setTimeout(() => {
      const d = currentData;
      const isDrop = d.avgDiff < 0;
      const tripDiff = d.latestTrips - d.prevTrips;
      const pkgDiff = d.latestPkgs - d.prevPkgs;

      lastEnglishHtml = buildEnglish(d, isDrop, tripDiff, pkgDiff);
      lastChineseHtml = buildChinese(d, isDrop, tripDiff, pkgDiff);

      box.innerHTML = lastEnglishHtml;
      box.classList.remove('hidden');
      bindPanelButtons(box);

      btn.disabled = false;
      btn.innerHTML = `🤖 Generate Automated AI Reasoning`;
    }, 1200);
  }

  function init(getCurrentDataFn) {
    const btn = document.getElementById('btnGenerateAi');
    if (!btn) return;
    btn.addEventListener('click', () => {
      generateReasoning(getCurrentDataFn());
    });
  }

  return { init };
})();
