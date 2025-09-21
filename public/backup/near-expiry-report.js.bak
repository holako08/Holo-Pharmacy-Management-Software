// User info fetch and logout
fetchUserInfo();
document.getElementById('logout-btn').addEventListener('click', () => {
  fetch('/logout').then(() => window.location.href = '/');
});

// --- Table Utility ---
function formatDate(isoDate) {
  if (!isoDate) return '';
  const d = new Date(isoDate);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('en-GB'); // DD/MM/YYYY
}

function renderTable(data) {
  const tbody = document.getElementById('expiry-table').querySelector('tbody');
  tbody.innerHTML = '';
  const batchNumberTh = document.getElementById('batch-number-th');

  // Check if at least one row has a batch_number
  const hasBatch = data && data.some(row => row.batch_number !== undefined && row.batch_number !== null);

  // Show or hide the Batch Number column
  batchNumberTh.style.display = hasBatch ? '' : 'none';

  if (!data || data.length === 0) {
    document.getElementById('table-feedback').textContent = 'No medicines found in selected period.';
    return;
  }
  document.getElementById('table-feedback').textContent = '';

  data.forEach(row => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.item_name}</td>
      <td>${row.barcode}</td>
      ${hasBatch ? `<td>${row.batch_number !== null && row.batch_number !== undefined ? row.batch_number : ''}</td>` : ''}
      <td>${row.stock}</td>
      <td>${formatDate(row.expiry)}</td>
    `;
    tbody.appendChild(tr);
  });
}


// --- 1. Default Load: Next 3 Months ---
function loadDefault() {
  fetch('/api/near-expiry-G7v9Q')
    .then(res => res.json())
    .then(renderTable)
    .catch(() => { document.getElementById('table-feedback').textContent = 'Failed to load data.'; });
}
loadDefault();

// --- 2. Filtering ---
document.getElementById('filter-form').addEventListener('submit', e => {
  e.preventDefault();
  const start = document.getElementById('start-date').value;
  const end = document.getElementById('end-date').value;
  if (!start || !end) {
    document.getElementById('table-feedback').textContent = 'Select both start and end dates!';
    return;
  }
  fetch('/api/filter-expiry-D8k1P', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ startDate: start, endDate: end })
  })
    .then(res => res.json())
    .then(renderTable)
    .catch(() => { document.getElementById('table-feedback').textContent = 'Filter failed.'; });
});

document.getElementById('reset-filter').addEventListener('click', () => {
  document.getElementById('start-date').value = '';
  document.getElementById('end-date').value = '';
  loadDefault();
});

// --- 3. Excel Export ---
document.getElementById('export-excel').addEventListener('click', () => {
  let start = document.getElementById('start-date').value;
  let end = document.getElementById('end-date').value;
  // Fallback to default period
  if (!start || !end) {
    const now = new Date();
    start = now.toISOString().slice(0,10);
    const plus3 = new Date();
    plus3.setMonth(now.getMonth() + 3);
    end = plus3.toISOString().slice(0,10);
  }
  fetch('/api/export-expiry-V2h5K', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ startDate: start, endDate: end })
  }).then(response => {
    if (response.ok) {
      return response.blob();
    }
    throw new Error('Export failed');
  }).then(blob => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'NearExpiryReport.xlsx';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
  }).catch(() => {
    document.getElementById('table-feedback').textContent = 'Excel export failed.';
  });
});

// --- User Info Fetcher (Provided in prompt) ---
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
    .catch(error => {});
}
