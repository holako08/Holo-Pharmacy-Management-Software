document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const searchInput = document.getElementById('searchInput');
    const searchButton = document.getElementById('searchButton');
    const searchResults = document.getElementById('searchResults');
    const selectedMedicinesBody = document.getElementById('selectedMedicinesBody');
    const ignoreButton = document.getElementById('ignoreButton');
    const downloadButton = document.getElementById('downloadButton');
    const logoutButton = document.getElementById('logoutButton');
    const userName = document.getElementById('userName');
    const userJobTitle = document.getElementById('userJobTitle');

    // Additional DOM Elements
    const saveButton = document.getElementById('saveButton');
    const fetchByDateRange = document.getElementById('fetchByDateRange');
    const startDate = document.getElementById('startDate');
    const endDate = document.getElementById('endDate');

    // State variables
    let selectedMedicines = [];
    let activeIndex = -1;

    // Check for user session
    loadUserSession();

    // Setup event listeners
    searchInput.addEventListener('input', handleSearchInput);
    searchInput.addEventListener('keydown', handleKeyNavigation);
    searchButton.addEventListener('click', () => searchMedicines(searchInput.value));
    ignoreButton.addEventListener('click', clearSelectedMedicines);
    downloadButton.addEventListener('click', downloadExcel);
    logoutButton.addEventListener('click', handleLogout);
    selectedMedicinesBody.addEventListener('change', handleQuantityChange);
    saveButton.addEventListener('click', saveRequirements);
    fetchByDateRange.addEventListener('click', fetchRequirementsByDateRange);
    
    // Add document-level keyboard shortcuts
    document.addEventListener('keydown', handleGlobalKeyDown);

    // Function to load user session
    function loadUserSession() {
        const userInfoString = sessionStorage.getItem('userInfo');
        if (!userInfoString) {
            console.log('No userInfo found in session storage, redirecting to login page');
            window.location.href = 'index.html';
            return;
        }

        try {
            const userInfo = JSON.parse(userInfoString);
            console.log('Parsed userInfo:', userInfo);
            
            // Update user profile information in the header
            userName.textContent = userInfo.fullName || userInfo.username;
            userJobTitle.textContent = userInfo.jobTitle || 'Staff';
        } catch (error) {
            console.error('Error parsing user information:', error);
            alert('There was an error loading your profile. Please log in again.');
            window.location.href = 'index.html';
        }
    }

    // Handle search input
    function handleSearchInput(event) {
        const searchTerm = event.target.value.trim();
        console.log('Search input:', searchTerm);

        if (searchTerm === '') {
            searchResults.innerHTML = '';
            searchResults.style.display = 'none';
            activeIndex = -1;
            return;
        }

        if (searchTerm.length < 3) {
            searchResults.innerHTML = '<div>Type at least 3 characters to search</div>';
            searchResults.style.display = 'block';
            return;
        }

        searchMedicines(searchTerm);
    }

    // Search medicines API call
    function searchMedicines(searchTerm) {
        if (searchTerm.length < 3) return;

        // Show loading indicator in the dropdown
        searchResults.innerHTML = '<div>Searching...</div>';
        searchResults.style.display = 'block';

        fetch('/api/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ searchTerm })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            displaySearchResults(data);
        })
        .catch(error => {
            console.error('Failed to fetch:', error);
            searchResults.innerHTML = '<div>Error searching medicines. Please try again.</div>';
            searchResults.style.display = 'block';
        });
    }

    // Display search results
    function displaySearchResults(results) {
        searchResults.innerHTML = '';
        
        if (results.length === 0) {
            searchResults.innerHTML = '<div>No medicines found</div>';
            searchResults.style.display = 'block';
            return;
        }
        
        results.forEach((item, index) => {
            const resultItem = document.createElement('div');
            resultItem.classList.add('search-result-item');
            resultItem.innerHTML = `
                <span class="medicine-name">${item.item_name}</span>
                <span class="medicine-price">${item.price || 'N/A'}</span>
            `;
            
            // Store all relevant data in dataset
            resultItem.dataset.id = item.id;
            resultItem.dataset.itemName = item.item_name;
            resultItem.dataset.barcode = item.barcode || 'N/A';
            resultItem.dataset.price = item.price || 'N/A';
            resultItem.dataset.stock = item.stock || 'N/A';
            
            resultItem.addEventListener('click', () => {
                selectMedicine(item);
                searchInput.value = ''; // Clear the search input
                searchResults.style.display = 'none'; // Hide search results after selection
            });
            
            searchResults.appendChild(resultItem);
        });
        
        searchResults.style.display = 'block';
        activeIndex = -1; // Reset active index when displaying new results
    }

    // Handle keyboard navigation in search results
    function handleKeyNavigation(event) {
        const items = Array.from(searchResults.children);
        
        if (items.length === 0 || searchResults.style.display === 'none') return;

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            activeIndex = (activeIndex + 1) % items.length;
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            activeIndex = (activeIndex - 1 + items.length) % items.length;
        } else if (event.key === 'Enter' && activeIndex !== -1) {
            event.preventDefault();
            const item = items[activeIndex];
            
            // Create an item object from the dataset
            const selectedItem = {
                id: item.dataset.id,
                item_name: item.dataset.itemName,
                barcode: item.dataset.barcode,
                price: item.dataset.price,
                stock: item.dataset.stock
            };
            
            selectMedicine(selectedItem);
            searchInput.value = ''; // Clear the search input
            searchResults.style.display = 'none';
            activeIndex = -1;
        } else if (event.key === 'Escape') {
            searchResults.style.display = 'none';
            activeIndex = -1;
        }

        highlightActiveItem();
    }

    // Highlight active search result item
    function highlightActiveItem() {
        const items = Array.from(searchResults.children);
        items.forEach((item, index) => {
            if (index === activeIndex) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }

    // Select medicine from search results
    function selectMedicine(item) {
        console.log('Selecting medicine:', item);
        
        // Ensure we have a valid item
        if (!item || !item.item_name) {
            console.error('Invalid medicine item:', item);
            return;
        }
        
        const id = item.id || item.item_name;  // Fallback to item_name if no id exists
        const item_name = item.item_name;
        const barcode = item.barcode || 'N/A';
        const price = item.price || 'N/A';
    
        // Check if medicine already exists in the selected list
        const existingIndex = selectedMedicines.findIndex(med => med.id === id);
        
        if (existingIndex === -1) {
            // Add new medicine to the list
            selectedMedicines.push({
                id: id,  // Ensure id is properly assigned
                item_name: item_name,
                barcode: barcode,
                price: price,
                quantity: 1
            });
            console.log('Added new medicine:', item_name);
        } else {
            // Increment quantity if medicine already exists
            selectedMedicines[existingIndex].quantity += 1;
            console.log('Incremented quantity for:', item_name);
        }
        
        // Update the table with the new selection
        updateSelectedMedicinesTable();
    }
    

   // Function to update the table with medicines, including the correct quantity
function updateSelectedMedicinesTable() {
    console.log('Updating table with medicines:', selectedMedicines);
    
    // Clear the table body
    selectedMedicinesBody.innerHTML = '';

    if (selectedMedicines.length === 0) {
        // Show the empty placeholder row
        const emptyRow = document.createElement('tr');
        emptyRow.className = 'empty-row';
        emptyRow.innerHTML = `
            <td class="item-placeholder">Item names from search here dynamically</td>
            <td colspan="2" class="empty-placeholder">Leave these two empty</td>
            <td class="input-placeholder">Input: number</td>
            <td class="empty-placeholder"></td> <!-- Empty column for delete button -->
        `;
        selectedMedicinesBody.appendChild(emptyRow);
        return;
    }

    // Add each selected medicine to the table in its own row
    selectedMedicines.forEach((medicine) => {
        const row = document.createElement('tr');
        row.dataset.id = medicine.id;
    
        const nameCell = document.createElement('td');
        nameCell.textContent = medicine.item_name;
    
        const fromAgentCell = document.createElement('td');
        fromAgentCell.contentEditable = 'true';
    
        const toStoreCell = document.createElement('td');
        toStoreCell.contentEditable = 'true';
    
        const quantityCell = document.createElement('td');
        const quantityInput = document.createElement('input');
        quantityInput.type = 'number';
        quantityInput.className = 'quantity-input';
        quantityInput.value = medicine.quantity || 1; // Set initial value from selectedMedicines
        quantityInput.min = '1';
        quantityInput.dataset.id = medicine.id;  // Store the medicine ID as a data attribute
        quantityCell.appendChild(quantityInput);
    
        const actionsCell = document.createElement('td');
    
        // Delete Button
        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Delete';
        deleteButton.className = 'btn clear-btn';
        deleteButton.onclick = function () {
            deleteMedicine(medicine.id, row);
        };
    
        // Done Button
        const doneButton = document.createElement('button');
        doneButton.textContent = 'Done';
        doneButton.className = 'btn done-btn';
        doneButton.onclick = function () {
            console.log('Item name:', medicine.item_name);  // Log the item_name to inspect it
        
            if (medicine.item_name) {
                row.classList.add('done-row'); // Add green highlight
                markAsProcured(medicine.item_name);   // Pass item_name to the function
            } else {
                console.error('Invalid item_name, skipping procured action.');
            }
        
            row.remove();  // Remove the row from the table
            selectedMedicines = selectedMedicines.filter(med => med.item_name !== medicine.item_name); // Remove from memory
        };
        
        
        
        
    
        // Append buttons to actionsCell
        actionsCell.appendChild(deleteButton);
        actionsCell.appendChild(doneButton);
    
        // Append all the cells to the row
        row.appendChild(nameCell);
        row.appendChild(fromAgentCell);
        row.appendChild(toStoreCell);
        row.appendChild(quantityCell);
        row.appendChild(actionsCell); // Correctly append actionsCell here
    
        selectedMedicinesBody.appendChild(row);
        console.log('Added row for medicine:', medicine.item_name);
    });

    const doneButtons = document.querySelectorAll('.done-btn');
    doneButtons.forEach(button => {
        button.addEventListener('click', function() {
            // Get the item name from the row (this can be adjusted based on your table structure)
            const itemName = this.closest('tr').querySelector('td:first-child').textContent.trim();

            if (itemName) {
                // Assuming you have an endpoint to delete this item
                fetch('/delete-item', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ name: itemName })
                })
                .then(response => response.json())
                .then(data => {
                    console.log(data);
                    // Optionally, remove the row from the table or notify the user.
                })
                .catch(error => {
                    console.error('Error deleting item:', error);
                });
            } else {
                console.error('Invalid item name');
            }
        });
    });
    
}

// Function to delete the medicine row from the table
function deleteMedicineRow(medicineId, row) {
    const index = selectedMedicines.findIndex(med => med.id === medicineId);
    if (index !== -1) {
        selectedMedicines.splice(index, 1); // Remove the medicine from the selected list
        row.remove(); // Remove the row from the table
        console.log('Deleted row for medicine:', medicineId);
    }
}


    // Handle quantity change in the table
    function handleQuantityChange(event) {
        if (event.target.classList.contains('quantity-input')) {
            const id = event.target.dataset.id;
            const quantity = parseInt(event.target.value) || 1;
            
            const medicineIndex = selectedMedicines.findIndex(med => med.id === id);
            if (medicineIndex !== -1) {
                selectedMedicines[medicineIndex].quantity = quantity;
                console.log('Updated quantity for:', selectedMedicines[medicineIndex].item_name);
            }
        }
    }

    // Clear all selected medicines
    function clearSelectedMedicines() {
        if (selectedMedicines.length === 0) return;
        
        if (confirm('Are you sure you want to clear all selected medicines?')) {
            selectedMedicines = [];
            updateSelectedMedicinesTable();
            console.log('Cleared all medicines');
        }
    }

 // Function to download selected medicines as Excel file
function downloadExcel() {
    if (selectedMedicines.length === 0) {
        alert('No medicines selected. Please select medicines first.');
        return;
    }

    // Prepare data for Excel, ensuring correct quantities are captured from the input fields
    const data = selectedMedicines.map(medicine => {
        const row = Array.from(selectedMedicinesBody.querySelectorAll('tr')).find(r => r.dataset.id === medicine.id);
        let fromAgent = '', toStore = '', quantity = 1;  // Default quantity is 1 if not found

        if (row) {
            // Capture values from the table cells
            fromAgent = row.cells[1].textContent.trim(); // Assuming 'From Agent' is in column 2
            toStore = row.cells[2].textContent.trim();   // Assuming 'To Store' is in column 3
            const quantityInput = row.querySelector('.quantity-input');  // Get the quantity input field

            // Ensure that the quantity is properly captured from the input field
            if (quantityInput) {
                quantity = parseInt(quantityInput.value) || 1; // Parse the quantity, default to 1 if invalid
            }
        }

        return {
            item_name: medicine.item_name,
            barcode: medicine.barcode,
            price: medicine.price,
            quantity: quantity,  // Include the correct quantity entered in the input field
            from_agent: fromAgent,
            to_store: toStore
        };
    });

    // Check if any data was captured before proceeding with Excel export
    if (data.length === 0) {
        alert('No data available to export');
        return;
    }

    // Create an Excel worksheet with the captured data
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Medicine Requirements");

    // Generate filename with date
    const date = new Date();
    const formattedDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    XLSX.writeFile(wb, `medicine_requirements_${formattedDate}.xlsx`);
}



    // Handle logout
    function handleLogout(e) {
        e.preventDefault();
        console.log('Logout button clicked');
        
        if (confirm('Are you sure you want to log out?')) {
            // Clear session storage
            sessionStorage.removeItem('userInfo');
            console.log('Session storage cleared');
            
            // Call logout API
            fetch('/logout')
                .then(response => console.log('Logout API response status:', response.status))
                .catch(error => console.error('Logout API error:', error))
                .finally(() => {
                    console.log('Redirecting to login page');
                    // Redirect to login page
                    window.location.href = 'index.html';
                });
        }
    }

    // Global keyboard shortcuts
    function handleGlobalKeyDown(event) {
        switch (event.key) {
            case "F1":
                event.preventDefault();
                focusAndSelect(searchInput);
                break;
            case "F2":
                event.preventDefault();
                focusLastSelectedMedicine();
                break;
            case "Delete":
                if (event.ctrlKey) {
                    event.preventDefault();
                    clearSelectedMedicines();
                }
                break;
        }
    }

    function focusAndSelect(element) {
        if (element) {
            element.focus();
            element.select();
        }
    }

    function focusLastSelectedMedicine() {
        // Ensure there are selected medicines
        if (selectedMedicines.length === 0) {
            console.log("No medicines selected yet.");
            return;
        }

        // Focus on the last medicine's quantity input
        const lastQuantityInput = selectedMedicinesBody.querySelector("tr:last-child .quantity-input");
        if (lastQuantityInput) {
            lastQuantityInput.focus();
            lastQuantityInput.select();
        }
    }

    // Hide search results when clicking outside
    document.addEventListener('click', (event) => {
        if (!searchInput.contains(event.target) && 
            !searchResults.contains(event.target) && 
            !searchButton.contains(event.target)) {
            searchResults.style.display = 'none';
        }
    });

   // Function to save requirements (updated to correctly capture quantities from the input fields)
function saveRequirements() {
    if (selectedMedicines.length === 0) {
        alert('No medicines added to the requirements.');
        return;
    }

    // Collect the requirements data including quantities from the input fields
    const requirementsData = selectedMedicines.map(medicine => {
        const row = selectedMedicinesBody.querySelector(`tr[data-id="${medicine.id}"]`); // Find the row for this medicine
        const quantityInput = row.querySelector('.quantity-input'); // Get the input field for quantity
        const quantity = parseInt(quantityInput.value) || 1;  // Use the value from the input field, default to 1 if invalid

        return {
            item_name: medicine.item_name,
            quantity: quantity,  // Capture the quantity
            from_agent: '',  // Assuming the agent is filled out elsewhere in your code
            to_store: '',  // Assuming the store is filled out elsewhere
            date: new Date().toISOString().split('T')[0]  // Save current date as the date for the requirement
        };
    });

    // Now send the data to the server
    fetch('/api/saveRequirements', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requirementsData)
    })
    .then(response => response.json())
    .then(data => {
        alert('Requirements saved successfully!');
    })
    .catch(error => {
        console.error('Error saving requirements:', error);
    });
}


  // Function to fetch requirements by date range
function fetchRequirementsByDateRange() {
    const start = document.getElementById('startDate').value;
    const end = document.getElementById('endDate').value;

    if (!start || !end) {
        alert('Please select both start and end dates.');
        return;
    }

    // Fetch data from the backend
    fetch('/api/fetchRequirementsByDateRange', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ startDate: start, endDate: end })
    })
    .then(response => response.json())
    .then(data => {
        selectedMedicines = data;  // Assuming data returned is an array of selected medicines
        updateSelectedMedicinesTable(); // Update the table to show fetched data
    })
    .catch(error => {
        console.error('Error fetching requirements:', error);
    });
}

// Function to update the table with medicines, including the correct quantity from the fetched data
function updateSelectedMedicinesTable() {
    console.log('Updating table with medicines:', selectedMedicines);
    
    // Clear the table body
    selectedMedicinesBody.innerHTML = '';

    if (selectedMedicines.length === 0) {
        // Show the empty placeholder row
        const emptyRow = document.createElement('tr');
        emptyRow.className = 'empty-row';
        emptyRow.innerHTML = ` 
            <td class="item-placeholder">Item names from search here dynamically</td>
            <td colspan="2" class="empty-placeholder">Leave these two empty</td>
            <td class="input-placeholder">Input: number</td>
            <td class="empty-placeholder"></td> <!-- Empty column for delete button -->
        `;
        selectedMedicinesBody.appendChild(emptyRow);
        return;
    }

    // Add each selected medicine to the table in its own row
    selectedMedicines.forEach((medicine) => {
        const row = document.createElement('tr');
        row.dataset.id = medicine.id;
    
        const nameCell = document.createElement('td');
        nameCell.textContent = medicine.item_name;
    
        const fromAgentCell = document.createElement('td');
        fromAgentCell.contentEditable = 'true';
    
        const toStoreCell = document.createElement('td');
        toStoreCell.contentEditable = 'true';
    
        const quantityCell = document.createElement('td');
        const quantityInput = document.createElement('input');
        quantityInput.type = 'number';
        quantityInput.className = 'quantity-input';
        quantityInput.value = medicine.quantity || 1; // Set initial value from selectedMedicines
        quantityInput.min = '1';
        quantityInput.dataset.id = medicine.id;  // Store the medicine ID as a data attribute
        quantityCell.appendChild(quantityInput);
    
        const actionsCell = document.createElement('td');
    
        // Delete Button
        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Delete';
        deleteButton.className = 'btn clear-btn';
        deleteButton.onclick = function () {
            deleteMedicine(medicine.id, row);
        };
    
        // Done Button
        const doneButton = document.createElement('button');
        doneButton.textContent = 'Done';
        doneButton.className = 'btn done-btn';
        doneButton.onclick = function () {
            row.classList.add('done-row'); // Add green highlight
            markAsProcured(medicine.id);   // Call backend to delete
            row.remove();                  // Remove from table
            selectedMedicines = selectedMedicines.filter(med => med.id !== medicine.id); // Remove from memory
        };
    
        // Append buttons to actionsCell
        actionsCell.appendChild(deleteButton);
        actionsCell.appendChild(doneButton);
    
        // Append all the cells to the row
        row.appendChild(nameCell);
        row.appendChild(fromAgentCell);
        row.appendChild(toStoreCell);
        row.appendChild(quantityCell);
        row.appendChild(actionsCell);  // Add the action buttons cell here
    
        selectedMedicinesBody.appendChild(row);
        console.log('Added row for medicine:', medicine.item_name);
    });
}


// Function to delete the medicine row from the table
function deleteMedicine(medicineId, row) {
    // Remove the medicine from the selected list
    selectedMedicines = selectedMedicines.filter(med => med.id !== medicineId);

    // Remove the row from the table
    row.remove();

    console.log('Deleted row for medicine:', medicineId);
}

function markAsProcured(itemName) {
    if (!itemName) {
        console.error('Invalid item_name, cannot mark as procured');
        return;
    }

    fetch('/api/deleteRequirement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_name: itemName })  // Send item_name
    })
    .then(res => res.json())
    .then(data => {
        console.log('Backend response:', data);  // Log the backend response for debugging
        if (data.message === 'Requirement deleted successfully') {
            console.log(`Requirement with item name "${itemName}" deleted.`);
        } else {
            console.error('Error deleting requirement:', data);
        }
    })
    .catch(err => {
        console.error('Error deleting requirement:', err);
    });
}


});
