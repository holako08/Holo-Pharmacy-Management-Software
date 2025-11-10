let transferList = [];
let srrModalData = [];
let currentSRRID = null; // To track for STN
let currentUserBranch = '';

function updateProfilePicture() {
    // Fetch user info and photo and update the DOM
    fetch('/api/user-info')
        .then(r => r.json())
        .then(data => {
            if (data && data.user) {
                document.getElementById('user-name').textContent = data.user.fullName || data.user.username;
                document.getElementById('user-job-title').textContent = data.user.jobTitle || '';
                // MODIFIED: Store the user's branch from session
                currentUserBranch = data.user.branch || '';
                const fromBranchSelect = document.getElementById('branch-from');
                if(fromBranchSelect) fromBranchSelect.value = currentUserBranch;
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
        if (!fileInput.files.length) return alert('Choose an SRR file to parse.');
        const fd = new FormData();
        fd.append('srrfile', fileInput.files[0]);
        fetch('/api/stock-mgmt-x9z/parse-srr-file', { method: 'POST', body: fd })
            .then(r => r.json())
            .then(resp => {
                if (resp.success === false) return alert(resp.message); // Handles "already transferred" error
                if (!resp.items) return alert('Could not parse SRR file.');
                showSRRModal(resp.items, resp.srr_id || null);
            });
    };
    // NEW: SRR ID Search Handler
    document.getElementById('srr-id-search-btn').onclick = function() {
        const srrId = document.getElementById('srr-id-search').value.trim();
        if (!srrId) return alert('Please enter an SRR ID to search.');
        
        fetch(`/api/stock-mgmt-x9z/request/${srrId}`)
            .then(r => r.json())
            .then(resp => {
                if (resp.success === false) return alert(resp.message); // Handles "already transferred" error
                if (!resp.items) return alert('Could not find or load this SRR ID.');
                showSRRModal(resp.items, srrId);
            })
            .catch(err => alert(`Error: ${err.message}`));
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
// MODIFIED FUNCTION
function showSRRModal(items, srr_id = null) {
    currentSRRID = srr_id;
    srrModalData = items.map(it => ({
        item_name: it.item_name,
        qty: it.qty,
        batch: null,
        expiry: null,
        stock: null, // This will be the stock of the chosen batch
        availableBatches: [],
        done: false
    }));
    
    // Fetch batches for all items and render
    Promise.all(
        srrModalData.map(it =>
            fetch('/api/pos/medicines/get-by-name/' + encodeURIComponent(it.item_name))
                .then(r => {
                    if (!r.ok) { // Check for HTTP errors like 404
                        throw new Error(`HTTP error! status: ${r.status}`);
                    }
                    return r.json();
                })
                .then(data => {
                    if (data.batches && data.batches.length) {
                        // Filter batches to only include those from the current user's branch
                        it.availableBatches = data.batches.filter(b => b.branch === currentUserBranch);
                    } else if (data.stock !== null && data.stock !== undefined) {
                        // Fallback for legacy items with no batch records
                        it.availableBatches = [{
                            batch_number: 'BTC111', // Default batch name
                            expiry: data.expiry ? data.expiry.split('T')[0] : '2099-12-31',
                            quantity: data.stock,
                            branch: currentUserBranch // Assume it's in the current branch
                        }];
                    } else {
                        it.availableBatches = [];
                    }
                })
                .catch(err => {
                    // **THE FIX IS HERE**
                    // If a fetch fails for one item, log it and continue with the others.
                    console.error(`Failed to fetch batches for "${it.item_name}":`, err.message);
                    it.availableBatches = []; // Ensure it has an empty array so it doesn't break later
                })
        )
    )
    .then(() => {
        // This .then() will now always execute.
        renderSRRModal();
    })
    .catch(err => {
        // General catch block for unexpected errors in Promise.all itself
        console.error("A critical error occurred while processing SRR items:", err);
        alert("An error occurred. Check the console for details.");
    });

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
    if (!it.availableBatches || it.availableBatches.length === 0) {
        alert(`No stock available for "${it.item_name}" in your branch (${currentUserBranch}).`);
        return;
    }
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
    it.stock = batch.quantity; // Store the original stock of the batch
    it.qty = qty; // Update with the actually assigned quantity
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
                quantity: it.qty, // The assigned quantity
                stock: it.stock  // The original stock of the chosen batch
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
window.closeSRRModal = closeSRRModal;
