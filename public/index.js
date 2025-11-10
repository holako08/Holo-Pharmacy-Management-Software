document.getElementById('login-form').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const branch = document.getElementById('branch').value; // Get the selected branch
    const errorMessage = document.getElementById('error-message');
    const loginButton = document.querySelector('.login-button');
    
    // Disable the login button and show loading state
    loginButton.disabled = true;
    loginButton.textContent = 'Logging in...';
    errorMessage.style.display = 'none';
    
    // Basic client-side validation now includes branch
    if (!username || !password || !branch) {
        errorMessage.style.display = 'block';
        errorMessage.textContent = 'Please enter username, password, and select a branch';
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
    
    // Send login request to server, now with branch
    fetch('/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password, branch }), // Add branch to the request body
    })
    .then(response => {
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            return response.json().then(data => {
                throw new Error(data.message || `Server error: ${response.status}`);
            });
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            // Store user data in session storage, now including the branch
            sessionStorage.setItem('userInfo', JSON.stringify({
                userId: data.userId,
                username: data.username,
                isAdmin: data.isAdmin,
                fullName: data.fullName,
                jobTitle: data.jobTitle,
                branch: data.branch // Store the branch
            }));
            
            console.log('Login successful, redirecting to dashboard...');
            
            // Redirect to dashboard
            window.location.href = 'dashboard.html';
        } else {
            throw new Error(data.message || 'Unknown error occurred');
        }
    })
    .catch(error => {
        console.error('Login error:', error);
        
        loginButton.disabled = false;
        loginButton.textContent = 'Login';
        
        errorMessage.style.display = 'block';
        errorMessage.textContent = error.message || 'Connection error. Please try again.';
    });
});