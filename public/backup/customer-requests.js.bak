let editingRequestId = null; // Track if we’re in edit mode

const customerNameInput = document.getElementById('customer-name-input');
const customerNameList = document.getElementById('customer-name-list');
const phoneNumberInput = document.getElementById('phone-number-input');
const phoneNumberList = document.getElementById('phone-number-list');

const cancelEditBtn = document.getElementById('cancel-edit-btn');
cancelEditBtn.addEventListener('click', function() {
  editingRequestId = null;
  document.getElementById('request-form').reset();
  selectedMedicines = [];
  renderSelectedMedicines();
  document.querySelector('#request-form button[type="submit"]').textContent = 'Add Request';
  cancelEditBtn.style.display = 'none';
});


// Fetch user info on page load
fetchUserInfo();

function fetchUserInfo() {
  fetch('/api/user-info')
    .then(r => r.json())
    .then(data => {
      const user = data.user;
      document.getElementById('user-name').textContent = user.fullName;
      document.getElementById('user-job-title').textContent = user.jobTitle;
      const userPhoto = document.getElementById('user-photo');
      if (userPhoto) {
        userPhoto.onerror = function() {
          userPhoto.src = 'images/default-profile.png';
        };
        userPhoto.src = `/api/user-photo/${user.userId}`;
      }
    });
}
document.getElementById('logout-btn').addEventListener('click', () => {
  fetch('/logout').then(() => window.location.href = '/');
});

// Dynamic medicine search/autocomplete
const medicineSearch = document.getElementById('medicine-search');
const autocompleteList = document.getElementById('autocomplete-list');
const selectedMedicinesDiv = document.getElementById('selected-medicines');
let selectedMedicines = [];

medicineSearch.addEventListener('input', function() {
  const q = this.value.trim();
  if (!q) {
    autocompleteList.innerHTML = '';
    return;
  }
  fetch(`/api/pos/medicines/search?q=${encodeURIComponent(q)}`)
    .then(r => r.json())
    .then(results => {
      autocompleteList.innerHTML = '';
      results.forEach(med => {
        const div = document.createElement('div');
        div.className = 'autocomplete-item';
        div.textContent = `${med.item_name} (${med.price} OMR) [${med.barcode}]`;
        div.onclick = function() {
          if (!selectedMedicines.some(m => m.id === med.id)) {
            selectedMedicines.push(med);
            renderSelectedMedicines();
          }
          medicineSearch.value = '';
          autocompleteList.innerHTML = '';
        };
        autocompleteList.appendChild(div);
      });
    });
});

function renderSelectedMedicines() {
  selectedMedicinesDiv.innerHTML = '';
  selectedMedicines.forEach((m, i) => {
    const span = document.createElement('span');
    span.className = 'selected-medicine';
    span.textContent = `${m.item_name} `;
    const removeBtn = document.createElement('button');
    removeBtn.textContent = '×';
    removeBtn.onclick = () => {
      selectedMedicines.splice(i, 1);
      renderSelectedMedicines();
    };
    span.appendChild(removeBtn);
    selectedMedicinesDiv.appendChild(span);
  });
}

// Form submit
document.getElementById('request-form').addEventListener('submit', function(e) {
  e.preventDefault();
  const formData = new FormData(this);
  if (selectedMedicines.length === 0) {
    alert('Select at least one medicine');
    return;
  }

  const data = {
    customer_name: formData.get('customer_name'),
    phone_number: formData.get('phone_number'),
    required_items: selectedMedicines.map(m => m.item_name).join(', ')
  };

  if (editingRequestId) {
    // Edit mode: update
    fetch(`/api/cr-req-x7c1/${editingRequestId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'CSRF-Token': csrfToken() },
      body: JSON.stringify({ ...data, status: 'pending' }) // Keep as pending on edit
    })
    .then(r => r.json())
    .then(res => {
      if (res.success) {
        this.reset();
        selectedMedicines = [];
        renderSelectedMedicines();
        loadRequests();
        editingRequestId = null;
        document.querySelector('#request-form button[type="submit"]').textContent = 'Add Request';
      } else {
        alert('Update failed.');
      }
      cancelEditBtn.style.display = 'none';
    });
  } else {
    // Add mode: create new
    fetch('/api/cr-req-x7c1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CSRF-Token': csrfToken() },
      body: JSON.stringify(data)
    })
    .then(r => r.json())
    .then(res => {
      if (res.success) {
        selectedMedicines = [];
        renderSelectedMedicines();
        this.reset();
        loadRequests();
      }
    });
  }
});


// Requests table load/render
function loadRequests() {
  fetch('/api/cr-req-x7c1')
    .then(r => r.json())
    .then(data => {
      const container = document.getElementById('requests-table-container');
      container.innerHTML = `<table>
        <tr>
          <th>#</th>
<th>Customer</th>
<th>Phone</th>
<th>Items</th>
<th>Date/Time</th>
<th>Status</th>
<th>Recorded By</th>
<th>Completed By</th>
<th>Actions</th>
        </tr>
        ${data.map(r => `
        <tr>
          <td>${r.id}</td>
<td>${r.customer_name}</td>
<td>${r.phone_number}</td>
<td>${r.required_items}</td>
<td>${formatDate(r.request_datetime)}</td>
<td>${r.status === 'pending' ? '<span class="pending">Pending</span>' : '<span class="completed">Completed</span>'}</td>
<td>${r.recorded_by_pharmacist || ''}</td>
<td>${r.completed_by_pharmacist || ''}</td>
<td>
  <button onclick="editRequest(${r.id})">Edit</button>
  <button onclick="deleteRequest(${r.id})">Delete</button>
  ${r.status === 'pending' ? `<button onclick="markComplete(${r.id})">Complete</button>` : ''}
</td>

        </tr>`).join('')}
      </table>`;
    });
}
loadRequests();

function formatDate(dt) {
  if (!dt) return '';
  const d = new Date(dt);
  return d.toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' });
}

// Add edit/delete/complete logic as required, using API endpoints.

// Utility to get CSRF token from meta or cookie, as implemented on backend
function csrfToken() {
  // Example: from meta tag or cookie. Implement as per your CSRF solution.
  return document.querySelector('meta[name="csrf-token"]')?.content || '';
}

// --- Edit Request ---
function editRequest(id) {
  fetch('/api/cr-req-x7c1')
    .then(r => r.json())
    .then(data => {
      const req = data.find(r => r.id === id);
      if (!req) return alert('Request not found.');

      // Set edit mode
      editingRequestId = id;

      // Fill form fields
      document.querySelector('[name="customer_name"]').value = req.customer_name;
      document.querySelector('[name="phone_number"]').value = req.phone_number;

      // Fill selected medicines using the required_items text
      selectedMedicines = [];
      const items = req.required_items.split(',').map(item => item.trim()).filter(Boolean);

      // For best UX, fetch medicine details from DB if possible
      Promise.all(items.map(item =>
        fetch(`/api/pos/medicines/search?q=${encodeURIComponent(item)}`)
          .then(r => r.json())
          .then(results => results.find(m => m.item_name === item) || { item_name: item, id: Math.random() })
      )).then(meds => {
        selectedMedicines = meds;
        renderSelectedMedicines();
      });

      // Change button to "Update"
      const addBtn = document.querySelector('#request-form button[type="submit"]');
      addBtn.textContent = 'Update Request';
      cancelEditBtn.style.display = 'inline-block';
    });
}

// --- Delete Request ---
function deleteRequest(id) {
  if (!confirm('Are you sure you want to delete this request?')) return;
  fetch(`/api/cr-req-x7c1/${id}`, {
    method: 'DELETE',
    headers: { 'CSRF-Token': csrfToken() }
  })
  .then(r => r.json())
  .then(res => {
    if (res.success) {
      loadRequests();
    } else {
      alert('Delete failed.');
    }
  });
}

// --- Mark Complete ---
function markComplete(id) {
  // Find the row for status
  fetch(`/api/cr-req-x7c1`)
    .then(r => r.json())
    .then(data => {
      const req = data.find(r => r.id === id);
      if (!req) return alert('Request not found.');
      fetch(`/api/cr-req-x7c1/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'CSRF-Token': csrfToken() },
        body: JSON.stringify({
          customer_name: req.customer_name,
          phone_number: req.phone_number,
          required_items: req.required_items,
          status: 'completed'
        })
      })
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          loadRequests();
        } else {
          alert('Mark as complete failed.');
        }
      });
    });
}

// --- Customer Name Autocomplete ---
customerNameInput.addEventListener('input', function() {
  const q = this.value.trim();
  if (!q) {
    customerNameList.innerHTML = '';
    return;
  }
  fetch(`/api/cr-req-x7k2/suggest-customer-name?q=${encodeURIComponent(q)}`)
    .then(r => r.json())
    .then(names => {
      customerNameList.innerHTML = '';
      names.forEach(name => {
        const div = document.createElement('div');
        div.className = 'autocomplete-item';
        div.textContent = name;
        div.onclick = function() {
          customerNameInput.value = name;
          customerNameList.innerHTML = '';
        };
        customerNameList.appendChild(div);
      });
    });
});
customerNameInput.addEventListener('blur', () => setTimeout(() => customerNameList.innerHTML = '', 100));

// --- Phone Number Autocomplete ---
phoneNumberInput.addEventListener('input', function() {
  const q = this.value.trim();
  if (!q) {
    phoneNumberList.innerHTML = '';
    return;
  }
  fetch(`/api/cr-req-x7k2/suggest-phone-number?q=${encodeURIComponent(q)}`)
    .then(r => r.json())
    .then(numbers => {
      phoneNumberList.innerHTML = '';
      numbers.forEach(number => {
        const div = document.createElement('div');
        div.className = 'autocomplete-item';
        div.textContent = number;
        div.onclick = function() {
          phoneNumberInput.value = number;
          phoneNumberList.innerHTML = '';
        };
        phoneNumberList.appendChild(div);
      });
    });
});
phoneNumberInput.addEventListener('blur', () => setTimeout(() => phoneNumberList.innerHTML = '', 100));