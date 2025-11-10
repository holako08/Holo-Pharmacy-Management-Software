let currentLoadedItemData = null;
const downloadBtn = document.getElementById('download-item-btn');
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
  
  // **UPDATED** to include active_name_3
  document.getElementById('active-ingredient').textContent =
    [item.active_name_1, item.active_name_2, item.active_name_3].filter(Boolean).join(' | ') || 'N/A';
  
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

  // **NEW** fields added
  document.getElementById('arabic-name').textContent = item.arabic_name || '--';
  document.getElementById('supplier').textContent = item.supplier || '--';
  
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

  // **UPDATED** Batch breakdown table
  const batchTableDiv = document.getElementById('item-batch-table');
  if (batchTableDiv) {
    if (item.batches && item.batches.length > 0) {
      let batchTableHtml = `
        <h3 style="margin-top: 1.5em; margin-bottom: 0.5em; color: #555;">Batch Details</h3>
        <table style="width:100%; margin-top:0;">
          <tr style="background:#ffeeba;">
            <th>Batch Number</th>
            <th>Expiry</th>
            <th>Quantity</th>
            <th>Branch</th>
            <th>Received Date</th>
          </tr>
          ${item.batches.map(b => `
            <tr>
              <td>${b.batch_number || '-'}</td>
              <td>${b.expiry ? new Date(b.expiry).toLocaleDateString('en-GB') : '-'}</td>
              <td>${b.quantity != null ? b.quantity : '-'}</td>
              <td>${b.branch || 'N/A'}</td>
              <td>${b.received_date ? new Date(b.received_date).toLocaleDateString('en-GB') : '-'}</td>
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
// --- Download Item Data as TXT ---
function downloadItemData() {
  if (!currentLoadedItemData) {
    alert('No item data to download.');
    return;
  }
  
  const item = currentLoadedItemData;

  // Format the batch details into a readable string
  let batchDetails = 'No batch information available.';
  if (item.batches && item.batches.length > 0) {
    batchDetails = item.batches.map(b => 
      `Batch: ${b.batch_number || '-'} | Expiry: ${b.expiry ? new Date(b.expiry).toLocaleDateString('en-GB') : '-'} | Qty: ${b.quantity != null ? b.quantity : '-'} | Branch: ${b.branch || 'N/A'}`
    ).join('\n');
  }

  // Combine all item information into a single string
  const fileContent = `
Item Name: ${item.item_name || 'N/A'}
ID: ${item.id || 'N/A'}
Arabic Name: ${item.arabic_name || 'N/A'}
Active Ingredients: ${[item.active_name_1, item.active_name_2, item.active_name_3].filter(Boolean).join(' | ') || 'N/A'}
----------------------------------------------------
Barcode: ${item.barcode || 'N/A'}
Price: ${item.price != null ? item.price + " OMR" : 'N/A'}
Total Stock: ${document.getElementById('stock').textContent.replace('Stock: ','')}
Nearest Expiry: ${document.getElementById('expiry').textContent}
Packet Size: ${item.packet_size != null ? item.packet_size : 'N/A'}
Supplier: ${item.supplier || 'N/A'}
Location: ${item.location || 'N/A'}
----------------------------------------------------
Uses: ${item.uses || 'N/A'}
Dosage: ${item.dosage || 'N/A'}
Significant Side Effects: ${item.significant_side_effects || 'N/A'}
Significant Interactions: ${item.significant_interactions || 'N/A'}
Cross-Selling: ${item.cross_selling || 'N/A'}
----------------------------------------------------
Batch Details:
${batchDetails}
  `.trim();

  // Create a Blob from the content
  const blob = new Blob([fileContent], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  
  // Create a temporary link to trigger the download
  const a = document.createElement('a');
  a.href = url;
  a.download = `${item.item_name.replace(/ /g, '_')}_data.txt`; // Create a safe filename
  document.body.appendChild(a);
  a.click();
  
  // Clean up by removing the link and revoking the URL
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Add an event listener for the new button
if (downloadBtn) {
  downloadBtn.addEventListener('click', downloadItemData);
}


// --- Fill Item Info (UPDATED) ---
function fillItemInfo(item) {
  // Store the full item data globally for the download function
  currentLoadedItemData = item;
  
  // Show and enable the download button
  if (downloadBtn) {
    downloadBtn.style.display = 'inline-block';
    downloadBtn.disabled = false;
  }

  document.getElementById('item-name').textContent = item.item_name || '--';
  document.getElementById('item-id-label').textContent = item.id ? `ID: ${item.id}` : '';
  
  document.getElementById('active-ingredient').textContent =
    [item.active_name_1, item.active_name_2, item.active_name_3].filter(Boolean).join(' | ') || 'N/A';
  
  document.getElementById('barcode').textContent = "Barcode: " + (item.barcode || '--');
  document.getElementById('price').textContent = "Price: " + (item.price != null ? item.price + " OMR" : '--');

  // Stock & Expiry (Batch-aware with fallback)
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

  document.getElementById('arabic-name').textContent = item.arabic_name || '--';
  document.getElementById('supplier').textContent = item.supplier || '--';
  document.getElementById('packet-size').textContent = item.packet_size != null ? item.packet_size : '--';
  document.getElementById('location').textContent = item.location || '--';
  document.getElementById('cross-selling').textContent = item.cross_selling || '--';
  document.getElementById('side-effects').textContent = item.significant_side_effects || '--';
  document.getElementById('interactions').textContent = item.significant_interactions || '--';
  document.getElementById('uses').textContent = item.uses || '--';
  document.getElementById('dosage').textContent = item.dosage || '--';

  const imgEl = document.getElementById('item-photo');
  imgEl.onerror = function() {
    imgEl.onerror = null;
    imgEl.src = '/uploads/default-medicine.png';
  };
  imgEl.src = '/api/pos/medicines/photo/' + item.id;

  const batchTableDiv = document.getElementById('item-batch-table');
  if (batchTableDiv) {
    if (item.batches && item.batches.length > 0) {
      let batchTableHtml = `
        <h3 style="margin-top: 1.5em; margin-bottom: 0.5em; color: #555;">Batch Details</h3>
        <table style="width:100%; margin-top:0;">
          <tr style="background:#ffeeba;">
            <th>Batch Number</th>
            <th>Expiry</th>
            <th>Quantity</th>
            <th>Branch</th>
            <th>Received Date</th>
          </tr>
          ${item.batches.map(b => `
            <tr>
              <td>${b.batch_number || '-'}</td>
              <td>${b.expiry ? new Date(b.expiry).toLocaleDateString('en-GB') : '-'}</td>
              <td>${b.quantity != null ? b.quantity : '-'}</td>
              <td>${b.branch || 'N/A'}</td>
              <td>${b.received_date ? new Date(b.received_date).toLocaleDateString('en-GB') : '-'}</td>
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


// --- Load Item by ID (UPDATED) ---
function loadItem(itemId) {
  if (!itemId) {
    document.getElementById('item-name').textContent = 'No item selected';
    // Clear data and hide button if no item is selected
    currentLoadedItemData = null;
    if(downloadBtn) downloadBtn.style.display = 'none';
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
      // Clear data and hide button on error
      currentLoadedItemData = null;
      if(downloadBtn) downloadBtn.style.display = 'none';
    });
}