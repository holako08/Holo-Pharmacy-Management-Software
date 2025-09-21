/*  history.js  —  Purchase Orders & GRNs history - FIXED VERSION WITH FOC SUPPORT  */
const BASE_URL = 'http://localhost:3000';

/* ---------- helpers ---------- */
const medCache = new Map();
async function getMedName(id) {
  if (medCache.has(id)) return medCache.get(id);
  try {
    const res = await fetch(`${BASE_URL}/api/pos/medicines/get-by-id/${id}`);
    const data = await res.json();
    const name = data?.item_name || `(ID:${id})`;
    medCache.set(id, name);
    return name;
  } catch {
    medCache.set(id, `(ID:${id})`);
    return `(ID:${id})`;
  }
}

/* ---------- initial load ---------- */
async function loadData() {
  const code = document.getElementById('filterCode').value.trim();
  const from = document.getElementById('filterFrom').value;
  const to   = document.getElementById('filterTo').value;
  const params = new URLSearchParams();
  if (code) { params.set('po_code', code); params.set('grn_code', code); }
  if (from) params.set('from', from);
  if (to)   params.set('to', to);

  /* PO table */
  const poRes = await fetch(`${BASE_URL}/api/purchase-orders?${params}`);
  const pos   = await poRes.json();
  const poBody = document.getElementById('poBody');
  poBody.innerHTML = '';
  pos.forEach(p => {
    poBody.insertAdjacentHTML('beforeend', `
      <tr>
        <td>${p.po_id}</td>
        <td>${p.po_code}</td>
        <td>${p.agency_name || 'N/A'}</td>
        <td>${Number(p.total_amount || 0).toFixed(3)}</td>
        <td>${p.status}</td>
        <td>${new Date(p.created_at).toLocaleDateString()}</td>
        <td>
          <button class="btn btn-sm btn-outline-primary" onclick="viewPO(${p.po_id})">View</button>
          <button class="btn btn-sm btn-outline-warning ${p.status !== 'Pending' ? 'disabled' : ''}"
                  onclick="${p.status === 'Pending' ? `editPO(${p.po_id})` : ''}" ${p.status !== 'Pending' ? 'disabled' : ''}>Edit</button>
          <button class="btn btn-sm btn-outline-success ${p.status !== 'Pending' ? 'disabled' : ''}"
                  onclick="${p.status === 'Pending' ? `receivePO(${p.po_id})` : ''}" ${p.status !== 'Pending' ? 'disabled' : ''}>Receive</button>
        </td>
      </tr>`);
  });

  /* GRN table */
  const grnRes = await fetch(`${BASE_URL}/api/goods-receipt-notes?${params}`);
  const grns   = await grnRes.json();
  const grnBody = document.getElementById('grnBody');
  grnBody.innerHTML = '';
  grns.forEach(g => {
    grnBody.insertAdjacentHTML('beforeend', `
      <tr>
        <td>${g.grn_id}</td>
        <td>${g.grn_code}</td>
        <td>${g.po_code || 'N/A'}</td>
        <td>${g.agency_name || 'N/A'}</td>
        <td>${new Date(g.received_at).toLocaleString()}</td>
        <td>
          <button class="btn btn-sm btn-outline-primary" onclick="viewGRN(${g.grn_id})">View</button>
        </td>
      </tr>`);
  });
}
loadData();

/* ---------- utility ---------- */
function clearFilters() {
  document.getElementById('filterCode').value = '';
  document.getElementById('filterFrom').value = '';
  document.getElementById('filterTo').value = '';
  loadData();
}

/* ---------- PO specific ---------- */
let originalPOHeader, originalPOItems;

async function viewPO(id)  { openPOModal(id, 'view');  }
async function editPO(id)  { openPOModal(id, 'edit');  }
async function receivePO(id){ openPOModal(id, 'receive'); }

async function openPOModal(id, mode) {
  const modal   = new bootstrap.Modal(document.getElementById('genericModal'));
  const title   = document.getElementById('modalTitle');
  const body    = document.getElementById('modalBody');
  const btnSave = document.getElementById('btnSave');
  const btnRecv = document.getElementById('btnReceive');

  btnSave.classList.add('d-none');
  btnRecv.classList.add('d-none');

  try {
    const response = await fetch(`${BASE_URL}/api/purchase-orders/${id}`);
    if (!response.ok) throw new Error('Failed to fetch PO');
    const po = await response.json();

    if (mode === 'edit' && po.status !== 'Pending') {
      title.textContent = `PO #${id} – Editing Denied`;
      body.innerHTML = `<div class="alert alert-danger">Status is <b>${po.status}</b>; cannot edit.</div>`;
      modal.show();
      return;
    }

    /* cache original for diff */
    originalPOHeader = {
      agency: po.agency_name || '',
      remarks: po.remarks || '',
      total_amount: Number(po.total_amount || 0)
    };
    originalPOItems = po.items.map(it => ({
      poi_id: it.poi_id,
      medicine_id: it.medicine_id,
      quantity: Number(it.quantity || 0),
      wholesale_price: Number(it.wholesale_price || 0),
      is_foc: Boolean(it.is_foc)
    }));

    title.textContent = `PO #${id}`;
    
    // Generate items HTML with FOC support
    const itemsHTML = po.items.map(it => {
      const medicineName = it.medicine_name || it.item_name || '(Unknown)';
      const quantity = Number(it.quantity || 0);
      const price = Number(it.wholesale_price || 0);
      const is_foc = Boolean(it.is_foc);
      const subtotal = is_foc ? 0 : quantity * price;
      
      return `
        <tr data-mid="${it.medicine_id}" data-poi-id="${it.poi_id}">
          <td>${medicineName}</td>
          <td><input type="number" class="qty form-control" value="${quantity}" ${mode !== 'edit' ? 'readonly' : ''}></td>
          <td><input type="number" step="any" class="price form-control" value="${price}" ${mode !== 'edit' ? 'readonly' : ''}></td>
          <td><input type="checkbox" class="foc" ${is_foc ? 'checked' : ''} ${mode !== 'edit' ? 'disabled' : ''}></td>
          <td class="subtotal ${is_foc ? 'text-success' : ''}">${is_foc ? '0.000 (FOC)' : subtotal.toFixed(3)}</td>
          ${mode === 'edit' ? '<td><button class="btn btn-sm btn-danger delete-row">&times;</button></td>' : ''}
        </tr>`;
    }).join('');

    body.innerHTML = `
      <table class="table table-borderless">
        <tr>
          <td><strong>Code:</strong> ${po.po_code}</td>
          <td><strong>Agency:</strong> ${po.agency_name || 'N/A'}</td>
          <td><strong>Date:</strong> ${new Date(po.created_at).toLocaleDateString()}</td>
        </tr>
        <tr>
          <td colspan="3"><strong>Remarks:</strong> ${po.remarks || ''}</td>
        </tr>
      </table>
      <table class="table table-bordered" id="itemTable">
        <thead>
          <tr>
            <th>Medicine</th>
            <th>Qty</th>
            <th>Wholesale&nbsp;Price</th>
            <th>FOC</th>
            <th>Subtotal</th>
            ${mode === 'edit' ? '<th></th>' : ''}
            ${mode === 'receive' ? '<th>Batch</th><th>Expiry</th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${mode === 'receive' ? 
            po.items.map(it => {
              const is_foc = Boolean(it.is_foc);
              return `
                <tr data-mid="${it.medicine_id}" data-poi-id="${it.poi_id}">
                  <td>${it.medicine_name || it.item_name || '(Unknown)'}</td>
                  <td><input type="number" class="qty form-control" value="${it.quantity || 0}"></td>
                  <td><input type="number" step="any" class="price form-control" value="${is_foc ? 0 : (it.wholesale_price || 0)}" ${is_foc ? 'readonly' : ''}></td>
                  <td><input type="checkbox" class="foc" ${is_foc ? 'checked' : ''} disabled></td>
                  <td class="subtotal ${is_foc ? 'text-success' : ''}">${is_foc ? '0.000 (FOC)' : ((it.quantity || 0) * (it.wholesale_price || 0)).toFixed(3)}</td>
                  <td><input type="text" class="batch form-control" placeholder="Batch #" required></td>
                  <td><input type="date" class="expiry form-control" required></td>
                </tr>`;
            }).join('') 
            : itemsHTML}
        </tbody>
      </table>
      <div class="text-end fw-bold mt-2">
        Total: <span id="grandTotal">${Number(po.total_amount || 0).toFixed(3)}</span>
        <br><small class="text-muted">(excluding FOC items)</small>
      </div>`;

    if (mode !== 'view') {
      body.querySelector('#itemTable').addEventListener('input', calcPOTotal);
      if (mode === 'edit') {
        btnSave.classList.remove('d-none');
        btnSave.onclick = () => savePOChanges(id);
        enablePODeleteRow();
      } else if (mode === 'receive') {
        btnRecv.classList.remove('d-none');
        btnRecv.onclick = () => saveGRNFromPO(id);
      }
    }
    modal.show();
  } catch (err) {
    console.error('Error loading PO:', err);
    title.textContent = `PO #${id} - Error`;
    body.innerHTML = `<div class="alert alert-danger">Failed to load PO: ${err.message}</div>`;
    modal.show();
  }
}

function calcPOTotal() {
  let grand = 0;
  document.querySelectorAll('#itemTable tbody tr').forEach(tr => {
    const qty   = Number(tr.querySelector('.qty').value) || 0;
    const price = Number(tr.querySelector('.price').value) || 0;
    const foc   = tr.querySelector('.foc').checked;
    const st    = foc ? 0 : qty * price;
    
    // Update subtotal display with FOC indication
    const subtotalCell = tr.querySelector('.subtotal');
    if (foc) {
      subtotalCell.textContent = '0.000 (FOC)';
      subtotalCell.classList.add('text-success');
    } else {
      subtotalCell.textContent = st.toFixed(3);
      subtotalCell.classList.remove('text-success');
    }
    
    grand += st;
  });
  document.getElementById('grandTotal').textContent = grand.toFixed(3);
}

function enablePODeleteRow() {
  document.getElementById('itemTable').addEventListener('click', async e => {
    if (e.target.classList.contains('delete-row')) {
      const tr = e.target.closest('tr');
      const poi_id = tr.dataset.poiId;
      if (!confirm('Delete this item?')) return;
      
      try {
        const res = await fetch(`${BASE_URL}/api/purchase-orders/items/${poi_id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) { 
          tr.remove(); 
          calcPOTotal(); 
        } else {
          alert('Failed to delete item: ' + (data.message || 'Unknown error'));
        }
      } catch (err) {
        console.error('Delete error:', err);
        alert('Network error while deleting item');
      }
    }
  });
}

/* ---------- GRN specific - FIXED VERSION WITH FOC SUPPORT ---------- */
async function viewGRN(id) { openGRNModal(id); }

/* ----------  front-end – openGRNModal (full replacement)  ---------- */
async function openGRNModal(id) {
  const modal = new bootstrap.Modal(document.getElementById('genericModal'));
  const title = document.getElementById('modalTitle');
  const body  = document.getElementById('modalBody');

  console.log(`[GRN FRONTEND DEBUG] Opening GRN modal for ID: ${id}`);

  try {
    const response = await fetch(`${BASE_URL}/api/goods-receipt-notes/${id}`);
    console.log(`[GRN FRONTEND DEBUG] Response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[GRN FRONTEND DEBUG] Response error:`, errorText);
      throw new Error('Failed to fetch GRN');
    }
    
    const grn = await response.json();
    console.log(`[GRN FRONTEND DEBUG] Received GRN data:`, grn);
    
    title.textContent = `GRN #${id}`;

    // Generate items HTML with improved error handling
    const itemsHTML = grn.items.map((it, index) => {
      console.log(`[GRN FRONTEND DEBUG] Processing item ${index + 1}:`, it);
      
      const quantity = Number(it.quantity || 0);
      const receivedPrice = Number(it.received_price || 0);
      const receivedSubtotal = Number(it.received_subtotal || 0);
      const is_foc = Boolean(it.is_foc);
      
      // Better medicine name handling
      const medicineName = it.medicine_name && it.medicine_name !== '(Unknown Medicine)' 
        ? it.medicine_name 
        : `(Medicine ID: ${it.medicine_id || 'Unknown'})`;
      
      return `
        <tr>
          <td>${medicineName}</td>
          <td>${it.batch_number || 'N/A'}</td>
          <td>${it.expirydate ? new Date(it.expirydate).toLocaleDateString() : 'N/A'}</td>
          <td>${quantity.toFixed(3)}</td>
          <td class="${is_foc ? 'text-success' : ''}">${is_foc ? '0.000 (FOC)' : receivedPrice.toFixed(3)}</td>
          <td class="${is_foc ? 'text-success' : ''}">${is_foc ? '0.000 (FOC)' : receivedSubtotal.toFixed(3)}</td>
        </tr>`;
    }).join('');

    // Improved total calculations with better fallbacks
    const totalAmount = Number(grn.total_amount || 0);
    const poTotalAmount = Number(grn.po_total_amount || 0);
    const calculatedTotal = Number(grn.calculated_total || 0);
    const totalMatchesPo = grn.total_matches_po;
    
    // Get FOC item counts
    const focItemsCount = grn.foc_items_count || 0;
    const nonFocItemsCount = grn.non_foc_items_count || grn.items.length;

    console.log(`[GRN FRONTEND DEBUG] Total calculations:`, {
      totalAmount,
      poTotalAmount,
      calculatedTotal,
      totalMatchesPo,
      focItemsCount,
      nonFocItemsCount
    });

    // Create improved total display
    const totalDisplay = `
      <div class="text-end fw-bold mt-3">
        <div class="row">
          <div class="col-md-6">
            <div class="card bg-light p-2">
              <small class="text-muted">Items Summary</small>
              <div class="fw-normal">
                <span class="text-success">FOC Items: ${focItemsCount}</span><br>
                <span class="text-primary">Paid Items: ${nonFocItemsCount}</span><br>
                <span class="text-info">Total Items: ${grn.items.length}</span>
              </div>
            </div>
          </div>
          <div class="col-md-6">
            <div class="card bg-light p-2">
              <small class="text-muted">Financial Summary</small>
              <div class="fw-normal">
                <span class="fs-6">GRN Total: <strong>${totalAmount.toFixed(3)}</strong></span><br>
                <span class="text-muted">PO Total: ${poTotalAmount.toFixed(3)}</span><br>
                <span class="text-info">Calculated: ${calculatedTotal.toFixed(3)}</span><br>
                ${totalMatchesPo ? 
                  '<span class="text-success">✓ Totals match PO</span>' : 
                  '<span class="text-warning">⚠ Totals differ from PO</span>'
                }
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    body.innerHTML = `
      <table class="table table-borderless mb-3">
        <tr>
          <td><strong>GRN Code:</strong> ${grn.grn_code || 'N/A'}</td>
          <td><strong>PO Code:</strong> ${grn.po_code || 'N/A'}</td>
          <td><strong>Agency:</strong> ${grn.agency_name || 'N/A'}</td>
        </tr>
        <tr>
          <td><strong>Received At:</strong> ${grn.received_at ? new Date(grn.received_at).toLocaleString() : 'N/A'}</td>
          <td><strong>Received By:</strong> ${grn.received_by_name || grn.received_by || 'N/A'}</td>
          <td><strong>Remarks:</strong> ${grn.remarks || 'No remarks'}</td>
        </tr>
      </table>
      
      <div class="table-responsive">
        <table class="table table-bordered table-striped">
          <thead class="table-dark">
            <tr>
              <th>Medicine</th>
              <th>Batch</th>
              <th>Expiry</th>
              <th>Qty</th>
              <th>Price</th>
              <th>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHTML}
          </tbody>
        </table>
      </div>
      
      ${totalDisplay}`;
    document.getElementById('btnSave').classList.add('d-none');
    document.getElementById('btnReceive').classList.add('d-none');
    modal.show();
  } catch (err) {
    console.error('[GRN FRONTEND DEBUG] Error loading GRN:', err);
    title.textContent = `GRN #${id} - Error`;
    body.innerHTML = `
      <div class="alert alert-danger">
        <h6>Failed to load GRN</h6>
        <p>${err.message}</p>
        <small class="text-muted">Check browser console for detailed error logs.</small>
      </div>`;
    modal.show();
  }
}

/* ---------- save / receive helpers ---------- */
async function savePOChanges(id) {
  const agencyName = document
    .querySelector('#modalBody .table-borderless tr:first-child td:nth-child(2)')
    .textContent.replace('Agency: ', '').trim();
  const remarks = document
    .querySelector('#modalBody .table-borderless tr:nth-child(2) td')
    .textContent.replace('Remarks: ', '').trim();

  const rows = [...document.querySelectorAll('#itemTable tbody tr')];
  let changedItems = [];
  let anyHeaderChanged = false;
  let newTotal = 0;

  rows.forEach(tr => {
    const poi_id        = tr.dataset.poiId ? Number(tr.dataset.poiId) : null;
    const medicine_id   = Number(tr.dataset.mid);
    const quantity      = Number(tr.querySelector('.qty').value) || 0;
    const wholesale_price = Number(tr.querySelector('.price').value) || 0;
    const foc           = tr.querySelector('.foc').checked;
    const st            = foc ? 0 : quantity * wholesale_price;
    newTotal += st;

    const orig = originalPOItems.find(x => x.poi_id === poi_id);
    if (
      !orig ||
      orig.quantity !== quantity ||
      orig.wholesale_price !== wholesale_price ||
      orig.is_foc !== foc
    ) {
      changedItems.push({ poi_id, medicine_id, quantity, wholesale_price, foc });
    }
  });

  if (
    agencyName !== originalPOHeader.agency ||
    remarks !== originalPOHeader.remarks ||
    Math.abs(newTotal - originalPOHeader.total_amount) > 0.0001
  ) anyHeaderChanged = true;

  if (!anyHeaderChanged && changedItems.length === 0) {
    alert('Nothing changed!');
    return;
  }

  try {
    const res = await fetch(`${BASE_URL}/api/purchase-orders/${id}/partial-update`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        header: anyHeaderChanged ? {
          agency: agencyName,
          remarks,
          total_amount: newTotal,
          updated_by: 1 // TODO: real user
        } : null,
        items: changedItems
      })
    });
    const data = await res.json();
    if (data.success) {
      bootstrap.Modal.getInstance(document.getElementById('genericModal')).hide();
      loadData();
    } else {
      alert('Update failed: ' + (data.message || 'Unknown'));
    }
  } catch (err) {
    console.error(err);
    alert('Network error');
  }
}

async function saveGRNFromPO(po_id) {
  const rows = [...document.querySelectorAll('#itemTable tbody tr')];
  const items = [];
  
  for (const tr of rows) {
    const medicine_id = Number(tr.dataset.mid);
    const batch_number = tr.querySelector('.batch')?.value?.trim();
    const expirydate = tr.querySelector('.expiry')?.value;
    const quantity = Number(tr.querySelector('.qty').value) || 0;
    const is_foc = tr.querySelector('.foc')?.checked || false;
    
    // For FOC items, price should be 0
    const received_price = is_foc ? 0 : (Number(tr.querySelector('.price').value) || 0);
    
    if (quantity > 0 && batch_number && expirydate) {
      items.push({
        medicine_id,
        batch_number,
        expirydate,
        quantity,
        received_price,
        is_foc: is_foc  // ✅ ADD THIS LINE - Send FOC status to server
      });
      
      console.log(`[RECEIVE] Item ${medicine_id}: Qty=${quantity}, Price=${received_price}, FOC=${is_foc}`);
    }
  }

  if (!items.length) {
    alert('Please fill in all required fields (batch, expiry, quantity > 0).');
    return;
  }

  try {
    const res = await fetch(`${BASE_URL}/api/goods-receipt-notes/from-po`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        po_id,
        received_by: 1, // TODO: get real user ID from session
        remarks: document.querySelector('#grnRemarks')?.value || '',
        items
      })
    });
    const data = await res.json();
    if (data.success) {
      alert(`Received successfully! GRN code: ${data.grn_code}\nTotal: ${data.total_amount.toFixed(3)} (${data.foc_items} FOC items)`);
      bootstrap.Modal.getInstance(document.getElementById('genericModal')).hide();
      loadData();
    } else {
      alert(`Failed: ${data.message || 'Unknown error'}`);
    }
  } catch (err) {
    console.error(err);
    alert('Network / server error');
  }
}