let requestItems = [];
let requestingUserName = "";
let requestingUserId = null; // For photo

document.addEventListener('DOMContentLoaded', () => {
    fetchUserInfo(); // Fetch user info and fill all fields

    var _el_search_medicine = document.getElementById('search-medicine');
    if (_el_search_medicine) _el_search_medicine.addEventListener('input', handleSearch);

    document.getElementById('submit-request').onclick = handleSubmitRequest;
    document.getElementById('logout-btn').onclick = logout;
});

// Fetch user info from backend and update the user-info-panel
function fetchUserInfo() {
    fetch('/api/user-info')
      .then(r => r.json())
      .then(data => {
        if (!data.user) return;
        const user = data.user;

        // Set the global variable!
        requestingUserName = user.fullName || user.username || '';

        const userName = document.getElementById('user-name');
        if (userName) userName.textContent = user.fullName;

        const userJob = document.getElementById('user-job-title');
        if (userJob) userJob.textContent = user.jobTitle;

        // Set user photo only if the element exists
        const userPhoto = document.getElementById('user-photo');
        if (userPhoto) {
            userPhoto.onerror = function() {
                userPhoto.src = 'images/default-profile.png';
            };
            userPhoto.src = `/api/user-photo/${user.userId}`;
        }

        // Only set 'requested-by' if the element exists
        const reqBy = document.getElementById('requested-by');
        if (reqBy) reqBy.textContent = user.fullName;
      });
}

function logout() {
    fetch('/logout').finally(() => {
        window.location.href = 'index.html';
    });
}

function handleSearch() {
    const query = this.value.trim();
    if (!query) {
        document.getElementById('search-results').innerHTML = '';
        document.getElementById('search-results').style.display = 'none';
        return;
    }
    fetch('/api/pos/medicines/search?q=' + encodeURIComponent(query))
        .then(r => r.json())
        .then(data => {
            const results = document.getElementById('search-results');
            results.innerHTML = '';
            data.forEach(med => {
                const div = document.createElement('div');
                div.textContent = `${med.item_name}`;
                div.className = 'search-result-row';
                div.onclick = () => addRequestItem(med.item_name);
                results.appendChild(div);
            });
            results.style.display = data.length ? 'block' : 'none';
        });
}

function addRequestItem(item_name) {
    if (requestItems.find(it => it.item_name === item_name)) return;
    requestItems.push({ item_name, qty: 1 });
    renderTable();
    document.getElementById('search-results').style.display = 'none';
    document.getElementById('search-medicine').value = '';
}

function renderTable() {
    const tbody = document.querySelector('#request-table tbody');
    tbody.innerHTML = '';
    requestItems.forEach((it, i) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${it.item_name}</td>
            <td><input type="number" min="1" value="${it.qty}" style="width:65px;" onchange="updateQty(${i},this.value)"></td>
            <td><button onclick="removeItem(${i})">Remove</button></td>
        `;
        tbody.appendChild(tr);
    });
    // Attach helpers to window (so inline onchange works)
    window.updateQty = (idx, v) => { requestItems[idx].qty = parseFloat(v) || 1; };
    window.removeItem = (idx) => { requestItems.splice(idx, 1); renderTable(); };
}

function handleSubmitRequest() {
    const from = document.getElementById('from-branch').value;
    const to = document.getElementById('to-branch').value;
    if (!from || !to || !requestItems.length) {
        alert('Fill all fields and add at least 1 item');
        return;
    }
    // Use requestingUserName (session) only!
    fetch('/api/stock-mgmt-x9z/create-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            from_branch: from,
            to_branch: to,
            requested_by: requestingUserName,
            items: requestItems
        })
    })
    .then(r => r.json())
    .then(resp => {
        if (resp.success && resp.srr_id) {
            document.getElementById('download-links').style.display = '';
            document.getElementById('srr-txt-link').href = `/api/stock-mgmt-x9z/generate-srr-file/${resp.srr_id}`;
        } else {
            alert(resp.message || "Failed to submit stock request");
        }
    })
    .catch(() => {
        alert("Network/server error. Please check connection or contact admin.");
    });
}
