/* ================================================================
   Big Ben RMC -- Raw Materials Acceptance Dashboard
   app.js | SD-QA-01 Rev.1 | Firebase Realtime Database
   Stable version -- offline-first with Firebase sync
   ================================================================ */

/* -- Firebase Config -- */
const firebaseConfig = {
  apiKey:            "AIzaSyB9w-dx2JwfqOS9tBec7e8aT6r1i3gYBKw",
  authDomain:        "raw-materials-acceptance.firebaseapp.com",
  databaseURL:       "https://raw-materials-acceptance-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "raw-materials-acceptance",
  storageBucket:     "raw-materials-acceptance.firebasestorage.app",
  messagingSenderId: "344106615126",
  appId:             "1:344106615126:web:f5243e6e775a11d8af56f7"
};

/* -- Material config -- */
const SUBTYPES = {
  'Coarse Aggregates': ['Agg - G1"', 'Agg - 3/4"', 'Agg - 3/8"', 'Other'],
  'Fine Aggregates':   ['Sand - S1', 'Sand - 2mm', 'Sand - 4mm', 'Other'],
  'Portland Cement':   ['Type I', 'Type II', 'Other'],
  'Fly Ash':           ['Type C', 'Type F', 'Other'],
  'Admixture':         ['Type A', 'Type B', 'Type C', 'Type D', 'Type E', 'Type F', 'Type G', 'Other'],
};

const MAT_PARAMS = {
  'Coarse Aggregates': ['Sieve Analysis','Specific Gravity','Unit Weight','Moisture Content','Soundness','Cleanliness','Los Angeles Abrasion'],
  'Fine Aggregates':   ['Sieve Analysis','Specific Gravity','Moisture Content','Material Finer than No.200','Soundness','Cleanliness'],
  'Portland Cement':   ['Temperature','Setting Time','Chemical Test','Mortar Test'],
  'Fly Ash':           ['Visual Inspection','Mill Certificate Check','Quality Test (ASTM C311)'],
  'Admixture':         ['Specific Gravity','pH Level','Mill Certificate Check'],
};

const QCP_FREQ = {
  'Coarse Aggregates': 'Weekly / per supplier',
  'Fine Aggregates':   'Weekly / per supplier',
  'Portland Cement':   'Every delivery',
  'Admixture':         'Every delivery',
  'Fly Ash':           'Every delivery',
};

/* -- State -- */
let deliveries  = [];
let documents   = [];
let editIdx     = null;
let gaugeCharts = {};
let trendChart  = null;
let activeTab   = 'kpi';
let db          = null;
let isOnline    = navigator.onLine;
let pendingSync = [];

/* ================================================================
   OFFLINE / ONLINE DETECTION
   ================================================================ */
function updateOnlineStatus() {
  isOnline = navigator.onLine;
  const indicator = document.getElementById('online-indicator');
  if (indicator) {
    indicator.textContent = isOnline ? 'Online' : 'Offline';
    indicator.style.background = isOnline ? '#EAF3DE' : '#FAEEDA';
    indicator.style.color = isOnline ? '#3B6D11' : '#854F0B';
    indicator.style.border = isOnline ? '0.5px solid #639922' : '0.5px solid #EF9F27';
  }
  if (isOnline) syncPending();
}

window.addEventListener('online',  updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

/* ================================================================
   LOCAL STORAGE (offline backup)
   ================================================================ */
const LS_KEY      = 'rma_deliveries_local';
const LS_PENDING  = 'rma_pending_sync';
const LS_DOCS     = 'rma_documents_local';

function saveLocal() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(deliveries)); } catch(e) {}
}
function loadLocal() {
  try {
    const d = localStorage.getItem(LS_KEY);
    if (d) deliveries = JSON.parse(d);
    const p = localStorage.getItem(LS_PENDING);
    if (p) pendingSync = JSON.parse(p);
  } catch(e) {}
}
function savePending() {
  try { localStorage.setItem(LS_PENDING, JSON.stringify(pendingSync)); } catch(e) {}
}
function clearPending() {
  pendingSync = [];
  try { localStorage.removeItem(LS_PENDING); } catch(e) {}
}

/* ================================================================
   FIREBASE INIT
   ================================================================ */
function initFirebase() {
  try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.database();

    /* Real-time listener for deliveries */
    db.ref('deliveries').on('value', snap => {
      const val = snap.val();
      const firebaseData = val
        ? Object.entries(val).map(([id, d]) => ({ ...d, _id: id }))
        : [];
      firebaseData.sort((a, b) =>
        (b.date||'').localeCompare(a.date||'') || (b.time||'').localeCompare(a.time||''));
      deliveries = firebaseData;
      saveLocal();
      buildMonthSelect();
      render();
      if (activeTab === 'kpi') setTimeout(renderCharts, 80);
    }, err => {
      console.warn('Firebase error:', err);
      toast('Using offline data', '#854F0B');
    });

    /* Real-time listener for documents */
    db.ref('documents').on('value', snap => {
      const val = snap.val();
      documents = val
        ? Object.entries(val).map(([id, d]) => ({ ...d, _id: id }))
        : [];
      renderDocs();
      const badge = document.getElementById('doc-count-badge');
      if (badge) badge.textContent = documents.length;
    });

  } catch(e) {
    console.warn('Firebase init failed, using offline mode:', e);
    toast('Offline mode -- data saved locally', '#854F0B');
  }
}

/* ================================================================
   SYNC PENDING OFFLINE ENTRIES
   ================================================================ */
function syncPending() {
  if (!db || !pendingSync.length) return;
  const toSync = [...pendingSync];
  clearPending();
  toSync.forEach(entry => {
    db.ref('deliveries').push(entry)
      .then(() => toast('Synced offline entry: ' + entry.dr, '#639922'))
      .catch(() => {
        pendingSync.push(entry);
        savePending();
      });
  });
}

/* ================================================================
   SAVE / DELETE
   ================================================================ */
function saveDeliveryToDb(entry) {
  if (!isOnline || !db) {
    /* Offline: save locally + queue for sync */
    const offlineEntry = { ...entry, _id: 'offline_' + Date.now(), _pending: true };
    deliveries.unshift(offlineEntry);
    saveLocal();
    pendingSync.push(entry);
    savePending();
    toast('Saved offline -- will sync when online', '#854F0B');
    return Promise.resolve();
  }
  if (editIdx !== null && deliveries[editIdx] && deliveries[editIdx]._id) {
    return db.ref('deliveries/' + deliveries[editIdx]._id).set(entry);
  }
  return db.ref('deliveries').push(entry);
}

function deleteDeliveryFromDb() {
  if (!isOnline || !db) {
    toast('Cannot delete while offline', '#E24B4A');
    return Promise.reject(new Error('Offline'));
  }
  const id = deliveries[editIdx]._id;
  return db.ref('deliveries/' + id).remove();
}

function saveDocToDb(doc) {
  if (!isOnline || !db) {
    toast('Cannot upload documents while offline', '#E24B4A');
    return Promise.reject(new Error('Offline'));
  }
  return db.ref('documents').push(doc);
}

function deleteDocFromDb(id) {
  if (!isOnline || !db) {
    toast('Cannot delete while offline', '#E24B4A');
    return Promise.reject(new Error('Offline'));
  }
  return db.ref('documents/' + id).remove();
}

function clearAllData() {
  if (!confirm('Clear ALL delivery data? This cannot be undone.')) return;
  if (!isOnline || !db) { toast('Cannot clear while offline', '#E24B4A'); return; }
  db.ref('deliveries').remove()
    .then(() => { localStorage.removeItem(LS_KEY); toast('All data cleared.', '#378ADD'); })
    .catch(err => toast('Error: ' + err.message, '#E24B4A'));
}

/* ================================================================
   MONTH SELECT
   ================================================================ */
function buildMonthSelect() {
  const sel = document.getElementById('sel-month');
  if (!sel) return;
  const cur = sel.value;
  const months = new Set(deliveries.map(d => (d.date||'').slice(0, 7)).filter(Boolean));
  const now = new Date();
  const thisMonth = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
  months.add(thisMonth);
  sel.innerHTML = '';
  const allOpt = document.createElement('option');
  allOpt.value = 'all'; allOpt.textContent = 'All Months';
  if (cur === 'all') allOpt.selected = true;
  sel.appendChild(allOpt);
  [...months].sort().reverse().forEach(m => {
    const [y, mo] = m.split('-');
    const lbl = new Date(+y, +mo-1, 1).toLocaleDateString('en-PH', {year:'numeric', month:'long'});
    const o = document.createElement('option');
    o.value = m; o.textContent = lbl;
    if (m === (cur || thisMonth)) o.selected = true;
    sel.appendChild(o);
  });
}

function selMonth() {
  const sel = document.getElementById('sel-month');
  return sel ? sel.value : '';
}

function monthDeliveries() {
  const m = selMonth();
  if (m === 'all') return [...deliveries];
  return deliveries.filter(d => (d.date||'').startsWith(m));
}

/* ================================================================
   TABS
   ================================================================ */
function setTab(name, btn) {
  document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  const tab = document.getElementById('tab-' + name);
  if (tab) tab.classList.add('active');
  activeTab = name;
  if (name === 'kpi') setTimeout(renderCharts, 80);
  if (name === 'docs') renderDocs();
}

/* ================================================================
   RENDER
   ================================================================ */
function render() {
  const now = new Date();
  const dateEl = document.getElementById('cur-date');
  if (dateEl) dateEl.textContent = now.toLocaleDateString('en-PH',
    {weekday:'short', year:'numeric', month:'short', day:'numeric'});

  const md = monthDeliveries();
  const [y, mo] = (selMonth()||'').split('-');
  const lbl = y && mo ? new Date(+y,+mo-1,1).toLocaleDateString('en-PH',
    {year:'numeric', month:'long'}) : '';

  const logLbl = document.getElementById('log-month-label');
  if (logLbl) logLbl.textContent = lbl;
  const trendLbl = document.getElementById('trend-month-label');
  if (trendLbl) trendLbl.textContent = lbl;

  renderOverall(md);
  renderGaugeType(md);
  renderGaugeSubtype(md);
  renderLog();
}

/* -- Overall KPI -- */
function renderOverall(md) {
  const tot  = md.length;
  const pass = md.filter(d => d.status === 'Passed').length;
  const rej  = md.filter(d => d.status === 'Rejected').length;
  const pend = md.filter(d => d.status === 'Pending').length;
  const pct  = tot ? Math.round(pass / tot * 100) : 0;

  const color    = pct===100 ? '#3B6D11' : pct>=80 ? '#854F0B' : '#A32D2D';
  const barColor = pct===100 ? '#639922' : pct>=80 ? '#EF9F27' : '#E24B4A';

  const pctEl = document.querySelector('#overall-card .overall-big span:first-child');
  if (pctEl) { pctEl.textContent = pct + '%'; pctEl.style.color = color; }

  const bar = document.getElementById('overall-bar');
  if (bar) { bar.style.width = pct + '%'; bar.style.background = barColor; }

  const noteEl = document.getElementById('overall-note');
  if (noteEl) noteEl.textContent = pct === 100
    ? 'All ' + tot + ' deliveries passed -- monthly target achieved!'
    : (100-pct) + '% gap to 100% target - ' + rej + ' rejection' + (rej!==1?'s':'') + ' this month' + (pend?' - '+pend+' pending':'');

  const setMini = (id, val) => {
    const el = document.querySelector('#' + id + ' .ms-val');
    if (el) el.textContent = val;
  };
  setMini('mini-total', tot);
  setMini('mini-pass',  pass);
  setMini('mini-rej',   rej);
  setMini('mini-pend',  pend);
}

/* -- Gauges per type -- */
function renderGaugeType(md) {
  const grid = document.getElementById('gauge-type-grid');
  if (!grid) return;
  grid.innerHTML = '';
  Object.keys(SUBTYPES).forEach((mat, i) => {
    const rows = md.filter(d => d.material === mat);
    const tot  = rows.length;
    const pass = rows.filter(d => d.status === 'Passed').length;
    const pct  = tot ? Math.round(pass / tot * 100) : null;
    const color     = pct===null?'#999':pct===100?'#3B6D11':pct>=80?'#854F0B':'#A32D2D';
    const fillColor = pct===null?'#ddd':pct===100?'#639922':pct>=80?'#EF9F27':'#E24B4A';
    const cls       = pct===null?'':pct===100?'hit':pct>=80?'warn':'critical';
    const pillCls   = pct===null?'p-pend':pct===100?'p-pass':pct>=80?'p-pend':'p-rej';
    const pillLbl   = pct===null?'no data':pct===100?'on target':pct>=80?'below target':'critical';

    const card = document.createElement('div');
    card.className = 'gauge-card ' + cls;
    card.title = QCP_FREQ[mat] || '';
    card.innerHTML =
      '<div class="gauge-mat">' + mat + '</div>' +
      '<div class="gauge-wrap"><canvas id="gc-' + i + '" width="90" height="50"></canvas></div>' +
      '<div class="gauge-pct" style="color:' + color + '">' + (pct!==null?pct+'%':'--') + '</div>' +
      '<div class="gauge-det">' + pass + '/' + tot + ' passed</div>' +
      '<span class="gauge-pill badge ' + pillCls + '">' + pillLbl + '</span>';
    grid.appendChild(card);

    setTimeout(function() {
      const ctx = document.getElementById('gc-' + i);
      if (!ctx) return;
      if (gaugeCharts[i]) { try { gaugeCharts[i].destroy(); } catch(e){} }
      gaugeCharts[i] = new Chart(ctx, {
        type: 'doughnut',
        data: { datasets: [{
          data: [pct||0, 100-(pct||0)],
          backgroundColor: [fillColor, 'rgba(128,128,128,0.1)'],
          borderWidth: 0, circumference: 180, rotation: 270
        }]},
        options: { responsive: false, maintainAspectRatio: false, cutout: '68%',
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
          animation: { duration: 500 }}
      });
    }, 100 + i * 30);
  });
}

/* -- Gauges per subtype -- */
function renderGaugeSubtype(md) {
  const grid = document.getElementById('gauge-subtype-grid');
  if (!grid) return;
  grid.innerHTML = '';
  Object.entries(SUBTYPES).forEach(function([mat, subs]) {
    subs.forEach(function(sub) {
      const rows = md.filter(d => d.material===mat && (d.type===sub || d.subtype===sub));
      const tot  = rows.length;
      const pass = rows.filter(d => d.status==='Passed').length;
      const pct  = tot ? Math.round(pass/tot*100) : null;
      const color     = pct===null?'#999':pct===100?'#3B6D11':pct>=80?'#854F0B':'#A32D2D';
      const fillColor = pct===null?'#eee':pct===100?'#639922':pct>=80?'#EF9F27':'#E24B4A';
      const pillCls   = pct===null?'p-pend':pct===100?'p-pass':pct>=80?'p-pend':'p-rej';
      const pillLbl   = pct===null?'no data':pct===100?'on target':pct>=80?'below':'critical';

      const card = document.createElement('div');
      card.className = 'sub-card';
      card.innerHTML =
        '<div class="sub-mat">' + mat + '</div>' +
        '<div class="sub-name">' + sub + '</div>' +
        '<div class="sub-pct" style="color:' + color + '">' + (pct!==null?pct+'%':'--') + '</div>' +
        '<div class="sub-det">' + pass + '/' + tot + ' passed ' +
        '<span class="pill ' + pillCls + '" style="margin-left:3px">' + pillLbl + '</span></div>' +
        '<div class="prog-bar"><div class="prog-fill" style="width:' + (pct||0) + '%;background:' + fillColor + '"></div></div>';
      grid.appendChild(card);
    });
  });
}

/* -- Trend chart -- */
function renderCharts() {
  const md = monthDeliveries();
  const monthStr = selMonth();
  if (!monthStr) return;
  if (trendChart) { try { trendChart.destroy(); } catch(e){} trendChart = null; }
  const [y, mo] = monthStr.split('-');
  const days = Array.from({length: new Date(+y,+mo,0).getDate()}, (_,i) =>
    monthStr + '-' + String(i+1).padStart(2,'0'));
  const passRates = days.map(date => {
    const rows = md.filter(d => d.date===date && d.status!=='Pending');
    if (!rows.length) return null;
    return Math.round(rows.filter(d => d.status==='Passed').length / rows.length * 100);
  });
  const rejCounts = days.map(date =>
    md.filter(d => d.date===date && d.status==='Rejected').length);
  const ctx = document.getElementById('chartTrend');
  if (!ctx) return;
  trendChart = new Chart(ctx, {
    type: 'bar',
    data: { labels: days.map(d => d.slice(8)), datasets: [
      { type:'line', data:passRates, borderColor:'#3B6D11', backgroundColor:'rgba(59,109,17,0.07)',
        tension:0.35, fill:true, pointRadius:3, pointBackgroundColor:'#639922',
        borderWidth:2, spanGaps:true, yAxisID:'y' },
      { type:'line', data:days.map(()=>100), borderColor:'#378ADD', borderDash:[5,4],
        pointRadius:0, fill:false, borderWidth:1.5, yAxisID:'y' },
      { type:'bar', data:rejCounts, backgroundColor:'rgba(226,75,74,0.28)',
        borderRadius:2, yAxisID:'y2' }
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid:{display:false}, ticks:{font:{size:9}, autoSkip:true, maxTicksLimit:15} },
        y: { min:0, max:105, position:'left',
          ticks:{font:{size:9}, callback:v=>v+'%'}, grid:{color:'rgba(128,128,128,0.07)'} },
        y2: { min:0, max:6, position:'right',
          ticks:{font:{size:9}, stepSize:1}, grid:{display:false} }
      }
    }
  });
}

/* -- Delivery Log -- */
function renderLog() {
  const md     = monthDeliveries();
  const search = (document.getElementById('search-box') ? document.getElementById('search-box').value : '').toLowerCase();
  const fMat   = document.getElementById('filter-mat')   ? document.getElementById('filter-mat').value   : '';
  const fStat  = document.getElementById('filter-status') ? document.getElementById('filter-status').value : '';

  let rows = [...md].sort((a,b) =>
    (b.date||'').localeCompare(a.date||'') || (b.time||'').localeCompare(a.time||''));
  if (search) rows = rows.filter(r =>
    [r.supplier,r.material,r.type,r.dr,r.plate,r.param,r.result,r.tester,r.remarks]
    .join(' ').toLowerCase().includes(search));
  if (fMat)  rows = rows.filter(r => r.material===fMat);
  if (fStat) rows = rows.filter(r => r.status===fStat);

  const tbody = document.getElementById('log-body');
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="14">No deliveries logged for this month yet. Click "+ Log Delivery" to start.</td></tr>';
  } else {
    tbody.innerHTML = rows.map(function(d) {
      const idx = deliveries.findIndex(x => x._id === d._id);
      const pc  = d.status==='Passed'?'p-pass':d.status==='Rejected'?'p-rej':'p-pend';
      const pending = d._pending ? ' style="opacity:0.7"' : '';
      return '<tr' + pending + '>' +
        '<td>' + (d.date||'--') + '</td>' +
        '<td>' + (d.time||'--') + '</td>' +
        '<td title="' + (d.dr||'') + '">' + (d.dr||'--') + '</td>' +
        '<td title="' + (d.plate||'') + '">' + (d.plate||'--') + '</td>' +
        '<td title="' + (d.supplier||'') + '">' + (d.supplier||'--') + '</td>' +
        '<td title="' + (d.material||'') + '">' + (d.material||'--') + '</td>' +
        '<td title="' + (d.type||d.subtype||'') + '">' + (d.type||d.subtype||'--') + '</td>' +
        '<td title="' + (d.source||'') + '">' + (d.source||'--') + '</td>' +
        '<td title="' + (d.param||'') + '">' + (d.param||'--') + '</td>' +
        '<td title="' + (d.result||'') + '">' + (d.result||'--') + '</td>' +
        '<td><span class="pill ' + pc + '">' + d.status + '</span>' +
          (d._pending ? '<span style="font-size:9px;color:#854F0B;margin-left:3px">pending sync</span>' : '') +
        '</td>' +
        '<td>' + (d.tester||'--') + '</td>' +
        '<td title="' + (d.remarks||'') + '">' + (d.remarks||'--') + '</td>' +
        '<td>' +
          (d._pending ? '' :
            '<button class="act-btn" onclick="openEditForm(' + idx + ')" title="Edit">' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
            '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>' +
            '<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>' +
            '</svg></button>') +
        '</td>' +
      '</tr>';
    }).join('');
  }
  const footer = document.getElementById('log-footer');
  if (footer) footer.textContent = 'Showing ' + rows.length + ' of ' + md.length + ' entries for this month';
}

/* ================================================================
   DELIVERY MODAL
   ================================================================ */
function openAddForm() {
  try {
    editIdx = null;
    const now = new Date();
    setText('modal-title', 'Log New Delivery');
    setStyle('modal-delete-btn', 'display', 'none');
    setText('modal-save-btn', 'Save Delivery');
    setVal('m-date', now.toISOString().split('T')[0]);
    setVal('m-time', now.toTimeString().slice(0,5));
    ['m-dr','m-plate','m-supplier','m-source','m-result','m-tester','m-remarks','m-subtype-other','m-status-other']
      .forEach(id => setVal(id, ''));
    const tw=document.getElementById('type-other-wrap'); if(tw) tw.style.display='none';
    const sw=document.getElementById('status-other-wrap'); if(sw) sw.style.display='none';
    setVal('m-material', '');
    setVal('m-status', 'Passed');
    updateSubtypes();
    openModal('delivery-modal');
  } catch(e) {
    console.error('openAddForm error:', e);
    toast('Error: ' + e.message, '#E24B4A');
  }
}

function openEditForm(idx) {
  try {
    editIdx = idx;
    const d = deliveries[idx];
    if (!d) return;
    setText('modal-title', 'Edit Delivery Entry');
    setStyle('modal-delete-btn', 'display', 'inline-flex');
    setText('modal-save-btn', 'Save Changes');
    setVal('m-date',     d.date||'');
    setVal('m-time',     d.time||'');
    setVal('m-dr',       d.dr||'');
    setVal('m-plate',    d.plate||'');
    setVal('m-supplier', d.supplier||'');
    setVal('m-material', d.material||'');
    updateSubtypes(d.type||d.subtype||'', d.param||'');
    setVal('m-source',   d.source||'');
    setVal('m-result',   d.result||'');
    setVal('m-status',   d.status||'Passed');
    setVal('m-tester',   d.tester||'');
    setVal('m-remarks',  d.remarks||'');
    openModal('delivery-modal');
  } catch(e) {
    console.error('openEditForm error:', e);
    toast('Error opening edit form: ' + e.message, '#E24B4A');
  }
}

function toggleTypeOther() {
  const sel = document.getElementById('m-subtype');
  const wrap = document.getElementById('type-other-wrap');
  if (!sel || !wrap) return;
  wrap.style.display = sel.value === 'Other' ? '' : 'none';
}

function toggleStatusOther() {
  const wrap = document.getElementById('status-other-wrap');
  if (wrap) wrap.style.display = getVal('m-status') === '__other__' ? '' : 'none';
}

function printLog() {
  const logTab = document.querySelector('.tab:nth-child(2)');
  if (logTab) setTab('log', logTab);
  setTimeout(() => window.print(), 300);
}

function closeDeliveryModal() {
  closeModal('delivery-modal');
  editIdx = null;
}

/* -- Helper functions -- */
function getVal(id) {
  const el = document.getElementById(id);
  return el ? el.value : '';
}
function setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
function setStyle(id, prop, val) {
  const el = document.getElementById(id);
  if (el) el.style[prop] = val;
}
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

/* -- Populate dropdowns -- */
function populateSelect(id, items, selected) {
  const sel = document.getElementById(id);
  if (!sel || sel.tagName !== 'SELECT') return;
  sel.innerHTML = '<option value="">-- Select --</option>';
  items.forEach(s => {
    const o = document.createElement('option');
    o.value = s; o.textContent = s;
    if (s === selected) o.selected = true;
    sel.appendChild(o);
  });
}

function updateSubtypes(selectedType, selectedParam) {
  const mat   = getVal('m-material');
  const subs  = SUBTYPES[mat] || [];
  const params = MAT_PARAMS[mat] || [];
  if (!subs.length) {
    const el = document.getElementById('m-subtype');
    if (el) el.innerHTML = '<option value="">n/a</option>';
  } else {
    populateSelect('m-subtype', subs, selectedType||'');
  }
  populateSelect('m-param', params, selectedParam||'');
}

/* -- Save delivery -- */
function saveDelivery() {
  const date     = getVal('m-date');
  const supplier = getVal('m-supplier').trim();
  const material = getVal('m-material');

  if (!date || !supplier || !material) {
    toast('Please fill in Date, Supplier and Material.', '#E24B4A');
    return;
  }

  const entry = {
    date,
    time:     getVal('m-time'),
    dr:       getVal('m-dr').trim(),
    plate:    getVal('m-plate').trim(),
    supplier,
    material,
    type:     getVal('m-subtype'),
    source:   getVal('m-source').trim(),
    param:    getVal('m-param'),
    result:   getVal('m-result').trim(),
    status:   getVal('m-status')==='__other__' ? getVal('m-status-other').trim() : getVal('m-status'),
    tester:   getVal('m-tester').trim(),
    remarks:  getVal('m-remarks').trim(),
  };

  const btn = document.getElementById('modal-save-btn');
  if (btn) { btn.textContent = 'Saving...'; btn.disabled = true; }

  saveDeliveryToDb(entry)
    .then(() => {
      closeDeliveryModal();
      setVal('sel-month', entry.date.slice(0,7));
      buildMonthSelect();
      render();
      if (activeTab === 'kpi') setTimeout(renderCharts, 80);
      if (!isOnline) {
        toast('Saved offline -- will sync when online', '#854F0B');
      } else {
        toast(editIdx!==null ? 'Entry updated!' : 'Delivery logged: ' + (entry.dr||entry.material),
          entry.status==='Passed' ? '#639922' : '#E24B4A');
      }
    })
    .catch(err => {
      toast('Save failed: ' + err.message, '#E24B4A');
      console.error('Save error:', err);
    })
    .finally(() => {
      if (btn) { btn.textContent = editIdx!==null ? 'Save Changes' : 'Save Delivery'; btn.disabled = false; }
    });
}

function deleteEntry() {
  if (editIdx === null) return;
  if (!confirm('Delete this delivery entry? This cannot be undone.')) return;
  deleteDeliveryFromDb()
    .then(() => { closeDeliveryModal(); toast('Entry deleted.', '#E24B4A'); })
    .catch(err => toast('Delete failed: ' + err.message, '#E24B4A'));
}

/* ================================================================
   DOCUMENTS
   ================================================================ */
function openDocForm() {
  setVal('df-date', new Date().toISOString().split('T')[0]);
  ['df-title','df-issuer','df-link','df-notes'].forEach(id => setVal(id, ''));
  const fi = document.getElementById('df-file');
  if (fi) fi.value = '';
  const fp = document.getElementById('doc-form-panel');
  if (fp) fp.classList.add('open');
}
function closeDocForm() {
  const fp = document.getElementById('doc-form-panel');
  if (fp) fp.classList.remove('open');
}

function saveDoc() {
  const title = getVal('df-title').trim();
  if (!title) { toast('Please enter a document title.', '#E24B4A'); return; }
  const fileInput = document.getElementById('df-file');
  const file = fileInput ? fileInput.files[0] : null;

  const finalize = (fileData, fileName, fileType) => {
    const doc = {
      title,
      material: getVal('df-mat'),
      doctype:  getVal('df-type'),
      date:     getVal('df-date'),
      issuer:   getVal('df-issuer').trim(),
      link:     getVal('df-link').trim(),
      notes:    getVal('df-notes').trim(),
      fileData: fileData || null,
      fileName: fileName || null,
      fileType: fileType || null,
      savedAt:  Date.now(),
    };
    saveDocToDb(doc)
      .then(() => { closeDocForm(); toast('Document saved.', '#639922'); })
      .catch(err => toast('Save failed: ' + err.message, '#E24B4A'));
  };

  if (file) {
    if (file.size > 5*1024*1024) { toast('File too large -- max 5MB.', '#E24B4A'); return; }
    const reader = new FileReader();
    reader.onload = e => finalize(e.target.result, file.name, file.type);
    reader.readAsDataURL(file);
  } else {
    finalize(null, null, null);
  }
}

function renderDocs() {
  const grid = document.getElementById('doc-grid');
  if (!grid) return;
  if (!documents.length) {
    grid.innerHTML = '<div class="no-docs">No documents attached yet.<br>Click "Add Document" to attach annual quality tests.</div>';
    return;
  }
  grid.innerHTML = documents.map(doc =>
    '<div class="doc-card">' +
      '<div class="doc-card-head"><div>' +
        '<div class="doc-title">' + doc.title + '</div>' +
        '<div class="doc-meta">' +
          '<span class="doc-tag">' + doc.material + '</span>' +
          '<span class="doc-tag">' + doc.doctype + '</span>' +
          (doc.date ? '<span>' + doc.date + '</span>' : '') +
          (doc.issuer ? '<span>- ' + doc.issuer + '</span>' : '') +
        '</div></div></div>' +
      (doc.notes ? '<div class="doc-notes">' + doc.notes + '</div>' : '') +
      '<div class="doc-actions">' +
        (doc.fileData ?
          '<a class="doc-link-btn" href="' + doc.fileData + '" download="' + (doc.fileName||'document') + '" target="_blank">Download</a>' +
          '<a class="doc-link-btn" href="' + doc.fileData + '" target="_blank">View</a>' : '') +
        (doc.link ?
          '<a class="doc-link-btn" href="' + doc.link + '" target="_blank">Open Link</a>' : '') +
        '<button class="doc-del-btn" onclick="deleteDoc(\'' + doc._id + '\')">Delete</button>' +
      '</div>' +
    '</div>'
  ).join('');
}

function deleteDoc(id) {
  if (!confirm('Delete this document?')) return;
  deleteDocFromDb(id)
    .then(() => toast('Document deleted.', '#E24B4A'))
    .catch(err => toast('Error: ' + err.message, '#E24B4A'));
}

/* ================================================================
   EXPORT CSV
   ================================================================ */
function exportCSV() {
  const md = monthDeliveries();
  if (!md.length) { toast('No data to export.', '#E24B4A'); return; }
  const hdrs = ['Date','Time','DR No.','Plate No.','Supplier','Material','Type',
    'Source','Test Parameter','Result','Status','Tested By','Remarks'];
  const rows = md.map(d => [d.date,d.time,d.dr,d.plate,d.supplier,d.material,
    d.type||d.subtype,d.source,d.param,d.result,d.status,d.tester,d.remarks]
    .map(v => '"' + (v||'').replace(/"/g,'""') + '"').join(','));
  const csv = [hdrs.join(','), ...rows].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv'}));
  const [y,m] = (selMonth()||'').split('-');
  const lbl = y && m ? new Date(+y,+m-1,1).toLocaleDateString('en-PH',
    {year:'numeric',month:'long'}).replace(/ /g,'_') : 'export';
  a.download = 'BigBen_RMA_' + lbl + '.csv';
  a.click();
  toast('CSV exported.', '#378ADD');
}

/* ================================================================
   TOAST
   ================================================================ */
function toast(msg, color) {
  color = color || '#639922';
  const dot = document.getElementById('toast-dot');
  const msgEl = document.getElementById('toast-msg');
  const el = document.getElementById('toast');
  if (!el) return;
  if (dot) dot.style.background = color;
  if (msgEl) msgEl.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 3500);
}

/* ================================================================
   KEYBOARD
   ================================================================ */
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    closeDeliveryModal();
    closeDocForm();
  }
});

/* ================================================================
   INIT
   ================================================================ */
document.addEventListener('DOMContentLoaded', function() {
  /* Add online indicator to header */
  const headerRight = document.querySelector('.header-right');
  if (headerRight) {
    const indicator = document.createElement('span');
    indicator.id = 'online-indicator';
    indicator.textContent = navigator.onLine ? 'Online' : 'Offline';
    indicator.style.cssText = 'font-size:10px;padding:3px 10px;border-radius:6px;font-weight:500;' +
      (navigator.onLine
        ? 'background:#EAF3DE;color:#3B6D11;border:0.5px solid #639922'
        : 'background:#FAEEDA;color:#854F0B;border:0.5px solid #EF9F27');
    headerRight.insertBefore(indicator, headerRight.firstChild);
  }

  /* Month select listener */
  const selEl = document.getElementById('sel-month');
  if (selEl) selEl.addEventListener('change', function() {
    render();
    if (activeTab === 'kpi') setTimeout(renderCharts, 80);
  });

  /* Load local data first for instant display */
  loadLocal();
  buildMonthSelect();
  render();

  /* Then connect Firebase for real-time sync */
  initFirebase();
  updateOnlineStatus();

  setTimeout(renderCharts, 200);
});
