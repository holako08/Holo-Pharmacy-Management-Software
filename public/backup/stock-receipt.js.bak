let parsedTransfer = null;

document.addEventListener('DOMContentLoaded', function () {
    // Parse button
    document.getElementById('parse-btn').onclick = handleParseFile;
    document.getElementById('confirm-receipt-btn').onclick = handleConfirmReceipt;
});

function handleParseFile() {
    const fileInput = document.getElementById('receipt-file');
    if (!fileInput.files.length) {
        alert('Please select a transfer TXT file.');
        return;
    }
    const formData = new FormData();
    formData.append('transferfile', fileInput.files[0]);
    fetch('/api/stock-mgmt-x9z/upload-stn', {
        method: 'POST',
        body: formData
    })
    .then(r => r.json())
    .then(resp => {
        if (resp.success && resp.transfer) {
            parsedTransfer = resp.transfer;
            showParsedTransfer(parsedTransfer);
        } else {
            alert(resp.error || 'Failed to parse transfer file.');
        }
    })
    .catch(() => alert('Error uploading/reading file.'));
}

function showParsedTransfer(transfer) {
    document.getElementById('parsed-section').style.display = '';
    // Fill preview table
    const tbody = document.querySelector('#preview-table tbody');
    tbody.innerHTML = '';
    for (let i = 0; i < transfer.items.length; i++) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${transfer.items[i]}</td>
            <td>${transfer.batches[i]}</td>
            <td>${transfer.expiry_dates[i]}</td>
            <td>
                <input type="number" min="0" step="any" value="${transfer.quantities[i]}" data-index="${i}" style="width:80px;">
            </td>
        `;
        tbody.appendChild(tr);
    }
    document.getElementById('preview-from').innerText = transfer.branch_from || '';
    document.getElementById('preview-to').innerText = transfer.branch_to || '';
    document.getElementById('preview-sender').innerText = transfer.transferring_user || '';
    document.getElementById('preview-date').innerText = transfer.transfer_date
        ? new Date(transfer.transfer_date).toLocaleString('en-GB', { hour12: false })
        : '';
}


// On confirm, POST to process-receipt
function handleConfirmReceipt() {
    if (!parsedTransfer) return alert('No transfer loaded.');
    // Get edited quantities from table inputs
    const qtyInputs = document.querySelectorAll('#preview-table tbody input[type="number"]');
    const newQuantities = Array.from(qtyInputs).map(input => parseFloat(input.value) || 0);

    fetch('/api/user-info')
        .then(r => r.json())
        .then(resp => {
            const user = resp.user || {};
            const payload = {
                transfer_id: parsedTransfer.transfer_id,
                items: parsedTransfer.items,
                quantities: newQuantities,   // <--- use the edited ones!
                batches: parsedTransfer.batches,
                expiry_dates: parsedTransfer.expiry_dates,
                branch_from: parsedTransfer.branch_from,
                branch_to: parsedTransfer.branch_to,
                sending_user: parsedTransfer.transferring_user,
                receiving_user: user.fullName || user.username || 'Receiving User'
            };
            document.getElementById('confirm-receipt-btn').disabled = true;
            fetch('/api/stock-mgmt-x9z/process-receipt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
            .then(r => r.json())
            .then(resp2 => {
                document.getElementById('confirm-receipt-btn').disabled = false;
                if (resp2.success && resp2.receipt_id) {
                    document.getElementById('receipt-success').style.display = '';
                    document.getElementById('srn-link').href = '/api/stock-mgmt-x9z/generate-srn/' + resp2.receipt_id;
                    document.getElementById('parsed-section').style.display = 'none';
                } else {
                    alert(resp2.error || 'Failed to process receipt.');
                }
            })
            .catch(() => {
                document.getElementById('confirm-receipt-btn').disabled = false;
                alert('Error processing receipt.');
            });
        });
}


document.addEventListener('DOMContentLoaded', function () {
    fetchUserInfo();
    document.getElementById('logout-btn').onclick = logout;
    // ...existing code...
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

