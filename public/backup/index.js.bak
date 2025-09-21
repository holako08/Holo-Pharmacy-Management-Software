document.getElementById('login-form').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorMessage = document.getElementById('error-message');
    const loginButton = document.querySelector('.login-button');
    
    // Disable the login button and show loading state
    loginButton.disabled = true;
    loginButton.textContent = 'Logging in...';
    errorMessage.style.display = 'none';
    
    // Basic client-side validation
    if (!username || !password) {
        errorMessage.style.display = 'block';
        errorMessage.textContent = 'Please enter both username and password';
        loginButton.disabled = false;
        loginButton.textContent = 'Login';
        return;
    }
    
    // Set a timeout to handle server not responding
    const timeoutId = setTimeout(() => {
        loginButton.disabled = false;
        loginButton.textContent = 'Login';
        errorMessage.style.display = 'block';
        errorMessage.textContent = 'Server not responding. Please try again.';
    }, 15000); // 15 seconds timeout
    
    // Send login request to server
    fetch('/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
    })
    .then(response => {
        clearTimeout(timeoutId);
        
        // Check if response is ok before parsing JSON
        if (!response.ok) {
            return response.json().then(data => {
                throw new Error(data.message || `Server error: ${response.status}`);
            });
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            // Store user data in session storage for access control
            sessionStorage.setItem('userInfo', JSON.stringify({
                userId: data.userId,
                username: data.username,
                isAdmin: data.isAdmin,
                fullName: data.fullName,
                jobTitle: data.jobTitle
            }));
            
            console.log('Login successful, redirecting to dashboard...');
            
            // Redirect to dashboard
            window.location.href = 'dashboard.html';
        } else {
            // This should not happen if we're handling errors correctly in the catch block
            // but just in case the server sends success: false
            throw new Error(data.message || 'Unknown error occurred');
        }
    })
    .catch(error => {
        console.error('Login error:', error);
        
        // Reset button state
        loginButton.disabled = false;
        loginButton.textContent = 'Login';
        
        // Show error message
        errorMessage.style.display = 'block';
        errorMessage.textContent = error.message || 'Connection error. Please try again.';
    });
});