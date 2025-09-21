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
          userPhoto.src = 'public/default-profile.png';
        };
        userPhoto.src = `/api/user-photo/${user.userId}`;
      }
    })
    .catch(() => {});
}

// --- Logout ---
document.addEventListener('DOMContentLoaded', () => {
  fetchUserInfo();
  document.getElementById('logout-btn').addEventListener('click', () => {
    fetch('/logout').then(() => window.location.href = '/');
  });
});

// --- Item Search Logic ---
const searchInput = document.getElementById('item-search-input');
const suggestionsBox = document.getElementById('item-search-suggestions');
let searchTimeout = null;

searchInput.addEventListener('input', function() {
  const q = this.value.trim();
  if (searchTimeout) clearTimeout(searchTimeout);
  if (!q) {
    suggestionsBox.style.display = "none";
    return;
  }
  searchTimeout = setTimeout(() => {
    fetch('/api/search-items?q=' + encodeURIComponent(q))
      .then(res => res.json())
      .then(data => {
        if (!data.length) {
          suggestionsBox.innerHTML = '<ul><li style="color:#888;">No results found.</li></ul>';
          suggestionsBox.style.display = "block";
          return;
        }
        suggestionsBox.innerHTML =
          '<ul>' +
          data.map(item =>
            `<li data-id="${item.id}">
              <strong>${item.item_name}</strong>
              ${item.active_name_1 ? `<span style="color:#999;"> | ${item.active_name_1}</span>` : ''}
              ${item.active_name_2 ? `<span style="color:#999;">, ${item.active_name_2}</span>` : ''}
              <span style="color:#aaa; float:right; font-size:0.95em;">${item.barcode || ''}</span>
            </li>`
          ).join('') +
          '</ul>';
        suggestionsBox.style.display = "block";
      });
  }, 220);
});

suggestionsBox.addEventListener('click', function(e) {
  let li = e.target;
  while (li && li.tagName !== 'LI') li = li.parentElement;
  if (!li || !li.dataset.id) return;
  const itemId = li.dataset.id;
  suggestionsBox.style.display = "none";
  searchInput.value = li.querySelector('strong')?.textContent || '';
  loadItem(itemId);
});

document.addEventListener('click', function(e) {
  if (!searchInput.contains(e.target) && !suggestionsBox.contains(e.target)) {
    suggestionsBox.style.display = "none";
  }
});

// --- Fill Item Info ---
function fillItemInfo(item) {
  document.getElementById('item-name').textContent = item.item_name || '--';
  document.getElementById('item-id-label').textContent = item.id ? `ID: ${item.id}` : '';
  document.getElementById('active-ingredient').textContent =
    [item.active_name_1, item.active_name_2].filter(Boolean).join(' | ') || 'N/A';
  document.getElementById('barcode').textContent = "Barcode: " + (item.barcode || '--');
  document.getElementById('price').textContent = "Price: " + (item.price != null ? item.price + " OMR" : '--');

  // --- Stock & Expiry (Batch-aware with fallback) ---
  let finalStock = null, finalExpiry = null;
  if (item.batches && item.batches.length > 0) {
    let totalStock = 0;
    let nearestExpiry = null;
    item.batches.forEach(b => {
      if (b.quantity != null) totalStock += Number(b.quantity);
      if (b.expiry && (!nearestExpiry || new Date(b.expiry) < new Date(nearestExpiry))) nearestExpiry = b.expiry;
    });
    finalStock = totalStock;
    finalExpiry = nearestExpiry;
  }
  // Fallback to legacy
  if ((typeof finalStock === "undefined" || finalStock === null) && item.stock != null) {
    finalStock = item.stock;
  }
  if ((typeof finalExpiry === "undefined" || finalExpiry === null) && item.expiry) {
    finalExpiry = item.expiry;
  }
  document.getElementById('stock').textContent = "Stock: " + (finalStock != null ? finalStock : '--');
  document.getElementById('expiry').textContent = finalExpiry
    ? new Date(finalExpiry).toLocaleDateString('en-GB')
    : '--';

  document.getElementById('packet-size').textContent = item.packet_size != null ? item.packet_size : '--';
  document.getElementById('location').textContent = item.location || '--';
  document.getElementById('cross-selling').textContent = item.cross_selling || '--';
  document.getElementById('side-effects').textContent = item.significant_side_effects || '--';
  document.getElementById('interactions').textContent = item.significant_interactions || '--';
  document.getElementById('uses').textContent = item.uses || '--';
  document.getElementById('dosage').textContent = item.dosage || '--';

  // Item image
  const imgEl = document.getElementById('item-photo');
  imgEl.onerror = function() {
    imgEl.onerror = null; // Prevent endless loop
    imgEl.src = '/uploads/default-medicine.png';
  };
  imgEl.src = '/api/pos/medicines/photo/' + item.id;

  // Batch breakdown table (optional)
  const batchTableDiv = document.getElementById('item-batch-table');
  if (batchTableDiv) {
    if (item.batches && item.batches.length > 0) {
      let batchTableHtml = `
        <table style="width:100%; margin-top:1em;">
          <tr style="background:#ffeeba;">
            <th>Batch Number</th>
            <th>Expiry</th>
            <th>Quantity</th>
          </tr>
          ${item.batches.map(b => `
            <tr>
              <td>${b.batch_number || '-'}</td>
              <td>${b.expiry ? new Date(b.expiry).toLocaleDateString('en-GB') : '-'}</td>
              <td>${b.quantity != null ? b.quantity : '-'}</td>
            </tr>
          `).join('')}
        </table>
      `;
      batchTableDiv.innerHTML = batchTableHtml;
    } else {
      batchTableDiv.innerHTML = '';
    }
  }
}

// --- Load Item by ID ---
function loadItem(itemId) {
  if (!itemId) {
    document.getElementById('item-name').textContent = 'No item selected';
    return;
  }
  fetch('/api/item-master/' + itemId)
    .then(res => {
      if (!res.ok) throw new Error('Not found');
      return res.json();
    })
    .then(fillItemInfo)
    .catch(() => {
      document.getElementById('item-name').textContent = 'Item not found';
    });
}

// --- Deep link support on initial load (?id=xx) ---
window.addEventListener('DOMContentLoaded', () => {
  const initialId = new URLSearchParams(window.location.search).get('id');
  if (initialId) loadItem(initialId);
});
