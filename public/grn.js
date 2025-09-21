// grn.js - Updated version with PDF and Excel export functionality

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
    } catch (error) {
        window.location.href = 'index.html';
        return;
    }
    // Elements - Updated to match actual HTML IDs
    const poSearchInput = document.getElementById('grn-po-search');
    const poSuggestions = document.getElementById('grn-po-suggestions');
    const grnItemsTbody = document.getElementById('grn-items-tbody');
    const saveGrnBtn = document.getElementById('save-grn-btn');
    const exportGrnPdfBtn = document.getElementById('export-grn-pdf-btn');
    const exportGrnXlsxBtn = document.getElementById('export-grn-xlsx-btn');
    const grnStatusMessage = document.getElementById('grn-status-message');
    const grnDate = document.getElementById('grn-date');
    const grnRemarks = document.getElementById('grn-remarks');
    const loadPoBtn = document.getElementById('load-po-btn');
    const grnTotal = document.getElementById('grn-total');

    let selectedPO = null;
    let poItems = [];
    let lastSavedGrnId = null; // Track the last saved GRN for exports

    // Check if critical elements exist
    if (!poSearchInput) {
        console.error('Element with ID "grn-po-search" not found');
        return;
    }

    // Utility: Format today as YYYY-MM-DD
    function todayStr() {
        const d = new Date();
        return d.toISOString().split('T')[0];
    }
    
    if (grnDate) {
        grnDate.value = todayStr();
    }

    // --- PO Search + Suggest ---
    poSearchInput.addEventListener('input', function () {
        const query = poSearchInput.value.trim();
        if (query.length < 2) {
            if (poSuggestions) poSuggestions.innerHTML = '';
            return;
        }
        
        // Search for purchase orders
        fetch(`/api/purchase-orders?po_code=${encodeURIComponent(query)}`)
            .then(res => res.json())
            .then(orders => {
                if (poSuggestions) {
                    poSuggestions.innerHTML = '';
                    orders.forEach(order => {
                        const div = document.createElement('div');
                        div.textContent = `${order.po_code} | ${order.agency_name} | ${new Date(order.created_at).toLocaleDateString()}`;
                        div.classList.add('suggestion');
                        div.style.cursor = 'pointer';
                        div.style.padding = '8px';
                        div.style.borderBottom = '1px solid #ddd';
                        div.addEventListener('click', () => {
                            selectPO(order);
                            poSuggestions.innerHTML = '';
                            poSearchInput.value = order.po_code;
                        });
                        poSuggestions.appendChild(div);
                    });
                }
            })
            .catch(err => {
                console.error('Error searching POs:', err);
                setStatus('Error searching purchase orders', true);
            });
    });

    // Load PO button click handler
    if (loadPoBtn) {
        loadPoBtn.addEventListener('click', function() {
            const query = poSearchInput.value.trim();
            if (!query) {
                setStatus('Please enter a PO code to search', true);
                return;
            }
            
            // Search and load the first matching PO
            fetch(`/api/purchase-orders?po_code=${encodeURIComponent(query)}`)
                .then(res => res.json())
                .then(orders => {
                    if (orders.length > 0) {
                        selectPO(orders[0]);
                    } else {
                        setStatus('No purchase order found with that code', true);
                    }
                })
                .catch(err => {
                    console.error('Error loading PO:', err);
                    setStatus('Error loading purchase order', true);
                });
        });
    }

    // --- Select PO and populate table ---
    async function selectPO(po) {
        try {
            selectedPO = po;
            setStatus('Loading PO items...', false);
            
            // Fetch PO items
            const response = await fetch(`/api/purchase-orders/${po.po_id}`);
            const poData = await response.json();
            
            if (poData.items) {
                poItems = poData.items.map(item => ({
                    ...item,
                    batch_number: '',
                    expirydate: '',
                    received_qty: item.quantity,
                    received_price: item.wholesale_price || 0,
                    received_subtotal: 0
                }));
                
                renderItemsTable();
                setStatus(`Loaded ${poItems.length} items from PO ${po.po_code}`, false, 'success');
            } else {
                setStatus('No items found in this purchase order', true);
            }
        } catch (err) {
            console.error('Error selecting PO:', err);
            setStatus('Error loading purchase order details', true);
        }
    }

    // --- Render GRN Items Table ---
    function renderItemsTable() {
        if (!grnItemsTbody) return;
        
        grnItemsTbody.innerHTML = '';
        
        poItems.forEach((item, idx) => {
            const tr = document.createElement('tr');

            // Medicine Name
            const tdName = document.createElement('td');
            tdName.textContent = item.medicine_name || item.item_name || 'Unknown Medicine';
            tr.appendChild(tdName);

            // Quantity
            const tdQty = document.createElement('td');
            const qtyInput = document.createElement('input');
            qtyInput.type = 'number';
            qtyInput.min = '0.001';
            qtyInput.step = '0.001';
            qtyInput.value = item.received_qty || item.quantity;
            qtyInput.style.width = '80px';
            qtyInput.addEventListener('input', () => {
                item.received_qty = parseFloat(qtyInput.value) || 0;
                updateSubtotal(item, tr);
                updateTotal();
            });
            tdQty.appendChild(qtyInput);
            tr.appendChild(tdQty);

            // Batch Number
            const tdBatch = document.createElement('td');
            const batchInput = document.createElement('input');
            batchInput.type = 'text';
            batchInput.placeholder = 'Batch #';
            batchInput.value = item.batch_number || '';
            batchInput.style.width = '100px';
            batchInput.addEventListener('input', () => {
                item.batch_number = batchInput.value;
            });
            tdBatch.appendChild(batchInput);
            tr.appendChild(tdBatch);

            // Expiry Date
            const tdExpiry = document.createElement('td');
            const expiryInput = document.createElement('input');
            expiryInput.type = 'date';
            expiryInput.value = item.expirydate || '';
            expiryInput.addEventListener('input', () => {
                item.expirydate = expiryInput.value;
            });
            tdExpiry.appendChild(expiryInput);
            tr.appendChild(tdExpiry);

            // FOC Checkbox
            const tdFoc = document.createElement('td');
            const focCheckbox = document.createElement('input');
            focCheckbox.type = 'checkbox';
            focCheckbox.checked = item.is_foc || false;
            focCheckbox.addEventListener('change', () => {
                item.is_foc = focCheckbox.checked;
                updateSubtotal(item, tr);
                updateTotal();
            });
            tdFoc.appendChild(focCheckbox);
            tr.appendChild(tdFoc);

            // Wholesale Price
            const tdPrice = document.createElement('td');
            const priceInput = document.createElement('input');
            priceInput.type = 'number';
            priceInput.min = '0';
            priceInput.step = '0.001';
            priceInput.value = item.received_price || item.wholesale_price || 0;
            priceInput.style.width = '80px';
            priceInput.addEventListener('input', () => {
                item.received_price = parseFloat(priceInput.value) || 0;
                updateSubtotal(item, tr);
                updateTotal();
            });
            tdPrice.appendChild(priceInput);
            tr.appendChild(tdPrice);

            // Subtotal
            const tdSubtotal = document.createElement('td');
            tdSubtotal.classList.add('subtotal-cell');
            tr.appendChild(tdSubtotal);

            // Edit/Remove
            const tdEdit = document.createElement('td');
            const removeBtn = document.createElement('button');
            removeBtn.textContent = 'Remove';
            removeBtn.type = 'button';
            removeBtn.style.background = '#dc3545';
            removeBtn.style.color = 'white';
            removeBtn.style.border = 'none';
            removeBtn.style.padding = '4px 8px';
            removeBtn.style.cursor = 'pointer';
            removeBtn.addEventListener('click', () => {
                poItems.splice(idx, 1);
                renderItemsTable();
                updateTotal();
            });
            tdEdit.appendChild(removeBtn);
            tr.appendChild(tdEdit);

            grnItemsTbody.appendChild(tr);
            
            // Initial subtotal calculation
            updateSubtotal(item, tr);
        });
        
        updateTotal();
    }

    // Update subtotal for a specific item
    function updateSubtotal(item, row) {
        const subtotalCell = row.querySelector('.subtotal-cell');
        if (item.is_foc) {
            item.received_subtotal = 0;
        } else {
            item.received_subtotal = (item.received_qty || 0) * (item.received_price || 0);
        }
        
        if (subtotalCell) {
            if (item.is_foc) {
                subtotalCell.textContent = '0.000 (FOC)';
                subtotalCell.style.color = '#28a745';
                subtotalCell.style.fontWeight = 'bold';
            } else {
                subtotalCell.textContent = item.received_subtotal.toFixed(3);
                subtotalCell.style.color = '';
                subtotalCell.style.fontWeight = '';
            }
        }
    }

    // Update total amount
    function updateTotal() {
        const total = poItems.reduce((sum, item) => {
            return sum + (item.received_subtotal || 0);
        }, 0);
        
        if (grnTotal) {
            grnTotal.textContent = total.toFixed(3);
        }
    }

    // Add helper function to get current user ID (inspired by history.js)
    async function getCurrentUserId() {
        try {
            const res = await fetch('/api/user-info');
            if (res.ok) {
                const data = await res.json();
                return data.user?.userId || null;
            }
            return null;
        } catch (err) {
            console.error('Error getting current user ID:', err);
            return null;
        }
    }

    // --- Save GRN ---
    if (saveGrnBtn) {
        saveGrnBtn.addEventListener('click', async function (e) {
            e.preventDefault();

            if (!selectedPO) {
                setStatus('Please select a Purchase Order.', true);
                return;
            }

            // Validate required fields
            for (const item of poItems) {
                if (!item.batch_number || !item.expirydate) {
                    setStatus('All batch numbers and expiry dates must be filled.', true);
                    return;
                }
                if (!item.received_qty || item.received_qty <= 0) {
                    setStatus('All received quantities must be greater than 0.', true);
                    return;
                }
            }

            // Get current user ID (inspired by history.js logic)
            const currentUserId = await getCurrentUserId();
            if (!currentUserId) {
                setStatus('Error: Could not determine current user. Please log in again.', true);
                return;
            }

            // Prepare payload with received_by user ID
            const payload = {
                po_id: selectedPO.po_id,
                received_by: currentUserId, // ✅ FIXED: Use actual user ID like history.js
                remarks: grnRemarks ? grnRemarks.value : '',
                items: poItems.map(item => ({
                    medicine_id: item.medicine_id,
                    batch_number: item.batch_number,
                    expirydate: item.expirydate,
                    quantity: item.received_qty,
                    received_price: item.received_price,
                    is_foc: item.is_foc || false
                }))
            };

            setStatus('Saving GRN...', false);

            try {
                const resp = await fetch('/api/goods-receipt-notes/from-po', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                
                const data = await resp.json();
                
                if (data.success) {
                    lastSavedGrnId = data.grn_id; // Store for exports
                    setStatus(`GRN saved successfully! GRN Code: ${data.grn_code}`, false, 'success');
                    
                    // Enable export buttons now that GRN is saved
                    if (exportGrnPdfBtn) exportGrnPdfBtn.disabled = false;
                    if (exportGrnXlsxBtn) exportGrnXlsxBtn.disabled = false;
                    
                    // Optionally reset form after successful save
                    // resetForm();
                } else {
                    setStatus(data.message || 'Failed to save GRN.', true);
                }
            } catch (err) {
                console.error('Save GRN error:', err);
                setStatus('Server error while saving GRN.', true);
            }
        });
    }

    // --- Export buttons ---
    if (exportGrnPdfBtn) {
        exportGrnPdfBtn.addEventListener('click', async () => {
            if (lastSavedGrnId) {
                // Use the same PDF endpoint from history.js for saved GRNs
                try {
                    setStatus('Generating PDF...', false);
                    const response = await fetch(`/api/goods-receipt-notes/${lastSavedGrnId}/print-pdf`);
                    
                    if (!response.ok) {
                        throw new Error(`Failed to generate PDF: ${response.status}`);
                    }
                    
                    // Create blob from response
                    const blob = await response.blob();
                    
                    // Create download link
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `GRN_${lastSavedGrnId}.pdf`;
                    document.body.appendChild(a);
                    a.click();
                    
                    // Cleanup
                    window.URL.revokeObjectURL(url);
                    document.body.removeChild(a);
                    
                    setStatus('PDF exported successfully!', false, 'success');
                    
                } catch (err) {
                    console.error('Error exporting PDF:', err);
                    setStatus('Failed to export PDF: ' + err.message, true);
                }
            } else {
                setStatus('Please save the GRN first before exporting to PDF.', true);
            }
        });
    }
    
    if (exportGrnXlsxBtn) {
        exportGrnXlsxBtn.addEventListener('click', async () => {
            if (!selectedPO || poItems.length === 0) {
                setStatus('Please load a Purchase Order and add items before exporting.', true);
                return;
            }

            try {
                setStatus('Generating Excel file...', false);
                
                // Calculate total for export
                const totalAmount = poItems.reduce((sum, item) => {
                    return sum + (item.received_subtotal || 0);
                }, 0);

                // Prepare data for export
                const exportData = {
                    po_data: {
                        po_code: selectedPO.po_code,
                        agency_name: selectedPO.agency_name
                    },
                    items: poItems,
                    total_amount: totalAmount,
                    grn_date: grnDate ? grnDate.value : new Date().toISOString().split('T')[0],
                    remarks: grnRemarks ? grnRemarks.value : ''
                };

                const response = await fetch('/api/grn/export-excel', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(exportData)
                });

                if (!response.ok) {
                    throw new Error(`Failed to generate Excel: ${response.status}`);
                }

                // Create blob from response
                const blob = await response.blob();
                
                // Create download link
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `GRN_${selectedPO.po_code || 'Draft'}_${new Date().toISOString().slice(0, 10)}.xlsx`;
                document.body.appendChild(a);
                a.click();
                
                // Cleanup
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                
                setStatus('Excel file exported successfully!', false, 'success');

            } catch (err) {
                console.error('Error exporting Excel:', err);
                setStatus('Failed to export Excel: ' + err.message, true);
            }
        });
    }

    // --- Reset form ---
    function resetForm() {
        selectedPO = null;
        poItems = [];
        lastSavedGrnId = null;
        if (poSearchInput) poSearchInput.value = '';
        if (grnRemarks) grnRemarks.value = '';
        if (grnDate) grnDate.value = todayStr();
        if (grnItemsTbody) grnItemsTbody.innerHTML = '';
        if (grnTotal) grnTotal.textContent = '0.000';
        if (poSuggestions) poSuggestions.innerHTML = '';
        
        // Disable export buttons until GRN is saved
        if (exportGrnPdfBtn) exportGrnPdfBtn.disabled = true;
        if (exportGrnXlsxBtn) exportGrnXlsxBtn.disabled = false; // Excel can work with draft data
    }

    // --- Utility for status messaging ---
    function setStatus(msg, isError, cls) {
        if (grnStatusMessage) {
            grnStatusMessage.textContent = msg;
            grnStatusMessage.style.color = isError ? '#bb2222' : (cls === 'success' ? '#228822' : '#666');
            
            // Clear status after 5 seconds
            setTimeout(() => {
                if (grnStatusMessage) {
                    grnStatusMessage.textContent = '';
                }
            }, 5000);
        }
    }

    // Initial setup
    setStatus('Ready to create Goods Receipt Note', false);
    
    // Initially disable PDF export until GRN is saved
    if (exportGrnPdfBtn) exportGrnPdfBtn.disabled = true;
});

// Logout function
function logout() {
    sessionStorage.removeItem('userInfo');
    window.location.href = 'index.html';
}