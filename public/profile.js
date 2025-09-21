document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('profileFormUnique');
    const status = document.getElementById('updateStatusUnique');
    const photoInput = document.getElementById('profilePhotoInput');
    const photoPreview = document.getElementById('profilePhotoPreview');
  
    const editBtn = document.getElementById('editBtnUnique');
    const saveBtn = document.getElementById('saveBtnUnique');
    const cancelBtn = document.getElementById('cancelBtnUnique');
    const togglePassword = document.getElementById('togglePassword');
    const passwordInput = document.getElementById('passwordUpdateUnique');
  
    const formElements = document.querySelectorAll('#profileFormUnique input, #profileFormUnique select');
    formElements.forEach(input => input.disabled = true);
    photoInput.disabled = true;
  
    // Load user profile
    fetch('/api/getUserProfileUnique', {
      method: 'GET',
      credentials: 'include'
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          const u = data.user;
          document.getElementById('userIdUnique').value = u.UserID;
          document.getElementById('usernameUnique').value = u.Username;
          document.getElementById('fullNameUnique').value = u.FullName || '';
          document.getElementById('emailUnique').value = u.Email || ''; // Ensure DB has email field
          document.getElementById('jobTitleUnique').value = u.JobTitle || '';
          document.getElementById('genderUnique').value = u.Gender || 'Other';
          document.getElementById('birthdateUnique').value = u.Birthdate?.split('T')[0] || '';
          photoPreview.src = u.Photo || 'default.png';
        } else {
          status.textContent = data.message || 'Failed to load user profile.';
        }
      })
      .catch(() => status.textContent = 'Error loading profile');
  
    // Preview photo
    photoInput.addEventListener('change', e => {
      const file = e.target.files[0];
      if (file) {
        photoPreview.src = URL.createObjectURL(file);
      }
    });
  
    // Enable editing
    editBtn.addEventListener('click', () => {
      formElements.forEach(input => input.disabled = false);
      passwordInput.value = '';
      photoInput.disabled = false;
      editBtn.style.display = 'none';
      saveBtn.style.display = 'inline-block';
      cancelBtn.style.display = 'inline-block';
    });
  
    // Cancel editing
    cancelBtn.addEventListener('click', () => {
      window.location.reload();
    });
  
    // Toggle password visibility
    togglePassword.addEventListener('click', () => {
      const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
      passwordInput.setAttribute('type', type);
      togglePassword.textContent = type === 'password' ? '👁️' : '🙈';
    });
  
    // Save changes
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData();
      formData.append('userId', document.getElementById('userIdUnique').value);
      formData.append('fullName', document.getElementById('fullNameUnique').value);
      formData.append('email', document.getElementById('emailUnique').value);
      formData.append('jobTitle', document.getElementById('jobTitleUnique').value);
      formData.append('gender', document.getElementById('genderUnique').value);
      formData.append('birthdate', document.getElementById('birthdateUnique').value);
      formData.append('password', passwordInput.value);
      if (photoInput.files[0]) {
        formData.append('photo', photoInput.files[0]);
      }
  
      try {
        const res = await fetch('/api/updateProfileInfoUnique', {
          method: 'POST',
          credentials: 'include',
          body: formData,
        });
        const data = await res.json();
        status.textContent = data.message;
        if (data.success) {
          setTimeout(() => window.location.reload(), 1200);
        }
      } catch (err) {
        status.textContent = 'Error updating profile.';
      }
    });
  });
  