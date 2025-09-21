const bcrypt = require('bcrypt');

async function hashPassword(password) {
    try {
        // Hash the password with a salt round of 10
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        console.log('Hashed Password:', hashedPassword);
        return hashedPassword;
    } catch (error) {
        console.error('Error hashing password:', error);
    }
}

// Example usage
const password = "72699414";
hashPassword(password);