// requirements.js
let userBranch = 'Unknown'; // Variable to store user's branch

// Fetch user info from session and update UI
function fetchUserInfo() {
    const userInfoString = sessionStorage.getItem('userInfo');

    if (!userInfoString) {
        console.log('No userInfo found in sessionStorage, redirecting to login...');
        window.location.href = 'index.html';
        return;
    }

    try {
        const userInfo = JSON.parse(userInfoString);

        userBranch = userInfo.branch || 'Unknown'; // <-- STORE USER BRANCH

        const nameSpan = document.getElementById('userName');
        const jobTitleSpan = document.getElementById('userJobTitle');
        const userPhoto = document.getElementById('user-photo');
        if (userPhoto && userInfo.userId) {
            userPhoto.onerror = function() {
                userPhoto.src = 'images/default-profile.png';
            };
            userPhoto.src = `/api/user-photo/${userInfo.userId}`;
        }


        if (nameSpan) nameSpan.textContent = userInfo.fullName || userInfo.username || 'User';
        if (jobTitleSpan) jobTitleSpan.textContent = userInfo.jobTitle || 'Staff';

        console.log('User info loaded from sessionStorage:', userInfo);
    } catch (error) {
        console.error('Failed to parse user info from sessionStorage:', error);
        alert('Error loading user info. Please log in again.');
        window.location.href = 'index.html';
    }
}

// Search medicines dynamically on input
document.getElementById('searchInput').addEventListener('input', async () => {
    const searchTerm = document.getElementById('searchInput').value.trim();
    const searchResults = document.getElementById('searchResults');
    searchResults.innerHTML = '';

    if (!searchTerm) return;

   const response = await fetch(`/api/pos/medicines/search?q=${encodeURIComponent(searchTerm)}`);


    const results = await response.json();

    results.forEach(result => {
        const div = document.createElement('div');
        div.textContent = `${result.item_name} - ${result.price}`;
        div.classList.add('search-result-item');
        div.addEventListener('click', () => {
            addToTable(result);
            searchResults.innerHTML = ''; // Clear results after selection
        });
        searchResults.appendChild(div);
    });

    searchResults.style.display = results.length ? 'block' : 'none';
});

// Function to add selected item to the table
function addToTable(item) {
    const tableBody = document.getElementById('selectedMedicinesBody');
    const newRow = document.createElement('tr');

    newRow.innerHTML = `
        <td class="item-name">${item.item_name}</td>
        <td>
            <select class="agent-select" onchange="checkStock(this.closest('tr'))">
                <option value="">Select Agent</option>
                <option value="CTPR">CTPR</option>
                <option value="CP">CP</option>
                <option value="AHP">AHP</option>
            </select>
        </td>
        <td class="to-store">${userBranch}</td>
        <td>
            <input type="number" min="1" class="quantity-input" 
                   data-item-name="${item.item_name}" 
                   placeholder="Quantity" 
                   oninput="checkStock(this.closest('tr'))" />
        </td>
        <td class="stock-cell">N/A</td>
        <td><button class="btn done-btn" onclick="deleteRow(this)">Delete</button></td>
    `;
    tableBody.appendChild(newRow);
    return newRow; // <-- FIX 1: Return the newly created row
}
// NEW Function to check stock and highlight row
async function checkStock(row) {
    const agentSelect = row.querySelector('.agent-select');
    const quantityInput = row.querySelector('.quantity-input');
    const stockCell = row.querySelector('.stock-cell');
    const itemName = row.querySelector('.item-name').textContent;

    // Failsafe: If elements don't exist (e.g., static row), exit.
    if (!agentSelect || !quantityInput) {
        return;
    }
    
    const agent = agentSelect.value;
    const quantity = parseInt(quantityInput.value, 10);

    // Clear previous state
    stockCell.textContent = 'N/A';
    row.classList.remove('danger-row');

    if (agent && itemName) {
        // Don't check stock for AHP as it has no DB
        if (agent.toUpperCase() === 'AHP') {
            stockCell.textContent = 'N/A';
            return;
        }

        try {
            const response = await fetch(`/api/agent-stock/${encodeURIComponent(agent)}/${encodeURIComponent(itemName)}`);
            if (!response.ok) {
                stockCell.textContent = 'Error';
                return;
            }

            const data = await response.json();
            
            if (data.stock !== null) {
                const stock = Number(data.stock);
                stockCell.textContent = stock;

                // Check quantity only if it's a valid number
                if (!isNaN(quantity) && quantity > 0 && quantity > stock) {
                    row.classList.add('danger-row');
                }
            } else {
                stockCell.textContent = 'N/A';
            }

        } catch (err) {
            console.error('Error fetching stock:', err);
            stockCell.textContent = 'Error';
        }
    }
}

// Handle Save Requirements button click
document.getElementById('saveButton').addEventListener('click', async () => {
    const rows = document.querySelectorAll('#selectedMedicinesBody tr');
    const requirementsData = [];

    rows.forEach(row => {
        const itemName = row.querySelector('.item-name')?.textContent;
        const agent = row.querySelector('.agent-select')?.value;
        const store = row.querySelector('.to-store')?.textContent;
        const quantity = row.querySelector('.quantity-input')?.value;
        
        if (itemName && quantity && agent && store) {
            requirementsData.push({
                item_name: itemName,
                quantity: quantity,
                from_agent: agent,
                to_store: store,
                date: new Date().toISOString().split('T')[0]
            });
        }
    });

    if (requirementsData.length > 0) {
        const response = await fetch('/api/saveRequirements', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requirementsData)
        });

        const result = await response.json();
        alert(result.message);
    } else {
        alert('No complete requirements to save (ensure agent, store, and quantity are set).');
    }
});

// Fetch by Date Range
document.getElementById('fetchByDateRange').addEventListener('click', async () => {
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;

    if (startDate && endDate) {
        const response = await fetch('/api/fetchRequirementsByDateRange', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ startDate, endDate })
        });

        const results = await response.json();
        const tableBody = document.getElementById('selectedMedicinesBody');
        tableBody.innerHTML = '';

        // <-- FIX 2: This entire loop is replaced
        results.forEach(item => {
            // 1. Create the row using the standard function.
            //    The 'item' object has 'item_name', which addToTable uses.
            const newRow = addToTable(item);

            // 2. Populate the agent and quantity fields with the fetched data.
            //    'item' also has 'from_agent' and 'quantity'.
            const agentSelect = newRow.querySelector('.agent-select');
            const quantityInput = newRow.querySelector('.quantity-input');

            if (agentSelect) {
                agentSelect.value = item.from_agent;
            }
            if (quantityInput) {
                quantityInput.value = item.quantity;
            }

            // 3. Manually trigger the stock check for this new row.
            checkStock(newRow);
        });
        // <-- END OF FIX
        
    } else {
        alert('Please select both start and end dates.');
    }
});

// Function to delete a row and send delete request
function deleteRow(button) {
    const row = button.closest('tr');
    const itemName = row.querySelector('.item-name')?.textContent; // Use class selector
    row.remove();

    if (itemName) {
        fetch('/api/deleteRequirement', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ item_name: itemName })
        })
            .then(res => res.json())
            .then(data => console.log(data.message))
            .catch(err => console.error('Error deleting:', err));
    }
}

// Clear all rows
document.getElementById('ignoreButton').addEventListener('click', () => {
    const rows = document.querySelectorAll('#selectedMedicinesBody tr');
    rows.forEach(row => row.remove());
});
// Excel Export with formatting
document.getElementById('downloadButton').addEventListener('click', () => {
    const table = document.getElementById('medicinesTable');
    const wb = XLSX.utils.table_to_book(table, { sheet: "Requirements" });

    // Ensure quantity column is parsed as numbers
    const ws = wb.Sheets["Requirements"];
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let R = range.s.r + 1; R <= range.e.r; ++R) {
        // Column 4: quantity required
        const cell_address_qty = XLSX.utils.encode_cell({ r: R, c: 3 }); 
        const cell_qty = ws[cell_address_qty];
        if (cell_qty && !isNaN(cell_qty.v)) {
            cell_qty.t = 'n';
        }
        
        // Column 5: stock
        const cell_address_stock = XLSX.utils.encode_cell({ r: R, c: 4 }); 
        const cell_stock = ws[cell_address_stock];
        if (cell_stock && !isNaN(cell_stock.v)) {
            cell_stock.t = 'n';
        }
    }

    XLSX.writeFile(wb, "medicine_requirements.xlsx");
});

// Logout with session termination
document.getElementById('logoutButton').addEventListener('click', async () => {
    await fetch('/logout'); // Uses GET request as provided
    window.location.href = '/index.html';
});

// Fetch user info on page load
fetchUserInfo();