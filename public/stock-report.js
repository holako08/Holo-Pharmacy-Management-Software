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
const paginationDiv = document.getElementById('stock-report-pagination'); // <--- FIXED!

// --- Pagination/PerPage Control ---
let lastStockData = [];
let currentThreshold = 5;
let currentPage = 1;
let perPage = 20;
let totalItems = 0;

// --- Per-page Input (Add if not present) ---
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
  // Place it after the threshold input for UI consistency
  thresholdInput.insertAdjacentElement('afterend', perPageInput);
  const perPageLabel = document.createElement('label');
  perPageLabel.textContent = "Items/Page:";
  perPageLabel.style.marginLeft = "12px";
  thresholdInput.insertAdjacentElement('afterend', perPageLabel);
  perPageLabel.appendChild(perPageInput);
}
perPage = parseInt(perPageInput.value) || 20;

// --- Util ---
function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d)) return '';
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
  fetch(`/api/stock-report-BR51f?lowStockThreshold=${threshold}&q=${encodeURIComponent(q)}&page=${currentPage}&perPage=${perPage}`)
    .then(res => res.json())
    .then(({data, total}) => {
      lastStockData = data;
      totalItems = total;
      renderStockTable(data, threshold);
      renderPagination();
      loadingDiv.style.display = 'none';
    })
    .catch(() => {
      stockTableBody.innerHTML = '<tr><td colspan="5" style="color:#b00020;">Failed to load data.</td></tr>';
      summaryDiv.textContent = '';
      paginationDiv.innerHTML = '';
      loadingDiv.style.display = 'none';
    });
}

// --- Render Table ---
function renderStockTable(data, threshold) {
  stockTableBody.innerHTML = '';
  if (!data || data.length === 0) {
    stockTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No items found.</td></tr>';
    summaryDiv.textContent = '';
    return;
  }
  let lowCount = 0, outCount = 0;
  data.forEach(row => {
    const stockVal = parseFloat(row.stock) || 0;
    if (stockVal < threshold) lowCount++;
    if (stockVal === 0) outCount++;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.item_name}</td>
      <td>${row.barcode}</td>
      <td>${Number(row.price).toLocaleString(undefined, {minimumFractionDigits: 3})}</td>
      <td>${row.expiry ? formatDate(row.expiry) : ''}</td>
      <td>${stockVal}</td>
    `;
    if (stockVal < threshold) tr.classList.add('low-stock-row');
    stockTableBody.appendChild(tr);
  });
  summaryDiv.textContent =
    `Total: ${totalItems} | Low stock: ${lowCount} | Out of stock: ${outCount}`;
}

// --- Render Pagination ---
function renderPagination() {
  const totalPages = Math.ceil(totalItems / perPage);
  if (totalPages <= 1) {
    paginationDiv.innerHTML = '';
    return;
  }
  let html = '';
  // Show up to 7 buttons, center on currentPage
  const pageWindow = 3;
  let start = Math.max(1, currentPage - pageWindow);
  let end = Math.min(totalPages, currentPage + pageWindow);
  if (currentPage - pageWindow < 1) end = Math.min(totalPages, end + (1 - (currentPage - pageWindow)));
  if (currentPage + pageWindow > totalPages) start = Math.max(1, start - ((currentPage + pageWindow) - totalPages));

  if (start > 1) html += `<button data-page="1">1</button>${start > 2 ? '<span style="margin:0 5px;">...</span>' : ''}`;
  for (let i = start; i <= end; i++) {
    html += `<button class="${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
  }
  if (end < totalPages) html += `${end < totalPages - 1 ? '<span style="margin:0 5px;">...</span>' : ''}<button data-page="${totalPages}">${totalPages}</button>`;
  paginationDiv.innerHTML = html;

  // Add click listeners
  Array.from(paginationDiv.querySelectorAll('button')).forEach(btn => {
    btn.onclick = e => {
      currentPage = parseInt(btn.getAttribute('data-page'));
      fetchAndRenderStock(currentPage);
    };
  });
}

// --- Events ---
searchInput.addEventListener('input', debounce(() => { currentPage = 1; fetchAndRenderStock(); }, 350));
thresholdInput.addEventListener('input', debounce(() => { currentPage = 1; fetchAndRenderStock(); }, 100));
perPageInput.addEventListener('input', () => { currentPage = 1; fetchAndRenderStock(); });
refreshBtn.addEventListener('click', () => { currentPage = 1; fetchAndRenderStock(); });

// --- Export to Excel (current filter only, not paginated) ---
exportBtn.addEventListener('click', () => {
  const threshold = parseFloat(thresholdInput.value) || 5;
  const q = searchInput.value || '';
  exportBtn.disabled = true;
  exportBtn.textContent = "Exporting...";
  fetch('/api/export-stock-report-RT65z', {
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
    a.download = 'stock_report.xlsx';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
    exportBtn.disabled = false;
    exportBtn.textContent = "Export to Excel";
  }).catch(() => {
    exportBtn.disabled = false;
    exportBtn.textContent = "Export to Excel";
    alert('Excel export failed.');
  });
});

// --- Debounce utility ---
function debounce(fn, delay) {
  let timeout = null;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), delay);
  };
}

// --- On page load ---
window.addEventListener('DOMContentLoaded', () => {
  fetchAndRenderStock();
});

// --- User Info Fetcher ---
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
    .catch(() => {});
}
