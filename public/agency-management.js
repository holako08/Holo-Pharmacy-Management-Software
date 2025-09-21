// Global variables
let currentPage = 1;
let pageSize = 20;
let totalPages = 1;
let totalRecords = 0;
let searchTerm = '';
let agencies = [];
let currentAgencyId = null;

// DOM elements
const agenciesTable = document.getElementById('agencies-tbody');
const searchInput = document.getElementById('search-input');
const pageSizeSelect = document.getElementById('page-size-select');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const pageInfo = document.getElementById('page-info');
const entriesInfo = document.getElementById('entries-info');
const loadingIndicator = document.getElementById('loading');
const agencyModal = document.getElementById('agency-modal');
const deleteModal = document.getElementById('delete-modal');
const agencyForm = document.getElementById('agency-form');

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    updateProfilePicture();
    setupEventListeners();
    loadAgencies();
});

// Fetch and update user profile picture and name
function updateProfilePicture() {
    const userInfoString = sessionStorage.getItem('userInfo');

    if (!userInfoString) {
        window.location.href = 'index.html';
        return;
    }

    try {
        const userInfo = JSON.parse(userInfoString);
        
        // Debug: Log the userInfo to see what properties are available
        console.log('User Info from session:', userInfo);
        console.log('Available properties:', Object.keys(userInfo));
        
        // Update user name - use fullName (which contains "Omar Hamid")
        const pharmacistNameElement = document.getElementById('pharmacist-name');
        if (pharmacistNameElement) {
            const userName = userInfo.fullName || userInfo.username || 'User';
            console.log('Setting user name to:', userName);
            pharmacistNameElement.textContent = userName;
        }
        
        // Update job title
        const jobTitleElement = document.getElementById('job-title');
        if (jobTitleElement && userInfo.jobTitle) {
            console.log('Setting job title to:', userInfo.jobTitle);
            jobTitleElement.textContent = userInfo.jobTitle;
        }
        
        // Update profile picture
        const userPhoto = document.getElementById('user-photo-img');
        if (userPhoto) {
            userPhoto.onerror = function() {
                console.error('Failed to load user photo. Falling back.');
                userPhoto.src = 'images/default-profile.png';
            };
            
            // Set default image first to avoid 404 error
            userPhoto.src = 'images/default-profile.png';
            
            // Try to load user's actual photo
            if (userInfo.userId) {
                userPhoto.src = `/api/user-photo/${userInfo.userId}`;
            }
        }
    } catch (error) {
        console.error('Error parsing user info:', error);
        window.location.href = 'index.html';
    }
}
// Logout function
function logout() {
    sessionStorage.removeItem('userInfo');
    window.location.href = 'index.html';
}

// Setup event listeners
function setupEventListeners() {
    // Search functionality
    searchInput.addEventListener('input', debounce(handleSearch, 300));
    
    // Page size change
    pageSizeSelect.addEventListener('change', handlePageSizeChange);
    
    // Pagination buttons
    prevBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            loadAgencies();
        }
    });
    
    nextBtn.addEventListener('click', () => {
        if (currentPage < totalPages) {
            currentPage++;
            loadAgencies();
        }
    });
    
    // Add agency button
    document.getElementById('add-agency-btn').addEventListener('click', () => {
        openModal('add');
    });
    
    // Modal close buttons
    document.querySelectorAll('.close').forEach(closeBtn => {
        closeBtn.addEventListener('click', closeModals);
    });
    
    // Cancel buttons
    document.querySelectorAll('.cancel-btn').forEach(cancelBtn => {
        cancelBtn.addEventListener('click', closeModals);
    });
    
    // Form submission
    agencyForm.addEventListener('submit', handleFormSubmit);
    
    // Delete confirmation
    document.getElementById('confirm-delete-btn').addEventListener('click', handleDelete);
    
    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target === agencyModal || e.target === deleteModal) {
            closeModals();
        }
    });
}

// Debounce function for search
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Handle search input
function handleSearch() {
    searchTerm = searchInput.value.trim();
    currentPage = 1;
    loadAgencies();
}

// Handle page size change
function handlePageSizeChange() {
    pageSize = parseInt(pageSizeSelect.value);
    currentPage = 1;
    loadAgencies();
}

// Load agencies from server
async function loadAgencies() {
    showLoading(true);
    
    try {
        const params = new URLSearchParams({
            page: currentPage,
            limit: pageSize,
            search: searchTerm
        });
        
        const response = await fetch(`/api/pharma-agencies-xyz123?${params}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            agencies = data.data;
            totalRecords = data.pagination.total;
            totalPages = data.pagination.totalPages;
            currentPage = data.pagination.currentPage;
            
            renderAgenciesTable();
            updatePaginationInfo();
        } else {
            throw new Error(data.message || 'Failed to load agencies');
        }
    } catch (error) {
        console.error('Error loading agencies:', error);
        showError('Failed to load agencies. Please try again.');
        agenciesTable.innerHTML = '<tr><td colspan="7" class="text-center">Error loading data</td></tr>';
    } finally {
        showLoading(false);
    }
}

// Render agencies table
function renderAgenciesTable() {
    if (agencies.length === 0) {
        agenciesTable.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem; color: #666;">No agencies found</td></tr>';
        return;
    }
    
    agenciesTable.innerHTML = agencies.map(agency => `
        <tr>
            <td>${agency.agency_id}</td>
            <td>${escapeHtml(agency.name || '')}</td>
            <td>${escapeHtml(agency.contact_person || '')}</td>
            <td>${escapeHtml(agency.email || '')}</td>
            <td>${escapeHtml(agency.phone || '')}</td>
            <td>${escapeHtml(agency.address || '')}</td>
            <td>
                <div class="action-buttons">
                    <button class="edit-btn" onclick="openModal('edit', ${agency.agency_id})">Edit</button>
                    <button class="delete-btn" onclick="openDeleteModal(${agency.agency_id}, '${escapeHtml(agency.name)}')">Delete</button>
                </div>
            </td>
        </tr>
    `).join('');
}

// Update pagination information
function updatePaginationInfo() {
    const startRecord = totalRecords === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const endRecord = Math.min(currentPage * pageSize, totalRecords);
    
    entriesInfo.textContent = `Showing ${startRecord} to ${endRecord} of ${totalRecords} entries`;
    pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    
    prevBtn.disabled = currentPage <= 1;
    nextBtn.disabled = currentPage >= totalPages;
}

// Show/hide loading indicator
function showLoading(show) {
    loadingIndicator.style.display = show ? 'flex' : 'none';
}

// Show error message
function showError(message) {
    alert(message); // Simple alert for now, could be enhanced with a toast system
}

// Show success message
function showSuccess(message) {
    alert(message); // Simple alert for now, could be enhanced with a toast system
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Open modal for add/edit
function openModal(mode, agencyId = null) {
    const modalTitle = document.getElementById('modal-title');
    const form = document.getElementById('agency-form');
    
    // Reset form
    form.reset();
    document.getElementById('agency-id').value = '';
    currentAgencyId = null;
    
    if (mode === 'add') {
        modalTitle.textContent = 'Add New Agency';
        agencyModal.style.display = 'block';
    } else if (mode === 'edit' && agencyId) {
        modalTitle.textContent = 'Edit Agency';
        currentAgencyId = agencyId;
        loadAgencyData(agencyId);
        agencyModal.style.display = 'block';
    }
}

// Load agency data for editing
async function loadAgencyData(agencyId) {
    try {
        const response = await fetch(`/api/pharma-agency-detail-xyz123/${agencyId}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            const agency = data.data;
            document.getElementById('agency-id').value = agency.agency_id;
            document.getElementById('agency-name').value = agency.name || '';
            document.getElementById('contact-person').value = agency.contact_person || '';
            document.getElementById('email').value = agency.email || '';
            document.getElementById('phone').value = agency.phone || '';
            document.getElementById('address').value = agency.address || '';
        } else {
            throw new Error(data.message || 'Failed to load agency data');
        }
    } catch (error) {
        console.error('Error loading agency data:', error);
        showError('Failed to load agency data. Please try again.');
        closeModals();
    }
}

// Open delete confirmation modal
function openDeleteModal(agencyId, agencyName) {
    currentAgencyId = agencyId;
    document.getElementById('delete-agency-name').textContent = agencyName;
    deleteModal.style.display = 'block';
}

// Close all modals
function closeModals() {
    agencyModal.style.display = 'none';
    deleteModal.style.display = 'none';
    currentAgencyId = null;
}

// Handle form submission
async function handleFormSubmit(e) {
    e.preventDefault();
    
    const formData = new FormData(agencyForm);
    const agencyData = {
        name: formData.get('name').trim(),
        contact_person: formData.get('contact_person').trim() || null,
        email: formData.get('email').trim() || null,
        phone: formData.get('phone').trim() || null,
        address: formData.get('address').trim() || null
    };
    
    // Validate required fields
    if (!agencyData.name) {
        showError('Agency name is required.');
        return;
    }
    
    // Validate email format if provided
    if (agencyData.email && !isValidEmail(agencyData.email)) {
        showError('Please enter a valid email address.');
        return;
    }
    
    try {
        let url, method;
        
        if (currentAgencyId) {
            // Edit existing agency
            url = `/api/pharma-agency-update-xyz123/${currentAgencyId}`;
            method = 'POST';
        } else {
            // Add new agency
            url = '/api/pharma-agency-create-xyz123';
            method = 'POST';
        }
        
        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(agencyData)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            showSuccess(currentAgencyId ? 'Agency updated successfully!' : 'Agency added successfully!');
            closeModals();
            loadAgencies(); // Reload the table
        } else {
            throw new Error(data.message || 'Failed to save agency');
        }
    } catch (error) {
        console.error('Error saving agency:', error);
        showError('Failed to save agency. Please try again.');
    }
}

// Handle delete
async function handleDelete() {
    if (!currentAgencyId) return;
    
    try {
        const response = await fetch(`/api/pharma-agency-delete-xyz123/${currentAgencyId}`, {
            method: 'POST'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            showSuccess('Agency deleted successfully!');
            closeModals();
            loadAgencies(); // Reload the table
        } else {
            throw new Error(data.message || 'Failed to delete agency');
        }
    } catch (error) {
        console.error('Error deleting agency:', error);
        showError('Failed to delete agency. Please try again.');
    }
}

// Validate email format
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}