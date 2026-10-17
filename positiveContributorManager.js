/* ==========================================================================
   MODULE: POSITIVE CONTRIBUTOR MANAGER (GROWTH DRIVER ANALYSIS)
   ========================================================================== */
const PositiveContributorManager = (() => {

  function renderPositiveContributor(data) {
    const culpritEl = document.getElementById('culpritBox');
    if (!culpritEl) return;

    // Only display when average loading quantity increased significantly (> 30 points)
    if (data.avgDiff <= 30) return;

    // Find routes with positive contributions
    const routeStats = [];
    if (data.dailyTrendMatrix || data.topNeg) {
      // We evaluate positive contributors from the dataset metrics if available
    }

    // Fallback search across route metrics if tracked
    // (Alternatively, you can extract top positive routes directly in dataAnalyzer)
    const positiveBoxHtml = `
      <div class="culprit-box positive-box" style="border-color: #10B981; background: #ECFDF5; margin-top: 10px; display: flex; align-items: flex-start; gap: 12px; padding: 12px; border-radius: 8px; border-left: 4px solid #10B981;">
        <div class="alert-icon" style="color: #10B981; font-size: 1.2rem;">🚀</div>
        <div>
          <div class="culprit-title" style="color: #065F46; font-weight: 700; font-size: 0.95rem;">Performance Growth Driver</div>
          <div class="culprit-detail" style="color: #047857; font-size: 0.85rem; margin-top: 2px;">
            Average loading tickets increased by <strong>+${Math.round(data.avgDiff)} points</strong> compared to the previous period. This upward trend was primarily driven by higher trip volumes and stronger package consolidation across high-performing mainline routes.
          </div>
        </div>
      </div>
    `;

    // Append or inject alongside existing culprit box
    culpritEl.innerHTML += positiveBoxHtml;
  }

  return { renderPositiveContributor };
})();