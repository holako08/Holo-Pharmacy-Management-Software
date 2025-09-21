let transferList = [];
let srrModalData = [];
let currentSRRID = null; // To track for STN

function updateProfilePicture() {
    // Fetch user info and photo and update the DOM
    fetch('/api/user-info')
        .then(r => r.json())
        .then(data => {
            if (data && data.user) {
                document.getElementById('user-name').textContent = data.user.fullName || data.user.username;
                document.getElementById('user-job-title').textContent = data.user.jobTitle || '';
                // If a photo path exists, set it, else use default
                if (data.user.photo && data.user.photo !== '') {
                    document.getElementById('user-photo').src = data.user.photo.startsWith('uploads/')
                        ? '/' + data.user.photo
                        : data.user.photo;
                } else {
                    document.getElementById('user-photo').src = 'images/default-profile.png';
                }
            }
        })
        .catch(() => {
            // Fallback to default image
            document.getElementById('user-photo').src = 'images/default-profile.png';
        });
}



document.addEventListener('DOMContentLoaded', function () {
    updateProfilePicture();
    window.logout = logout;

    // Search
    const searchInput = document.getElementById('search-medicine');
    const searchResults = document.getElementById('search-results');
    let searchTimeout = null;

    searchInput.addEventListener('input', function () {
        const query = this.value.trim();
        if (!query) {
            searchResults.style.display = 'none';
            return;
        }
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            fetch('/api/pos/medicines/search-with-batches?q=' + encodeURIComponent(query))
                .then(r => r.json())
                .then(data => {
                    if (Array.isArray(data) && data.length > 0) {
                        searchResults.innerHTML = '';
                        data.forEach(med => {
                            const div = document.createElement('div');
                            div.textContent = `${med.item_name} (Batch: ${med.batch_number || "N/A"}, Exp: ${med.expiry || "-"})`;
                            div.onclick = () => showBatchList(med.id, med.item_name);
                            searchResults.appendChild(div);
                        });
                        searchResults.style.display = 'block';
                    } else {
                        searchResults.innerHTML = '<div>No results</div>';
                        searchResults.style.display = 'block';
                    }
                });
        }, 350);
    });

    // Hide results on outside click
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
            searchResults.style.display = 'none';
        }
    });

    // Add transfer handler
    document.getElementById('submit-transfer').onclick = handleSubmitTransfer;

    // SRR Parse Handler
    document.getElementById('parse-srr-btn').onclick = function() {
        const fileInput = document.getElementById('srr-file');
        if (!fileInput.files.length) return alert('Choose SRR file');
        const fd = new FormData();
        fd.append('srrfile', fileInput.files[0]);
        fetch('/api/stock-mgmt-x9z/parse-srr-file', { method: 'POST', body: fd })
            .then(r => r.json())
            .then(resp => {
                if (!resp.items) return alert('Could not parse SRR');
                showSRRModal(resp.items, resp.srr_id || null); // You must pass the srr_id from your backend parse response!
            });
    };

    // PDF/TXT download with SRR reference if present
    const stnLink = document.getElementById('stn-link');
    const txtLink = document.getElementById('txt-link');
    if (stnLink) {
        stnLink.onclick = function(e) {
            e.preventDefault();
            if (!stnLink.href || stnLink.href.endsWith('#')) return;
            let url = stnLink.href;
            if (currentSRRID) url += `?srr_id=${currentSRRID}`;
            fetch(url)
            .then(resp => {
                if (!resp.ok) throw new Error("File not found or server error");
                return resp.blob();
            })
            .then(blob => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = "STN.pdf";
                a.style.display = "none";
                document.body.appendChild(a);
                a.click();
                URL.revokeObjectURL(url);
                a.remove();
            })
            .catch(err => alert("Error downloading PDF: " + err.message));
        };
    }
    if (txtLink) {
        txtLink.onclick = function(e) {
            e.preventDefault();
            if (!txtLink.href || txtLink.href.endsWith('#')) return;
            let url = txtLink.href;
            if (currentSRRID) url += `?srr_id=${currentSRRID}`;
            fetch(url)
            .then(resp => {
                if (!resp.ok) throw new Error("File not found or server error");
                return resp.blob();
            })
            .then(blob => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = "STN.txt";
                a.style.display = "none";
                document.body.appendChild(a);
                a.click();
                URL.revokeObjectURL(url);
                a.remove();
            })
            .catch(err => alert("Error downloading TXT: " + err.message));
        };
    }
});

// =========== Modal logic for SRR: let user pick batch! ===========
function showSRRModal(items, srr_id = null) {
    currentSRRID = srr_id; // Store for STN
    srrModalData = items.map(it => ({
        item_name: it.item_name,
        qty: it.qty,
        batch: null,
        expiry: null,
        availableBatches: [],
        stock: null,
        done: false
    }));
    // Fetch batches for all items and render
    Promise.all(
        srrModalData.map((it, idx) =>
            fetch('/api/pos/medicines/get-by-name/' + encodeURIComponent(it.item_name))
                .then(r => r.json())
                .then(data => {
                    if (data.batches && data.batches.length) {
                        it.availableBatches = data.batches;
                    } else {
                        it.availableBatches = [{
                            batch_number: 'BTC111',
                            expiry: data.expiry ? data.expiry.split('T')[0] : '2099-12-31',
                            quantity: data.stock !== null && data.stock !== undefined ? data.stock : 100
                        }];
                    }
                })
        )
    ).then(renderSRRModal);
    document.getElementById('import-srr-modal').style.display = 'flex';
}

function renderSRRModal() {
    const tbody = document.querySelector('#srr-modal-table tbody');
    tbody.innerHTML = '';
    srrModalData.forEach((it, idx) => {
        let action = '';
        if (it.done) {
            action = '<span style="color:#26b052;font-weight:600;">Assigned</span>';
        } else {
            action = `<button class="srr-batch-btn" onclick="chooseBatchSRR(${idx})">Choose Batch</button>`;
        }
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${it.item_name}</td>
            <td>${it.qty}</td>
            <td>
                ${it.done
                    ? `<b>${it.batch}</b> / <span style="color:#555">${it.expiry}</span>`
                    : '-'
                }
            </td>
            <td>${action}</td>
        `;
        tbody.appendChild(tr);
    });
}

// Let user select batch for a row in modal
window.chooseBatchSRR = function(idx) {
    const it = srrModalData[idx];
    // Simple browser prompt, you can make this a nicer modal if you want!
    let batchOptions = it.availableBatches.map((b, i) =>
        `${i + 1}. ${b.batch_number} (Exp: ${b.expiry ? b.expiry.split('T')[0] : '-'}, Stock: ${b.quantity})`
    ).join('\n');
    let chosenIdx = prompt(
        `Choose batch for ${it.item_name} (Requested: ${it.qty}):\n${batchOptions}\nEnter batch number (1-${it.availableBatches.length}):`
    );
    if (!chosenIdx) return;
    let n = parseInt(chosenIdx);
    if (isNaN(n) || n < 1 || n > it.availableBatches.length) {
        alert('Invalid batch selection.');
        return;
    }
    const batch = it.availableBatches[n - 1];
    let maxQty = batch.quantity;
    let qty = prompt(`Enter quantity to assign from this batch (max: ${maxQty}, requested: ${it.qty}):`, it.qty);
    if (!qty) return;
    qty = parseFloat(qty);
    if (isNaN(qty) || qty <= 0) {
    alert('Invalid quantity.');
    return;
}
    it.batch = batch.batch_number;
    it.expiry = batch.expiry ? batch.expiry.split('T')[0] : '-';
    it.qty = qty;
    it.done = true;
    renderSRRModal();
}

function closeSRRModal() {
    document.getElementById('import-srr-modal').style.display = 'none';
    srrModalData.forEach(it => {
        if (it.done) {
            addToTransferList({
                item_name: it.item_name,
                batch: it.batch,
                expiry: it.expiry,
                quantity: it.qty,
                stock: it.qty // For requests, stock = assigned qty
            });
        }
    });
}

// ========= Batch list for search (no change) ==========
function showBatchList(medId, itemName) {
    fetch('/api/pos/medicines/get-by-id/' + medId)
        .then(r => r.json())
        .then(data => {
            const container = document.getElementById('batch-list');
            container.innerHTML = `<h4>Select Batch for <b>${itemName}</b></h4>`;
            if (!data.batches || !data.batches.length) {
                const expiry = data.expiry ? data.expiry.split('T')[0] : '2099-12-31';
                const stock = (data.stock !== null && data.stock !== undefined) ? data.stock : 100;
                const table = document.createElement('table');
                table.innerHTML = `
                    <tr>
                        <th>Batch No.</th>
                        <th>Expiry</th>
                        <th>Stock</th>
                        <th>Qty to Transfer</th>
                        <th>Add</th>
                    </tr>
                    <tr>
                        <td>BTC111</td>
                        <td>${expiry}</td>
                        <td>${stock}</td>
                        <td><input type="number" min="0.01" step="any" max="${stock}" value="1" style="width:55px;"></td>
                        <td><button>Add</button></td>
                    </tr>
                `;
                const addBtn = table.querySelector('button');
                addBtn.onclick = () => {
                    const qty = parseFloat(table.querySelector('input').value);
                    if (!qty || qty <= 0 || qty > stock) {
                        alert('Invalid quantity');
                        return;
                    }
                    addToTransferList({
                        item_name: itemName,
                        batch: 'BTC111',
                        expiry: expiry,
                        quantity: qty,
                        stock: stock
                    });
                };
                container.appendChild(table);
                return;
            }
            const table = document.createElement('table');
            table.innerHTML = `
                <tr>
                    <th>Batch No.</th>
                    <th>Expiry</th>
                    <th>Stock</th>
                    <th>Qty to Transfer</th>
                    <th>Add</th>
                </tr>
            `;
            data.batches.forEach(b => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${b.batch_number}</td>
                    <td>${b.expiry ? b.expiry.split('T')[0] : '-'}</td>
                    <td>${b.quantity}</td>
                    <td><input type="number" min="0.01" step="any" max="${b.quantity}" value="1" style="width:55px;"></td>
                    <td><button>Add</button></td>
                `;
                tr.querySelector('button').onclick = () => {
                    const qty = parseFloat(tr.querySelector('input').value);
                    if (!qty || qty <= 0 || qty > b.quantity) {
                        alert('Invalid quantity');
                        return;
                    }
                    addToTransferList({
                        item_name: itemName,
                        batch: b.batch_number,
                        expiry: b.expiry ? b.expiry.split('T')[0] : '-',
                        quantity: qty,
                        stock: b.quantity
                    });
                };
                table.appendChild(tr);
            });
            container.appendChild(table);
        });
}

// ========== ADD/REMOVE TRANSFER TABLE ==============
function addToTransferList(item) {
    const idx = transferList.findIndex(t => t.item_name === item.item_name && t.batch === item.batch);
    if (idx !== -1) {
        if (transferList[idx].quantity + item.quantity > item.stock) {
            alert('Total quantity exceeds available stock.');
            return;
        }
        transferList[idx].quantity += item.quantity;
    } else {
        transferList.push(item);
    }
    renderTransferTable();
}

function renderTransferTable() {
    const tbody = document.querySelector('#transfer-table tbody');
    tbody.innerHTML = '';
    transferList.forEach((item, i) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.item_name}</td>
            <td>${item.batch}</td>
            <td>${item.expiry}</td>
            <td>${item.quantity}</td>
            <td>${item.stock}</td>
            <td><button onclick="removeTransferItem(${i})">🗑️</button></td>
        `;
        tbody.appendChild(tr);
    });
}

window.removeTransferItem = function (idx) {
    transferList.splice(idx, 1);
    renderTransferTable();
}

// ========= SUBMIT TRANSFER =========
function handleSubmitTransfer() {
    const branchFrom = document.getElementById('branch-from').value;
    const branchTo = document.getElementById('branch-to').value;
    if (!branchTo) return alert('Select receiving branch.');
    if (!transferList.length) return alert('Add at least one item to transfer.');
    for (let i = 0; i < transferList.length; i++) {
        if (!transferList[i].quantity || transferList[i].quantity <= 0 || transferList[i].quantity > transferList[i].stock) {
            return alert(`Check quantity for ${transferList[i].item_name}, batch ${transferList[i].batch}`);
        }
    }
    const payload = {
        items: transferList.map(x => x.item_name),
        quantities: transferList.map(x => x.quantity),
        batches: transferList.map(x => x.batch),
        expiry_dates: transferList.map(x => x.expiry),
        branch_from: branchFrom,
        branch_to: branchTo,
        based_on_srr: currentSRRID // Pass the SRR reference if available!
    };
    document.getElementById('submit-transfer').disabled = true;
    fetch('/api/stock-mgmt-x9z/process-transfer', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
    })
    .then(r => r.json())
    .then(resp => {
        document.getElementById('submit-transfer').disabled = false;
        if (resp.success && resp.transfer_id) {
            document.getElementById('transfer-success').style.display = '';
            let stnUrl = '/api/stock-mgmt-x9z/generate-stn/' + resp.transfer_id;
            let txtUrl = '/api/stock-mgmt-x9z/generate-transfer-file/' + resp.transfer_id;
            if (currentSRRID) {
                stnUrl += `?srr_id=${currentSRRID}`;
                txtUrl += `?srr_id=${currentSRRID}`;
            }
            document.getElementById('stn-link').href = stnUrl;
            document.getElementById('txt-link').href = txtUrl;
            transferList = [];
            renderTransferTable();
        } else {
            alert(resp.error || 'Failed to process transfer.');
        }
    })
    .catch(() => {
        document.getElementById('submit-transfer').disabled = false;
        alert('Error processing transfer');
    });
}

// ========== USER PHOTO & LOGOUT ===========
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


window.closeSRRModal = closeSRRModal;
