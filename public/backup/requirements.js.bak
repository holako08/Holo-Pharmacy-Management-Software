// requirements.js

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
        <td>${item.item_name}</td>
        <td></td>
        <td></td>
        <td><input type="number" min="1" class="quantity-input" data-item-name="${item.item_name}" placeholder="Quantity" /></td>
        <td><button class="btn done-btn" onclick="deleteRow(this)">Delete</button></td>
    `;
    tableBody.appendChild(newRow);
}

// Handle Save Requirements button click
document.getElementById('saveButton').addEventListener('click', async () => {
    const rows = document.querySelectorAll('#selectedMedicinesBody tr');
    const requirementsData = [];

    rows.forEach(row => {
        const itemName = row.cells[0].textContent;
        const quantity = row.querySelector('.quantity-input')?.value;
        if (itemName && quantity) {
            requirementsData.push({
                item_name: itemName,
                quantity: quantity,
                from_agent: '',
                to_store: '',
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
        alert('No requirements to save.');
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

        results.forEach(item => {
            const newRow = document.createElement('tr');
            newRow.innerHTML = `
                <td>${item.item_name}</td>
                <td>${item.from_agent}</td>
                <td>${item.to_store}</td>
                <td>${item.quantity}</td>
                <td><button class="btn done-btn" onclick="deleteRow(this)">Delete</button></td>
            `;
            tableBody.appendChild(newRow);
        });
    } else {
        alert('Please select both start and end dates.');
    }
});

// Function to delete a row and send delete request
function deleteRow(button) {
    const row = button.closest('tr');
    const itemName = row.querySelector('td').textContent;
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
        const cell_address = XLSX.utils.encode_cell({ r: R, c: 3 }); // Column 4: quantity
        const cell = ws[cell_address];
        if (cell && !isNaN(cell.v)) {
            cell.t = 'n';
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
