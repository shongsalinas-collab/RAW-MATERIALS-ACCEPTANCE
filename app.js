/* ============================================================
   Big Ben RMC — Raw Materials Receiving KPI Dashboard
   app.js  |  SD-QA-01 Rev.1
   Firebase Firestore version — shared real-time data
   ============================================================ */

/* ============================================================
   FIREBASE CONFIG — PALITAN ANG MGA VALUE DITO
   Makukuha sa: Firebase Console → Project Settings → General
   → Your apps → Web app → firebaseConfig
   ============================================================ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, getDocs, addDoc, updateDoc, deleteDoc, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey:            "AIzaSyB9w-dx2Jwfq0S9tBec7e8aT6r1i3gYBKw",
  authDomain:        "raw-materials-acceptance.firebaseapp.com",
  projectId:         "raw-materials-acceptance",
  storageBucket:     "raw-materials-acceptance.firebasestorage.app",
  messagingSenderId: "344106615126",
  appId:             "1:344106615126:web:f5243e6e775a11d8af56f7"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);
const COLLECTION = "deliveries";

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
let editDocId = null;
let gaugeCharts = {};
let trendChart = null;

/* ============================================================ DATA — FIRESTORE ============================================================ */

function loadData() {
  // Real-time listener — awtomatiko mag-a-update ang dashboard kapag may nag-edit
  const col = collection(db, COLLECTION);
  onSnapshot(col, (snapshot) => {
    allData = [];
    snapshot.forEach(docSnap => {
      allData.push({ _id: docSnap.id, ...docSnap.data() });
    });
    allData.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
    buildMonthSelect();
    render();
  }, (error) => {
    showToast('Connection error. Check Firebase config.', '#E24B4A');
    console.error(error);
  });
}

async function saveData(entry) {
  try {
    await addDoc(collection(db, COLLECTION), entry);
  } catch (e) {
    showToast('Error saving data: ' + e.message, '#E24B4A');
  }
}

async function updateData(docId, entry) {
  try {
    const ref = doc(db, COLLECTION, docId);
    await updateDoc(ref, entry);
  } catch (e) {
    showToast('Error updating data: ' + e.message, '#E24B4A');
  }
}

async function deleteData(docId) {
  try {
    const ref = doc(db, COLLECTION, docId);
    await deleteDoc(ref);
  } catch (e) {
    showToast('Error deleting data: ' + e.message, '#E24B4A');
  }
}

async function clearAllData() {
  if (!confirm('Clear ALL delivery data? This cannot be undone.')) return;
  try {
    const snapshot = await getDocs(collection(db, COLLECTION));
    const deletes = snapshot.docs.map(d => deleteDoc(doc(db, COLLECTION, d.id)));
    await Promise.all(deletes);
    showToast('All data cleared. Ready for real entries.', '#378ADD');
  } catch (e) {
    showToast('Error clearing data: ' + e.message, '#E24B4A');
  }
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
    tbody.innerHTML = rows.map((d) => {
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
          <button class="edit-btn" onclick="openEdit('${d._id}')" title="Edit entry">
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

async function saveDelivery() {
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

  await saveData(entry);
  document.getElementById('sel-month').value = entry.date.slice(0, 7);
  document.getElementById('form-panel').classList.remove('open');
  showToast(`Delivery logged — ${entry.material} · ${entry.status}`, entry.status === 'Passed' ? '#639922' : '#E24B4A');
}

/* ============================================================ FORM — EDIT ============================================================ */

function openEdit(docId) {
  const d = allData.find(x => x._id === docId);
  if (!d) return;
  editDocId = docId;

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
  editDocId = null;
}

async function saveEdit() {
  if (!editDocId) return;
  const entry = {
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
  await updateData(editDocId, entry);
  closeEdit();
  showToast('Entry updated successfully.', '#639922');
}

async function deleteEntry() {
  if (!editDocId) return;
  if (!confirm('Delete this delivery entry? This cannot be undone.')) return;
  await deleteData(editDocId);
  closeEdit();
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
  loadData(); // Real-time listener na — awtomatiko mag-re-render

  document.getElementById('sel-month').addEventListener('change', render);

  const headerRight = document.querySelector('.header-right');

  const exportBtn = document.createElement('button');
  exportBtn.className = 'btn-secondary';
  exportBtn.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px';
  exportBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Export CSV';
  exportBtn.onclick = exportCSV;

  const clearBtn = document.createElement('button');
  clearBtn.className = 'btn-danger';
  clearBtn.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px';
  clearBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg> Clear data';
  clearBtn.onclick = clearAllData;

  headerRight.insertBefore(clearBtn, headerRight.querySelector('.btn-primary'));
  headerRight.insertBefore(exportBtn, clearBtn);
});
