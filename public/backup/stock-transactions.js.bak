let transactionsData = [];
let currentPage = 1, totalPages = 1, limit = 20, total = 0;
let lastFilters = {};

document.addEventListener('DOMContentLoaded', function () {
    loadTransactions();

    document.getElementById('filter-btn').onclick = () => { currentPage = 1; loadTransactions(); };
    document.getElementById('reset-btn').onclick = () => { resetFilters(); loadTransactions(); };
    document.getElementById('export-btn').onclick = exportExcel;
   

    // Add listeners for all filter fields
    ['filter-item','filter-id','filter-user','filter-date-from','filter-date-to','filter-type']
        .forEach(id => {
            document.getElementById(id).addEventListener(
                ['filter-type','filter-date-from','filter-date-to'].includes(id) ? 'change' : 'input',
                () => { currentPage = 1; loadTransactions(); }
            );
        });
});

function loadTransactions(page = currentPage) {
    const item = document.getElementById('filter-item').value.trim();
    const idSearch = document.getElementById('filter-id').value.trim();
    const user = document.getElementById('filter-user').value.trim();
    const from = document.getElementById('filter-date-from').value;
    const to = document.getElementById('filter-date-to').value;
    const type = document.getElementById('filter-type').value;

    lastFilters = { item, id: idSearch, user, dateFrom: from, dateTo: to, type };

    let url = `/api/stock-mgmt-x9z/dashboard?page=${page}&limit=${limit}`;
    Object.entries(lastFilters).forEach(([k, v]) => { if (v) url += `&${k}=${encodeURIComponent(v)}`; });

    fetch(url)
        .then(r => r.json())
        .then(data => {
            transactionsData = data.transactions || [];
            total = data.total || 0;
            currentPage = data.page || 1;
            totalPages = data.totalPages || 1;
            renderTable(transactionsData);
            renderPagination();
        });
}

function renderTable(data) {
    const tbody = document.querySelector('#transactions-table tbody');
    tbody.innerHTML = '';
    if (!data.length) {
        document.getElementById('no-data-msg').style.display = '';
        return;
    }
    document.getElementById('no-data-msg').style.display = 'none';
    data.forEach(t => {
        const tr = document.createElement('tr');
        const typeStr = t.transfer_id ? 'STN' : (t.receipt_id ? 'SRN' : '');
        const items = Array.isArray(t.items) ? t.items.join(', ') : (t.items || '');
        const quantities = Array.isArray(t.quantities) ? t.quantities.join(', ') : (t.quantities || '');
        const batches = Array.isArray(t.batches) ? t.batches.join(', ') : (t.batches || '');
        const user = t.transferring_user || t.sending_user || t.receiving_user || '';
        const date = t.transfer_date || t.receipt_date || t.created_at || '';
        const id = t.transfer_id || t.receipt_id || '';
        tr.innerHTML = `
            <td>${typeStr}</td>
            <td>${id}</td>
            <td>${items}</td>
            <td>${quantities}</td>
            <td>${batches}</td>
            <td>${t.branch_from || ''}</td>
            <td>${t.branch_to || ''}</td>
            <td>${user}</td>
            <td>${formatDate(date)}</td>
            <td>${t.status || ''}</td>
            <td>
                ${typeStr === 'STN'
        ? `<a href="/api/stock-mgmt-x9z/generate-stn/${t.transfer_id}" class="btn-link" target="_blank">STN PDF</a>
           <a href="/api/stock-mgmt-x9z/generate-transfer-file/${t.transfer_id}" class="btn-link" target="_blank">TXT</a>`
        : (typeStr === 'SRN'
            ? `<a href="/api/stock-mgmt-x9z/generate-srn/${t.receipt_id}" class="btn-link" target="_blank">SRN PDF</a>`
            : ''
          )
    }
    <button class="btn-link view-txn-btn" data-txn-idx="${transactionsData.indexOf(t)}">View</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}


function renderPagination() {
    const container = document.getElementById('pagination');
    if (!container) return;
    if (totalPages <= 1) { container.innerHTML = ''; return; }
    let html = '';

    html += `<button ${currentPage == 1 ? 'disabled' : ''} onclick="gotoPage(1)">«</button>`;
    html += `<button ${currentPage == 1 ? 'disabled' : ''} onclick="gotoPage(${currentPage - 1})">‹</button>`;

    // Show up to 5 page numbers, centered
    let start = Math.max(1, currentPage - 2), end = Math.min(totalPages, currentPage + 2);
    if (currentPage <= 3) end = Math.min(5, totalPages);
    if (currentPage >= totalPages - 2) start = Math.max(1, totalPages - 4);
    for (let i = start; i <= end; i++) {
        html += `<button ${i === currentPage ? 'style="background:#d1b464;color:#23232b;font-weight:bold;" disabled' : ''} onclick="gotoPage(${i})">${i}</button>`;
    }
    html += `<button ${currentPage == totalPages ? 'disabled' : ''} onclick="gotoPage(${currentPage + 1})">›</button>`;
    html += `<button ${currentPage == totalPages ? 'disabled' : ''} onclick="gotoPage(${totalPages})">»</button>`;
    html += `<span style="margin-left:12px;">Total: ${total} txns</span>`;
    container.innerHTML = html;
}

// This needs to be global for inline onclicks!
window.gotoPage = function(page) {
    if (page >= 1 && page <= totalPages) {
        currentPage = page;
        loadTransactions();
    }
};

function resetFilters() {
    ['filter-item','filter-id','filter-user','filter-date-from','filter-date-to','filter-type']
        .forEach(id => document.getElementById(id).value = '');
    currentPage = 1;
}

function exportExcel() {
    if (!transactionsData.length) return alert('No transactions to export.');
    const rows = transactionsData.map(t => ({
        Type: t.transfer_id ? 'Transfer' : 'Receipt',
        ID: t.transfer_id || t.receipt_id || '',
        Items: Array.isArray(t.items) ? t.items.join(', ') : (t.items || ''),
        Quantities: Array.isArray(t.quantities) ? t.quantities.join(', ') : (t.quantities || ''),
        Batches: Array.isArray(t.batches) ? t.batches.join(', ') : (t.batches || ''),
        From: t.branch_from || '',
        To: t.branch_to || '',
        User: t.transferring_user || t.sending_user || t.receiving_user || '',
        Date: formatDate(t.transfer_date || t.receipt_date || t.created_at || ''),
        Status: t.status || ''
    }));
    fetch('/api/stock-mgmt-x9z/export-dashboard-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows })
    })
    .then(res => {
        if (res.ok) return res.blob();
        else throw new Error('Export failed');
    })
    .then(blob => {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `stock_transactions_${Date.now()}.xlsx`;
        link.click();
    }).catch(() => alert('Export failed'));
}

function formatDate(dt) {
    if (!dt) return '';
    const d = new Date(dt);
    if (isNaN(d)) return dt;
    return d.toLocaleDateString('en-GB') + ' ' + d.toLocaleTimeString('en-GB', { hour12: false });
}

// Dummy logout
function logout() {
    fetch('/logout')
        .then(() => window.location.href = '/index.html');
}

function viewTxnDetails(txn) {
    const typeStr = txn.transfer_id ? 'STN' : (txn.receipt_id ? 'SRN' : '');
    const items = Array.isArray(txn.items) ? txn.items : (typeof txn.items === "string" ? JSON.parse(txn.items) : []);
    const batches = Array.isArray(txn.batches) ? txn.batches : (typeof txn.batches === "string" ? JSON.parse(txn.batches) : []);
    const exps = Array.isArray(txn.expiry_dates) ? txn.expiry_dates : (typeof txn.expiry_dates === "string" ? JSON.parse(txn.expiry_dates) : []);
    const qtys = Array.isArray(txn.quantities) ? txn.quantities : (typeof txn.quantities === "string" ? JSON.parse(txn.quantities) : []);
    const stockCol = typeStr === 'STN' ? 'Stock Out' : 'Stock In';

    let table = `
      <div style="margin-bottom:12px;">
        <b>Type:</b> ${typeStr}<br>
        <b>ID:</b> ${txn.transfer_id || txn.receipt_id || ''}<br>
        <b>Status:</b> ${txn.status || ''}<br>
        <b>From Branch:</b> ${txn.branch_from || ''}<br>
        <b>To Branch:</b> ${txn.branch_to || ''}<br>
        <b>User:</b> ${txn.transferring_user || txn.sending_user || txn.receiving_user || ''}<br>
        <b>Date:</b> ${formatDate(txn.transfer_date || txn.receipt_date || txn.created_at || '')}
      </div>
      <div style="overflow-x:auto;">
        <table class="txn-details-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Batch</th>
              <th>Expiry</th>
              <th>Quantity</th>
              <th>${stockCol}</th>
            </tr>
          </thead>
          <tbody>
    `;
    for(let i=0;i<items.length;i++) {
        table += `
          <tr>
            <td>${items[i] || ''}</td>
            <td>${batches[i] || ''}</td>
            <td>${exps[i] || ''}</td>
            <td>${qtys[i] || ''}</td>
            <td>${qtys[i] || ''}</td>
          </tr>
        `;
    }
    table += `</tbody></table></div>`;

    document.getElementById('txn-modal-content').innerHTML = table;
    document.getElementById('txn-modal').classList.add('active');
}


function closeTxnModal() {
    document.getElementById('txn-modal').classList.remove('active');
}

window.viewTxnDetails = viewTxnDetails;
window.closeTxnModal = closeTxnModal;

document.querySelector('#transactions-table').addEventListener('click', function (e) {
    if (e.target.classList.contains('view-txn-btn')) {
        const idx = e.target.getAttribute('data-txn-idx');
        if (idx != null) {
            viewTxnDetails(transactionsData[idx]);
        }
    }
});

document.addEventListener('DOMContentLoaded', function () {
    fetchUserInfo();
    document.getElementById('logout-btn').onclick = logout;
    // ...existing code...
});

// Fetch user info from backend and update the user-info-panel
function fetchUserInfo() {
    fetch('/api/user-info')
      .then(r => r.json())
      .then(data => {
        if (!data.user) return;
        const user = data.user;

        // Set the global variable!
        requestingUserName = user.fullName || user.username || '';

        const userName = document.getElementById('user-name');
        if (userName) userName.textContent = user.fullName;

        const userJob = document.getElementById('user-job-title');
        if (userJob) userJob.textContent = user.jobTitle;

        // Set user photo only if the element exists
        const userPhoto = document.getElementById('user-photo');
        if (userPhoto) {
            userPhoto.onerror = function() {
                userPhoto.src = 'images/default-profile.png';
            };
            userPhoto.src = `/api/user-photo/${user.userId}`;
        }

        // Only set 'requested-by' if the element exists
        const reqBy = document.getElementById('requested-by');
        if (reqBy) reqBy.textContent = user.fullName;
      });
}



function logout() {
    fetch('/logout').finally(() => {
        window.location.href = 'index.html';
    });
}
