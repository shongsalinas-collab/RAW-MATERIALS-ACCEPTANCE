/* ================================================================
   Big Ben RMC -- Raw Materials Acceptance Dashboard
   app.js  |  SD-QA-01 Rev.1  |  Firebase Realtime Database
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

/* -- Material / Subtype map -- */
const SUBTYPES = {
  'Coarse Aggregates': ['Agg - G1"', 'Agg - 3/4"', 'Agg - 3/8"'],
  'Fine Aggregates':   ['S1', '2mm', '4mm'],
  'Portland Cement':   ['Type I', 'Type II'],
  'Fly Ash':           ['Type C', 'Type F'],
  'Admixture':         ['Type A', 'Type B', 'Type C', 'Type D', 'Type E', 'Type F', 'Type G'],
};

const MAT_SOURCES = {
  'Coarse Aggregates': ['Montalban, Rizal', 'Norzagaray, Bulacan', 'Rodriguez, Rizal', 'Other'],
  'Fine Aggregates':   ['Montalban, Rizal', 'Norzagaray, Bulacan', 'Rodriguez, Rizal', 'Other'],
  'Portland Cement':   ['Local Supplier', 'Direct from Plant', 'Other'],
  'Fly Ash':           ['Batangas', 'Sual, Pangasinan', 'Other'],
  'Admixture':         ['Local Supplier', 'Direct Distributor', 'Other'],
};

const MAT_PARAMS = {
  'Coarse Aggregates': ['Sieve Analysis', 'Specific Gravity', 'Unit Weight', 'Moisture Content', 'Soundness', 'Cleanliness', 'Los Angeles Abrasion'],
  'Fine Aggregates':   ['Sieve Analysis', 'Specific Gravity', 'Moisture Content', 'Material Finer than #200', 'Soundness', 'Cleanliness'],
  'Portland Cement':   ['Temperature', 'Setting Time', 'Chemical Test', 'Mortar Test'],
  'Fly Ash':           ['Visual Inspection (Float Oil & Color)', 'Mill Certificate Check', 'Quality Test (ASTM C311)'],
  'Admixture':         ['Specific Gravity', 'pH Level', 'Mill Certificate Check'],
};

const QCP_FREQ = {
  'Coarse Aggregates': 'Weekly / per supplier',
  'Fine Aggregates':   'Weekly / per supplier',
  'Portland Cement':   'Every delivery (temp)',
  'Admixture':         'Every delivery',
  'Fly Ash':           'Every delivery',
};

let deliveries  = [];
let documents   = [];
let editIdx     = null;
let gaugeCharts = {};
let trendChart  = null;
let activeTab   = 'kpi';
let db          = null;

/* ================================================================
   FIREBASE INIT
   ================================================================ */
function initFirebase() {
  firebase.initializeApp(firebaseConfig);
  db = firebase.database();

  /* -- Listen: deliveries (real-time) -- */
  db.ref('deliveries').on('value', snap => {
    const val = snap.val();
    deliveries = val ? Object.entries(val).map(([id, d]) => ({ ...d, _id: id })) : [];
    deliveries.sort((a, b) => a.date.localeCompare(b.date) || (a.time||'').localeCompare(b.time||''));
    buildMonthSelect();
    render();
    if (activeTab === 'kpi') setTimeout(renderCharts, 60);
  });

  /* -- Listen: documents (real-time) -- */
  db.ref('documents').on('value', snap => {
    const val = snap.val();
    documents = val ? Object.entries(val).map(([id, d]) => ({ ...d, _id: id })) : [];
    renderDocs();
    document.getElementById('doc-count-badge').textContent = documents.length;
  });
}

/* ================================================================
   SAVE / DELETE -- Firebase
   ================================================================ */
function saveDeliveryToDb(entry) {
  if (editIdx !== null) {
    const id = deliveries[editIdx]._id;
    return db.ref('deliveries/' + id).set(entry);
  } else {
    return db.ref('deliveries').push(entry);
  }
}

function deleteDeliveryFromDb(idx) {
  const id = deliveries[idx]._id;
  return db.ref('deliveries/' + id).remove();
}

function saveDocToDb(doc) {
  return db.ref('documents').push(doc);
}

function deleteDocFromDb(id) {
  return db.ref('documents/' + id).remove();
}

function clearAllData() {
  if (!confirm('Clear ALL delivery data? This cannot be undone.')) return;
  db.ref('deliveries').remove().then(() => toast('All delivery data cleared.', '#378ADD'));
}

/* ================================================================
   MONTH SELECT
   ================================================================ */
function buildMonthSelect() {
  const sel = document.getElementById('sel-month');
  const cur = sel.value;
  const months = new Set(deliveries.map(d => d.date.slice(0, 7)));
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  months.add(thisMonth);
  sel.innerHTML = '';
  [...months].sort().reverse().forEach(m => {
    const [y, mo] = m.split('-');
    const lbl = new Date(+y, +mo-1, 1).toLocaleDateString('en-PH', { year:'numeric', month:'long' });
    const o = document.createElement('option');
    o.value = m; o.textContent = lbl;
    if (m === (cur || thisMonth)) o.selected = true;
    sel.appendChild(o);
  });
}

function selMonth() { return document.getElementById('sel-month').value; }
function monthDeliveries() { return deliveries.filter(d => d.date.startsWith(selMonth())); }

/* ================================================================
   TABS
   ================================================================ */
function setTab(name, btn) {
  document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('tab-' + name).classList.add('active');
  activeTab = name;
  if (name === 'kpi') setTimeout(renderCharts, 60);
  if (name === 'docs') renderDocs();
}

/* ================================================================
   RENDER
   ================================================================ */
function render() {
  const now = new Date();
  document.getElementById('cur-date').textContent =
    now.toLocaleDateString('en-PH', { weekday:'short', year:'numeric', month:'short', day:'numeric' });

  const md = monthDeliveries();
  const [y, mo] = selMonth().split('-');
  const lbl = new Date(+y, +mo-1, 1).toLocaleDateString('en-PH', { year:'numeric', month:'long' });
  document.getElementById('log-month-label').textContent   = lbl;
  document.getElementById('trend-month-label').textContent = lbl;

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

  const el = document.querySelector('#overall-card .overall-big span:first-child');
  el.textContent = pct + '%';
  el.style.color = color;

  const bar = document.getElementById('overall-bar');
  bar.style.width = pct + '%'; bar.style.background = barColor;

  document.getElementById('overall-note').textContent =
    pct === 100
      ? `All ${tot} deliveries passed -- monthly target achieved! v`
      : `${100-pct}% gap to 100% target - ${rej} rejection${rej!==1?'s':''} this month${pend ? ` - ${pend} pending` : ''}`;

  document.querySelector('#mini-total .ms-val').textContent = tot;
  document.querySelector('#mini-pass .ms-val').textContent  = pass;
  document.querySelector('#mini-rej .ms-val').textContent   = rej;
  document.querySelector('#mini-pend .ms-val').textContent  = pend;
}

/* -- Gauges per type -- */
function renderGaugeType(md) {
  const grid = document.getElementById('gauge-type-grid');
  grid.innerHTML = '';
  Object.keys(SUBTYPES).forEach((mat, i) => {
    const rows = md.filter(d => d.material === mat);
    const tot  = rows.length;
    const pass = rows.filter(d => d.status === 'Passed').length;
    const pct  = tot ? Math.round(pass / tot * 100) : null;
    const color     = pct===null?'#999':pct===100?'#3B6D11':pct>=80?'#854F0B':'#A32D2D';
    const fillColor = pct===null?'#ccc':pct===100?'#639922':pct>=80?'#EF9F27':'#E24B4A';
    const cls       = pct===null?'':pct===100?'hit':pct>=80?'warn':'critical';
    const pillCls   = pct===null?'p-pend':pct===100?'p-pass':pct>=80?'p-pend':'p-rej';
    const pillLbl   = pct===null?'no data':pct===100?'on target':pct>=80?'below target':'critical';

    const card = document.createElement('div');
    card.className = `gauge-card ${cls}`;
    card.title = QCP_FREQ[mat];
    card.innerHTML = `
      <div class="gauge-mat">${mat}</div>
      <div class="gauge-wrap"><canvas id="gc-${i}" width="90" height="50"></canvas></div>
      <div class="gauge-pct" style="color:${color}">${pct!==null?pct+'%':'--'}</div>
      <div class="gauge-det">${pass}/${tot} passed</div>
      <span class="gauge-pill badge ${pillCls}">${pillLbl}</span>`;
    grid.appendChild(card);

    setTimeout(() => {
      const ctx = document.getElementById(`gc-${i}`);
      if (!ctx) return;
      if (gaugeCharts[i]) { gaugeCharts[i].destroy(); }
      gaugeCharts[i] = new Chart(ctx, {
        type: 'doughnut',
        data: { datasets: [{ data:[pct??0, 100-(pct??0)], backgroundColor:[fillColor,'rgba(128,128,128,0.1)'], borderWidth:0, circumference:180, rotation:270 }] },
        options: { responsive:false, maintainAspectRatio:false, cutout:'68%', plugins:{ legend:{display:false}, tooltip:{enabled:false} }, animation:{duration:600} }
      });
    }, 80);
  });
}

/* -- Gauges per subtype -- */
function renderGaugeSubtype(md) {
  const grid = document.getElementById('gauge-subtype-grid');
  grid.innerHTML = '';
  Object.entries(SUBTYPES).forEach(([mat, subs]) => {
    subs.forEach(sub => {
      const rows = md.filter(d => d.material===mat && d.subtype===sub);
      const tot  = rows.length;
      const pass = rows.filter(d => d.status==='Passed').length;
      const pct  = tot ? Math.round(pass/tot*100) : null;
      const color     = pct===null?'#999':pct===100?'#3B6D11':pct>=80?'#854F0B':'#A32D2D';
      const fillColor = pct===null?'#ddd':pct===100?'#639922':pct>=80?'#EF9F27':'#E24B4A';
      const pillCls   = pct===null?'p-pend':pct===100?'p-pass':pct>=80?'p-pend':'p-rej';

      const card = document.createElement('div');
      card.className = 'sub-card';
      card.innerHTML = `
        <div class="sub-mat">${mat}</div>
        <div class="sub-name">${sub}</div>
        <div class="sub-pct" style="color:${color}">${pct!==null?pct+'%':'--'}</div>
        <div class="sub-det">${pass}/${tot} passed <span class="pill ${pillCls}" style="margin-left:4px">${pct===null?'no data':pct===100?'on target':pct>=80?'below':'critical'}</span></div>
        <div class="prog-bar"><div class="prog-fill" style="width:${pct??0}%;background:${fillColor}"></div></div>`;
      grid.appendChild(card);
    });
  });
}

/* -- Charts -- */
function renderCharts() {
  renderTrend(monthDeliveries(), selMonth());
}

function renderTrend(md, monthStr) {
  if (trendChart) { trendChart.destroy(); trendChart = null; }
  const [y, mo] = monthStr.split('-');
  const days = Array.from({ length: new Date(+y,+mo,0).getDate() }, (_, i) =>
    `${monthStr}-${String(i+1).padStart(2,'0')}`);
  const passRates = days.map(date => {
    const rows = md.filter(d => d.date===date && d.status!=='Pending');
    if (!rows.length) return null;
    return Math.round(rows.filter(d => d.status==='Passed').length / rows.length * 100);
  });
  const rejCounts = days.map(date => md.filter(d => d.date===date && d.status==='Rejected').length);
  trendChart = new Chart(document.getElementById('chartTrend'), {
    type: 'bar',
    data: { labels: days.map(d => d.slice(8)), datasets: [
      { type:'line', data:passRates, borderColor:'#3B6D11', backgroundColor:'rgba(59,109,17,0.07)', tension:0.35, fill:true, pointRadius:3, pointBackgroundColor:'#639922', borderWidth:2, spanGaps:true, yAxisID:'y' },
      { type:'line', data:days.map(()=>100), borderColor:'#378ADD', borderDash:[5,4], pointRadius:0, fill:false, borderWidth:1.5, yAxisID:'y' },
      { type:'bar', data:rejCounts, backgroundColor:'rgba(226,75,74,0.28)', borderRadius:2, yAxisID:'y2' }
    ]},
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false} },
      scales:{
        x:{ grid:{display:false}, ticks:{font:{size:9}, maxRotation:0, autoSkip:true, maxTicksLimit:15} },
        y:{ min:0, max:105, position:'left', ticks:{font:{size:9}, callback:v=>v+'%'}, grid:{color:'rgba(128,128,128,0.08)'} },
        y2:{ min:0, max:6, position:'right', ticks:{font:{size:9}, stepSize:1}, grid:{display:false} }
      }
    }
  });
}

/* -- Delivery Log -- */
function renderLog() {
  const md     = monthDeliveries();
  const search = (document.getElementById('search-box')?.value||'').toLowerCase();
  const fMat   = document.getElementById('filter-mat')?.value||'';
  const fStat  = document.getElementById('filter-status')?.value||'';

  let rows = [...md].sort((a,b) => b.date.localeCompare(a.date) || (b.time||'').localeCompare(a.time||''));
  if (search) rows = rows.filter(r => [r.supplier,r.material,r.subtype,r.dr,r.plate,r.param,r.result,r.tester,r.remarks].join(' ').toLowerCase().includes(search));
  if (fMat)   rows = rows.filter(r => r.material===fMat);
  if (fStat)  rows = rows.filter(r => r.status===fStat);

  const tbody = document.getElementById('log-body');
  if (!rows.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="13">No deliveries match the current filter for this month.</td></tr>';
  } else {
    tbody.innerHTML = rows.map(d => {
      const idx = deliveries.findIndex(x => x._id === d._id);
      const pc  = d.status==='Passed'?'p-pass':d.status==='Rejected'?'p-rej':'p-pend';
      return `<tr>
        <td>${d.date}</td><td>${d.time||'--'}</td>
        <td title="${d.dr||''}">${d.dr||'--'}</td>
        <td title="${d.plate||''}">${d.plate||'--'}</td>
        <td title="${d.supplier||''}">${d.supplier||'--'}</td>
        <td title="${d.material||''}">${d.material||'--'}</td>
        <td title="${d.subtype||''}">${d.subtype||'--'}</td>
        <td title="${d.type||''}">${d.type||'--'}</td>
        <td title="${d.source||''}">${d.source||'--'}</td>
        <td><span class="pill ${pc}">${d.status}</span></td>
        <td>${d.tester||'--'}</td>
        <td title="${d.remarks||''}">${d.remarks||'--'}</td>
        <td>
          <button class="act-btn" onclick="openEditForm(${idx})" title="Edit">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
        </td>
      </tr>`;
    }).join('');
  }
  document.getElementById('log-footer').textContent = `Showing ${rows.length} of ${md.length} entries for this month`;
}

/* ================================================================
   DELIVERY MODAL
   ================================================================ */
function openAddForm() {
  editIdx = null;
  const now = new Date();
  document.getElementById('modal-title').textContent    = 'Log New Delivery';
  document.getElementById('modal-delete-btn').style.display = 'none';
  document.getElementById('modal-save-btn').textContent = 'Save Delivery';
  document.getElementById('m-date').value     = now.toISOString().split('T')[0];
  document.getElementById('m-time').value     = now.toTimeString().slice(0,5);
  ['m-dr','m-plate','m-supplier','m-type','m-result','m-tester','m-remarks'].forEach(id => { document.getElementById(id).value=''; });
  document.getElementById('m-material').value = '';
  document.getElementById('m-status').value   = 'Passed';
  updateSubtypes();
  document.getElementById('delivery-modal').classList.add('open');
}

function openEditForm(idx) {
  editIdx = idx;
  const d = deliveries[idx];
  if (!d) return;
  document.getElementById('modal-title').textContent    = 'Edit Delivery Entry';
  document.getElementById('modal-delete-btn').style.display = 'inline-flex';
  document.getElementById('modal-save-btn').textContent = 'Save Changes';
  document.getElementById('m-date').value     = d.date;
  document.getElementById('m-time').value     = d.time||'';
  document.getElementById('m-dr').value       = d.dr||'';
  document.getElementById('m-plate').value    = d.plate||'';
  document.getElementById('m-supplier').value = d.supplier||'';
  document.getElementById('m-material').value = d.material||'';
  updateSubtypes(d.subtype, d.source, d.param);
  document.getElementById('m-type').value     = d.type||'';
  document.getElementById('m-result').value   = d.result||'';
  document.getElementById('m-status').value   = d.status||'Passed';
  document.getElementById('m-tester').value   = d.tester||'';
  document.getElementById('m-remarks').value  = d.remarks||'';
  document.getElementById('delivery-modal').classList.add('open');
}

function closeDeliveryModal() {
  document.getElementById('delivery-modal').classList.remove('open');
  editIdx = null;
}

function populateSelect(id, items, selected='', placeholder='-- Select --') {
  const sel = document.getElementById(id);
  if (!sel) return;
  sel.innerHTML = '';
  const blank = document.createElement('option');
  blank.value=''; blank.textContent=placeholder; sel.appendChild(blank);
  items.forEach(s => {
    const o = document.createElement('option');
    o.value=s; o.textContent=s;
    if (s===selected) o.selected=true;
    sel.appendChild(o);
  });
}

function updateSubtypes(selectedSub='', selectedSrc='', selectedParam='') {
  const mat = document.getElementById('m-material').value;

  // Subtype
  const subs = SUBTYPES[mat] || [];
  if (!subs.length) {
    document.getElementById('m-subtype').innerHTML='<option value="">n/a</option>';
  } else {
    populateSelect('m-subtype', subs, selectedSub);
  }

  // Source dropdown
  const srcs = MAT_SOURCES[mat] || [];
  const srcEl = document.getElementById('m-source');
  if (srcEl.tagName === 'SELECT') {
    populateSelect('m-source', srcs, selectedSrc);
  }

  // Test parameter dropdown
  const params = MAT_PARAMS[mat] || [];
  const paramEl = document.getElementById('m-param');
  if (paramEl.tagName === 'SELECT') {
    populateSelect('m-param', params, selectedParam);
  }
}

function saveDelivery() {
  const date     = document.getElementById('m-date').value;
  const supplier = document.getElementById('m-supplier').value.trim();
  const material = document.getElementById('m-material').value;
  if (!date||!supplier||!material) { toast('Please fill in Date, Supplier, and Material.','#E24B4A'); return; }

  const entry = {
    date, time:document.getElementById('m-time').value,
    dr:document.getElementById('m-dr').value.trim(),
    plate:document.getElementById('m-plate').value.trim(),
    supplier, material,
    subtype:document.getElementById('m-subtype').value,
    type:document.getElementById('m-type').value.trim(),
    source:document.getElementById('m-source').value.trim(),
    param:document.getElementById('m-param').value.trim(),
    result:document.getElementById('m-result').value.trim(),
    status:document.getElementById('m-status').value,
    tester:document.getElementById('m-tester').value.trim(),
    remarks:document.getElementById('m-remarks').value.trim(),
  };

  const btn = document.getElementById('modal-save-btn');
  btn.textContent = 'Saving...'; btn.disabled = true;

  saveDeliveryToDb(entry)
    .then(() => {
      closeDeliveryModal();
      document.getElementById('sel-month').value = entry.date.slice(0,7);
      toast(editIdx!==null ? 'Entry updated.' : `Logged -- ${material} - ${entry.status}`,
            entry.status==='Passed'?'#639922':'#E24B4A');
    })
    .catch(err => { toast('Save failed: '+err.message,'#E24B4A'); })
    .finally(() => { btn.textContent = editIdx!==null?'Save Changes':'Save Delivery'; btn.disabled=false; });
}

function deleteEntry() {
  if (editIdx===null) return;
  if (!confirm('Delete this delivery entry? This cannot be undone.')) return;
  deleteDeliveryFromDb(editIdx)
    .then(() => { closeDeliveryModal(); toast('Entry deleted.','#E24B4A'); })
    .catch(err => toast('Delete failed: '+err.message,'#E24B4A'));
}

/* ================================================================
   DOCUMENTS
   ================================================================ */
function openDocForm() {
  const now = new Date();
  document.getElementById('df-date').value = now.toISOString().split('T')[0];
  ['df-title','df-issuer','df-link','df-notes'].forEach(id => { document.getElementById(id).value=''; });
  document.getElementById('df-file').value = '';
  document.getElementById('doc-form-panel').classList.add('open');
}
function closeDocForm() { document.getElementById('doc-form-panel').classList.remove('open'); }

function saveDoc() {
  const title = document.getElementById('df-title').value.trim();
  if (!title) { toast('Please enter a document title.','#E24B4A'); return; }

  const fileInput = document.getElementById('df-file');
  const file = fileInput.files[0];

  const finalize = (fileData, fileName, fileType) => {
    const doc = {
      title,
      material: document.getElementById('df-mat').value,
      doctype:  document.getElementById('df-type').value,
      date:     document.getElementById('df-date').value,
      issuer:   document.getElementById('df-issuer').value.trim(),
      link:     document.getElementById('df-link').value.trim(),
      notes:    document.getElementById('df-notes').value.trim(),
      fileData: fileData||null,
      fileName: fileName||null,
      fileType: fileType||null,
      savedAt:  Date.now(),
    };
    saveDocToDb(doc)
      .then(() => { closeDocForm(); toast('Document saved.','#639922'); })
      .catch(err => toast('Save failed: '+err.message,'#E24B4A'));
  };

  if (file) {
    if (file.size > 5*1024*1024) { toast('File too large -- max 5MB.','#E24B4A'); return; }
    const reader = new FileReader();
    reader.onload = e => finalize(e.target.result, file.name, file.type);
    reader.readAsDataURL(file);
  } else {
    finalize(null, null, null);
  }
}

function renderDocs() {
  const grid = document.getElementById('doc-grid');
  if (!documents.length) {
    grid.innerHTML = '<div class="no-docs">No documents attached yet.<br>Click "Add Document" to attach annual quality tests and certifications.</div>';
    return;
  }
  grid.innerHTML = documents.map(doc => `
    <div class="doc-card">
      <div class="doc-card-head">
        <div>
          <div class="doc-title">${doc.title}</div>
          <div class="doc-meta">
            <span class="doc-tag">${doc.material}</span>
            <span class="doc-tag">${doc.doctype}</span>
            ${doc.date?`<span>${doc.date}</span>`:''}
            ${doc.issuer?`<span>- ${doc.issuer}</span>`:''}
          </div>
        </div>
      </div>
      ${doc.notes?`<div class="doc-notes">${doc.notes}</div>`:''}
      <div class="doc-actions">
        ${doc.fileData?`<a class="doc-link-btn" href="${doc.fileData}" download="${doc.fileName||'document'}" target="_blank">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Download
        </a>
        <a class="doc-link-btn" href="${doc.fileData}" target="_blank">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          View
        </a>`:''}
        ${doc.link?`<a class="doc-link-btn" href="${doc.link}" target="_blank">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          Open Link
        </a>`:''}
        <button class="doc-del-btn" onclick="deleteDoc('${doc._id}')">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          Delete
        </button>
      </div>
    </div>`).join('');
}

function deleteDoc(id) {
  if (!confirm('Delete this document?')) return;
  deleteDocFromDb(id)
    .then(() => toast('Document deleted.','#E24B4A'))
    .catch(err => toast('Delete failed: '+err.message,'#E24B4A'));
}

/* ================================================================
   EXPORT CSV
   ================================================================ */
function exportCSV() {
  const md = monthDeliveries();
  const hdrs = ['Date','Time','DR No.','Plate No.','Supplier','Material','Subtype','Type','Source','Test Parameter','Result','Status','Tested By','Remarks'];
  const rows = md.map(d => [d.date,d.time,d.dr,d.plate,d.supplier,d.material,d.subtype,d.type,d.source,d.param,d.result,d.status,d.tester,d.remarks]
    .map(v => `"${(v||'').replace(/"/g,'""')}"`).join(','));
  const csv = [hdrs.join(','), ...rows].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type:'text/csv' }));
  const [y,m] = selMonth().split('-');
  a.download = `BigBen_RMA_${new Date(+y,+m-1,1).toLocaleDateString('en-PH',{year:'numeric',month:'long'}).replace(/ /g,'_')}.csv`;
  a.click();
  toast('CSV exported.','#378ADD');
}

/* ================================================================
   TOAST
   ================================================================ */
function toast(msg, color='#639922') {
  document.getElementById('toast-dot').style.background = color;
  document.getElementById('toast-msg').textContent = msg;
  const el = document.getElementById('toast');
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 3500);
}

/* ================================================================
   KEYBOARD
   ================================================================ */
document.addEventListener('keydown', e => {
  if (e.key==='Escape') { closeDeliveryModal(); closeDocForm(); }
});

/* ================================================================
   INIT
   ================================================================ */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('sel-month').addEventListener('change', () => {
    render();
    if (activeTab==='kpi') setTimeout(renderCharts, 60);
  });

  /* Show connecting status */
  document.getElementById('cur-date').textContent = 'Connecting to Firebase...';

  initFirebase();
  setTimeout(renderCharts, 300);
});
