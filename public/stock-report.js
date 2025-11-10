// stock-report.js

// --- User Info and Logout ---
fetchUserInfo();
document.getElementById('logout-btn').addEventListener('click', () => {
  fetch('/logout').then(() => window.location.href = '/');
});

// --- DOM Elements ---
const stockTableBody = document.getElementById('stock-table').querySelector('tbody');
const searchInput = document.getElementById('stock-search');
const thresholdInput = document.getElementById('stock-threshold');
const refreshBtn = document.getElementById('refresh-btn');
const exportBtn = document.getElementById('export-stock-btn');
const loadingDiv = document.getElementById('stock-report-loading');
const summaryDiv = document.getElementById('stock-summary');
const paginationDiv = document.getElementById('stock-report-pagination');

// --- State Management ---
let currentThreshold = 5;
let currentPage = 1;
let perPage = 20;
let totalItems = 0;

// --- Per-page Input ---
let perPageInput = document.getElementById('stock-per-page');
if (!perPageInput) {
  perPageInput = document.createElement('input');
  perPageInput.type = 'number';
  perPageInput.id = 'stock-per-page';
  perPageInput.value = 20;
  perPageInput.min = 1;
  perPageInput.style.width = "68px";
  perPageInput.style.marginLeft = "12px";
  perPageInput.title = "Items per page";
  const perPageLabel = document.createElement('label');
  perPageLabel.textContent = "Items/Page:";
  perPageLabel.style.marginLeft = "12px";
  thresholdInput.insertAdjacentElement('afterend', perPageLabel);
  perPageLabel.appendChild(perPageInput);
}

// --- Util ---
function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return ''; // More robust check
  // Add one day to correct for timezone issues
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString('en-GB');
}

// --- Fetch and Render Stock ---
function fetchAndRenderStock(page = currentPage) {
  const q = searchInput.value || '';
  const threshold = parseFloat(thresholdInput.value) || 5;
  currentThreshold = threshold;
  currentPage = page;
  perPage = parseInt(perPageInput.value) || 20;

  loadingDiv.style.display = 'block';
  stockTableBody.innerHTML = '';
  summaryDiv.textContent = '';
  paginationDiv.innerHTML = '';
  
  // MODIFIED: Calling the new batch-aware endpoint
  const apiUrl = `/api/batch-stock-report-V2?lowStockThreshold=${threshold}&q=${encodeURIComponent(q)}&page=${currentPage}&perPage=${perPage}`;
  
  fetch(apiUrl)
    .then(res => res.json())
    .then(({data, total}) => {
      totalItems = total;
      renderStockTable(data, threshold);
      renderPagination();
      loadingDiv.style.display = 'none';
    })
    .catch((error) => {
      console.error("Fetch Error:", error);
      stockTableBody.innerHTML = '<tr><td colspan="7" style="color:#b00020; text-align:center;">Failed to load data. Please check server connection.</td></tr>';
      summaryDiv.textContent = '';
      paginationDiv.innerHTML = '';
      loadingDiv.style.display = 'none';
    });
}

// --- Render Table ---
function renderStockTable(data, threshold) {
  stockTableBody.innerHTML = '';
  if (!data || data.length === 0) {
    stockTableBody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No batches found matching the criteria.</td></tr>';
    summaryDiv.textContent = '0 Batches Found';
    return;
  }
  let lowCount = 0, outCount = 0;
  data.forEach(row => {
    const stockVal = parseFloat(row.quantity) || 0;
    if (stockVal < threshold) lowCount++;
    if (stockVal === 0) outCount++;
    const tr = document.createElement('tr');
    
    // MODIFIED: Updated innerHTML to match new table structure
    tr.innerHTML = `
      <td>${row.item_name || ''}</td>
      <td>${row.barcode || ''}</td>
      <td>${row.batch_number || 'N/A'}</td>
      <td>${row.branch || 'N/A'}</td>
      <td>${formatDate(row.expiry)}</td>
      <td>${formatDate(row.received_date)}</td>
      <td>${stockVal}</td>
    `;
    if (stockVal < threshold) {
      tr.classList.add('low-stock-row');
    }
    stockTableBody.appendChild(tr);
  });
  
  // MODIFIED: Updated summary text for clarity
  summaryDiv.textContent =
    `Total Batches Found: ${totalItems} | Low Stock Batches: ${lowCount} | Out of Stock Batches: ${outCount}`;
}

// --- Render Pagination ---
function renderPagination() {
  const totalPages = Math.ceil(totalItems / perPage);
  if (totalPages <= 1) {
    paginationDiv.innerHTML = '';
    return;
  }
  let html = '';
  const pageWindow = 3;
  let start = Math.max(1, currentPage - pageWindow);
  let end = Math.min(totalPages, currentPage + pageWindow);
  if (currentPage - pageWindow < 1) end = Math.min(totalPages, end + (1 - (currentPage - pageWindow)));
  if (currentPage + pageWindow > totalPages) start = Math.max(1, start - ((currentPage + pageWindow) - totalPages));

  if (start > 1) html += `<button data-page="1">1</button>${start > 2 ? '<span>...</span>' : ''}`;
  for (let i = start; i <= end; i++) {
    html += `<button class="${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
  }
  if (end < totalPages) html += `${end < totalPages - 1 ? '<span>...</span>' : ''}<button data-page="${totalPages}">${totalPages}</button>`;
  paginationDiv.innerHTML = html;

  paginationDiv.querySelectorAll('button').forEach(btn => {
    btn.onclick = () => {
      fetchAndRenderStock(parseInt(btn.getAttribute('data-page')));
    };
  });
}

// --- Events ---
function debounce(fn, delay) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), delay);
  };
}

searchInput.addEventListener('input', debounce(() => fetchAndRenderStock(1), 350));
thresholdInput.addEventListener('input', debounce(() => fetchAndRenderStock(1), 350));
perPageInput.addEventListener('change', () => fetchAndRenderStock(1));
refreshBtn.addEventListener('click', () => fetchAndRenderStock(1));

// --- Export to Excel ---
exportBtn.addEventListener('click', () => {
  const threshold = parseFloat(thresholdInput.value) || 5;
  const q = searchInput.value || '';
  exportBtn.disabled = true;
  exportBtn.textContent = "Exporting...";
  
  // MODIFIED: Calling the new batch-aware export endpoint
  fetch('/api/export-batch-stock-report-V2', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ lowStockThreshold: threshold, q })
  })
  .then(res => {
    if (!res.ok) throw new Error('Export failed');
    return res.blob();
  })
  .then(blob => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'batch_stock_report.xlsx';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
  }).catch(err => {
    console.error("Export Error:", err);
    alert('Excel export failed.');
  }).finally(() => {
    exportBtn.disabled = false;
    exportBtn.textContent = "Export to Excel";
  });
});

// --- Initial Load ---
document.addEventListener('DOMContentLoaded', () => {
  fetchAndRenderStock(1);
});

// --- User Info Fetcher ---
function fetchUserInfo() {
  fetch('/api/user-info')
    .then(response => response.json())
    .then(data => {
      const user = data.user;
      if (user) {
        document.getElementById('user-name').textContent = user.fullName;
        document.getElementById('user-job-title').textContent = user.jobTitle;
        const userPhoto = document.getElementById('user-photo');
        if (userPhoto) {
          userPhoto.onerror = () => { userPhoto.src = 'images/default-profile.png'; };
          userPhoto.src = `/api/user-photo/${user.userId}`;
        }
      }
    })
    .catch(() => console.error('Could not fetch user info.'));
}