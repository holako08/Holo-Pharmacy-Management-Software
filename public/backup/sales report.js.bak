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

        $('#reportData').html('');
        $('#reportNote').text('Fetching report data...');

        $.ajax({
            url: '/generate-report',
            method: 'POST',
            data: JSON.stringify({ fromDate, toDate }),
            contentType: 'application/json',
            success: function (response) {
                fetchEcommerceAndInsuranceSales(fromDate, toDate, function (eCommerceSales, insuranceSales) {
                    const totalSales = response.cashSales + response.cardSales + eCommerceSales + insuranceSales;

                    const reportRows = `
    <tr><td>From Date</td><td>${fromDate}</td></tr>
    <tr><td>To Date</td><td>${toDate}</td></tr>
    <tr><td>Cash Sales</td><td>$${response.cashSales.toFixed(2)}</td></tr>
    <tr><td>Card Sales</td><td>$${response.cardSales.toFixed(2)}</td></tr>
    <tr><td>E-commerce Sales</td><td>$${eCommerceSales.toFixed(2)}</td></tr>
    <tr><td>Insurance Sales</td><td>$${insuranceSales.toFixed(2)}</td></tr>
    <tr><td>Total Sales</td><td>$${totalSales.toFixed(2)}</td></tr>
`;
$('#reportData').html(reportRows);

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

    function fetchEcommerceAndInsuranceSales(fromDate, toDate, callback) {
        $.ajax({
            url: '/fetch-extended-sales',
            method: 'POST',
            data: JSON.stringify({ fromDate, toDate }),
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
    $('#downloadButton').on('click', function () {
        if ($('#reportData').html() === '') {
            alert('No data to download. Please generate a report first.');
            return;
        }
    
        const wb = XLSX.utils.book_new();
        const ws_data = [];
        
        $('#salesTable tr').each(function () {
            const row = [];
            $(this).find('th, td').each(function () {
                row.push($(this).text().trim());
            });
            ws_data.push(row);
        });
    
        const ws = XLSX.utils.aoa_to_sheet(ws_data);
        XLSX.utils.book_append_sheet(wb, ws, 'Sales Report');
        
        XLSX.writeFile(wb, `sales_report_${$('#fromDate').val()}_to_${$('#toDate').val()}.xlsx`);
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
