$(document).ready(function () {
    // Display user info from session
    function checkAuth() {
        const userInfoString = sessionStorage.getItem('userInfo');
        if (!userInfoString) {
            window.location.href = 'index.html';
            return;
        }

        try {
            const userInfo = JSON.parse(userInfoString);
            document.getElementById('userInfo').textContent =
                `${userInfo.jobTitle || 'Staff'} ${userInfo.fullName || userInfo.username} is logged-in`;
                const userPhoto = document.getElementById('user-photo');
            if (userPhoto && userInfo.userId) {
                userPhoto.onerror = function() {
                    userPhoto.src = 'images/default-profile.png';
                };
                userPhoto.src = `/api/user-photo/${userInfo.userId}`;
            }

        } catch (error) {
            console.error('Error parsing userInfo:', error);
            window.location.href = 'index.html';
        }
    }

    checkAuth();

    // Log out functionality
    $('#logOutButton').on('click', function (e) {
        e.preventDefault();
        sessionStorage.removeItem('userInfo');
        fetch('/logout').finally(() => {
            window.location.href = 'index.html';
        });
    });

    // Handle form submit
    $('#reportForm').on('submit', function (event) {
        event.preventDefault();
        const fromDate = $('#fromDate').val();
        const toDate = $('#toDate').val();
        // Get the selected branch value
        const branch = $('#branchSelect').val();

        // Check if a branch is selected
        if (!branch) {
            alert('Please select a branch.');
            return;
        }

        $('#reportData').html('');
        $('#reportNote').text('Fetching report data...');

        $.ajax({
            url: '/generate-report',
            method: 'POST',
            // Pass the branch in the request body
            data: JSON.stringify({ fromDate, toDate, branch }), // <-- Added branch
            contentType: 'application/json',
            success: function (response) {
                // Pass the branch to the next function
                fetchEcommerceAndInsuranceSales(fromDate, toDate, branch, function (eCommerceSales, insuranceSales) { // <-- Added branch
                    const totalSales = response.cashSales + response.cardSales + eCommerceSales + insuranceSales;
                    
                    // Add branch to the report table
                    const branchName = $('#branchSelect option:selected').text(); // Get friendly name
                    const reportRows = `
                        <tr><td>From Date</td><td>${fromDate}</td></tr>
                        <tr><td>To Date</td><td>${toDate}</td></tr>
                        <tr><td>Branch</td><td>${branchName}</td></tr> <tr><td>Cash Sales</td><td>${response.cashSales.toFixed(3)} OMR</td></tr>
                        <tr><td>Card Sales</td><td>${response.cardSales.toFixed(3)} OMR</td></tr>
                        <tr><td>E-commerce Sales</td><td>${eCommerceSales.toFixed(3)} OMR</td></tr>
                        <tr><td>Insurance Sales</td><td>${insuranceSales.toFixed(3)} OMR</td></tr>
                        <tr style="font-weight: bold; background-color: #f0f0f0;"><td>Total Sales</td><td>${totalSales.toFixed(3)} OMR</td></tr>
                    `;
                    $('#reportData').html(reportRows);

                    $('#reportNote').text('Report generated successfully for the selected date range.');
                });
            },
            error: function (xhr, status, error) {
                console.error('AJAX error:', status, error);
                if (xhr.status === 404) {
                    $('#reportNote').html('<div class="note">No sales found for the selected date range.</div>');
                } else {
                    $('#reportNote').html(`<div class="note">Error: ${error}</div>`);
                }
                $('#reportData').html('');
            }
        });
    });

    // Modified function to accept and send branch
    function fetchEcommerceAndInsuranceSales(fromDate, toDate, branch, callback) { // <-- Added branch
        $.ajax({
            url: '/fetch-extended-sales',
            method: 'POST',
            // Pass the branch in the request body
            data: JSON.stringify({ fromDate, toDate, branch }), // <-- Added branch
            contentType: 'application/json',
            success: function (response) {
                const eCommerceSales = response.eCommerceSales || 0;
                const insuranceSales = response.insuranceSales || 0;
                callback(eCommerceSales, insuranceSales);
            },
            error: function () {
                callback(0, 0);
            }
        });
    }

    // Download Excel report
    // REPLACED broken logic with a call to the correct backend endpoint
    $('#downloadButton').on('click', function () {
        const fromDate = $('#fromDate').val();
        const toDate = $('#toDate').val();
        const branch = $('#branchSelect').val();

        if ($('#reportData').html() === '') {
            alert('No data to download. Please generate a report first.');
            return;
        }

        if (!branch) {
            alert('Please select a branch.');
            return;
        }

        // Use fetch to call the new endpoint and handle the file download
        fetch('/api/download-sales-xlsx', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ fromDate, toDate, branch }) // <-- Added branch
        })
        .then(response => {
            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error('No sales data found for the selected criteria.');
                }
                throw new Error('Network response was not ok.');
            }
            return response.blob();
        })
        .then(blob => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `sales_report_${branch.replace(/ /g, '_')}_${fromDate}_to_${toDate}.xlsx`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        })
        .catch(err => {
            console.error('Error downloading Excel report:', err);
            alert(`Error downloading report: ${err.message}`);
        });
    });
    
    

    // Excel-friendly date format
    function formatDateForExcel(dateString) {
        const date = new Date(dateString);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${month}/${day}/${year}`;
    }

    // Ignore button clears the report
    $('#ignoreBtn').on('click', function () {
        location.reload(); // ✅ refreshes the same page so user can select a new date
    });
    

    // Print report button
    $('#printButton').on('click', function () {
        window.print();
    });

    // Set default date
    const today = new Date().toISOString().split('T')[0];
    $('#fromDate').val(today);
    $('#toDate').val(today);
});