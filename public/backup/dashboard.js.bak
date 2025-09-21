// Set current date and time
function updateDateTime() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    document.getElementById('current-date-time').textContent = now.toLocaleDateString('en-US', options);
}

// Fetch and update user profile picture
function updateProfilePicture() {
    const userInfoString = sessionStorage.getItem('userInfo');

    if (!userInfoString) {
        window.location.href = 'index.html';
        return;
    }

    try {
        const userInfo = JSON.parse(userInfoString);

        const userPhoto = document.getElementById('user-photo');
        if (userPhoto) {
            userPhoto.onerror = function() {
                console.error('Failed to load user photo. Falling back.');
                userPhoto.src = 'images/default-profile.png'; // fallback image
            };
            userPhoto.src = `/api/user-photo/${userInfo.userId}`;
            console.log('Updated user photo src:', userPhoto.src);
        } else {
            console.error('userPhoto element not found!');
        }
    } catch (error) {
        console.error('Error parsing user info:', error);
        window.location.href = 'index.html';
    }
}




// Check user authentication and access rights
function checkAuth() {
    console.log('Checking authentication status...');
    
    // Get user info from session storage
    const userInfoString = sessionStorage.getItem('userInfo');
    if (!userInfoString) {
        window.location.href = 'index.html';
        return;
    }
    
    try {
        const userInfo = JSON.parse(userInfoString);
        document.querySelector('.username').textContent = userInfo.fullName || userInfo.username;
        document.querySelector('.job-title').textContent = userInfo.jobTitle || 'Staff';
        document.querySelector('.greeting').textContent = `Welcome, ${userInfo.fullName.split(' ')[0] || userInfo.username}`;
        
        // Fetch the profile picture from the backend
        updateProfilePicture();
    } catch (error) {
        console.error('Error parsing userInfo:', error);
        window.location.href = 'index.html';
    }
}

// Function to fetch today's sales for the dashboard
function fetchTodaySales() {
    const today = new Date().toISOString().split('T')[0];

    $.ajax({
        url: '/generate-report',
        method: 'POST',
        data: JSON.stringify({ fromDate: today, toDate: today }),
        contentType: 'application/json',
        success: function(response) {
            console.log('Sales response:', response);
            if (typeof response.totalSales === 'number') {
                $('#totalSalesCard').text('$' + response.totalSales.toFixed(2));
            } else {
                console.warn('No sales data received, setting to $0.00');
                $('#totalSalesCard').text('$0.00');
            }
        },
        error: function(xhr, status, error) {
            console.error("Error fetching today's sales:", status, error);
            $('#totalSalesCard').text('$0.00'); // Ensure zero is displayed on error
        }
    });
}

// Initialize dashboard
function initDashboard() {
    console.log('Initializing dashboard...');
    updateDateTime();
    setInterval(updateDateTime, 60000);
    checkAuth();
    fetchTodaySales();
    fetchLowStockCount();
    fetchNearExpiryCount();
}


// Setup logout functionality
function setupLogout() {
    console.log('Setting up logout functionality');
    const logoutLink = document.querySelector('.dropdown-menu a[href="#"]:last-child');
    if (logoutLink) {
        console.log('Logout link found, attaching event listener');
        logoutLink.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('Logout link clicked');
            
            // Clear session storage
            sessionStorage.removeItem('userInfo');
            console.log('Session storage cleared');
            
            // Call logout API (optional)
            fetch('/logout')
                .then(response => console.log('Logout API response status:', response.status))
                .catch(error => console.error('Logout API error:', error))
                .finally(() => {
                    console.log('Redirecting to login page');
                    // Redirect to login page
                    window.location.href = 'index.html';
                });
        });
    } else {
        console.warn('Logout link not found');
    }
}
function fetchLowStockCount() {
    fetch('/api/quick-stats/low-stock-count')
      .then(res => res.json())
      .then(data => {
          let n = Number(data.count);
          document.getElementById('lowStockCard').textContent = (n > 0) ? n : '0';
      })
      .catch(() => {
          document.getElementById('lowStockCard').textContent = '0';
      });
}

function fetchNearExpiryCount() {
    fetch('/api/quick-stats/near-expiry-count')
      .then(res => res.json())
      .then(data => {
          let n = Number(data.count);
          document.getElementById('nearExpiryCard').textContent = (n > 0) ? n : '0';
      })
      .catch(() => {
          document.getElementById('nearExpiryCard').textContent = '0';
      });
}


// Execute when DOM is fully loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM fully loaded, initializing dashboard');
    initDashboard();
    setupLogout();
});

