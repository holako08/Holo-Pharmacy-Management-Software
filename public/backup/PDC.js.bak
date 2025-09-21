let drugs = [];

document.addEventListener('DOMContentLoaded', () => {
  fetchDrugs();

  document.getElementById('doseSearchInput').addEventListener('input', function () {
    renderDoseSuggestions(this.value);
  });

  // User info
  const userInfoString = sessionStorage.getItem('userInfo');
  if (!userInfoString) {
    window.location.href = 'index.html';
    return;
  }

  try {
    const userInfo = JSON.parse(userInfoString);
    document.getElementById('pharmacist-name').textContent = userInfo.fullName || userInfo.username;
    document.getElementById('job-title').textContent = userInfo.jobTitle || 'Staff';

    const userPhoto = document.getElementById('user-photo');
    if (userPhoto && userInfo.userId) {
      userPhoto.onerror = () => userPhoto.src = 'images/default-profile.png';
      userPhoto.src = `/api/user-photo/${userInfo.userId}`;
    }
  } catch {
    window.location.href = 'index.html';
  }
});



// Fetch drugs from backend (MySQL)
function fetchDrugs() {
  fetch('/api/pdc/drugs')
    .then(res => res.json())
    .then(data => {
      drugs = data;
      renderDoseSuggestions(); // ✅ instead of populateDrugDropdown
      renderDrugList();
    });
}


// Populate dropdown list
function renderDoseSuggestions(filter = '') {
  const container = document.getElementById('doseSuggestions');
  container.innerHTML = '';

  const filtered = drugs.filter(drug =>
    drug.name.toLowerCase().includes(filter.toLowerCase())
  );

  filtered.forEach(drug => {
    const div = document.createElement('div');
    div.textContent = drug.name;
    div.style.padding = '8px';
    div.style.cursor = 'pointer';
    div.style.borderBottom = '1px solid #eee';
    div.addEventListener('click', () => {
      // Set name and fill dose field
      document.getElementById('doseSearchInput').value = drug.name;
      document.getElementById('doseDescription').innerText = drug.dose;

      // Auto-fill adult dose input
      const match = drug.dose.match(/(\d+(\.\d+)?)/);
      if (match) {
        document.getElementById('dose').value = match[1];
        calculateDose();
      }

      container.innerHTML = ''; // clear suggestions
    });
    container.appendChild(div);
  });
}

// Unit conversion
function convertUnits(weight, dose, weightUnit, doseUnit) {
  if (weightUnit === 'lbs') weight *= 0.453592; // Convert lbs to kg
  if (doseUnit === 'g') dose *= 1000; // Convert g to mg
  return { weight, dose };
}

// Pediatric dose calculation logic
function calculateDose() {
  const weight = parseFloat(document.getElementById('weight').value) || 0;
  const dose = parseFloat(document.getElementById('dose').value) || 0;
  const syrupMg = parseFloat(document.getElementById('syrupMg').value) || 0;
  const syrupMl = parseFloat(document.getElementById('syrupMl').value) || 0;
  const weightUnit = document.getElementById('weightUnit').value;
  const doseUnit = document.getElementById('doseUnit').value;

  const { weight: convertedWeight, dose: convertedDose } = convertUnits(weight, dose, weightUnit, doseUnit);
  const pediatricDoseMg = convertedWeight * convertedDose;
  const doseInMl = (pediatricDoseMg / syrupMg) * syrupMl;

  document.querySelector('.result-box p').innerText = `Pediatric Dose: ${doseInMl.toFixed(2)} mL`;
}

// Clear form inputs
function clearInputs() {
  document.querySelectorAll('input').forEach(input => input.value = '');
  document.querySelector('.result-box p').innerText = 'Dose result here';
}

// Handle input and button events
document.querySelectorAll('input').forEach(input => {
  input.addEventListener('input', calculateDose);
});

document.querySelector('.calculate-btn').addEventListener('click', calculateDose);
document.querySelector('.clear-btn').addEventListener('click', clearInputs);

// Modal manager open/close
function openDoseManager() {
  document.getElementById('doseManagerModal').style.display = 'flex';
  renderDrugList();
}

function closeDoseManager() {
  document.getElementById('doseManagerModal').style.display = 'none';
}

// Render drug list inside modal with edit/delete buttons
function renderDrugList() {
  const list = document.getElementById('drugList');
  if (!list) return;
  list.innerHTML = '';
  drugs.forEach((drug, index) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <strong>${drug.name}</strong>: ${drug.dose}
      <button onclick="editDrug(${index})">✏️</button>
      <button onclick="deleteDrug(${index})">❌</button>
    `;
    list.appendChild(li);
  });
}

// Add or update a drug (MySQL)
function addNewDrug() {
  const name = document.getElementById('newDrugName').value.trim();
  const dose = document.getElementById('newDrugDose').value.trim();
  if (!name || !dose) return alert("Both fields required.");

  fetch('/api/pdc/drug', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, dose })
  }).then(() => {
    document.getElementById('newDrugName').value = '';
    document.getElementById('newDrugDose').value = '';
    fetchDrugs();
  });
}

// Load drug data into input fields for editing
function editDrug(index) {
  const drug = drugs[index];
  document.getElementById('newDrugName').value = drug.name;
  document.getElementById('newDrugDose').value = drug.dose;
}

// Delete drug from MySQL
function deleteDrug(index) {
  const id = drugs[index].id;
  if (!confirm("Are you sure you want to delete this entry?")) return;

  fetch(`/api/pdc/drug/${id}`, { method: 'DELETE' })
    .then(() => fetchDrugs());
}

// On page load, fetch drugs and user info
document.addEventListener('DOMContentLoaded', () => {
  fetchDrugs();

  const userInfoString = sessionStorage.getItem('userInfo');
  if (!userInfoString) {
    window.location.href = 'index.html';
    return;
  }

  try {
    const userInfo = JSON.parse(userInfoString);
    document.getElementById('pharmacist-name').textContent = userInfo.fullName || userInfo.username;
    document.getElementById('job-title').textContent = userInfo.jobTitle || 'Staff';

    const userPhoto = document.getElementById('user-photo');
    if (userPhoto && userInfo.userId) {
      userPhoto.onerror = function () {
        userPhoto.src = 'images/default-profile.png';
      };
      userPhoto.src = `/api/user-photo/${userInfo.userId}`;
    }
  } catch (error) {
    window.location.href = 'index.html';
  }
});

// Log out
function logout() {
  window.location.href = 'index.html';
}
