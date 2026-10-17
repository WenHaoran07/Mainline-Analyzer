/* ==========================================================================
   MODULE: REFERENCE DIRECTORY MANAGER
   ========================================================================== */
const ReferenceManager = (() => {
  let activeTab = 'master';

  const configs = {
    master: { data: dcMasterData, columns: ['DC CODE', 'DC NAME', 'LOCATION / AREA', 'REGION'] },
    ports: { data: portUsedData, columns: ['REGION', 'DC CODE', 'PORT USED', 'RELATED DC CODE'] },
    trucks: { data: truckSizeData, columns: ['TRUCK SIZE (m)', 'WHEELS / TYPE'] }
  };

  function render() {
    const config = configs[activeTab];
    const query = (document.getElementById('dcSearch').value || '').trim().toLowerCase();
    const filtered = config.data.filter(row =>
      config.columns.some(col => String(row[col] ?? '').toLowerCase().includes(query))
    );

    document.getElementById('referenceHead').innerHTML =
      '<tr>' + config.columns.map(col => `<th>${col}</th>`).join('') + '</tr>';
    document.getElementById('referenceBody').innerHTML = filtered.length
      ? filtered.map(row => '<tr>' + config.columns.map(col => {
          const value = row[col] === null || row[col] === undefined || row[col] === '' ? '—' : row[col];
          return `<td>${String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>`;
        }).join('') + '</tr>').join('')
      : `<tr><td class="reference-empty" colspan="${config.columns.length}">No matching reference found.</td></tr>`;
    document.getElementById('referenceCount').textContent =
      `Showing ${filtered.length} of ${config.data.length} entries`;
    document.querySelectorAll('.reference-tab').forEach(button =>
      button.classList.toggle('active', button.dataset.refTab === activeTab)
    );
  }

  function init() {
    document.getElementById('dcSearch').addEventListener('input', render);
    document.querySelectorAll('.reference-tab').forEach(button => {
      button.addEventListener('click', () => {
        activeTab = button.dataset.refTab;
        render();
      });
    });
    render();
  }

  return { init, render };
})();