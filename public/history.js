const BASE_URL = 'http://localhost:3000';

/* ---------- Session Management ---------- */
document.addEventListener('DOMContentLoaded', () => {
  // Check user session and populate user info
  const userInfoString = sessionStorage.getItem('userInfo');
  if (!userInfoString) {
    window.location.href = 'index.html';
    return;
  }
  try {
    const userInfo = JSON.parse(userInfoString);
    document.getElementById('pharmacist-name').textContent = userInfo.fullName || userInfo.username;
    document.getElementById('job-title').textContent = userInfo.jobTitle || 'Staff';
    document.getElementById('user-photo').src = '/api/user-photo/' + userInfo.userId;
    
    // Load data after user verification
    loadData();
  } catch (error) {
    window.location.href = 'index.html';
    return;
  }
});

function logout() {
  window.location.href = 'index.html';
}

/* ---------- helpers ---------- */
const medCache = new Map();
const userCache = new Map();

// Add this function at the top of history.js, near other helper functions
async function getCurrentUserId() {
  try {
    const res = await fetch(`${BASE_URL}/api/user-info`);
    if (res.ok) {
      const data = await res.json();
      return data.user?.userId || null;
    }
    return null;
  } catch (err) {
    console.error('Error getting current user ID:', err);
    return null;
  }
}

async function getMedName(id) {
  if (medCache.has(id)) return medCache.get(id);
  try {
    const res = await fetch(`${BASE_URL}/api/pos/medicines/get-by-id/${id}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const name = data?.item_name || `(ID:${id})`;
    medCache.set(id, name);
    return name;
  } catch (err) {
    console.error(`Error fetching medicine name for ID ${id}:`, err);
    medCache.set(id, `(ID:${id})`);
    return `(ID:${id})`;
  }
}

async function getUserName(userId) {
  if (!userId) return 'Unknown User';
  if (userCache.has(userId)) return userCache.get(userId);
  
  try {
    console.log(`[USER DEBUG] Fetching user name for ID: ${userId}`);
    
    // Try the simple user by ID endpoint first
    let res = await fetch(`${BASE_URL}/api/user/${userId}`);
    
    console.log(`[USER DEBUG] user/${userId} response status: ${res.status}`);
    
    if (res.ok) {
      const data = await res.json();
      console.log(`[USER DEBUG] user/${userId} data received:`, data);
      const name = data?.FullName || data?.Username || `Unknown User (ID: ${userId})`;
      userCache.set(userId, name);
      return name;
    }
    
    // If that fails, try the POST getUser endpoint
    console.log(`[USER DEBUG] GET user/${userId} failed, trying POST getUser`);
    res = await fetch(`${BASE_URL}/api/getUser`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: userId })
    });
    
    if (res.ok) {
      const data = await res.json();
      console.log(`[USER DEBUG] POST getUser data received:`, data);
      const name = data?.FullName || data?.Username || `Unknown User (ID: ${userId})`;
      userCache.set(userId, name);
      return name;
    }
    
    // If both fail, try to get all users and find the one we need
    console.log(`[USER DEBUG] POST getUser failed, trying getUsers endpoint`);
    res = await fetch(`${BASE_URL}/api/getUsers`);
    
    if (res.ok) {
      const users = await res.json();
      console.log(`[USER DEBUG] getUsers response:`, users);
      
      const user = users.find(u => u.UserID === parseInt(userId));
      if (user) {
        const name = user.FullName || user.Username || `Unknown User (ID: ${userId})`;
        userCache.set(userId, name);
        return name;
      }
    }
    
    // If all fail, return fallback
    throw new Error(`User ${userId} not found in any endpoint`);
    
  } catch (err) {
    console.error(`[USER DEBUG] Error fetching user name for ID ${userId}:`, err);
    const fallbackName = `Unknown User (ID: ${userId})`;
    userCache.set(userId, fallbackName);
    return fallbackName;
  }
}

/* ---------- PRINT FUNCTIONS (NEW) ---------- */
async function printPO(id) {
  try {
    const response = await fetch(`${BASE_URL}/api/purchase-orders/${id}/print-pdf`);
    
    if (!response.ok) {
      throw new Error(`Failed to generate PDF: ${response.status}`);
    }
    
    // Create blob from response
    const blob = await response.blob();
    
    // Create download link
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PO_${id}.pdf`;
    document.body.appendChild(a);
    a.click();
    
    // Cleanup
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    
  } catch (err) {
    console.error('Error printing PO:', err);
    alert('Failed to generate PDF: ' + err.message);
  }
}

async function printGRN(id) {
  try {
    const response = await fetch(`${BASE_URL}/api/goods-receipt-notes/${id}/print-pdf`);
    
    if (!response.ok) {
      throw new Error(`Failed to generate PDF: ${response.status}`);
    }
    
    // Create blob from response
    const blob = await response.blob();
    
    // Create download link
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GRN_${id}.pdf`;
    document.body.appendChild(a);
    a.click();
    
    // Cleanup
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    
  } catch (err) {
    console.error('Error printing GRN:', err);
    alert('Failed to generate PDF: ' + err.message);
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
          <button class="btn btn-sm btn-print" onclick="printPO(${p.po_id})" title="Print PDF">
            <i class="fas fa-print"></i> Print
          </button>
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
          <button class="btn btn-sm btn-print" onclick="printGRN(${g.grn_id})" title="Print PDF">
            <i class="fas fa-print"></i> Print
          </button>
        </td>
      </tr>`);
  });
}

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

/* ---------- GRN specific - UPDATED VERSION WITH PROPER NAME RESOLUTION ---------- */
async function viewGRN(id) { openGRNModal(id); }

/* ---------- openGRNModal - UPDATED WITH PROPER NAME RESOLUTION ---------- */
async function openGRNModal(id) {
  const modal = new bootstrap.Modal(document.getElementById('genericModal'));
  const title = document.getElementById('modalTitle');
  const body = document.getElementById('modalBody');

  console.log(`[GRN DEBUG] Opening GRN modal for ID: ${id}`);

  try {
    const response = await fetch(`${BASE_URL}/api/goods-receipt-notes/${id}`);
    console.log(`[GRN DEBUG] Response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[GRN DEBUG] Response error:`, errorText);
      throw new Error('Failed to fetch GRN');
    }
    
    const grn = await response.json();
    console.log(`[GRN DEBUG] Received GRN data:`, grn);
    
    title.textContent = `GRN #${id}`;

    // Define grn_total using the total_amount from the GRN data
    const grn_total = Number(grn.total_amount) || 0;
    const po_total_amount = Number(grn.po_total_amount) || 0;
    const calculated_total = Number(grn.calculated_total || 0);
    const totalMatchesPo = Math.abs(grn_total - po_total_amount) < 0.01;

    // Get received by user name
    const receivedByName = await getUserName(grn.received_by);

    // Process items with proper medicine name resolution
    const processedItems = await Promise.all(grn.items.map(async (item) => {
      console.log(`[GRN DEBUG] Processing item ${item.grn_item_id}:`, item);
      
      const quantity = Number(item.quantity || 0);
      const receivedPrice = Number(item.received_price || 0);
      const receivedSubtotal = Number(item.received_subtotal || 0);
      const is_foc = Boolean(item.is_foc);
      
      // Get proper medicine name
      let medicineName = item.medicine_name;
      if (!medicineName || medicineName === '(Unknown Medicine)') {
        if (item.medicine_id) {
          medicineName = await getMedName(item.medicine_id);
        } else {
          medicineName = `(Unknown Medicine ID: ${item.medicine_id || 'N/A'})`;
        }
      }
      
      return {
        ...item,
        medicine_name: medicineName,
        quantity,
        received_price: receivedPrice,
        received_subtotal: receivedSubtotal,
        is_foc
      };
    }));

    // Generate items HTML with proper names
    const itemsHTML = processedItems.map(it => {
      return `
        <tr>
          <td>${it.medicine_name}</td>
          <td>${it.batch_number || 'N/A'}</td>
          <td>${it.expirydate ? new Date(it.expirydate).toLocaleDateString() : 'N/A'}</td>
          <td>${it.quantity.toFixed(3)}</td>
          <td class="${it.is_foc ? 'text-success' : ''}">${it.is_foc ? '0.000 (FOC)' : it.received_price.toFixed(3)}</td>
          <td class="${it.is_foc ? 'text-success' : ''}">${it.is_foc ? '0.000 (FOC)' : it.received_subtotal.toFixed(3)}</td>
        </tr>`;
    }).join('');

    // Create improved total display
    const totalDisplay = `
      <div class="text-end fw-bold mt-3">
        <div class="row">
          <div class="col-md-6">
            <div class="card bg-light p-2">
              <small class="text-muted">Items Summary</small>
              <div class="fw-normal">
                <span class="text-success">FOC Items: ${grn.foc_items_count || 0}</span><br>
                <span class="text-primary">Paid Items: ${grn.non_foc_items_count || 0}</span><br>
                <span class="text-info">Total Items: ${grn.items.length}</span>
              </div>
            </div>
          </div>
          <div class="col-md-6">
            <div class="card bg-light p-2">
              <small class="text-muted">Financial Summary</small>
              <div class="fw-normal">
                <span class="fs-6">GRN Total: <strong>${grn_total.toFixed(3)}</strong></span><br>
                <span class="text-muted">PO Total: ${po_total_amount.toFixed(3)}</span><br>
                <span class="text-info">Calculated: ${calculated_total.toFixed(3)}</span><br>
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
          <td><strong>Received By:</strong> ${receivedByName}</td>
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
    console.error('[GRN DEBUG] Error loading GRN:', err);
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
    const userId = await getCurrentUserId();
    const userName = await getUserName(userId);
    const res = await fetch(`${BASE_URL}/api/purchase-orders/${id}/partial-update`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        header: anyHeaderChanged ? {
          agency: agencyName,
          remarks,
          total_amount: newTotal,
          updated_by: userName,
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
        is_foc: is_foc
      });
      
      console.log(`[RECEIVE] Item ${medicine_id}: Qty=${quantity}, Price=${received_price}, FOC=${is_foc}`);
    }
  }

  if (!items.length) {
    alert('Please fill in all required fields (batch, expiry, quantity > 0).');
    return;
  }

  // Get current user ID
  const currentUserId = await getCurrentUserId();
  if (!currentUserId) {
    alert('Error: Could not determine current user. Please log in again.');
    return;
  }

  try {
    const res = await fetch(`${BASE_URL}/api/goods-receipt-notes/from-po`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        po_id,
        received_by: currentUserId, // ✅ FIXED: Use actual user ID
        remarks: document.querySelector('#grnRemarks')?.value || '',
        items
      })
    });
    const data = await res.json();
    if (data.success) {
      alert(`Received successfully! GRN code: ${data.grn_code}\nTotal: ${data.total_amount.toFixed(3)} (${data.foc_items || 0} FOC items)`);
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