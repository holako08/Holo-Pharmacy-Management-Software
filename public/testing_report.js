document.addEventListener('DOMContentLoaded', function () {
    initializeDateInputs();
    loadUserInfo();
    fetchTests(); // Load page 1 initially
    setupEventListeners();


// Initialize date range inputs
function initializeDateInputs() {
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);
    document.getElementById('startDateInput').valueAsDate = thirtyDaysAgo;
    document.getElementById('endDateInput').valueAsDate = today;
}

// Load user info from sessionStorage
function loadUserInfo() {
    const userInfoString = sessionStorage.getItem('userInfo');
    let userInfo = { fullName: 'Default User', jobTitle: 'Staff' };

    if (userInfoString) {
        try {
            userInfo = JSON.parse(userInfoString);
        } catch (e) {
            console.error('User info parsing error:', e);
        }
    }

    document.getElementById('jobTitle').textContent = userInfo.fullName || userInfo.username || 'Unknown';

    // Add user photo update 🔥
    const userAvatar = document.getElementById('userAvatar');
    if (userAvatar && userInfo.userId) {
        userAvatar.onerror = function() {
            userAvatar.src = 'images/default-profile.png';
        };
        userAvatar.src = `/api/user-photo/${userInfo.userId}`;
    }
}


// Setup all listeners
function setupEventListeners() {
    var _el_logoutBtn = document.getElementById('logoutBtn');
    if (_el_logoutBtn) _el_logoutBtn.addEventListener('click', logout);
    var _el_fetchTestsBtn = document.getElementById('fetchTestsBtn');
    if (_el_fetchTestsBtn) _el_fetchTestsBtn.addEventListener('click', () => fetchTests(1));
    var _el_patientSearchBar = document.getElementById('patientSearchBar');
    if (_el_patientSearchBar) _el_patientSearchBar.addEventListener('input', handleSearchInput);
    var _el_saveReportBtn = document.getElementById('saveReportBtn');
    if (_el_saveReportBtn) _el_saveReportBtn.addEventListener('click', saveReport);
    var _el_clearReportBtn = document.getElementById('clearReportBtn');
    if (_el_clearReportBtn) _el_clearReportBtn.addEventListener('click', clearReport);
}

// Fetch paginated tests
function fetchTests(page = 1) {
    const startDate = document.getElementById('startDateInput').value;
    const endDate = document.getElementById('endDateInput').value;
    if (!startDate || !endDate) return alert('Please enter both start and end dates');

    fetch(`/api/fetchAllTestsPaginated?page=${page}&limit=10`)
        .then(res => res.json())
        .then(data => {
            populateTestsTable(data.data);
            renderPagination(data.totalPages, page);
        })
        .catch(err => {
            console.error('Fetch error:', err);
            alert('Failed to fetch tests.');
        });
}

// Search handler
function handleSearchInput() {
    const searchTerm = this.value.trim();
    if (searchTerm.length >= 2) {
        fetch('/api/searchPatientsForTesting', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ searchTerm })
        })
            .then(res => res.json())
            .then(patients => {
                populateTestsTable(patients);
                document.getElementById('paginationContainer').innerHTML = '';
            })
            .catch(err => console.error('Search error:', err));
    } else if (searchTerm.length === 0) {
        fetchTests(); // reload
    }
}

// Populate table with tests
function populateTestsTable(patients) {
    const tbody = document.getElementById('testsTableBody');
    tbody.innerHTML = '';

    if (!patients || patients.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;">No tests found</td></tr>';
        return;
    }

    patients.forEach((p, i) => {
        const dateStr = p.created_at || p.date_time;
        const date = dateStr ? new Date(dateStr) : null;
        const formattedDate = date && !isNaN(date.getTime())
            ? date.toLocaleDateString() + ' ' + date.toLocaleTimeString()
            : 'N/A';

        const patientInfo = `${p.name || 'N/A'}, ${p.age || 'N/A'} years, ${p.weight || 'N/A'} kg`;
        const bp = (p.systolic && p.diastolic) ? `${p.systolic}/${p.diastolic}` : 'N/A';

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${i + 1}</td>
            <td>${formattedDate}</td>
            <td>${patientInfo}</td>
            <td>${p.smoking || 'N/A'}</td>
            <td>${bp}</td>
            <td>${p.fpg || 'N/A'}</td>
            <td>${p.npg || 'N/A'}</td>
            <td>${p.diagnosis || 'N/A'}</td>
            <td>${p.recommendations || 'N/A'}</td>
            <td>
                <button class="print-btn" data-id="${p.id || i}">Print Report</button>
                <button class="delete-btn" data-id="${p.id || i}">Delete</button>
            </td>
        `;

        row.querySelector('.print-btn').addEventListener('click', () => printTest(p));
        row.querySelector('.delete-btn').addEventListener('click', () => deleteTest(p.id || i));
        tbody.appendChild(row);
    });
}

// Render pagination
function renderPagination(totalPages, currentPage) {
    const container = document.getElementById('paginationContainer');
    container.innerHTML = '';
    for (let i = 1; i <= totalPages; i++) {
        const btn = document.createElement('button');
        btn.textContent = i;
        btn.classList.toggle('active', i === currentPage);
        btn.addEventListener('click', () => fetchTests(i));
        container.appendChild(btn);
    }
}

// Delete a test
function deleteTest(testId) {
    if (!confirm('Are you sure you want to delete this test?')) return;
    fetch(`/api/deleteTest/${testId}`, { method: 'DELETE' })
        .then(res => res.json())
        .then(() => {
            alert('Test deleted successfully');
            fetchTests();
        })
        .catch(err => alert('Error deleting test'));
}

// Save report as Excel
function saveReport() {
    const tests = getFilteredTestsData();
    fetch('/api/download-table2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableData: tests })
    })
        .then(res => res.blob())
        .then(blob => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'testing_report.xlsx';
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        })
        .catch(err => {
            console.error('Download error:', err);
            alert('Error downloading report.');
        });
}

// Get table data for Excel export
function getFilteredTestsData() {
    const rows = document.getElementById('testsTableBody').getElementsByTagName('tr');
    return Array.from(rows).map(row => {
        const cells = row.getElementsByTagName('td');
        return cells.length ? {
            TestID: cells[0].textContent.trim(),
            TestDateTime: cells[1].textContent.trim(),
            PatientInfo: cells[2].textContent.trim(),
            SmokingHistory: cells[3].textContent.trim(),
            SystolicDiastolic: cells[4].textContent.trim(),
            FastingBloodGlucose: cells[5].textContent.trim(),
            NonFastingBloodGlucose: cells[6].textContent.trim(),
            Diagnosis: cells[7].textContent.trim(),
            Recommendation: cells[8].textContent.trim(),
        } : null;
    }).filter(Boolean);
}

// Clear search and reload
function clearReport() {
    document.getElementById('patientSearchBar').value = '';
    document.getElementById('testsTableBody').innerHTML = '';
    fetchTests();
}

// Print test report
function printTest(p) {
    const report = window.open('', '', 'width=800,height=600');
    report.document.write(`
        <html><head><title>Health Report</title></head><body>
        <h1>Health Screening Report</h1>
        <p><strong>Name:</strong> ${p.name}</p>
        <p><strong>Age:</strong> ${p.age}</p>
        <p><strong>Weight:</strong> ${p.weight} kg</p>
        <p><strong>Smoking History:</strong> ${p.smoking}</p>
        <p><strong>Blood Pressure:</strong> ${p.systolic || 'N/A'}/${p.diastolic || 'N/A'}</p>
        <p><strong>FPG:</strong> ${p.fpg}</p>
        <p><strong>NPG:</strong> ${p.npg}</p>
        <p><strong>Results:</strong> ${p.diagnosis}</p>
        <p><strong>Recommendations:</strong> ${p.recommendations}</p>
        <p style="background-color: yellow; padding: 5px;"><mark>This is not a diagnosis, please consult a doctor for further evaluation.</mark></p>
        </body></html>`);
    report.document.close();
    report.print();
}

// Logout
function logout() {
    window.location.href = 'index.html';
}
});
