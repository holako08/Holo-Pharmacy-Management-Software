// purchase-order.js

// =========== CONFIG ===========
// Backend endpoints
const ENDPOINT_AGENCY_SEARCH = '/api/agencies'; // Implement this in backend (agency table)
const ENDPOINT_MEDICINE_SEARCH = '/api/pos/medicines/search';
const ENDPOINT_SAVE_PO = '/api/purchase-orders/create'; // To be created in backend
const ENDPOINT_EXPORT_PDF = '/api/purchase-orders/export-pdf'; // To be created in backend
const ENDPOINT_EXPORT_XLSX = '/api/purchase-orders/export-xlsx'; // To be created in backend

// =========== SESSION MANAGEMENT ===========
let currentUserId = null;

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
        
        // Set pharmacist field and store user ID
        document.getElementById('pharmacist').value = userInfo.fullName || userInfo.username;
        currentUserId = userInfo.userId;
        
    } catch (error) {
        window.location.href = 'index.html';
        return;
    }

    // Request server for new PO ID
    fetch('/api/purchase-orders/next-po-id')
        .then(res => res.json())
        .then(data => {
            if (data.po_id) document.getElementById('po-id').value = data.po_id;
        })
        .catch(err => console.error('Error fetching next PO ID:', err));
        
    // Set today's date
    const dateInput = document.getElementById('po-date');
    if (dateInput && !dateInput.value) {
        const now = new Date();
        dateInput.value = now.toISOString().slice(0,10);
    }
});

function logout() {
    window.location.href = 'index.html';
}

// ========== GLOBAL STATE ==========
let agencySelected = null;
let medicinesCache = {}; // {id: {id, item_name, ...}}
let lineId = 0;

// ========== HELPERS ==========
function debounce(func, delay) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => func.apply(this, args), delay);
    };
}

function formatCurrency(num) {
    return Number(num).toLocaleString(undefined, {minimumFractionDigits: 3, maximumFractionDigits: 3});
}

// ========== AGENCY SEARCH ==========
const agencyInput = document.getElementById('agency-search');
const agencySuggestions = document.getElementById('agency-suggestions');

// Debounced agency search
agencyInput.addEventListener('input', debounce(function (e) {
    const query = agencyInput.value.trim();
    if (!query) {
        agencySuggestions.innerHTML = '';
        agencySuggestions.classList.remove('active');
        agencySelected = null;
        return;
    }
    fetch(`${ENDPOINT_AGENCY_SEARCH}?q=${encodeURIComponent(query)}`)
        .then(res => res.json())
        .then(data => {
            agencySuggestions.innerHTML = '';
            if (!Array.isArray(data) || data.length === 0) {
                agencySuggestions.classList.remove('active');
                return;
            }
            data.forEach(agency => {
                const div = document.createElement('div');
                div.textContent = agency.name || agency.agency_name || agency.title || agency; // support various fields
                div.addEventListener('mousedown', () => {
                    agencyInput.value = div.textContent;
                    agencySuggestions.classList.remove('active');
                    agencySelected = agency;
                });
                agencySuggestions.appendChild(div);
            });
            agencySuggestions.classList.add('active');
        })
        .catch(err => console.error('Agency search error:', err));
}, 300));

agencyInput.addEventListener('blur', () => setTimeout(() => agencySuggestions.classList.remove('active'), 150));

// ========== DYNAMIC MEDICINE ROWS ==========
const itemsTbody = document.getElementById('po-items-tbody');
const addRowBtn = document.getElementById('add-row-btn');

// Initial empty row
addMedicineRow();

addRowBtn.addEventListener('click', () => addMedicineRow());

function addMedicineRow(data = {}) {
    lineId++;
    const tr = document.createElement('tr');
    tr.setAttribute('data-line-id', lineId);

    // Medicine name search
    const tdName = document.createElement('td');
    const medInput = document.createElement('input');
    medInput.type = 'text';
    medInput.className = 'med-search-input';
    medInput.placeholder = 'Type to search medicine...';
    medInput.autocomplete = 'off';
    medInput.value = data.item_name || '';
    const medSug = document.createElement('div');
    medSug.className = 'suggestions';

    tdName.appendChild(medInput);
    tdName.appendChild(medSug);

    // Quantity
    const tdQty = document.createElement('td');
    const qtyInput = document.createElement('input');
    qtyInput.type = 'number';
    qtyInput.min = '0.001';
    qtyInput.step = '0.001';
    qtyInput.value = data.quantity || '';
    qtyInput.required = true;
    tdQty.appendChild(qtyInput);

    // Wholesale price
    const tdPrice = document.createElement('td');
    const priceInput = document.createElement('input');
    priceInput.type = 'number';
    priceInput.min = '0';
    priceInput.step = '0.001';
    priceInput.value = data.wholesale_price || '';
    tdPrice.appendChild(priceInput);

    // FOC
    const tdFoc = document.createElement('td');
    const focInput = document.createElement('input');
    focInput.type = 'checkbox';
    focInput.checked = !!data.foc;
    tdFoc.appendChild(focInput);

    // Subtotal
    const tdSubtotal = document.createElement('td');
    tdSubtotal.textContent = '0.000';

    // Remove
    const tdRemove = document.createElement('td');
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '×';
    removeBtn.className = 'remove-btn';
    removeBtn.addEventListener('click', () => {
        tr.remove();
        updateTotal();
    });
    tdRemove.appendChild(removeBtn);

    tr.append(tdName, tdQty, tdPrice, tdFoc, tdSubtotal, tdRemove);
    itemsTbody.appendChild(tr);

    // --- Medicine search ---
    medInput.addEventListener('input', debounce(function () {
        const query = medInput.value.trim();
        if (!query) {
            medSug.innerHTML = '';
            medSug.classList.remove('active');
            return;
        }
        fetch(`${ENDPOINT_MEDICINE_SEARCH}?q=${encodeURIComponent(query)}`)
            .then(res => res.json())
            .then(data => {
                medSug.innerHTML = '';
                if (!Array.isArray(data) || data.length === 0) {
                    medSug.classList.remove('active');
                    return;
                }
                data.forEach(med => {
                    const div = document.createElement('div');
                    div.textContent = med.item_name;
                    div.addEventListener('mousedown', () => {
                        medInput.value = med.item_name;
                        priceInput.value = med.price || '';
                        qtyInput.focus();
                        medSug.classList.remove('active');
                        medicinesCache[med.id] = med;
                        updateSubtotal();
                    });
                    medSug.appendChild(div);
                });
                medSug.classList.add('active');
            })
            .catch(err => console.error('Medicine search error:', err));
    }, 300));
    medInput.addEventListener('blur', () => setTimeout(() => medSug.classList.remove('active'), 100));

    // --- FOC logic: zero price if checked ---
    focInput.addEventListener('change', () => {
        if (focInput.checked) {
            priceInput.value = 0;
            priceInput.disabled = true;
        } else {
            priceInput.disabled = false;
        }
        updateSubtotal();
    });

    // --- Real-time subtotal/total calc ---
    [qtyInput, priceInput, focInput].forEach(el =>
        el.addEventListener('input', updateSubtotal)
    );
    function updateSubtotal() {
        const qty = parseFloat(qtyInput.value) || 0;
        const price = focInput.checked ? 0 : (parseFloat(priceInput.value) || 0);
        const subtotal = qty * price;
        tdSubtotal.textContent = formatCurrency(subtotal);
        updateTotal();
    }
    // In case of autofill
    setTimeout(updateSubtotal, 0);
}

function updateTotal() {
    let total = 0;
    itemsTbody.querySelectorAll('tr').forEach(tr => {
        const subtotal = parseFloat(tr.children[4].textContent.replace(/,/g, '')) || 0;
        total += subtotal;
    });
    document.getElementById('po-total').textContent = formatCurrency(total);
}

// ========== FORM SUBMIT (SAVE PO) ==========
const poForm = document.getElementById('po-form');
const statusMsg = document.getElementById('po-status-message');

poForm.addEventListener('submit', function (e) {
    e.preventDefault();
    
    // Validate session
    if (!currentUserId) {
        setStatus('User session expired. Please reload the page.', true);
        return;
    }
    
    // Validate agency
    if (!agencyInput.value.trim()) {
        agencyInput.focus();
        setStatus('Please select a pharmaceutical agency.', true);
        return;
    }
    
    // Gather items
    const items = [];
    let valid = true;
    itemsTbody.querySelectorAll('tr').forEach(tr => {
        const medName = tr.children[0].querySelector('input').value.trim();
        const qty = parseFloat(tr.children[1].querySelector('input').value);
        const price = parseFloat(tr.children[2].querySelector('input').value) || 0;
        const foc = tr.children[3].querySelector('input').checked;
        if (!medName || !qty || qty < 0.001) valid = false;
        items.push({ 
            item_name: medName, 
            quantity: qty, 
            wholesale_price: price, 
            foc, 
            subtotal: foc ? 0 : qty * price 
        });
    });
    
    if (!valid || items.length === 0) {
        setStatus('Please complete all medicine rows.', true);
        return;
    }
    
    const poData = {
        agency: agencyInput.value.trim(),
        date: document.getElementById('po-date').value,
        remarks: document.getElementById('po-remarks').value,
        created_by: currentUserId,
        items: items
    };
    
    setStatus('Saving PO...', false, true);

    fetch(ENDPOINT_SAVE_PO, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(poData)
    })
    .then(res => res.json())
    .then(res => {
        if (res.success) {
            setStatus(`Purchase Order saved successfully! PO Code: ${res.po_code}`, false);
            poForm.reset();
            itemsTbody.innerHTML = '';
            addMedicineRow();
            updateTotal();
            
            // Reset date to today
            const dateInput = document.getElementById('po-date');
            if (dateInput) {
                const now = new Date();
                dateInput.value = now.toISOString().slice(0,10);
            }
        } else {
            setStatus('Failed to save: ' + (res.message || 'Unknown error'), true);
        }
    })
    .catch(err => {
        console.error('Save PO error:', err);
        setStatus('Error: ' + err.message, true);
    });
});

function setStatus(msg, error = false, loading = false) {
    statusMsg.textContent = msg;
    statusMsg.style.color = error ? '#c03a2b' : (loading ? '#888' : '#2b7a3c');
    
    // Clear status after 5 seconds unless it's an error
    if (!error && !loading) {
        setTimeout(() => {
            if (statusMsg.textContent === msg) {
                statusMsg.textContent = '';
            }
        }, 5000);
    }
}

// ========== EXPORT BUTTONS ==========
document.getElementById('export-po-pdf-btn').addEventListener('click', () => {
    const currentPOData = getCurrentPoData();
    if (!currentPOData.agency || !currentPOData.items.length) {
        setStatus('Please fill in agency and at least one item before exporting.', true);
        return;
    }
    
    setStatus('Exporting PDF...', false, true);
    fetch(ENDPOINT_EXPORT_PDF, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(currentPOData)
    })
    .then(res => {
        if (!res.ok) throw new Error('Failed');
        return res.blob();
    })
    .then(blob => {
        setStatus('PDF exported successfully!', false);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `purchase_order_${currentPOData.po_id || 'new'}.pdf`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { window.URL.revokeObjectURL(url); a.remove(); }, 100);
    })
    .catch(err => {
        console.error('PDF export error:', err);
        setStatus('PDF export failed', true);
    });
});

document.getElementById('export-po-xlsx-btn').addEventListener('click', () => {
    const currentPOData = getCurrentPoData();
    if (!currentPOData.agency || !currentPOData.items.length) {
        setStatus('Please fill in agency and at least one item before exporting.', true);
        return;
    }
    
    setStatus('Exporting Excel...', false, true);
    fetch(ENDPOINT_EXPORT_XLSX, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(currentPOData)
    })
    .then(res => {
        if (!res.ok) throw new Error('Failed');
        return res.blob();
    })
    .then(blob => {
        setStatus('Excel exported successfully!', false);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `purchase_order_${currentPOData.po_id || 'new'}.xlsx`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { window.URL.revokeObjectURL(url); a.remove(); }, 100);
    })
    .catch(err => {
        console.error('Excel export error:', err);
        setStatus('Excel export failed', true);
    });
});

// Helper: current PO form as object (for export)
function getCurrentPoData() {
    const items = [];
    itemsTbody.querySelectorAll('tr').forEach(tr => {
        const medName = tr.children[0].querySelector('input').value.trim();
        const qty = parseFloat(tr.children[1].querySelector('input').value);
        const price = parseFloat(tr.children[2].querySelector('input').value) || 0;
        const foc = tr.children[3].querySelector('input').checked;
        if (medName && qty > 0) { // Only include valid rows
            items.push({ 
                item_name: medName, 
                quantity: qty, 
                wholesale_price: price, 
                foc, 
                subtotal: foc ? 0 : qty * price 
            });
        }
    });
    
    // Get total from DOM (always formatted)
    const totalStr = document.getElementById('po-total').textContent.replace(/,/g, '');
    return {
        po_id: document.getElementById('po-id').value,
        pharmacist: document.getElementById('pharmacist').value,
        agency: agencyInput.value.trim(),
        date: document.getElementById('po-date').value,
        remarks: document.getElementById('po-remarks').value,
        total: parseFloat(totalStr) || 0,
        items: items
    };
}