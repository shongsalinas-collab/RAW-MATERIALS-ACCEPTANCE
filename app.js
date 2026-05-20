/* ============================================================
   Big Ben RMC — Raw Materials Receiving KPI Dashboard
   app.js  |  SD-QA-01 Rev.1
   ============================================================ */

const STORAGE_KEY = 'bigben_rmc_kpi_v1';

const MATERIALS = [
  'Coarse Aggregates',
  'Fine Aggregates',
  'Portland Cement',
  'Admixture',
  'Fly Ash'
];

const MAT_SHORT = ['Coarse Agg.', 'Fine Agg.', 'Cement', 'Admixture', 'Fly Ash'];

const MAT_CRITERIA = {
  'Coarse Aggregates': 'Sieve Analysis ±5% · SG ≥ 2.500 · UW ≥ 1.400 kg/m³',
  'Fine Aggregates':   'Sieve Analysis ±5% · #200 sieve ≤ 1% · SG ≥ 2.500',
  'Portland Cement':   'Temperature ≤ 32°C per delivery',
  'Admixture':         'Specific gravity & pH within mill certificate (ASTM C494)',
  'Fly Ash':           'No float oil / unburn coal · Mill certificate required'
};

const MAT_COLORS = ['#378ADD', '#1D9E75', '#D85A30', '#7F77DD', '#BA7517'];

let allData = [];
let editIndex = null;
let gaugeCharts = {};
let trendChart = null;

/* ============================================================ DATA ============================================================ */

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) allData = JSON.parse(raw);
  } catch (e) {
    allData = [];
  }
  if (!allData.length) allData = sampleData();
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allData));
  } catch (e) {
    showToast('Storage full — data not saved.', '#E24B4A');
  }
}

function sampleData() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = (n) => `${y}-${m}-${String(n).padStart(2, '0')}`;
  return [
    { date: d(2),  time: '07:30', dr: 'DR-2501', plate: 'XYZ 001', supplier: 'ABC Aggregates',  material: 'Coarse Aggregates', param: 'Sieve Analysis',    result: '±3%',          status: 'Passed',   tester: 'J. Dela Cruz', remarks: '' },
    { date: d(2),  time: '09:15', dr: 'DR-2502', plate: 'DEF 002', supplier: 'San Jose Sand',    material: 'Fine Aggregates',   param: 'Sieve Analysis',    result: '±6%',          status: 'Rejected', tester: 'J. Dela Cruz', remarks: 'Failed ±5% limit' },
    { date: d(3),  time: '08:00', dr: 'DR-2503', plate: 'GHI 003', supplier: 'PHL Cement Corp',  material: 'Portland Cement',   param: 'Temperature',       result: '28°C',         status: 'Passed',   tester: 'M. Santos',    remarks: '' },
    { date: d(3),  time: '10:30', dr: 'DR-2504', plate: 'JKL 004', supplier: 'Chem Solutions',   material: 'Admixture',         param: 'Specific Gravity',  result: '1.21',         status: 'Passed',   tester: 'M. Santos',    remarks: 'Within spec 1.18–1.25' },
    { date: d(4),  time: '07:45', dr: 'DR-2505', plate: 'MNO 005', supplier: 'FlyAsh Supply Co', material: 'Fly Ash',           param: 'Visual Inspection', result: 'Oil floating',  status: 'Rejected', tester: 'R. Reyes',     remarks: 'Rejected — float oil present' },
    { date: d(5),  time: '11:00', dr: 'DR-2506', plate: 'PQR 006', supplier: 'ABC Aggregates',   material: 'Coarse Aggregates', param: 'Sieve Analysis',    result: '±2%',          status: 'Passed',   tester: 'J. Dela Cruz', remarks: '' },
    { date: d(6),  time: '08:20', dr: 'DR-2507', plate: 'STU 007', supplier: 'San Jose Sand',    material: 'Fine Aggregates',   param: 'Sieve Analysis',    result: '±4%',          status: 'Passed',   tester: 'J. Dela Cruz', remarks: '' },
    { date: d(7),  time: '09:45', dr: 'DR-2508', plate: 'VWX 008', supplier: 'PHL Cement Corp',  material: 'Portland Cement',   param: 'Temperature',       result: '34°C',         status: 'Rejected', tester: 'R. Reyes',     remarks: 'Exceeded 32°C limit' },
    { date: d(8),  time: '07:00', dr: 'DR-2509', plate: 'YZA 009', supplier: 'FlyAsh Supply Co', material: 'Fly Ash',           param: 'Visual Inspection', result: 'Clean, gray',  status: 'Passed',   tester: 'M. Santos',    remarks: 'With mill cert' },
    { date: d(8),  time: '10:00', dr: 'DR-2510', plate: 'BCD 010', supplier: 'Chem Solutions',   material: 'Admixture',         param: 'Specific Gravity',  result: '1.28',         status: 'Rejected', tester: 'M. Santos',    remarks: 'Above spec — rejected' },
    { date: d(9),  time: '08:30', dr: 'DR-2511', plate: 'EFG 011', supplier: 'ABC Aggregates',   material: 'Coarse Aggregates', param: 'Sieve Analysis',    result: '±1%',          status: 'Passed',   tester: 'J. Dela Cruz', remarks: '' },
    { date: d(10), time: '09:00', dr: 'DR-2512', plate: 'HIJ 012', supplier: 'San Jose Sand',    material: 'Fine Aggregates',   param: 'Sieve Analysis',    result: '±3%',          status: 'Passed',   tester: 'J. Dela Cruz', remarks: '' },
    { date: d(11), time: '08:00', dr: 'DR-2513', plate: 'KLM 013', supplier: 'PHL Cement Corp',  material: 'Portland Cement',   param: 'Temperature',       result: '30°C',         status: 'Passed',   tester: 'R. Reyes',     remarks: '' },
    { date: d(12), time: '11:15', dr: 'DR-2514', plate: 'NOP 014', supplier: 'FlyAsh Supply Co', material: 'Fly Ash',           param: 'Visual Inspection', result: 'Unburn coal',  status: 'Rejected', tester: 'M. Santos',    remarks: 'Quality issue' },
    { date: d(13), time: '08:00', dr: 'DR-2515', plate: 'OPQ 015', supplier: 'ABC Aggregates',   material: 'Coarse Aggregates', param: 'Sieve Analysis',    result: '±2%',          status: 'Passed',   tester: 'J. Dela Cruz', remarks: '' },
    { date: d(14), time: '09:30', dr: 'DR-2516', plate: 'RST 016', supplier: 'San Jose Sand',    material: 'Fine Aggregates',   param: 'Sieve Analysis',    result: '±1%',          status: 'Passed',   tester: 'J. Dela Cruz', remarks: '' },
    { date: d(15), time: '07:45', dr: 'DR-2517', plate: 'UVW 017', supplier: 'PHL Cement Corp',  material: 'Portland Cement',   param: 'Temperature',       result: '29°C',         status: 'Passed',   tester: 'M. Santos',    remarks: '' },
    { date: d(15), time: '10:00', dr: 'DR-2518', plate: 'XYZ 018', supplier: 'Chem Solutions',   material: 'Admixture',         param: 'Specific Gravity',  result: '1.20',         status: 'Passed',   tester: 'M. Santos',    remarks: '' },
    { date: d(16), time: '08:15', dr: 'DR-2519', plate: 'ABC 019', supplier: 'FlyAsh Supply Co', material: 'Fly Ash',           param: 'Visual Inspection', result: 'Gray, clean',  status: 'Passed',   tester: 'R. Reyes',     remarks: 'With cert' },
    { date: d(17), time: '09:00', dr: 'DR-2520', plate: 'DEF 020', supplier: 'ABC Aggregates',   material: 'Coarse Aggregates', param: 'Sieve Analysis',    result: '±4%',          status: 'Passed',   tester: 'J. Dela Cruz', remarks: '' },
  ].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}

/* ============================================================ MONTH SELECT ============================================================ */

function buildMonthSelect() {
  const sel = document.getElementById('sel-month');
  const current = sel.value;

  const months = new Set(allData.map(d => d.date.slice(0, 7)));
  const now = new Date();
  const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  months.add(cur);

  sel.innerHTML = '';
  [...months].sort().reverse().forEach(m => {
    const [y, mo] = m.split('-');
    const label = new Date(+y, +mo - 1, 1).toLocaleDateString('en-PH', { year: 'numeric', month: 'long' });
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = label;
    if (m === (current || cur)) opt.selected = true;
    sel.appendChild(opt);
  });
}

function getSelMonth() { return document.getElementById('sel-month').value; }

function monthData() {
  const m = getSelMonth();
  return allData.filter(d => d.date.startsWith(m));
}

/* ============================================================ RENDER ============================================================ */

function render() {
  const md = monthData();
  const m = getSelMonth();
  const [y, mo] = m.split('-');
  const label = new Date(+y, +mo - 1, 1).toLocaleDateString('en-PH', { year: 'numeric', month: 'long' });

  document.getElementById('cur-date').textContent =
    new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
  document.getElementById('log-month-label').textContent = label;

  renderGauges(md);
  renderOverall(md);
  renderTrend(md, m);
  renderLog();
}

/* ---- GAUGE CARDS ---- */
function renderGauges(md) {
  const grid = document.getElementById('kpi-grid');
  grid.innerHTML = '';

  MATERIALS.forEach((mat, i) => {
    const rows = md.filter(d => d.material === mat);
    const tot = rows.length;
    const pass = rows.filter(d => d.status === 'Passed').length;
    const pct = tot ? Math.round(pass / tot * 100) : null;

    const color   = pct === null ? '#888' : pct === 100 ? '#3B6D11' : pct >= 80 ? '#854F0B' : '#A32D2D';
    const barFill = pct === null ? '#ccc' : pct === 100 ? '#639922' : pct >= 80 ? '#EF9F27' : '#E24B4A';
    const statusLabel = pct === null ? 'no data' : pct === 100 ? 'on target' : pct >= 80 ? 'below target' : 'critical';
    const statusCls   = pct === null ? 'badge-warn' : pct === 100 ? 'badge-pass' : pct >= 80 ? 'badge-warn' : 'badge-reject';
    const cardCls     = pct === null ? '' : pct === 100 ? 'target-hit' : pct >= 80 ? 'target-warn' : 'target-critical';

    const card = document.createElement('div');
    card.className = `kpi-card ${cardCls}`;
    card.title = MAT_CRITERIA[mat];
    card.innerHTML = `
      <div class="kpi-mat">${MAT_SHORT[i]}</div>
      <div class="gauge-wrap"><canvas id="gauge-${i}" role="img" aria-label="${mat} pass rate: ${pct !== null ? pct + '%' : 'no data'}"></canvas></div>
      <div class="kpi-pct" style="color:${color}">${pct !== null ? pct + '%' : '—'}</div>
      <div class="kpi-detail">${pass}/${tot} passed</div>
      <span class="kpi-status-pill badge ${statusCls}">${statusLabel}</span>
    `;
    grid.appendChild(card);

    setTimeout(() => {
      const ctx = document.getElementById(`gauge-${i}`);
      if (!ctx) return;
      if (gaugeCharts[i]) { gaugeCharts[i].destroy(); }
      const val = pct !== null ? pct : 0;
      gaugeCharts[i] = new Chart(ctx, {
        type: 'doughnut',
        data: {
          datasets: [{
            data: [val, 100 - val],
            backgroundColor: [barFill, 'rgba(128,128,128,0.12)'],
            borderWidth: 0,
            circumference: 180,
            rotation: 270
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '68%',
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
          animation: { duration: 600 }
        }
      });
    }, 60);
  });
}

/* ---- OVERALL KPI ---- */
function renderOverall(md) {
  const tot  = md.length;
  const pass = md.filter(d => d.status === 'Passed').length;
  const rej  = md.filter(d => d.status === 'Rejected').length;
  const pend = md.filter(d => d.status === 'Pending').length;
  const pct  = tot ? Math.round(pass / tot * 100) : 0;
  const gap  = 100 - pct;

  const color    = pct === 100 ? '#3B6D11' : pct >= 80 ? '#854F0B' : '#A32D2D';
  const barColor = pct === 100 ? '#639922' : pct >= 80 ? '#EF9F27' : '#E24B4A';

  const el = document.getElementById('overall-pct');
  el.textContent = pct + '%';
  el.style.color = color;

  const bar = document.getElementById('overall-bar');
  bar.style.width = pct + '%';
  bar.style.background = barColor;

  document.getElementById('overall-note').textContent =
    pct === 100
      ? `All ${tot} deliveries passed — monthly target achieved!`
      : `${gap}% gap to 100% target · ${rej} rejection${rej !== 1 ? 's' : ''} this month${pend ? ` · ${pend} pending` : ''}`;

  document.getElementById('overall-mini').innerHTML = [
    ['Total deliveries', tot, 'var(--text)'],
    ['Passed', pass, '#3B6D11'],
    ['Rejected', rej, '#A32D2D']
  ].map(([l, v, c]) => `
    <div class="mini-card">
      <div class="mini-label">${l}</div>
      <div class="mini-val" style="color:${c}">${v}</div>
    </div>`).join('');
}

/* ---- TREND CHART ---- */
function renderTrend(md, monthStr) {
  if (trendChart) { trendChart.destroy(); trendChart = null; }
  const [y, mo] = monthStr.split('-');
  const daysInMonth = new Date(+y, +mo, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => {
    return `${monthStr}-${String(i + 1).padStart(2, '0')}`;
  });

  const passRates = days.map(date => {
    const rows = md.filter(d => d.date === date && d.status !== 'Pending');
    if (!rows.length) return null;
    return Math.round(rows.filter(d => d.status === 'Passed').length / rows.length * 100);
  });

  const rejCounts = days.map(date =>
    md.filter(d => d.date === date && d.status === 'Rejected').length
  );

  const labels = days.map(d => d.slice(8));

  const ctx = document.getElementById('chartTrend');
  trendChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          type: 'line',
          label: 'Pass rate %',
          data: passRates,
          borderColor: '#3B6D11',
          backgroundColor: 'rgba(59,109,17,0.07)',
          tension: 0.35, fill: true,
          pointRadius: 3, pointBackgroundColor: '#639922',
          borderWidth: 2, spanGaps: true, yAxisID: 'y'
        },
        {
          type: 'line',
          label: 'Target 100%',
          data: days.map(() => 100),
          borderColor: '#378ADD',
          borderDash: [5, 4],
          pointRadius: 0, fill: false,
          borderWidth: 1.5, yAxisID: 'y'
        },
        {
          type: 'bar',
          label: 'Rejections',
          data: rejCounts,
          backgroundColor: 'rgba(226,75,74,0.30)',
          borderRadius: 2, yAxisID: 'y2'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 9 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 }
        },
        y: {
          min: 0, max: 105, position: 'left',
          ticks: { font: { size: 9 }, callback: v => v + '%' },
          grid: { color: 'rgba(128,128,128,0.1)' }
        },
        y2: {
          min: 0, max: 6, position: 'right',
          ticks: { font: { size: 9 }, stepSize: 1 },
          grid: { display: false }
        }
      }
    }
  });
}

/* ---- DELIVERY LOG ---- */
function renderLog() {
  const md = monthData();
  const search = (document.getElementById('search-box')?.value || '').toLowerCase();
  const filterStatus = document.getElementById('filter-status')?.value || '';

  let rows = [...md].sort((a, b) =>
    b.date.localeCompare(a.date) || b.time.localeCompare(a.time)
  );

  if (search) {
    rows = rows.filter(r =>
      [r.supplier, r.material, r.dr, r.plate, r.param, r.result, r.tester, r.remarks]
        .join(' ').toLowerCase().includes(search)
    );
  }
  if (filterStatus) {
    rows = rows.filter(r => r.status === filterStatus);
  }

  const tbody = document.getElementById('log-body');
  if (!rows.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="12">No deliveries match the current filter for this month.</td></tr>';
  } else {
    tbody.innerHTML = rows.map((d, i) => {
      const realIndex = allData.indexOf(d);
      const pillCls = d.status === 'Passed' ? 'pill-pass' : d.status === 'Rejected' ? 'pill-reject' : 'pill-pending';
      return `<tr>
        <td>${d.date}</td>
        <td>${d.time || '—'}</td>
        <td title="${d.dr}">${d.dr || '—'}</td>
        <td title="${d.plate}">${d.plate || '—'}</td>
        <td title="${d.supplier}">${d.supplier || '—'}</td>
        <td title="${d.material}">${d.material}</td>
        <td title="${d.param}">${d.param}</td>
        <td title="${d.result}">${d.result}</td>
        <td><span class="pill ${pillCls}">${d.status}</span></td>
        <td title="${d.tester}">${d.tester || '—'}</td>
        <td title="${d.remarks || ''}">${d.remarks || '—'}</td>
        <td>
          <button class="edit-btn" onclick="openEdit(${realIndex})" title="Edit entry">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
        </td>
      </tr>`;
    }).join('');
  }

  document.getElementById('log-footer').textContent =
    `Showing ${rows.length} of ${md.length} entries for this month`;
}

/* ============================================================ FORM — ADD ============================================================ */

function toggleForm() {
  const panel = document.getElementById('form-panel');
  const isOpen = panel.classList.contains('open');
  if (!isOpen) {
    const now = new Date();
    document.getElementById('f-date').value = now.toISOString().split('T')[0];
    document.getElementById('f-time').value = now.toTimeString().slice(0, 5);
    ['f-dr', 'f-plate', 'f-sup', 'f-param', 'f-res', 'f-tstr', 'f-rem'].forEach(id => {
      document.getElementById(id).value = '';
    });
    document.getElementById('f-mat').value = 'Coarse Aggregates';
    document.getElementById('f-stat').value = 'Passed';
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  panel.classList.toggle('open', !isOpen);
}

function saveDelivery() {
  const entry = {
    date:     document.getElementById('f-date').value || new Date().toISOString().split('T')[0],
    time:     document.getElementById('f-time').value,
    dr:       document.getElementById('f-dr').value.trim(),
    plate:    document.getElementById('f-plate').value.trim(),
    supplier: document.getElementById('f-sup').value.trim(),
    material: document.getElementById('f-mat').value,
    param:    document.getElementById('f-param').value.trim() || document.getElementById('f-mat').value,
    result:   document.getElementById('f-res').value.trim(),
    status:   document.getElementById('f-stat').value,
    tester:   document.getElementById('f-tstr').value.trim(),
    remarks:  document.getElementById('f-rem').value.trim(),
  };

  if (!entry.supplier || !entry.result) {
    showToast('Please fill in Supplier and Result fields.', '#E24B4A');
    return;
  }

  allData.push(entry);
  allData.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  saveData();
  buildMonthSelect();

  // Switch to the month of the new entry
  document.getElementById('sel-month').value = entry.date.slice(0, 7);

  document.getElementById('form-panel').classList.remove('open');
  render();
  showToast(`Delivery logged — ${entry.material} · ${entry.status}`, entry.status === 'Passed' ? '#639922' : '#E24B4A');
}

/* ============================================================ FORM — EDIT ============================================================ */

function openEdit(index) {
  editIndex = index;
  const d = allData[index];
  if (!d) return;

  document.getElementById('e-date').value  = d.date;
  document.getElementById('e-time').value  = d.time;
  document.getElementById('e-dr').value    = d.dr;
  document.getElementById('e-plate').value = d.plate;
  document.getElementById('e-sup').value   = d.supplier;
  document.getElementById('e-mat').value   = d.material;
  document.getElementById('e-param').value = d.param;
  document.getElementById('e-res').value   = d.result;
  document.getElementById('e-stat').value  = d.status;
  document.getElementById('e-tstr').value  = d.tester;
  document.getElementById('e-rem').value   = d.remarks;

  document.getElementById('edit-overlay').classList.add('open');
}

function closeEdit() {
  document.getElementById('edit-overlay').classList.remove('open');
  editIndex = null;
}

function saveEdit() {
  if (editIndex === null) return;
  allData[editIndex] = {
    date:     document.getElementById('e-date').value,
    time:     document.getElementById('e-time').value,
    dr:       document.getElementById('e-dr').value.trim(),
    plate:    document.getElementById('e-plate').value.trim(),
    supplier: document.getElementById('e-sup').value.trim(),
    material: document.getElementById('e-mat').value,
    param:    document.getElementById('e-param').value.trim(),
    result:   document.getElementById('e-res').value.trim(),
    status:   document.getElementById('e-stat').value,
    tester:   document.getElementById('e-tstr').value.trim(),
    remarks:  document.getElementById('e-rem').value.trim(),
  };
  allData.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  saveData();
  closeEdit();
  render();
  showToast('Entry updated successfully.', '#639922');
}

function deleteEntry() {
  if (editIndex === null) return;
  if (!confirm('Delete this delivery entry? This cannot be undone.')) return;
  allData.splice(editIndex, 1);
  saveData();
  closeEdit();
  buildMonthSelect();
  render();
  showToast('Entry deleted.', '#E24B4A');
}

/* ============================================================ TOAST ============================================================ */

function showToast(msg, color = '#639922') {
  let toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.className = 'toast';
    toast.innerHTML = '<span class="toast-dot" id="toast-dot"></span><span id="toast-msg"></span>';
    document.body.appendChild(toast);
  }
  document.getElementById('toast-dot').style.background = color;
  document.getElementById('toast-msg').textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

/* ============================================================ EXPORT ============================================================ */

function exportCSV() {
  const md = monthData();
  const headers = ['Date','Time','DR No.','Plate No.','Supplier','Material','Test Parameter','Result','Status','Tested By','Remarks'];
  const rows = md.map(d => [
    d.date, d.time, d.dr, d.plate, d.supplier, d.material, d.param, d.result, d.status, d.tester, d.remarks
  ].map(v => `"${(v||'').replace(/"/g,'""')}"`).join(','));

  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const [y, m] = getSelMonth().split('-');
  const label = new Date(+y, +m - 1, 1).toLocaleDateString('en-PH', { year: 'numeric', month: 'long' }).replace(/ /g, '_');
  a.download = `BigBen_RMC_KPI_${label}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('CSV exported successfully.', '#378ADD');
}

/* ============================================================ KEYBOARD ============================================================ */

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeEdit();
    document.getElementById('form-panel').classList.remove('open');
  }
});

/* ============================================================ INIT ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  loadData();
  buildMonthSelect();
  render();
  document.getElementById('sel-month').addEventListener('change', render);

  // Add export button to header
  const headerRight = document.querySelector('.header-right');
  const exportBtn = document.createElement('button');
  exportBtn.className = 'btn-secondary';
  exportBtn.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px';
  exportBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Export CSV`;
  exportBtn.onclick = exportCSV;
  headerRight.insertBefore(exportBtn, headerRight.querySelector('.btn-primary'));
});
