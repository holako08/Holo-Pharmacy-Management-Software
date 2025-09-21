// --- Utility Functions ---
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return '';
  return d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function formatTime(timeStr) {
  if (!timeStr) return '';
  // handles "13:21:15" or "13:21:15.000" formats
  let t = timeStr.split(':');
  if (t.length < 2) return '';
  let hour = Number(t[0]), min = t[1], ampm = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12;
  return `${hour}:${min} ${ampm}`;
}
function formatCurrency(num) {
  if (num === null || num === undefined || num === '') return '';
  return Number(num).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// --- User Info and Logout ---
function fetchUserInfo() {
  fetch('/api/user-info')
    .then(response => response.json())
    .then(data => {
      const user = data.user;
      document.getElementById('user-name').textContent = user.fullName;
      document.getElementById('user-job-title').textContent = user.jobTitle;
      const userPhoto = document.getElementById('user-photo');
      if (userPhoto) {
        userPhoto.onerror = function() {
          userPhoto.src = 'images/default-profile.png';
        };
        userPhoto.src = `/api/user-photo/${user.userId}`;
      }
    })
    .catch(error => {
      console.error('Error fetching user info:', error);
    });
}
document.getElementById('logout-btn').addEventListener('click', () => {
  fetch('/logout')
    .then(() => {
      window.location.href = '/';
    });
});
fetchUserInfo();

// --- Global Variables ---
let currentPage = 1;
let pageSize = 20;
let totalRows = 0;
let debounceTimer = null;
let filterState = {};

// --- Data Fetch ---
function getFilters() {
  return {
    dateStart: document.getElementById('bills-report-date-start').value,
    dateEnd: document.getElementById('bills-report-date-end').value,
    itemName: document.getElementById('bills-report-filter-item-name').value.trim(),
    patientName: document.getElementById('bills-report-filter-patient-name').value.trim(),
    patientPhone: document.getElementById('bills-report-filter-patient-phone').value.trim(),
    user: document.getElementById('bills-report-filter-user').value.trim(),
    paymentMethod: document.getElementById('bills-report-filter-payment-method').value.trim(),
    cardInvoice: document.getElementById('bills-report-filter-card-invoice').value.trim(),
    ecomInvoice: document.getElementById('bills-report-filter-ecom-invoice').value.trim(),
    priceMin: document.getElementById('bills-report-filter-price-min').value.trim(),
    priceMax: document.getElementById('bills-report-filter-price-max').value.trim(),
    page: currentPage,
    pageSize: pageSize
  };
}
function setFilters(filters) {
  document.getElementById('bills-report-date-start').value = filters.dateStart || '';
  document.getElementById('bills-report-date-end').value = filters.dateEnd || '';
  document.getElementById('bills-report-filter-item-name').value = filters.itemName || '';
  document.getElementById('bills-report-filter-patient-name').value = filters.patientName || '';
  document.getElementById('bills-report-filter-patient-phone').value = filters.patientPhone || '';
  document.getElementById('bills-report-filter-user').value = filters.user || '';
  document.getElementById('bills-report-filter-payment-method').value = filters.paymentMethod || '';
  document.getElementById('bills-report-filter-card-invoice').value = filters.cardInvoice || '';
  document.getElementById('bills-report-filter-ecom-invoice').value = filters.ecomInvoice || '';
  document.getElementById('bills-report-filter-price-min').value = filters.priceMin || '';
  document.getElementById('bills-report-filter-price-max').value = filters.priceMax || '';
}

// --- Main Data Loader ---
function loadBillsData(page = 1) {
  currentPage = page;
  filterState = getFilters();

  document.getElementById('bills-report-loading').style.display = 'block';
  document.getElementById('bills-report-table').style.opacity = '0.6';

  fetch('/api/bills-report/data', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({...filterState, page: currentPage, pageSize})
  })
    .then(res => res.json())
    .then(data => {
      renderTable(data.rows || []);
      renderPagination(data.totalRows || 0, currentPage);
      renderSummary(data.summary || {});
      totalRows = data.totalRows || 0;
      document.getElementById('bills-report-loading').style.display = 'none';
      document.getElementById('bills-report-table').style.opacity = '1';
    })
    .catch(err => {
      document.getElementById('bills-report-loading').textContent = "Failed to load data.";
      setTimeout(()=>{document.getElementById('bills-report-loading').style.display='none'}, 2000);
    });
}

function renderTable(rows) {
  const tbody = document.getElementById('bills-report-table').querySelector('tbody');
  tbody.innerHTML = '';
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="12" style="text-align:center; color:#888;">No data found.</td></tr>`;
    return;
  }
  rows.forEach(row => {
    tbody.innerHTML += `
      <tr>
        <td>${formatDate(row.bill_date)}</td>
        <td>${formatTime(row.bill_time)}</td>
        <td>${row.item_name || ''}</td>
        <td>${row.quantity || ''}</td>
        <td>${formatCurrency(row.price)}</td>
        <td>${formatCurrency(row.subtotal)}</td>
        <td>${row.payment_method || ''}</td>
        <td>${row.card_invoice_number || ''}</td>
        <td>${row['E-commerce Invoice Number'] || ''}</td>
        <td>${row.patient_name || ''}</td>
        <td>${row.patient_phone || ''}</td>
        <td>${row.user || ''}</td>
      </tr>
    `;
  });
}

function renderPagination(total, page) {
  const pagination = document.getElementById('bills-report-pagination');
  pagination.innerHTML = '';
  const pages = Math.ceil(total / pageSize);
  if (pages <= 1) return;
  for (let i = 1; i <= pages; i++) {
    const btn = document.createElement('button');
    btn.textContent = i;
    if (i === page) btn.classList.add('active');
    btn.onclick = () => loadBillsData(i);
    pagination.appendChild(btn);
  }
}

function renderSummary(summary) {
  const summaryDiv = document.getElementById('bills-report-summary');
  if (!summary || !summary.totalAmount) {
    summaryDiv.innerHTML = '';
    return;
  }
  summaryDiv.innerHTML = `
    <span>Total Transactions: <strong>${summary.transactionCount}</strong></span>
    <span>Total Amount: <strong>${formatCurrency(summary.totalAmount)}</strong></span>
    <span>Cash: <strong>${formatCurrency(summary.cashTotal)}</strong></span>
    <span>Card: <strong>${formatCurrency(summary.cardTotal)}</strong></span>
    <span>E-commerce: <strong>${formatCurrency(summary.ecomTotal)}</strong></span>
    <span>Insurance: <strong>${formatCurrency(summary.insuranceTotal)}</strong></span>
  `;
}


// --- Filter Handlers (debounced) ---
function setupFilters() {
  [
    'bills-report-filter-item-name',
    'bills-report-filter-patient-name',
    'bills-report-filter-patient-phone',
    'bills-report-filter-user',
    'bills-report-filter-payment-method',
    'bills-report-filter-card-invoice',
    'bills-report-filter-ecom-invoice',
    'bills-report-filter-price-min',
    'bills-report-filter-price-max'
  ].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => loadBillsData(1), 400);
    });
  });
  document.getElementById('bills-report-apply-date').onclick = () => loadBillsData(1);
  document.getElementById('bills-report-clear-filters').onclick = () => {
    setFilters({});
    loadBillsData(1);
  };
}
setupFilters();

// --- Excel Export ---
document.getElementById('bills-report-export').onclick = () => {
  fetch('/api/bills-report/export', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(getFilters())
  })
  .then(res => res.blob())
  .then(blob => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bills_report.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  });
};

// --- Init on Load ---
window.onload = () => {
  // Optionally set default date range to last 7 days
  const today = new Date();
  const prior = new Date();
  prior.setDate(today.getDate() - 7);
  document.getElementById('bills-report-date-end').value = today.toISOString().split('T')[0];
  document.getElementById('bills-report-date-start').value = prior.toISOString().split('T')[0];
  loadBillsData(1);
};
