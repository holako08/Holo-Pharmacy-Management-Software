// Set current date and time
function updateDateTime() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    document.getElementById('current-date-time').textContent = now.toLocaleDateString('en-US', options);
}

// Check authentication status on page load
document.addEventListener('DOMContentLoaded', function() {
    fetch('/api/user-info')
        .then(response => {
            if (!response.ok) {
                window.location.href = '/'; // Redirect to login if not authenticated
                throw new Error('Not authenticated');
            }
            return response.json();
        })
        .then(data => {
            // Display user info
            document.getElementById('loggedInUser').textContent = data.user.fullName || data.user.username;
            const userPhoto = document.getElementById('user-photo');
if (userPhoto && data.user.userId) {
    userPhoto.onerror = () => userPhoto.src = 'images/default-profile.png';
    userPhoto.src = `/api/user-photo/${data.user.userId}`;
}

            
            // Check if user is admin
            if (!data.user.isAdmin) {
                alert('Access denied. Admins only.');
                window.location.href = '/';
            }
            
            // Load users data
            loadUsers();
        })
        .catch(error => {
            console.error('Authentication error:', error);
        });

    // Setup event listeners
    var _el_showAddUserFormBtn = document.getElementById('showAddUserFormBtn');
    if (_el_showAddUserFormBtn) _el_showAddUserFormBtn.addEventListener('click', showAddUserForm);
    var _el_clearAddForm = document.getElementById('clearAddForm');
    if (_el_clearAddForm) _el_clearAddForm.addEventListener('click', clearAddForm);
    var _el_cancelEdit = document.getElementById('cancelEdit');
    if (_el_cancelEdit) _el_cancelEdit.addEventListener('click', cancelEdit);
    var _el_logoutBtn = document.getElementById('logoutBtn');
    if (_el_logoutBtn) _el_logoutBtn.addEventListener('click', logout);

    // Form submissions
    var _el_addUserFormElement = document.getElementById('addUserFormElement');
    if (_el_addUserFormElement) _el_addUserFormElement.addEventListener('submit', addUser);
    var _el_editUserFormElement = document.getElementById('editUserFormElement');
    if (_el_editUserFormElement) _el_editUserFormElement.addEventListener('submit', updateUser);
});

// Show/hide forms
function showAddUserForm() {
    document.getElementById('addUserForm').style.display = 'block';
}

function cancelEdit() {
    document.getElementById('editUserForm').style.display = 'none';
}

function clearAddForm() {
    document.getElementById('addUserFormElement').reset();
}

// Load users data
function loadUsers() {
    fetch('/api/getUsers')
        .then(response => response.json())
        .then(users => {
            const tableBody = document.getElementById('usersTableBody');
            tableBody.innerHTML = '';
            
            users.forEach(user => {
                const row = tableBody.insertRow();
                row.insertCell().textContent = user.Username;
                row.insertCell().textContent = user.IsAdmin ? 'Yes' : 'No';
                row.insertCell().textContent = user.FullName || '';
                row.insertCell().textContent = user.JobTitle || '';
                row.insertCell().textContent = user.Gender || '';

                let birthdate = user.Birthdate || '';
                if (birthdate) {
                    const date = new Date(birthdate);
                    const day = date.getDate().toString().padStart(2, '0');
                    const month = (date.getMonth() + 1).toString().padStart(2, '0');
                    const year = date.getFullYear();
                    birthdate = `${day}/${month}/${year}`;
                }
                row.insertCell().textContent = birthdate;

                row.insertCell().textContent = user.PhoneNumber || '';
                row.insertCell().textContent = user.IDNumber || '';
                row.insertCell().textContent = user.LicenseNumber || '';

                const photoCell = row.insertCell();
                if (user.Photo) {
                    const img = document.createElement('img');
                    img.src = user.Photo;
                    img.alt = "User photo";
                    img.style.width = '50px';
                    img.style.height = '50px';
                    photoCell.appendChild(img);
                } else {
                    photoCell.textContent = 'No photo';
                }

                const actionsCell = row.insertCell();
                const deleteBtn = document.createElement('button');
                deleteBtn.textContent = 'Delete';
                deleteBtn.className = 'action-btn delete-btn';
                deleteBtn.onclick = function() { deleteUser(user.UserID); };
                actionsCell.appendChild(deleteBtn);

                const editBtn = document.createElement('button');
                editBtn.textContent = 'Edit';
                editBtn.className = 'action-btn edit-btn';
                editBtn.onclick = function() { editUser(user.UserID); };
                actionsCell.appendChild(editBtn);
    });
        })
        .catch(error => {
            console.error('Error loading users:', error);
            alert('Error loading users. Please try again.');
        });
}

// Add a new user
function addUser(e) {
    e.preventDefault();
    const formData = new FormData(document.getElementById('addUserFormElement'));
    
    fetch('/api/addUser', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert('User added successfully');
            document.getElementById('addUserFormElement').reset();
            document.getElementById('addUserForm').style.display = 'none';
            loadUsers();
        } else {
            alert('Error adding user: ' + data.message);
        }
    })
    .catch(error => {
        console.error('Error adding user:', error);
        alert('Error adding user. Please try again.');
    });
}

// Edit user
function editUser(userId) {
    fetch('/api/getUser', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ userId })
    })
    .then(response => response.json())
    .then(user => {
        document.getElementById('editUserId').value = user.UserID;
        document.getElementById('editUsername').value = user.Username;
        document.getElementById('editPassword').value = '';
        
        // Set radio buttons
        if (user.IsAdmin === 1) {
            document.getElementById('editIsAdminYes').checked = true;
        } else {
            document.getElementById('editIsAdminNo').checked = true;
        }
        
        // Set gender radio buttons
        if (user.Gender === 'male') {
            document.getElementById('editGenderMale').checked = true;
        } else if (user.Gender === 'female') {
            document.getElementById('editGenderFemale').checked = true;
        } else {
            document.getElementById('editGenderOther').checked = true;
        }
        
        document.getElementById('editFullName').value = user.FullName || '';
        document.getElementById('editJobTitle').value = user.JobTitle || '';
        
        // Format birthdate for input field
        let birthdate = user.Birthdate || '';
        if (birthdate) {
            const date = new Date(birthdate);
            birthdate = date.toISOString().split('T')[0];
        }
        document.getElementById('editBirthdate').value = birthdate;
        
        document.getElementById('editEmail').value = user.Email || '';
        document.getElementById('editPhoneNumber').value = user.PhoneNumber || '';
        document.getElementById('editIDNumber').value = user.IDNumber || '';
        document.getElementById('editLicenseNumber').value = user.LicenseNumber || '';

        // Show the edit form
        document.getElementById('editUserForm').style.display = 'block';
    })
    .catch(error => {
        console.error('Error fetching user data:', error);
        alert('Error fetching user data. Please try again.');
    });
}

// Update user
function updateUser(e) {
    e.preventDefault();
    const formData = new FormData(document.getElementById('editUserFormElement'));
    
    fetch('/api/updateUser', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert('User updated successfully');
            document.getElementById('editUserForm').style.display = 'none';
            loadUsers();
        } else {
            alert('Error updating user: ' + data.message);
        }
    })
    .catch(error => {
        console.error('Error updating user:', error);
        alert('Error updating user. Please try again.');
    });
}

// Delete user
function deleteUser(userId) {
    if (confirm('Are you sure you want to delete this user?')) {
        fetch('/api/deleteUser', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ userId })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                alert('User deleted successfully');
                loadUsers();
            } else {
                alert('Error deleting user: ' + data.message);
            }
        })
        .catch(error => {
            console.error('Error deleting user:', error);
            alert('Error deleting user. Please try again.');
        });
    }
}

// Logout function
function logout() {
    fetch('/logout')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                window.location.href = '/';
            }
        })
        .catch(error => {
            console.error('Error logging out:', error);
            alert('Error logging out. Please try again.');
        });
}