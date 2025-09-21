const express = require('express');
const mysql2 = require('mysql2');
const bodyParser = require('body-parser');
const cors = require('cors');
const xlsx = require('xlsx');
const moment = require('moment');
const bcrypt = require('bcrypt');
const expressSession = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const workbook = new ExcelJS.Workbook();

const app = express();
const port = 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads')); // Serve uploaded files

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
      cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
      cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

/*databases connection*/
const medicinesPool = mysql2.createPool({
    host: 'localhost',
    user: 'root',
    password: '200800',
    database: 'medicines',
    connectionLimit: 10
});

const billsPool = mysql2.createPool({
    host: 'localhost',
    user: 'root',
    password: '200800',
    database: 'bills',
});

const connection = mysql2.createConnection({
  host: 'localhost',
  user: 'root',         
  password: '200800',         
  database: 'userauthdb'
});

const healthDBPool = mysql2.createPool({
  host: 'localhost',
  user: 'root',
  password: '200800',
  database: 'health_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
}).promise();

// Pool for medicine_requirements database
const medicineRequirementsPool = mysql2.createPool({
  host: 'localhost',
  user: 'root',            // Replace with your MySQL username
  password: '200800',      // Replace with your MySQL password
  database: 'medicine_requirements_db', // Your new database
  connectionLimit: 10
});

//requests pool
const requestsPool = mysql2.createPool({
  host: 'localhost',
  user: 'root',
  password: '200800', // your actual MySQL root password
  database: 'pharmacy_requests_db', // <-- THIS new database!
  connectionLimit: 10
});

const crossSellingPool = mysql2.createPool({
  host: 'localhost',
  user: 'root',
  password: '200800',
  database: 'cross_selling_db',
  waitForConnections: true,
  connectionLimit: 10
});

const pdcpool = mysql2.createPool({
  host: 'localhost',
  user: 'root',
  password: '200800',
  database: 'PDC',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const taskspool = mysql2.createPool({
  host: 'localhost',
  user: 'root',
  password: '200800',
  database: 'tasks'
});

const customerRequestsPool = mysql2.createPool({
  host: 'localhost',
  user: 'root',
  password: '200800',
  database: 'customer-requests-db',
  connectionLimit: 10
});

const stockTransactionsPool = require('mysql2').createPool({
    host: 'localhost',
    user: 'root',
    password: '200800',
    database: 'stock_transactions',
    connectionLimit: 10
});

const popool = mysql2.createPool({
    host: 'localhost',
    user: 'root',
    password: '200800',
    database: 'purchase_goods',
    connectionLimit: 10
});


// Connect to MySQL
connection.connect(error => {
  if (error) {
      console.error('Error connecting to MySQL database:', error);
      return;
  }
  console.log('Successfully connected to MySQL database');
});

// Get the next purchase order ID (AUTO_INCREMENT from purchase_orders)
app.get('/api/purchase-orders/next-po-id', async (req, res) => {
    try {
        const [rows] = await popool.promise().query(
            `SELECT MAX(po_id) AS maxId FROM purchase_orders`
        );
        const nextId = rows[0].maxId ? rows[0].maxId + 1 : 1;
        res.json({ po_id: nextId });
    } catch (err) {
        console.error('Error fetching next PO ID:', err);
        return res.status(500).json({ error: 'Failed to fetch next PO ID' });
    }
});

// Test database connection
async function testConnection() {
    try {
        const connection = await pool.getConnection();
        console.log('✅ Database connected successfully');
        connection.release();
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        process.exit(1);
    }
}

// Helper function to format response
const formatResponse = (success, data = null, message = '', pagination = null) => {
    const response = { success, message };
    if (data !== null) response.data = data;
    if (pagination) response.pagination = pagination;
    return response;
};

// Helper function to handle async route errors
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = connection;

// Search medicine by name
app.get('/api/pos/medicines/search', (req, res) => {
  const { q } = req.query;
  const query = `
  SELECT id, item_name, barcode, price
  FROM medicines_table 
  WHERE item_name LIKE ? 
     OR active_name_1 LIKE ? 
     OR active_name_2 LIKE ? 
     OR CAST(barcode AS CHAR) LIKE ? 
  LIMIT 50
`;

  const likeQ = `%${q}%`;
  medicinesPool.query(query, [likeQ, likeQ, likeQ, likeQ], (err, rows) => {
    if (err) {
      console.error("Error in /medicines/search:", err);
      return res.status(500).json({ error: 'Search failed' });
    }
    res.json(rows);
  });
});

// Enhanced medicine search: each batch is a row (with batch info)
app.get('/api/pos/medicines/search-with-batches', async (req, res) => {
  const { q } = req.query;

  // Get all medicines matching the query (by name, active, or barcode)
  const meds = await new Promise((resolve, reject) => {
    const sql = `
      SELECT id, item_name, barcode, price
      FROM medicines_table
      WHERE item_name LIKE ? OR active_name_1 LIKE ? OR active_name_2 LIKE ? OR CAST(barcode AS CHAR) LIKE ?
      LIMIT 50
    `;
    const likeQ = `%${q}%`;
    medicinesPool.query(sql, [likeQ, likeQ, likeQ, likeQ], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

  // For each medicine, get its batches (all batches, any stock, sorted by expiry)
  const allResults = [];
  for (let med of meds) {
    const [batches] = await medicinesPool.promise().query(
      `SELECT batch_id, batch_number, expiry, quantity
       FROM batches
       WHERE medicine_id = ?
       ORDER BY expiry ASC, batch_id ASC`,
      [med.id]
    );
    if (batches.length > 0) {
      for (let batch of batches) {
        allResults.push({
          id: med.id,
          item_name: med.item_name,
          price: med.price,
          barcode: med.barcode,
          batch_id: batch.batch_id,
          batch_number: batch.batch_number,
          expiry: batch.expiry,
          stock: batch.quantity
        });
      }
    } else {
      // Medicine with no batches (legacy/fallback)
      allResults.push({
        id: med.id,
        item_name: med.item_name,
        price: med.price,
        barcode: med.barcode,
        batch_id: null,
        batch_number: null,
        expiry: null,
        stock: null
      });
    }
  }
  res.json(allResults);
});


// Get medicine by ID, with all batches (sorted by expiry)
app.get('/api/pos/medicines/get-by-id/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // Get main medicine record
    const [medRows] = await medicinesPool.promise().query(
      'SELECT * FROM medicines_table WHERE id = ?',
      [id]
    );
    if (!medRows.length) {
      return res.status(404).json({ error: 'Item not found' });
    }
    const medicine = medRows[0];

    // Get all batches for this medicine, sorted by expiry
    const [batches] = await medicinesPool.promise().query(
      'SELECT * FROM batches WHERE medicine_id = ? ORDER BY expiry ASC, batch_id ASC',
      [id]
    );

    res.json({
      ...medicine,
      batches // Array of all batches (can be empty)
    });
  } catch (err) {
    console.error("Error in /medicines/get-by-id:", err);
    res.status(500).json({ error: 'Failed to load item' });
  }
});


// Get medicine by name, with all batches (sorted by expiry)
app.get('/api/pos/medicines/get-by-name/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const [medRows] = await medicinesPool.promise().query(
      'SELECT * FROM medicines_table WHERE item_name = ? LIMIT 1',
      [name]
    );
    if (!medRows.length) {
      return res.status(404).json({ error: 'Medicine not found' });
    }
    const medicine = medRows[0];

    // Get all batches for this medicine, sorted by expiry
    const [batches] = await medicinesPool.promise().query(
      'SELECT * FROM batches WHERE medicine_id = ? ORDER BY expiry ASC, batch_id ASC',
      [medicine.id]
    );

    res.json({
      ...medicine,
      batches
    });
  } catch (err) {
    console.error("Error fetching item by name:", err);
    res.status(500).json({ error: 'Failed to fetch medicine by name' });
  }
});



// Get medicine by barcode
// Get medicine by barcode, with nearest-expiry batch (if available)
app.get('/api/pos/medicines/get-by-barcode/:barcode', async (req, res) => {
  try {
    // Find the medicine
    const [medRows] = await medicinesPool.promise().query(
      'SELECT * FROM medicines_table WHERE barcode = ? LIMIT 1',
      [req.params.barcode]
    );
    const medicine = medRows[0];
    if (!medicine) return res.status(404).json({ error: "Medicine not found" });

    // Find batches for this medicine, sorted by expiry (soonest first)
    const [batches] = await medicinesPool.promise().query(
      `SELECT * FROM batches WHERE medicine_id = ? ORDER BY expiry ASC, batch_id ASC`,
      [medicine.id]
    );

    if (batches.length > 0) {
      // Use the first batch (nearest expiry)
      const batch = batches[0];
      res.json({
        ...medicine,
        batch_id: batch.batch_id,
        batch_number: batch.batch_number,
        expiry: batch.expiry,
        stock: batch.quantity
      });
    } else {
      // No batches: fallback to medicine record
      res.json({
        ...medicine,
        batch_id: null,
        batch_number: null,
        expiry: medicine.expiry || null,
        stock: medicine.stock || null
      });
    }
  } catch (err) {
    res.status(500).json({ error: 'Barcode lookup failed' });
  }
});

// Get all batches for a medicine
app.get('/api/batches/for-medicine/:medicine_id', (req, res) => {
    const { medicine_id } = req.params;
    const sql = 'SELECT * FROM batches WHERE medicine_id = ? ORDER BY expiry ASC, batch_id ASC';
    medicinesPool.query(sql, [medicine_id], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch batches' });
        res.json(rows);
    });

});

// Get batch by batch ID (keep as is, or change to singular endpoint)
app.get('/api/batch/:batch_id', (req, res) => {
    const { batch_id } = req.params;
    medicinesPool.query('SELECT * FROM batches WHERE batch_id = ?', [batch_id], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch batch' });
        res.json(rows[0] || null);
    });
});app.get('/api/batches/:batch_id', (req, res) => {
    const { batch_id } = req.params;
    medicinesPool.query('SELECT * FROM batches WHERE batch_id = ?', [batch_id], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch batch' });
        res.json(rows[0] || null);
    });
});
// Save a bill
app.post('/api/pos/bills/save', (req, res) => {
  const {
    patient_name,
    patient_phone,
    payment_method,
    card_invoice_number,
    ecommerce_invoice_number,
    items,
    user
  } = req.body;

  const billDate = new Date().toISOString().split('T')[0];
  const billTime = new Date().toTimeString().split(' ')[0];

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'Cart is empty.' });
  }

  const insertItem = (item, cb) => {
    const item_name = item.item_name || 'Unknown Item';
    const quantity = parseFloat(item.quantity) || 0;
    const price = parseFloat(item.price) || 0;
    const subtotal = parseFloat(item.subtotal) || 0;

    // NEW: Add batch fields
    const insertQuery = `
      INSERT INTO bills (
        bill_date, bill_time, item_name, quantity, price, subtotal,
        batch_id, batch_number, expiry,
        payment_method, card_invoice_number, \`E-commerce Invoice Number\`,
        patient_name, patient_phone, user
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    billsPool.query(
      insertQuery,
      [
        billDate,
        billTime,
        item_name,
        quantity,
        price,
        subtotal,
        item.batch_id || null,
        item.batch_number || null,
        item.expiry ? item.expiry.split('T')[0] : null,  // Save date only
        payment_method || 'Unknown',
        card_invoice_number || '',
        ecommerce_invoice_number || '',
        patient_name || '',
        patient_phone || '',
        user || 'Unknown User'
      ],
      cb
    );
  };

  const updateStock = async (item, cb) => {
    try {
      if (item.batch_id) {
        // Fetch packet_size for the medicine associated with the batch
        const [medRows] = await medicinesPool.promise().query(
          'SELECT mt.packet_size FROM batches b JOIN medicines_table mt ON b.medicine_id = mt.id WHERE b.batch_id = ? LIMIT 1',
          [item.batch_id]
        );
        const packetSize = (medRows && medRows.length && medRows[0].packet_size) ? medRows[0].packet_size : 1;
        const deductAmount = parseFloat(item.quantity) / packetSize;

        const updateBatch = 'UPDATE batches SET quantity = quantity - ? WHERE batch_id = ?';
        medicinesPool.query(updateBatch, [deductAmount, item.batch_id], cb);
      } else {
        // Fallback for items without batches (deduct from main table using packet_size)
        const query = 'SELECT packet_size FROM medicines_table WHERE item_name = ? LIMIT 1';
        medicinesPool.query(query, [item.item_name], (err, rows) => {
          if (err) return cb(err);
          const packetSize = (rows && rows.length && rows[0].packet_size) ? rows[0].packet_size : 1;
          const deductAmount = parseFloat(item.quantity) / packetSize;
          const updateQuery = 'UPDATE medicines_table SET stock = stock - ? WHERE item_name = ?';
          medicinesPool.query(updateQuery, [deductAmount, item.item_name], cb);
        });
      }
    } catch (err) {
      cb(err); // Propagate async errors to the callback
    }
  };

  let completed = 0;
  let errored = false;

  items.forEach((item) => {
    insertItem(item, (err) => {
      if (errored) return;
      if (err) {
        console.error("Insert error:", err);
        errored = true;
        return res.status(500).json({ success: false, message: 'Failed to insert bill item.' });
      }

      updateStock(item, (err2) => {
        if (errored) return;
        if (err2) {
          console.error("Stock update error:", err2);
          errored = true;
          return res.status(500).json({ success: false, message: 'Failed to update stock.' });
        }

        completed++;
        if (completed === items.length) {
          res.json({ success: true });
        }
      });
    });
  });
});


// ==================== Frequent Bills ====================

// Get all frequent bills
app.get('/api/pos/frequent-bills/get-all', (req, res) => {
  const query = 'SELECT * FROM frequent_bills ORDER BY created_at DESC';

  billsPool.query(query, (err, rows) => {
    if (err) {
      console.error("Error fetching frequent bills:", err);
      return res.status(500).json({ error: 'Failed to fetch frequent bills' });
    }
    res.json(rows);
  });
});


// Delete a frequent bill
app.delete('/api/pos/frequent-bills/delete/:id', (req, res) => {
  const billId = req.params.id;

  const query = 'DELETE FROM frequent_bills WHERE id = ?';

  billsPool.query(query, [billId], (err, result) => {
    if (err) {
      console.error("Error deleting frequent bill:", err);
      return res.status(500).json({ success: false, error: 'Delete failed' });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'Frequent bill not found' });
    }

    res.json({ success: true });
  });
});


// Add a frequent bill
app.post('/api/pos/frequent-bills/add', (req, res) => {
  const { bill_name, items } = req.body;

  if (!bill_name || !items || !Array.isArray(items)) {
    return res.status(400).json({ success: false, error: 'Invalid bill name or items' });
  }

  const query = 'INSERT INTO frequent_bills (bill_name, items, created_at) VALUES (?, ?, NOW())';

  billsPool.query(query, [bill_name, JSON.stringify(items)], (err, result) => {
    if (err) {
      console.error("Error adding frequent bill:", err);
      return res.status(500).json({ success: false, error: 'Failed to add frequent bill' });
    }
    res.json({ success: true, id: result.insertId });
  });
});


//update medicine stock upon billing
function updateStock(items) {
  const updatePromises = items.map(item => {
    return new Promise((resolve, reject) => {
      const query = `
        UPDATE medicines_table
        SET stock = stock - ?
        WHERE item_name = ?
      `;
      medicinesPool.query(query, [item.quantity, item.item_name], (err, results) => {
        if (err) {
          console.error('Error updating stock:', err);
          reject(err);
        } else {
          resolve(results);
        }
      });
    });
  });

  Promise.all(updatePromises)
    .then(() => {
      
    })
    .catch(err => {
      console.error('Error updating stock:', err);
    });
}

// Suggest unique patient names
app.get('/api/pos/bills/suggest-patient-name', (req, res) => {
  const { q } = req.query;
  const query = 'SELECT DISTINCT patient_name FROM bills WHERE patient_name LIKE ? LIMIT 10';

  billsPool.query(query, [`%${q}%`], (err, rows) => {
    if (err) {
      console.error("Error in suggest-patient-name:", err);
      return res.status(500).json({ error: 'Database error' });
    }

    const names = rows.map(r => r.patient_name);
    res.json(names);
  });
});

// Suggest unique patient phones
app.get('/api/pos/bills/suggest-patient-phone', (req, res) => {
  const { q } = req.query;
  const query = 'SELECT DISTINCT patient_phone FROM bills WHERE patient_phone LIKE ? LIMIT 10';

  billsPool.query(query, [`%${q}%`], (err, rows) => {
    if (err) {
      console.error("Error in suggest-patient-phone:", err);
      return res.status(500).json({ error: 'Database error' });
    }

    const phones = rows.map(r => r.patient_phone);
    res.json(phones);
  });
});

// Function to fetch item details from the medicines database
async function fetchItemDetails(itemName) {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT price, expiry, stock, packet_size
      FROM medicines_table 
      WHERE item_name = ?`;

    medicinesPool.query(query, [itemName], (err, results) => {
      if (err) {
        reject('Error fetching item details from medicines database: ' + err);
        return;
      }

      if (results.length === 0) {
        reject('Item not found in medicines database');
        return;
      }

      resolve(results[0]); // This now includes packet_size
    });
  });
}

//log in endpoint
// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware
app.use(expressSession({
  secret: 'pharmacy-management-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, maxAge: 36000000 } // 10 hours, secure:false for development
}));

// Serve index.html for root path
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Login route
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  // Input validation
  if (!username || !password) {
      console.log('Login attempt failed: Missing username or password');
      return res.status(400).json({ success: false, message: 'Username and password are required' });
  }
  
 
  
  // Query database for user
  const query = 'SELECT UserID, Username, PasswordHash, IsAdmin, FullName, JobTitle FROM users WHERE Username = ?';
  
  connection.query(query, [username], async (error, results) => {
      if (error) {
          console.error('Database error during login:', error);
          return res.status(500).json({ success: false, message: 'Database error occurred. Please try again.' });
      }
      
      if (results.length === 0) {
          console.log(`Login failed: No user found with username '${username}'`);
          return res.status(401).json({ success: false, message: 'Invalid username or password' });
      }
      
      const user = results[0];
     
     
      
      try {
          let passwordMatch = false;
          
          if (user.PasswordHash && user.PasswordHash.startsWith('$2')) {
             
              
              passwordMatch = await bcrypt.compare(password, user.PasswordHash);
              
             
              if (!passwordMatch) {
                  // Try logging the first few chars of both hashes for comparison
                  const testHash = await bcrypt.hash(password, 10);
                  
              }
          } 
          // If password is stored as plain text, hash it and compare
          else if (user.PasswordHash) {
             
              const hashedPassword = await bcrypt.hash(password, 10); // Hash the input password
              passwordMatch = (hashedPassword === user.PasswordHash);
          }
          
         
          
          if (!passwordMatch) {
              return res.status(401).json({ success: false, message: 'Invalid username or password' });
          }
          
          // Set session data
          req.session.user = {
              userId: user.UserID,
              username: user.Username,
              isAdmin: user.IsAdmin === 1,
              fullName: user.FullName || user.Username,
              jobTitle: user.JobTitle || 'Staff'
          };
          
          
          
          // Return success with user info
          return res.json({
              success: true,
              userId: user.UserID,
              username: user.Username,
              isAdmin: user.IsAdmin === 1,
              fullName: user.FullName || user.Username,
              jobTitle: user.JobTitle || 'Staff'
          });
      } catch (err) {
          console.error('Password comparison error:', err);
          return res.status(500).json({ success: false, message: 'Authentication error occurred. Please try again.' });
      }
  });
});

// Logout route
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// Auth check middleware
function isAuthenticated(req, res, next) {
  if (req.session.user) {
    next();
  } else {
    res.status(401).json({ success: false, message: 'Not authenticated' });
  }
}

// Protected route example
app.get('/api/user-info', isAuthenticated, (req, res) => {
    res.json({ user: req.session.user });
});

// Add user endpoint
app.post('/api/addUser', upload.single('photo'), async (req, res) => {
  const {
    username, password, isAdmin = 0, fullName = '', jobTitle = '', gender = '',
    birthdate = null, email = '', phoneNumber = '', idNumber = '', licenseNumber = ''
  } = req.body;

  let photoBlob = null;
  if (req.file) {
    photoBlob = fs.readFileSync(req.file.path);
    fs.unlinkSync(req.file.path); // Optional cleanup
  }

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password are required' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const query = `
      INSERT INTO users (Username, PasswordHash, IsAdmin, FullName, JobTitle, Gender, Birthdate, Email, PhoneNumber, IDNumber, LicenseNumber, Photo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const values = [username, hashedPassword, isAdmin, fullName, jobTitle, gender, birthdate || null, email, phoneNumber, idNumber, licenseNumber, photoBlob];
    
    connection.query(query, values, (err) => {
      if (err) return res.status(500).json({ success: false, message: 'Database error occurred' });
      res.json({ success: true, message: 'User added successfully' });
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error hashing password' });
  }
});


// Update user endpoint
app.post('/api/updateUser', upload.single('photo'), async (req, res) => {
  const {
    userId, username, password, isAdmin, fullName, jobTitle,
    gender, birthdate, email, phoneNumber, idNumber, licenseNumber
  } = req.body;

  if (!userId) return res.status(400).json({ success: false, message: 'User ID is required' });

  let photoBlob = null;
  if (req.file) {
    photoBlob = fs.readFileSync(req.file.path);
    fs.unlinkSync(req.file.path);
  }

  let query = 'UPDATE users SET ';
  const updates = [];
  const values = [];

  const set = (field, value) => { updates.push(`${field} = ?`); values.push(value); };
  if (username) set('Username', username);
  if (password) {
    try {
      const hashed = await bcrypt.hash(password, 10);
      set('PasswordHash', hashed);
    } catch {
      return res.status(500).json({ success: false, message: 'Password hash error' });
    }
  }
  if (isAdmin !== undefined) set('IsAdmin', isAdmin ? 1 : 0);
  if (fullName !== undefined) set('FullName', fullName);
  if (jobTitle !== undefined) set('JobTitle', jobTitle);
  if (gender !== undefined) set('Gender', gender);
  if (birthdate !== undefined) set('Birthdate', birthdate || null);
  if (email !== undefined) set('Email', email);
  if (phoneNumber !== undefined) set('PhoneNumber', phoneNumber);
  if (idNumber !== undefined) set('IDNumber', idNumber);
  if (licenseNumber !== undefined) set('LicenseNumber', licenseNumber);
  if (photoBlob) set('Photo', photoBlob);

  if (!updates.length) return res.status(400).json({ success: false, message: 'No fields to update' });

  query += updates.join(', ') + ' WHERE UserID = ?';
  values.push(userId);

  connection.query(query, values, (err) => {
    if (err) return res.status(500).json({ success: false, message: 'Update failed' });
    res.json({ success: true, message: 'User updated successfully' });
  });
});


// Get all users
app.get('/api/getUsers', (req, res) => {
  const query = `
    SELECT UserID, Username, IsAdmin, FullName, JobTitle, Gender, Birthdate, Email,
           PhoneNumber, IDNumber, LicenseNumber, Photo
    FROM users
  `;
  connection.query(query, (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error occurred' });
    res.json(results);
  });
});

// Get one user
app.post('/api/getUser', (req, res) => {
  const { userId } = req.body;
  const query = `
    SELECT UserID, Username, IsAdmin, FullName, JobTitle, Gender, Birthdate, Email,
           PhoneNumber, IDNumber, LicenseNumber, Photo
    FROM users WHERE UserID = ?
  `;
  connection.query(query, [userId], (err, results) => {
    if (err || results.length === 0) return res.status(500).json({ success: false, message: 'User not found or DB error' });
    res.json(results[0]);
  });
});

// Endpoint to delete a user
app.post('/api/deleteUser', (req, res) => {
  const { userId } = req.body;

  if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
  }

  const query = `
      DELETE FROM users
      WHERE UserID = ?
  `;
  connection.query(query, [userId], (err, results) => {
      if (err) {
          console.error('Error deleting user:', err);
          return res.status(500).json({ success: false, message: 'Database error occurred' });
      }
      if (results.affectedRows === 0) {
          return res.status(404).json({ success: false, message: 'User not found' });
      }
      res.json({ success: true, message: 'User deleted successfully' });
  });
});

// Middleware to check if the user is an admin
function isAdmin(req, res, next) {
  if (req.session.user && req.session.user.isAdmin) {
      next();
  } else {
      res.status(403).json({ success: false, message: 'Access denied. Admins only.' });
  }
}

// Endpoint to save patient data
app.post('/save_patient', async (req, res) => {
  try {
    const {
      name,
      age,
      weight,
      smoking,
      systolic,
      diastolic,
      fpg,
      npg,
      diagnosis,
      recommendations,
    } = req.body;

    // Convert recommendations to a string if it's an array
    const recommendationsString = Array.isArray(recommendations)
      ? recommendations.join(', ')
      : recommendations;

    const [result] = await healthDBPool.execute(
      'INSERT INTO patients (name, age, weight, smoking, systolic, diastolic, fpg, npg, diagnosis, recommendations) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        name,
        age,
        weight,
        smoking,
        systolic,
        diastolic,
        fpg,
        npg,
        diagnosis,
        recommendationsString,
      ]
    );
    res.json({ message: 'Patient data saved successfully!', result });
  } catch (error) {
    console.error('Error saving patient data:', error);
    res.status(500).json({ message: 'Error saving patient data', error });
  }
});

//endpoint to update a test
app.patch('/api/updateTest/:id', async (req, res) => {
  const id = req.params.id;
  const updates = req.body;

  const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
  const values = [...Object.values(updates), id];

  try {
    await healthDBPool.execute(`UPDATE patients SET ${fields} WHERE id = ?`, values);
    res.json({ message: 'Patient updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Error updating patient' });
  }
});

//get diagnosis endpoint
app.get('/api/getDiagnosisStats', async (req, res) => {
  try {
    const [rows] = await healthDBPool.execute(
      `SELECT diagnosis, COUNT(*) as count FROM patients GROUP BY diagnosis`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve stats' });
  }
});

//endpoint to search patients for testing
app.post('/api/searchPatientsForTesting', async (req, res) => {
  try {
    const { searchTerm } = req.body;
    
   
    
    // Search for patients by name (partial match)
    const [patients] = await healthDBPool.execute(
      'SELECT * FROM patients WHERE name LIKE ? ORDER BY created_at DESC',
      [`%${searchTerm}%`]
    );
    
   
    
    // Convert any null values to appropriate defaults and format dates
    const formattedPatients = patients.map(patient => ({
      id: patient.id,
      name: patient.name || 'Unknown',
      age: patient.age || '?',
      weight: patient.weight || '',
      smoking: patient.smoking || 'Non-smoker',
      systolic: patient.systolic || '',
      diastolic: patient.diastolic || '',
      fpg: patient.fpg || '',
      npg: patient.npg || '',
      diagnosis: patient.diagnosis || 'No diagnosis',
      recommendations: patient.recommendations || '',
      date_time: patient.date_time ? new Date(patient.date_time).toISOString() : new Date().toISOString()
    }));
    
    res.json(formattedPatients);
  } catch (error) {
    console.error('Error searching patients:', error);
    res.status(500).json({ 
      message: 'Error searching patients', 
      error: error.message 
    });
  }
});

// Endpoint to fetch tests for a date range
app.post('/api/fetchTestsForDateRange', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'Start and end dates are required' });
    }

    const start = `${startDate} 00:00:00`;
    const end = `${endDate} 23:59:59`;

    const [patients] = await healthDBPool.execute(
      'SELECT * FROM patients WHERE created_at BETWEEN ? AND ? ORDER BY created_at DESC',
      [start, end]
    );

    res.json(patients);
  } catch (error) {
    console.error('Error fetching tests:', error);
    res.status(500).json({ message: 'Error fetching tests', error: error.message });
  }
});

//get all tests 
app.get('/api/fetchAllTestsPaginated', async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;

    if (isNaN(page) || isNaN(limit) || page < 1 || limit < 1) {
      return res.status(400).json({ message: 'Invalid pagination parameters' });
    }

    const offset = (page - 1) * limit;

    // 👇 Use string interpolation instead of parameter placeholders
    const [data] = await healthDBPool.query(
      `SELECT * FROM patients ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`
    );

    const [countResult] = await healthDBPool.execute('SELECT COUNT(*) as total FROM patients');
    const total = countResult[0].total;

    res.json({
      data,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      total,
    });
  } catch (error) {
    console.error('Error fetching paginated tests:', error);
    res.status(500).json({ message: 'Failed to fetch tests', error: error.message });
  }
});

// Endpoint to delete a test by ID
app.delete('/api/deleteTest/:id', async (req, res) => {
  try {
    const testId = req.params.id;

    // Check if the test ID is valid
    if (!testId) {
      return res.status(400).json({ message: 'Test ID is required' });
    }

    // Delete the test from the database
    const [result] = await healthDBPool.execute(
      'DELETE FROM patients WHERE id = ?',
      [testId]
    );

    // Check if the deletion was successful
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Test not found' });
    }

    res.json({ message: 'Test deleted successfully' });
  } catch (error) {
    console.error('Error deleting test:', error);
    res.status(500).json({ message: 'Error deleting test', error: error.message });
  }
});

//endpoint to download testing report
app.post('/api/download-table2', async (req, res) => {
  try {
    const { tableData } = req.body;

    if (!Array.isArray(tableData) || tableData.length === 0) {
      return res.status(400).json({ error: 'No data provided to export' });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Testing Report');

    // Define columns
    worksheet.columns = [
      { header: 'Test ID', key: 'TestID', width: 10 },
      { header: 'Test Date and Time', key: 'TestDateTime', width: 25 },
      { header: 'Patient Info', key: 'PatientInfo', width: 30 },
      { header: 'Smoking History', key: 'SmokingHistory', width: 15 },
      { header: 'Systolic/Diastolic', key: 'SystolicDiastolic', width: 18 },
      { header: 'Fasting Blood Glucose', key: 'FastingBloodGlucose', width: 20 },
      { header: 'Non-Fasting Blood Glucose', key: 'NonFastingBloodGlucose', width: 22 },
      { header: 'Diagnosis', key: 'Diagnosis', width: 30 },
      { header: 'Recommendation', key: 'Recommendation', width: 30 },
    ];

    // Bold header
    worksheet.getRow(1).font = { bold: true };

    // Add rows
    tableData.forEach(test => {
      worksheet.addRow({
        TestID: test.TestID,
        TestDateTime: test.TestDateTime,
        PatientInfo: test.PatientInfo,
        SmokingHistory: test.SmokingHistory,
        SystolicDiastolic: test.SystolicDiastolic,
        FastingBloodGlucose: test.FastingBloodGlucose,
        NonFastingBloodGlucose: test.NonFastingBloodGlucose,
        Diagnosis: test.Diagnosis,
        Recommendation: test.Recommendation,
      });
    });

    // Set headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=testing_report_${Date.now()}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error exporting test report:', error);
    res.status(500).json({ error: 'Failed to generate Excel file' });
  }
});

// Function to delete a medicine
// Delete a medicine by ID
app.post('/delete-medicine', (req, res) => {
  const { id } = req.body;
  const sql = 'DELETE FROM medicines_table WHERE id = ?';

  medicinesPool.query(sql, [id], (err, result) => {
    if (err) {
      console.error('Error deleting medicine:', err);
      return res.status(500).json({ error: 'Error deleting medicine' });
    }
    console.log("Deleted rows:", result.affectedRows);
    res.json({ message: 'Medicine deleted successfully' });
  });
});


//search medicines to edit them 
//search medicines to edit them 
app.get('/search-medicine', async (req, res) => {
  const { query } = req.query;
  
  if (!query) {
      return res.status(400).json({ error: "Query is required" });
  }

  const sql = "SELECT * FROM medicines_table WHERE item_name LIKE ? OR barcode LIKE ?";
  const values = [`%${query}%`, `%${query}%`];

  try {
      const results = await executeMedicinesQuery(sql, values);
      res.json(results);
  } catch (err) {
      console.error("Error searching medicine:", err);
      res.status(500).json({ error: "Database error" });
  }
});
// Update this endpoint to sum stock and show nearest expiry from batches
app.get('/api/medicine-with-batch/:id', async (req, res) => {
    const medicineId = req.params.id;

    // Get medicine info
    const [medicineRows] = await medicinesPool.promise().query('SELECT * FROM medicines_table WHERE id = ?', [medicineId]);
    if (!medicineRows.length) return res.status(404).json({ error: 'Not found' });

    // Get batches
    const [batches] = await medicinesPool.promise().query('SELECT * FROM batches WHERE medicine_id = ?', [medicineId]);

    // Calculate
    let totalStock = 0;
    let nearestExpiry = null;
    batches.forEach(b => {
        if (b.quantity) totalStock += Number(b.quantity);
        if (b.expiry && (!nearestExpiry || new Date(b.expiry) < new Date(nearestExpiry))) nearestExpiry = b.expiry;
    });

    const medicine = medicineRows[0];
    medicine.stock = totalStock;
    medicine.expiry = nearestExpiry;

    res.json({ ...medicine, batches });
});


// Function to execute a query using the medicines pool
const executeMedicinesQuery = (sql, params) => {
  return new Promise((resolve, reject) => {
      medicinesPool.query(sql, params, (err, results) => {
          if (err) {
              reject(err);
          } else {
              resolve(results);
          }
      });
  });
};

// ADD MEDICINE (with image as BLOB)
app.post('/add-medicine', upload.single('item_pic'), (req, res) => {
  const body = req.body;
  let imageData = null;

  // If image uploaded, read file as binary (Buffer)
  if (req.file) {
    imageData = fs.readFileSync(req.file.path);
    fs.unlinkSync(req.file.path); // Optional: delete file from disk after reading
  }

  const values = [
    body.item_name || null,
    body.price || null,
    body.barcode || null,
    body.expiry || null,
    body.stock || null,
    body.packet_size || null,
    body.active_name_1 || null,
    body.active_name_2 || null,
    body.cross_selling || null,
    body.significant_side_effects || null,
    body.significant_interactions || null,
    body.uses || null,
    body.dosage || null,
    body.location || null,
    imageData // Store image as BLOB!
  ];

  const sql = `
    INSERT INTO medicines_table (
      item_name, price, barcode, expiry, stock, packet_size,
      active_name_1, active_name_2, cross_selling, significant_side_effects,
      significant_interactions, uses, dosage, location, item_pic
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  medicinesPool.query(sql, values, (err, result) => {
    if (err) {
      console.error("Error adding medicine:", err);
      return res.status(500).json({ error: "Error adding medicine" });
    }
    res.json({ message: "Medicine added successfully" });
  });
});

app.post('/update-medicine', upload.single('item_pic'), (req, res) => {
  const body = req.body;
  const id = body.id;
  let imageData = null;
  let fields = [
    "item_name", "price", "barcode", "expiry", "stock", "packet_size",
    "active_name_1", "active_name_2", "cross_selling",
    "significant_side_effects", "significant_interactions",
    "uses", "dosage", "location"
  ];

  let values = fields.map((field) => body[field] || null);

  if (req.file) {
    imageData = fs.readFileSync(req.file.path);
    fs.unlinkSync(req.file.path);
    fields.push("item_pic");
    values.push(imageData);
  }

  // Compose SET part
  const setClause = fields.map(f => `${f} = ?`).join(", ");
  values.push(id); // for WHERE

  const sql = `UPDATE medicines_table SET ${setClause} WHERE id = ?`;

  medicinesPool.query(sql, values, (err, result) => {
    if (err) {
      console.error("Error updating medicine:", err);
      return res.status(500).json({ error: "Error updating medicine" });
    }
    res.json({ message: "Medicine updated successfully" });
  });
});

// --- BATCHES API ---

// Add a batch
app.post('/api/batches/add', (req, res) => {
    const { medicine_id, batch_number, expiry, quantity, received_date } = req.body;
    const sql = `
        INSERT INTO batches (medicine_id, batch_number, expiry, quantity, received_date)
        VALUES (?, ?, ?, ?, ?)
    `;
    medicinesPool.query(sql, [medicine_id, batch_number || null, expiry || null, quantity || null, received_date || null], (err, result) => {
        if (err) return res.status(500).json({ error: 'Failed to add batch' });
        res.json({ message: 'Batch added', batch_id: result.insertId });
    });
});

// Edit a batch
app.post('/api/batches/edit', (req, res) => {
    const { batch_id, batch_number, expiry, quantity, received_date } = req.body;
    const sql = `
        UPDATE batches SET batch_number = ?, expiry = ?, quantity = ?, received_date = ?
        WHERE batch_id = ?
    `;
    medicinesPool.query(sql, [batch_number || null, expiry || null, quantity || null, received_date || null, batch_id], (err) => {
        if (err) return res.status(500).json({ error: 'Failed to update batch' });
        res.json({ message: 'Batch updated' });
    });
});

// Delete a batch
app.post('/api/batches/delete', (req, res) => {
    const { batch_id } = req.body;
    const sql = 'DELETE FROM batches WHERE batch_id = ?';
    medicinesPool.query(sql, [batch_id], (err) => {
        if (err) return res.status(500).json({ error: 'Failed to delete batch' });
        res.json({ message: 'Batch deleted' });
    });
});


app.get('/api/pos/medicines/photo/:id', (req, res) => {
  const id = req.params.id;
  const query = 'SELECT item_pic FROM medicines_table WHERE id = ?';

  medicinesPool.query(query, [id], (err, rows) => {
    if (err || !rows.length || !rows[0].item_pic) {
      return res.status(404).send('Image not found');
    }

    const itemPic = rows[0].item_pic;

    // If it's a Buffer and starts like an image file, serve it as binary
    if (Buffer.isBuffer(itemPic)) {
      // Heuristically check if it's a PNG, JPEG, or GIF by header
      const isPng = itemPic.slice(0, 8).toString('hex') === '89504e470d0a1a0a';
      const isJpeg = itemPic.slice(0, 2).toString('hex') === 'ffd8';
      const isGif = itemPic.slice(0, 6).toString() === 'GIF89a' || itemPic.slice(0, 6).toString() === 'GIF87a';

      if (isPng) {
        res.set('Content-Type', 'image/png');
        return res.send(itemPic);
      } else if (isJpeg) {
        res.set('Content-Type', 'image/jpeg');
        return res.send(itemPic);
      } else if (isGif) {
        res.set('Content-Type', 'image/gif');
        return res.send(itemPic);
      }

      // If it's not image data, try as path fallback below
    }

    // If it's a path string, serve from filesystem
    let filePathString = null;
    if (typeof itemPic === 'string') {
      filePathString = itemPic;
    } else if (Buffer.isBuffer(itemPic)) {
      // If not image binary, maybe it's a string buffer
      filePathString = itemPic.toString('utf8').replace(/\0/g, ''); // Remove null bytes
    }

    if (filePathString && filePathString.trim() && !filePathString.includes('\x00')) {
      const absolutePath = path.join(__dirname, filePathString);
      return fs.access(absolutePath, fs.constants.F_OK, (err) => {
        if (err) {
          return res.status(404).send('Image file not found');
        }
        return res.sendFile(absolutePath);
      });
    }

    // Otherwise, can't serve image
    return res.status(404).send('Image not found');
  });
});

//sales report
app.post('/fetch-extended-sales', (req, res) => {
  const { fromDate, toDate } = req.body;
  
  const query = `
      SELECT payment_method, SUM(subtotal) as total
      FROM bills
      WHERE bill_date BETWEEN ? AND ?
      AND (payment_method = 'ecommerce' OR payment_method = 'insurance')
      GROUP BY payment_method
  `;
  
  billsPool.query(query, [fromDate, toDate], (err, results) => {
      if (err) {
          console.error('Database query error:', err);
          return res.status(500).send('Internal Server Error');
      }
      
      // Initialize default values
      let eCommerceSales = 0;
      let insuranceSales = 0;
      
      // Process results if any found
      if (results && results.length > 0) {
          results.forEach(result => {
              if (result.payment_method && result.payment_method.toLowerCase() === 'ecommerce') {
                  eCommerceSales = parseFloat(result.total) || 0;
              } else if (result.payment_method && result.payment_method.toLowerCase() === 'insurance') {
                  insuranceSales = parseFloat(result.total) || 0;
              }
          });
      }
      
      res.json({
          eCommerceSales,
          insuranceSales
      });
  });
});

// Modify the existing generate-report endpoint to include all payment methods
app.post('/generate-report', (req, res) => {
  const { fromDate, toDate } = req.body;
  
  const query = `
      SELECT subtotal, payment_method
      FROM bills
      WHERE bill_date BETWEEN ? AND ?
  `;
  
  billsPool.query(query, [fromDate, toDate], (err, results) => {
      if (err) {
          console.error('Database query error:', err);
          return res.status(500).send('Internal Server Error');
      }
      
      if (results.length === 0) {
          return res.status(404).send('No bills found within the specified date range');
      }
      
      let totalSales = 0;
      let cashSales = 0;
      let cardSales = 0;
      let eCommerceSales = 0;
      let insuranceSales = 0;
      
      results.forEach(bill => {
          const subtotal = parseFloat(bill.subtotal) || 0;
          totalSales += subtotal;
          
          if (bill.payment_method) {
              const paymentMethod = bill.payment_method.toLowerCase();
              if (paymentMethod === 'cash') {
                  cashSales += subtotal;
              } else if (paymentMethod === 'card') {
                  cardSales += subtotal;
              } else if (paymentMethod === 'ecommerce') {
                  eCommerceSales += subtotal;
              } else if (paymentMethod === 'insurance') {
                  insuranceSales += subtotal;
              }
          }
      });
      
     
      
      res.json({
          totalSales,
          cashSales,
          cardSales,
          eCommerceSales,
          insuranceSales
      });
  });
});

//download sales report as xlsx
app.post('/api/download-sales-xlsx', async (req, res) => {
  const { fromDate, toDate } = req.body;

  try {
      const [bills] = await billsPool.promise().query(
          `SELECT payment_method, subtotal, bill_date FROM bills WHERE bill_date BETWEEN ? AND ?`,
          [fromDate, toDate]
      );

      if (!bills.length) {
          return res.status(404).json({ message: "No sales data for selected date range." });
      }

      // Calculate totals
      let cash = 0, card = 0, ecommerce = 0, insurance = 0;

      bills.forEach(bill => {
          const subtotal = parseFloat(bill.subtotal) || 0;
          switch ((bill.payment_method || '').toLowerCase()) {
              case 'cash': cash += subtotal; break;
              case 'card': card += subtotal; break;
              case 'ecommerce': ecommerce += subtotal; break;
              case 'insurance': insurance += subtotal; break;
          }
      });

      const total = cash + card + ecommerce + insurance;

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Sales Report');

      worksheet.columns = [
          { header: 'From Date', key: 'from', width: 15 },
          { header: 'To Date', key: 'to', width: 15 },
          { header: 'Cash Sales', key: 'cash', width: 15 },
          { header: 'Card Sales', key: 'card', width: 15 },
          { header: 'E-commerce Sales', key: 'ecommerce', width: 20 },
          { header: 'Insurance Sales', key: 'insurance', width: 20 },
          { header: 'Total Sales', key: 'total', width: 15 }
      ];

      worksheet.addRow({
          from: fromDate,
          to: toDate,
          cash: cash,
          card: card,
          ecommerce: ecommerce,
          insurance: insurance,
          total: total
      });

      // Proper date formatting
      worksheet.getColumn('from').numFmt = 'mm/dd/yyyy';
      worksheet.getColumn('to').numFmt = 'mm/dd/yyyy';

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=sales_report_${fromDate}_to_${toDate}.xlsx`);

      await workbook.xlsx.write(res);
      res.end();
  } catch (err) {
      console.error('Excel generation error:', err);
      res.status(500).json({ message: 'Error generating Excel report' });
  }
});

// API endpoint to download bills as Excel
app.post('/api/download-table', async (req, res) => {
  try {
    const { tableData } = req.body;
    
    // Validate the data
    if (!tableData || !Array.isArray(tableData) || tableData.length === 0) {
      return res.status(400).json({ error: 'No data provided' });
    }
    
    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Bills');
    
    // Add headers
    worksheet.addRow([
      'Bill ID', 
      'Bill Date', 
      'Bill Time', 
      'Item Name', 
      'Price', 
      'Quantity', 
      'Subtotal', 
      'Payment Method'
    ]);
    
    // Add data rows
    tableData.forEach(bill => {
      worksheet.addRow([
        bill.bill_id,
        bill.bill_date,
        bill.bill_time,
        bill.item_name,
        bill.price,
        bill.quantity,
        bill.subtotal,
        bill.payment_method
      ]);
    });
    
    // Set column widths
    worksheet.columns.forEach(column => {
      column.width = 15;
    });
    
    // Format header row
    worksheet.getRow(1).font = { bold: true };
    
    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=bills.xlsx');
    
    // Send the workbook
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error generating Excel file from table data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

//stock requirements
// Endpoint to save medicine requirements
app.post('/api/saveRequirements', (req, res) => {
  const requirementsData = req.body;

  const insertQueries = requirementsData.map(item => {
      return `
          INSERT INTO medicine_requirements (item_name, quantity_required, from_agent, to_store, date)
          VALUES (?, ?, ?, ?, ?)
      `;
  });

  const insertValues = requirementsData.map(item => [
      item.item_name, item.quantity, item.from_agent, item.to_store, item.date
  ]);

  const queryPromises = insertValues.map((values, index) => {
      return new Promise((resolve, reject) => {
          medicineRequirementsPool.query(insertQueries[index], values, (err, results) => {
              if (err) {
                  console.error('Error saving requirements:', err);
                  reject(err);
              } else {
                  resolve(results);
              }
          });
      });
  });

  Promise.all(queryPromises)
      .then(() => res.json({ message: 'Requirements saved successfully' }))
      .catch(err => res.status(500).json({ message: 'Error saving requirements', error: err }));
});

// Endpoint to fetch requirements by date range
app.post('/api/fetchRequirementsByDateRange', (req, res) => {
  const { startDate, endDate } = req.body;

  const query = `
      SELECT item_name, quantity_required AS quantity, from_agent, to_store, date 
      FROM medicine_requirements
      WHERE date BETWEEN ? AND ?
  `;

  medicineRequirementsPool.query(query, [startDate, endDate], (err, results) => {
      if (err) {
          console.error('Error fetching requirements:', err);
          return res.status(500).json({ message: 'Error fetching requirements', error: err });
      }

      res.json(results);  // Send the results, including quantities
  });
});

//endpoint to delete stock requirement
app.post('/api/deleteRequirement', (req, res) => {
  const { item_name } = req.body;

  if (!item_name) {
      return res.status(400).json({ message: 'Requirement item_name is required' });
  }

 
  const sql = 'DELETE FROM medicine_requirements WHERE item_name = ?';

  medicineRequirementsPool.query(sql, [item_name], (err, results) => {
      if (err) {
          console.error('Error deleting requirement:', err);
          return res.status(500).json({ message: 'Error deleting requirement', error: err });
      }

      if (results.affectedRows === 0) {
          
          return res.status(404).json({ message: 'Requirement not found' });
      }

     
      res.json({ message: 'Requirement deleted successfully' });
  });
});

//user profile
app.get('/api/getUserProfileUnique', (req, res) => {
  const userId = req.session.user ? req.session.user.userId : null;

  if (!userId) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const query = 'SELECT UserID, Username, FullName, Email, JobTitle, Gender, Birthdate, Photo FROM users WHERE UserID = ?';
  connection.query(query, [userId], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Error fetching profile' });
    if (results.length === 0) return res.status(404).json({ success: false, message: 'User not found' });

    res.json({ success: true, user: results[0] });
  });
});

app.post('/api/updateProfileInfoUnique', upload.single('photo'), async (req, res) => {
  const userId = req.session.user ? req.session.user.userId : null;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

  const { fullName, jobTitle, gender, birthdate, email, password } = req.body;

  let photoBlob = null;
  if (req.file) {
    photoBlob = fs.readFileSync(req.file.path);
    fs.unlinkSync(req.file.path);
  }

  let fields = [];
  let values = [];

  const add = (field, value) => { fields.push(`${field} = ?`); values.push(value); };

  if (fullName) add('FullName', fullName);
  if (jobTitle) add('JobTitle', jobTitle);
  if (gender) add('Gender', gender);
  if (birthdate) add('Birthdate', birthdate);
  if (email) add('Email', email);
  if (photoBlob) add('Photo', photoBlob);

  if (password) {
    const hashed = await bcrypt.hash(password, 10);
    add('PasswordHash', hashed);
  }

  if (fields.length === 0) return res.status(400).json({ success: false, message: 'Nothing to update' });

  const sql = `UPDATE users SET ${fields.join(', ')} WHERE UserID = ?`;
  values.push(userId);

  connection.query(sql, values, (err) => {
    if (err) {
      console.error('Profile update error:', err);
      return res.status(500).json({ success: false, message: 'Error updating profile' });
    }

    res.json({ success: true, message: 'Profile updated successfully' });
  });
});

// Save Variations
app.post('/api/save-variations-ky12z', (req, res) => {
  const variations = req.body;
  const query = `
    INSERT INTO stock_variations 
    (item_name, barcode, price, physical_qty, system_qty, variation, recorded_by, recorded_at)
    VALUES ?
  `;
  const values = variations.map(v => [
    v.item_name,
    v.barcode,
    v.price,
    v.physical_qty,
    v.system_qty,
    v.variation,
    v.recorded_by,
    new Date()
  ]);

  medicinesPool.query(query, [values], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "Variations saved successfully", inserted: result.affectedRows });
  });
});

// Get all variations
// ✅ Fetch variations by date range (inclusive)
app.post('/api/fetch-variations-dt98q', (req, res) => {
  const { startDate, endDate } = req.body;

  // Ensure inclusive filtering by adding full day timestamps
  const start = `${startDate} 00:00:00`;
  const end = `${endDate} 23:59:59`;

  const query = `
    SELECT * FROM stock_variations 
    WHERE recorded_at BETWEEN ? AND ?
    ORDER BY recorded_at DESC
  `;

  medicinesPool.query(query, [start, end], (err, results) => {
    if (err) {
      console.error("Error fetching variations:", err);
      return res.status(500).json({ error: err.message });
    }
    res.json(results);
  });
});


// Delete a variation
app.delete('/api/delete-variation-rw52x/:id', (req, res) => {
  const { id } = req.params;
  const query = `DELETE FROM stock_variations WHERE id = ?`;

  medicinesPool.query(query, [id], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Variation deleted successfully', affectedRows: result.affectedRows });
  });
});

//variations to excel
// ✅ DO NOT declare ExcelJS again here
app.get('/api/export_variations_excel', async (req, res) => {
  try {
    const [rows] = await medicinesPool.promise().query('SELECT * FROM stock_variations ORDER BY recorded_at DESC');

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Stock Variations');

    sheet.columns = [
      { header: 'Item Name', key: 'item_name' },
      { header: 'Barcode', key: 'barcode' },
      { header: 'Price', key: 'price' },
      { header: 'System Quantity', key: 'system_qty' },
      { header: 'Physical Quantity', key: 'physical_qty' },
      { header: 'Variation', key: 'variation' },
      { header: 'Recorded By', key: 'recorded_by' },
      { header: 'Recorded At', key: 'recorded_at' }
    ];

    rows.forEach(row => sheet.addRow(row));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=variations_export.xlsx');

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Error exporting Excel:", err);
    res.status(500).send("Failed to generate Excel");
  }
});
// PATCH endpoint to update a stock variation row by ID
app.patch('/api/update-variation-rw52x/:id', (req, res) => {
    const id = req.params.id;
    const { physical_qty, system_qty, variation } = req.body;
    const sql = `
        UPDATE stock_variations 
        SET physical_qty = ?, system_qty = ?, variation = ?
        WHERE id = ?
    `;
    medicinesPool.query(sql, [physical_qty, system_qty, variation, id], (err, result) => {
        if (err) {
            console.error("Failed to update variation:", err);
            return res.status(500).json({ success: false, error: 'Failed to update variation' });
        }
        res.json({ success: true, affectedRows: result.affectedRows });
    });
});


//requests center
//1. expenses
app.post('/api/request/expense', (req, res) => {
  const {
      name,
      department,
      designation,
      period,
      date,
      email,
      category,
      description,
      amount
  } = req.body;

  const userId = req.session.user ? req.session.user.userId : null;

  if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const query = `
      INSERT INTO expenses_requests 
      (user_id, name, department, designation, period, date, email, category, description, amount) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  requestsPool.query(query, [
      userId, name, department, designation, period, date, email, category, description, amount
  ], (err, results) => {
      if (err) {
          console.error('Error inserting expense request:', err);
          return res.status(500).json({ success: false, message: 'Database error' });
      }

      res.json({ success: true, message: 'Expense request submitted successfully' });
  });
});

//2. fetching expenses
app.post('/api/fetch-my-expenses', (req, res) => {
  const userId = req.session.user ? req.session.user.userId : null;
  const { year, month } = req.body;

  if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  if (!year || !month) {
      return res.status(400).json({ success: false, message: 'Year and month required' });
  }

  const period = `${year}-${month}`;

  const query = `
      SELECT id, date, category, description, CAST(amount AS DECIMAL(10,2)) AS amount, status
      FROM expenses_requests
      WHERE user_id = ? AND period = ?
      ORDER BY date DESC
  `;

  requestsPool.query(query, [userId, period], (err, results) => {
      if (err) {
          console.error('Error fetching expenses:', err);
          return res.status(500).json({ success: false, message: 'Database error' });
      }

      const fixedResults = results.map(row => ({
          ...row,
          amount: parseFloat(row.amount)
      }));

      res.json(fixedResults);
  });
});

//3. deleting expenses
app.delete('/api/delete-expense/:id', (req, res) => {
  const userId = req.session.user ? req.session.user.userId : null;
  const expenseId = req.params.id;

  if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const query = `
      DELETE FROM expenses_requests
      WHERE id = ? AND user_id = ?
  `;

  requestsPool.query(query, [expenseId, userId], (err, result) => {
      if (err) {
          console.error('Error deleting expense:', err);
          return res.status(500).json({ success: false, message: 'Database error' });
      }

      if (result.affectedRows === 0) {
          return res.status(404).json({ success: false, message: 'Expense not found or unauthorized' });
      }

      res.json({ success: true, message: 'Expense deleted successfully' });
  });
});

//4. maintainance 
app.post('/api/request/maintenance', (req, res) => {
  const userId = req.session.user ? req.session.user.userId : null;
  const { issueType, reason } = req.body;

  if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  if (!issueType || !reason) {
      return res.status(400).json({ success: false, message: 'Issue Type and Reason are required' });
  }

  const query = `
      INSERT INTO maintenance_requests (user_id, issue_type, reason)
      VALUES (?, ?, ?)
  `;

  requestsPool.query(query, [userId, issueType, reason], (err, results) => {
      if (err) {
          console.error('Error inserting maintenance request:', err);
          return res.status(500).json({ success: false, message: 'Database error' });
      }

      res.json({ success: true, message: 'Maintenance request submitted successfully' });
  });
});

//5. stock edit
app.post('/api/request/stock-edit', (req, res) => {
  const userId = req.session.user ? req.session.user.userId : null;
  const { editType, reason } = req.body;

  if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  if (!editType || !reason) {
      return res.status(400).json({ success: false, message: 'Edit Type and Reason are required' });
  }

  const query = `
      INSERT INTO stock_edit_requests (user_id, edit_type, reason)
      VALUES (?, ?, ?)
  `;

  requestsPool.query(query, [userId, editType, reason], (err, results) => {
      if (err) {
          console.error('Error inserting stock edit request:', err);
          return res.status(500).json({ success: false, message: 'Database error' });
      }

      res.json({ success: true, message: 'Stock edit request submitted successfully' });
  });
});

//6. requests summary
app.get('/api/my-requests-summary', (req, res) => {
  const userId = req.session.user ? req.session.user.userId : null;

  if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const totalQuery = `
      (SELECT COUNT(*) AS total FROM expenses_requests WHERE user_id = ?)
      UNION ALL
      (SELECT COUNT(*) FROM maintenance_requests WHERE user_id = ?)
      UNION ALL
      (SELECT COUNT(*) FROM stock_edit_requests WHERE user_id = ?)
  `;

  const statusQuery = `
      (SELECT status FROM expenses_requests WHERE user_id = ?)
      UNION ALL
      (SELECT status FROM maintenance_requests WHERE user_id = ?)
      UNION ALL
      (SELECT status FROM stock_edit_requests WHERE user_id = ?)
  `;

  requestsPool.query(totalQuery, [userId, userId, userId], (err, totalResults) => {
      if (err) {
          console.error('Error fetching total requests:', err);
          return res.status(500).json({ success: false, message: 'Database error' });
      }

      const total = totalResults.reduce((sum, row) => sum + Object.values(row)[0], 0);

      requestsPool.query(statusQuery, [userId, userId, userId], (err, statusResults) => {
          if (err) {
              console.error('Error fetching status counts:', err);
              return res.status(500).json({ success: false, message: 'Database error' });
          }

          let pending = 0, approved = 0, rejected = 0;
          statusResults.forEach(row => {
              const status = row.status;
              if (status.includes('Pending')) pending++;
              if (status === 'Approved') approved++;
              if (status === 'Rejected') rejected++;
          });

          res.json({
              total: total,
              pending: pending,
              approved: approved,
              rejected: rejected,
              usersInvolved: 2 // For now hardcode; later can improve to calculate dynamic approvers if needed
          });
      });
  });
});

//7.admin review requests
// Corrected /api/admin/fetch-pending
app.get('/api/admin/fetch-pending', (req, res) => {
  const userJobTitle = req.session.user ? req.session.user.jobTitle : null;
  if (!userJobTitle) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  const queries = `
      (SELECT id, 'Expense' AS type, category AS details, description AS reason, CAST(amount AS DECIMAL(10,2)) AS amount, status FROM expenses_requests WHERE status LIKE 'Pending%')
      UNION ALL
      (SELECT id, 'Maintenance' AS type, issue_type AS details, reason, NULL AS amount, status FROM maintenance_requests WHERE status LIKE 'Pending%')
      UNION ALL
      (SELECT id, 'Stock Edit' AS type, edit_type AS details, reason, NULL AS amount, status FROM stock_edit_requests WHERE status LIKE 'Pending%')
  `;
  requestsPool.query(queries, (err, results) => {
      if (err) {
          console.error('Error fetching pending requests:', err);
          return res.status(500).json({ success: false, message: 'Database error' });
      }
      res.json(results);
  });
});

//8. approve requests
app.post('/api/admin/approve', (req, res) => {
  const userJobTitle = req.session.user ? req.session.user.jobTitle : null;
  const approverName = req.session.user ? req.session.user.fullName : null;
  const { requestType, requestId } = req.body;

  if (!userJobTitle || !requestType || !requestId) {
    return res.status(400).json({ success: false, message: 'Missing data' });
  }

  let tableName = '';
  if (requestType === 'Expense') {
    tableName = 'expenses_requests';
  } else if (requestType === 'Maintenance') {
    tableName = 'maintenance_requests';
  } else if (requestType === 'Stock Edit') {
    tableName = 'stock_edit_requests';
  } else {
    return res.status(400).json({ success: false, message: 'Invalid request type' });
  }

  // Step 1: Fetch current status
  const queryFetch = `SELECT status FROM ${tableName} WHERE id = ?`;
  requestsPool.query(queryFetch, [requestId], (err, results) => {
    if (err || results.length === 0) {
      return res.status(500).json({ success: false, message: 'Request not found or DB error' });
    }

    const currentStatus = results[0].status || '';

    // Step 2: Check if user is allowed to approve
    let allowed = false;
    let nextStatus = '';
    let approverField = '';

    if (requestType === 'Expense') {
      if (currentStatus.includes('Pending Retail Ops') && userJobTitle === 'Retail Ops Supervisor') {
        nextStatus = 'Pending Finance';
        approverField = 'approver_1';
        allowed = true;
      } else if (currentStatus.includes('Pending Finance') && userJobTitle === 'Finance Supervisor') {
        nextStatus = 'Approved';
        approverField = 'approver_2';
        allowed = true;
      }
    } else if (requestType === 'Maintenance') {
      if (currentStatus.includes('Pending Retail Ops') && userJobTitle === 'Retail Ops Supervisor') {
        nextStatus = 'Pending Finance';
        approverField = 'approver_1';
        allowed = true;
      } else if (currentStatus.includes('Pending Finance') && userJobTitle === 'Finance Supervisor') {
        nextStatus = 'Approved';
        approverField = 'approver_2';
        allowed = true;
      }
    } else if (requestType === 'Stock Edit') {
      if (currentStatus.includes('Pending Store Manager') && userJobTitle === 'Store Manager') {
        nextStatus = 'Pending Retail Ops';
        approverField = 'approver_1';
        allowed = true;
      } else if (currentStatus.includes('Pending Retail Ops') && userJobTitle === 'Retail Ops Supervisor') {
        nextStatus = 'Approved';
        approverField = 'approver_2';
        allowed = true;
      }
    }

    if (!allowed) {
      return res.status(403).json({ success: false, message: 'You are not authorized to approve this request at this stage' });
    }

    // Step 3: Update request
    const queryUpdate = `
      UPDATE ${tableName}
      SET status = ?, ${approverField} = ?
      WHERE id = ?
    `;

    requestsPool.query(queryUpdate, [nextStatus, approverName, requestId], (err, result) => {
      if (err) {
        console.error('Error approving request:', err);
        return res.status(500).json({ success: false, message: 'Database error during approval' });
      }
      res.json({ success: true, message: 'Request approved successfully' });
    });
  });
});

//9. reject requests
app.post('/api/admin/reject', (req, res) => {
  const userJobTitle = req.session.user ? req.session.user.jobTitle : null;
  const approverName = req.session.user ? req.session.user.fullName : null;
  const { requestType, requestId } = req.body;

  if (!userJobTitle || !requestType || !requestId) {
    return res.status(400).json({ success: false, message: 'Missing data' });
  }

  let tableName = '';
  if (requestType === 'Expense') {
    tableName = 'expenses_requests';
  } else if (requestType === 'Maintenance') {
    tableName = 'maintenance_requests';
  } else if (requestType === 'Stock Edit') {
    tableName = 'stock_edit_requests';
  } else {
    return res.status(400).json({ success: false, message: 'Invalid request type' });
  }

  // Step 1: Fetch current status
  const queryFetch = `SELECT status FROM ${tableName} WHERE id = ?`;
  requestsPool.query(queryFetch, [requestId], (err, results) => {
    if (err || results.length === 0) {
      return res.status(500).json({ success: false, message: 'Request not found or DB error' });
    }

    const currentStatus = results[0].status || '';

    // Step 2: Check if user is allowed to reject
    let allowed = false;

    if (requestType === 'Expense') {
      if (currentStatus.includes('Pending Retail Ops') && userJobTitle === 'Retail Ops Supervisor') {
        allowed = true;
      } else if (currentStatus.includes('Pending Finance') && userJobTitle === 'Finance Supervisor') {
        allowed = true;
      }
    } else if (requestType === 'Maintenance') {
      if (currentStatus.includes('Pending Retail Ops') && userJobTitle === 'Retail Ops Supervisor') {
        allowed = true;
      } else if (currentStatus.includes('Pending Finance') && userJobTitle === 'Finance Supervisor') {
        allowed = true;
      }
    } else if (requestType === 'Stock Edit') {
      if (currentStatus.includes('Pending Store Manager') && userJobTitle === 'Store Manager') {
        allowed = true;
      } else if (currentStatus.includes('Pending Retail Ops') && userJobTitle === 'Retail Ops Supervisor') {
        allowed = true;
      }
    }

    if (!allowed) {
      return res.status(403).json({ success: false, message: 'You are not authorized to reject this request at this stage' });
    }

    // Step 3: Update request to Rejected
    const queryUpdate = `
      UPDATE ${tableName}
      SET status = 'Rejected', approver_1 = IFNULL(approver_1, ?)
      WHERE id = ?
    `;

    requestsPool.query(queryUpdate, [approverName, requestId], (err, result) => {
      if (err) {
        console.error('Error rejecting request:', err);
        return res.status(500).json({ success: false, message: 'Database error during rejection' });
      }
      res.json({ success: true, message: 'Request rejected successfully' });
    });
  });
});

//10. // Maintenance
app.post('/api/fetch-my-maintenance', (req, res) => {
  const userId = req.session.user ? req.session.user.userId : null;
  const { year, month } = req.body;

  if (!userId || !year || !month) {
    return res.status(400).json({ success: false, message: 'User ID, year, and month are required' });
  }

  const period = `${year}-${month}`;

  const query = `
    SELECT id, issue_type AS category, reason, status
    FROM maintenance_requests
    WHERE user_id = ? AND DATE_FORMAT(submitted_at, '%Y-%m') = ?
    ORDER BY id DESC
`;


  requestsPool.query(query, [userId, period], (err, results) => {
    if (err) {
      console.error('Error fetching maintenance requests:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    res.json(results);
  });
});

// 11. Stock Edit
app.post('/api/fetch-my-stockedits', (req, res) => {
  const userId = req.session.user ? req.session.user.userId : null;
  const { year, month } = req.body;

  if (!userId || !year || !month) {
    return res.status(400).json({ success: false, message: 'User ID, year, and month are required' });
  }

  const period = `${year}-${month}`;

  const query = `
    SELECT id, edit_type AS category, reason, status
    FROM stock_edit_requests
    WHERE user_id = ? AND DATE_FORMAT(submitted_at, '%Y-%m') = ?
    ORDER BY id DESC
  `;

  requestsPool.query(query, [userId, period], (err, results) => {
    if (err) {
      console.error('Error fetching stock edit requests:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    res.json(results);
  });
});

//12. deleting requests
// Delete Maintenance Request
app.delete('/api/delete-maintenance/:id', (req, res) => {
  const userId = req.session.user ? req.session.user.userId : null;
  const requestId = req.params.id;

  if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

  const query = `DELETE FROM maintenance_requests WHERE id = ? AND user_id = ?`;
  requestsPool.query(query, [requestId, userId], (err, result) => {
      if (err) return res.status(500).json({ success: false, message: 'Database error' });
      if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Request not found or unauthorized' });
      res.json({ success: true, message: 'Maintenance request deleted successfully' });
  });
});

// 13. Delete Stock Edit Request
app.delete('/api/delete-stockedit/:id', (req, res) => {
  const userId = req.session.user ? req.session.user.userId : null;
  const requestId = req.params.id;

  if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

  const query = `DELETE FROM stock_edit_requests WHERE id = ? AND user_id = ?`;
  requestsPool.query(query, [requestId, userId], (err, result) => {
      if (err) return res.status(500).json({ success: false, message: 'Database error' });
      if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Request not found or unauthorized' });
      res.json({ success: true, message: 'Stock edit request deleted successfully' });
  });
});

//14. request history pagenated
// ========== Unified Paginated User Requests Endpoint ==========
app.get('/api/my-requests-paginated', isAuthenticated, (req, res) => {
    const userId = req.session.user.userId;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;

    const countSql = `
        SELECT (
            (SELECT COUNT(*) FROM expenses_requests WHERE user_id = ?) +
            (SELECT COUNT(*) FROM maintenance_requests WHERE user_id = ?) +
            (SELECT COUNT(*) FROM stock_edit_requests WHERE user_id = ?)
        ) AS total
    `;

    const dataSql = `
        SELECT id, 'Expense' AS type, category AS details, description AS reason, amount, status, submitted_at AS created_at
        FROM expenses_requests WHERE user_id = ?
        UNION ALL
        SELECT id, 'Maintenance' AS type, issue_type AS details, reason, NULL AS amount, status, submitted_at AS created_at
        FROM maintenance_requests WHERE user_id = ?
        UNION ALL
        SELECT id, 'Stock Edit' AS type, edit_type AS details, reason, NULL AS amount, status, submitted_at AS created_at
        FROM stock_edit_requests WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
    `;

    requestsPool.query(countSql, [userId, userId, userId], (err, countRows) => {
        if (err) {
            console.error("Error counting user requests:", err);
            return res.status(500).json({ error: 'Count failed' });
        }
        const total = countRows[0].total;
        requestsPool.query(dataSql, [userId, userId, userId, limit, offset], (err2, rows) => {
            if (err2) {
                console.error("Error fetching paginated user requests:", err2);
                return res.status(500).json({ error: 'Fetch failed' });
            }
            res.json({
                data: rows,
                currentPage: page,
                totalPages: Math.ceil(total / limit),
                total,
            });
        });
    });
});


// Serve profile pictures
app.get('/api/user-photo/:userId', (req, res) => {
  const userId = req.params.userId;

  connection.query('SELECT Photo FROM users WHERE UserID = ?', [userId], (err, results) => {
    if (err || results.length === 0) {
      return res.sendFile(path.join(__dirname, 'public/images/default-profile.png'));
    }

    const photoData = results[0].Photo;

    // If photo is null or empty, fallback
    if (!photoData || photoData.length === 0) {
      return res.sendFile(path.join(__dirname, 'public/images/default-profile.png'));
    }

    // Check if it's a buffer and detect type
    if (Buffer.isBuffer(photoData)) {
      const hex = photoData.slice(0, 8).toString('hex');

      if (hex.startsWith('ffd8')) {
        res.set('Content-Type', 'image/jpeg');
      } else if (hex === '89504e470d0a1a0a') {
        res.set('Content-Type', 'image/png');
      } else if (photoData.slice(0, 6).toString() === 'GIF89a' || photoData.slice(0, 6).toString() === 'GIF87a') {
        res.set('Content-Type', 'image/gif');
      } else {
        return res.sendFile(path.join(__dirname, 'public/images/default-profile.png'));
      }

      return res.send(photoData);
    }

    // Fallback if not a valid buffer
    return res.sendFile(path.join(__dirname, 'public/images/default-profile.png'));
  });
});


//12. exporting requests to excel
app.post('/api/expense/export-excel', async (req, res) => {
    const userId = req.session.user ? req.session.user.userId : null;
    const { year, month } = req.body;

    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    if (!year || !month) return res.status(400).json({ error: 'Year and month required' });

    const period = `${year}-${month}`;
    try {
        const [expenses] = await requestsPool.promise().query(
            `SELECT date, category, description, amount, status 
             FROM expenses_requests 
             WHERE user_id = ? AND period = ?
             ORDER BY date DESC`,
            [userId, period]
        );

        if (!expenses.length) return res.status(404).json({ error: 'No expenses to export' });

        const ExcelJS = require('exceljs');
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('My Expenses');

        worksheet.columns = [
            { header: 'Date', key: 'date', width: 15 },
            { header: 'Category', key: 'category', width: 20 },
            { header: 'Description', key: 'description', width: 30 },
            { header: 'Amount', key: 'amount', width: 12 },
            { header: 'Status', key: 'status', width: 15 }
        ];

        worksheet.getRow(1).font = { bold: true };

        expenses.forEach(exp => worksheet.addRow(exp));

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=expenses_${period}.xlsx`);

        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error('Error exporting expenses:', err);
        res.status(500).json({ error: 'Failed to export expenses.' });
    }
});


//cross_selling_app
// ✅ GET all topics (id + title) for dynamic button loading
app.get('/api/cross-selling/all', (req, res) => {
  crossSellingPool.query('SELECT id, title FROM topics ORDER BY title', (err, rows) => {
    if (err) {
      console.error('Error fetching topics:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows);
  });
});

// ✅ GET content of a topic by title (when button is clicked)
app.get('/api/cross-selling', (req, res) => {
  const { title } = req.query;
  crossSellingPool.query('SELECT content FROM topics WHERE title = ?', [title], (err, rows) => {
    if (err) {
      console.error('Error fetching topic content:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows[0] || { content: 'Not found' });
  });
});

// ✅ POST a new topic (Add button)
app.post('/api/cross-selling', (req, res) => {
  const { title, content } = req.body;
  crossSellingPool.query('INSERT INTO topics (title, content) VALUES (?, ?)', [title, content], (err) => {
    if (err) {
      console.error('Error inserting topic:', err);
      return res.status(500).json({ success: false, error: 'Insert failed' });
    }
    res.json({ success: true });
  });
});

// ✅ PUT update topic by id (Edit button)
app.put('/api/cross-selling/:id', (req, res) => {
  const { title, content } = req.body;
  const { id } = req.params;
  crossSellingPool.query('UPDATE topics SET title = ?, content = ? WHERE id = ?', [title, content, id], (err) => {
    if (err) {
      console.error('Error updating topic:', err);
      return res.status(500).json({ success: false, error: 'Update failed' });
    }
    res.json({ success: true });
  });
});

// ✅ DELETE topic by id (Delete button)
app.delete('/api/cross-selling/:id', (req, res) => {
  const { id } = req.params;
  crossSellingPool.query('DELETE FROM topics WHERE id = ?', [id], (err) => {
    if (err) {
      console.error('Error deleting topic:', err);
      return res.status(500).json({ success: false, error: 'Delete failed' });
    }
    res.json({ success: true });
  });
});

//PDC
// ✅ GET all adult dose drugs
app.get('/api/pdc/drugs', (req, res) => {
  pdcpool.query('SELECT * FROM adult_doses', (err, results) => {
    if (err) {
      console.error('Error fetching drugs:', err);
      return res.status(500).json({ success: false, error: err });
    }
    res.json(results);
  });
});

// ✅ POST add or update drug
app.post('/api/pdc/drug', (req, res) => {
  const { name, dose } = req.body;
  if (!name || !dose) {
    return res.status(400).json({ success: false, message: 'Name and dose are required' });
  }

  const query = `
    INSERT INTO adult_doses (name, dose)
    VALUES (?, ?)
    ON DUPLICATE KEY UPDATE dose = VALUES(dose)
  `;

  pdcpool.query(query, [name, dose], (err) => {
    if (err) {
      console.error('Error saving drug:', err);
      return res.status(500).json({ success: false, error: err });
    }
    res.json({ success: true });
  });
});

// ✅ DELETE a drug
app.delete('/api/pdc/drug/:id', (req, res) => {
  const id = req.params.id;
  pdcpool.query('DELETE FROM adult_doses WHERE id = ?', [id], (err) => {
    if (err) {
      console.error('Error deleting drug:', err);
      return res.status(500).json({ success: false, error: err });
    }
    res.json({ success: true });
  });
});

//=================================edit bills====================================================
// ✅ GET bills in date range
// Fetch bills for editing (admin only) or for return/reprint (any authenticated user)
app.get('/api/bill-mgmt/fetch', isAuthenticated, async (req, res) => {
  try {
    const { from, to, role } = req.query;

    // Only restrict if role=admin
    if (role === 'admin') {
      if (!req.session.user || !req.session.user.isAdmin) {
        return res.status(403).json({ success: false, message: 'Admins only.' });
      }
    }

    // Validate dates
    if (!from || !to) {
      return res.status(400).json({ success: false, message: 'From and to dates required.' });
    }

    // Fetch bills within date range
    const query = `
      SELECT * FROM bills
      WHERE bill_date BETWEEN ? AND ?
      ORDER BY bill_date DESC, bill_time DESC, bill_id DESC
    `;
    const [rows] = await billsPool.promise().query(query, [from, to]);
    res.json(rows);
  } catch (err) {
    console.error('Error in /api/bill-mgmt/fetch:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});


// 🗑️ DELETE bill by ID
app.delete('/api/bill-mgmt/delete/:billId', isAuthenticated, isAdmin, (req, res) => {
  const billId = req.params.billId;
  billsPool.query('DELETE FROM bills WHERE bill_id = ?', [billId], (err) => {
    if (err) return res.status(500).json({ success: false });
    res.json({ success: true });
  });
});

// 💾 POST updates for edited bills
app.post('/api/bill-mgmt/update-multiple', isAuthenticated, isAdmin, (req, res) => {
  const updates = req.body.updates;
  let pending = updates.length;
  if (pending === 0) return res.json({ success: true });

  updates.forEach(update => {
    const {
      bill_id, quantity, subtotal, payment_method,
      card_invoice_number, ['E-commerce Invoice Number']: ecomm,
      patient_name, patient_phone, user,
    } = update;

    billsPool.query(
      `UPDATE bills SET 
        quantity = ?, subtotal = ?, payment_method = ?,
        card_invoice_number = ?, \`E-commerce Invoice Number\` = ?,
        patient_name = ?, patient_phone = ?, user = ?
      WHERE bill_id = ?`,
      [
        quantity, subtotal, payment_method,
        card_invoice_number, ecomm,
        patient_name, patient_phone, user, bill_id
      ],
      (err) => {
        if (--pending === 0) res.json({ success: true });
      }
    );
  });
});

// ==================================item-wise sales report====================================================
app.post('/api/bills-report/data', (req, res) => {
  const {
    dateStart, dateEnd, itemName, patientName, patientPhone, user, paymentMethod,
    cardInvoice, ecomInvoice, priceMin, priceMax, page, pageSize
  } = req.body;
  const offset = ((parseInt(page, 10) || 1) - 1) * (parseInt(pageSize, 10) || 20);
  let wheres = [];
  let params = [];

  // --- Dynamic WHEREs ---
  if (dateStart)        { wheres.push('bill_date >= ?'); params.push(dateStart); }
  if (dateEnd)          { wheres.push('bill_date <= ?'); params.push(dateEnd); }
  if (itemName)         { wheres.push('item_name LIKE ?'); params.push('%'+itemName+'%'); }
  if (patientName)      { wheres.push('patient_name LIKE ?'); params.push('%'+patientName+'%'); }
  if (patientPhone)     { wheres.push('patient_phone LIKE ?'); params.push('%'+patientPhone+'%'); }
  if (user)             { wheres.push('user LIKE ?'); params.push('%'+user+'%'); }
  if (paymentMethod)    { wheres.push('payment_method LIKE ?'); params.push('%'+paymentMethod+'%'); }
  if (cardInvoice)      { wheres.push('card_invoice_number LIKE ?'); params.push('%'+cardInvoice+'%'); }
  if (ecomInvoice)      { wheres.push('`E-commerce Invoice Number` LIKE ?'); params.push('%'+ecomInvoice+'%'); }
  if (priceMin)         { wheres.push('price >= ?'); params.push(priceMin); }
  if (priceMax)         { wheres.push('price <= ?'); params.push(priceMax); }

  const whereClause = wheres.length ? 'WHERE ' + wheres.join(' AND ') : '';
  const sql = `SELECT * FROM bills ${whereClause} ORDER BY bill_date DESC, bill_time DESC LIMIT ?, ?`;
  const countSql = `
  SELECT COUNT(*) AS totalRows,
         SUM(subtotal) AS totalAmount,
         COUNT(*) AS transactionCount,
         SUM(CASE WHEN LOWER(payment_method) LIKE '%cash%' THEN subtotal ELSE 0 END) AS cashTotal,
         SUM(CASE WHEN LOWER(payment_method) LIKE '%card%' THEN subtotal ELSE 0 END) AS cardTotal,
         SUM(CASE WHEN LOWER(payment_method) LIKE '%ecom%' THEN subtotal ELSE 0 END) AS ecomTotal,
         SUM(CASE WHEN LOWER(payment_method) LIKE '%insurance%' THEN subtotal ELSE 0 END) AS insuranceTotal
  FROM bills ${whereClause}
`;

  // --- Get totals/summary first
  billsPool.query(countSql, params, (err, countResults) => {
    if (err) return res.status(500).json({ error: 'Database error (summary)', details: err.message });
    const totalRows = countResults[0].totalRows || 0;
    const summary = {
  totalAmount: countResults[0].totalAmount || 0,
  transactionCount: countResults[0].transactionCount || 0,
  cashTotal: countResults[0].cashTotal || 0,
  cardTotal: countResults[0].cardTotal || 0,
  ecomTotal: countResults[0].ecomTotal || 0,
  insuranceTotal: countResults[0].insuranceTotal || 0
};
    // --- Then get rows
    billsPool.query(sql, [...params, offset, parseInt(pageSize, 10) || 20], (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error (rows)', details: err.message });
      res.json({ rows, totalRows, summary });
    });
  });
});

/**
 * 5. POST /api/bills-report/export
 *    Exports filtered bills data to Excel (.xlsx)
 *    Expects same body as data endpoint.
 *    Returns: XLSX file download (application/vnd.openxmlformats-officedocument.spreadsheetml.sheet)
 */
app.post('/api/bills-report/export', (req, res) => {
  const {
    dateStart, dateEnd, itemName, patientName, patientPhone, user, paymentMethod,
    cardInvoice, ecomInvoice, priceMin, priceMax
  } = req.body;
  let wheres = [];
  let params = [];

  if (dateStart)        { wheres.push('bill_date >= ?'); params.push(dateStart); }
  if (dateEnd)          { wheres.push('bill_date <= ?'); params.push(dateEnd); }
  if (itemName)         { wheres.push('item_name LIKE ?'); params.push('%'+itemName+'%'); }
  if (patientName)      { wheres.push('patient_name LIKE ?'); params.push('%'+patientName+'%'); }
  if (patientPhone)     { wheres.push('patient_phone LIKE ?'); params.push('%'+patientPhone+'%'); }
  if (user)             { wheres.push('user LIKE ?'); params.push('%'+user+'%'); }
  if (paymentMethod)    { wheres.push('payment_method LIKE ?'); params.push('%'+paymentMethod+'%'); }
  if (cardInvoice)      { wheres.push('card_invoice_number LIKE ?'); params.push('%'+cardInvoice+'%'); }
  if (ecomInvoice)      { wheres.push('`E-commerce Invoice Number` LIKE ?'); params.push('%'+ecomInvoice+'%'); }
  if (priceMin)         { wheres.push('price >= ?'); params.push(priceMin); }
  if (priceMax)         { wheres.push('price <= ?'); params.push(priceMax); }

  const whereClause = wheres.length ? 'WHERE ' + wheres.join(' AND ') : '';
  const sql = `SELECT * FROM bills ${whereClause} ORDER BY bill_date DESC, bill_time DESC`;

  billsPool.query(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error (export)', details: err.message });

    // Format rows for Excel
    const worksheetData = [
      [
        'Date', 'Time', 'Item Name', 'Quantity', 'Price', 'Subtotal', 'Payment Method',
        'Card Invoice #', 'E-commerce Invoice #', 'Patient Name', 'Patient Phone', 'User'
      ],
      ...rows.map(row => [
        row.bill_date ? new Date(row.bill_date).toLocaleDateString('en-GB') : '',
        row.bill_time ? (function(t){
          let [h,m] = t.split(':'); 
          let hour = Number(h), ampm = hour >= 12 ? 'PM' : 'AM';
          hour = hour % 12 || 12;
          return `${hour}:${m} ${ampm}`;
        })(row.bill_time) : '',
        row.item_name || '',
        row.quantity || '',
        row.price || '',
        row.subtotal || '',
        row.payment_method || '',
        row.card_invoice_number || '',
        row['E-commerce Invoice Number'] || '',
        row.patient_name || '',
        row.patient_phone || '',
        row.user || ''
      ])
    ];
    // Add summary row at the end
    const totalAmount = rows.reduce((sum, r) => sum + (Number(r.subtotal) || 0), 0);
    worksheetData.push(['', '', '', '', '', `Total: ${totalAmount.toFixed(2)}`]);

    // Create workbook and sheet
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.aoa_to_sheet(worksheetData);

    // Style header row
    const range = xlsx.utils.decode_range(ws['!ref']);
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cell = ws[xlsx.utils.encode_cell({c:C, r:0})];
      if (!cell.s) cell.s = {};
      cell.s = {
        font: { bold: true, color: { rgb: "222222" } },
        fill: { fgColor: { rgb: "F1C40F" } },
        alignment: { horizontal: "center", vertical: "center" }
      };
    }

    // Autosize columns (simple version)
    ws['!cols'] = worksheetData[0].map((col, idx) => ({
      wch: Math.max(
        col.toString().length + 2, // header width
        ...rows.map(r => (r[Object.keys(r)[idx]] || '').toString().length + 2),
        10
      )
    }));

    // Optional: format numeric columns
    // ws['E2'] = { t: 'n', z: '#,##0.00' }

    xlsx.utils.book_append_sheet(wb, ws, 'Bills Report');
    const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx', cellStyles: true });

    res.setHeader('Content-Disposition', 'attachment; filename=bills_report.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  });
});

//near expiry report
// --- 1. Primary Data: Near Expiry Fetch ---
// Default: next 3 months, batch-aware
app.get('/api/near-expiry-G7v9Q', async (req, res) => {
  const now = new Date();
  const threeMonthsLater = new Date();
  threeMonthsLater.setMonth(now.getMonth() + 3);

  const start = now.toISOString().slice(0, 10);
  const end = threeMonthsLater.toISOString().slice(0, 10);

  try {
    // Batch rows
    const [batchRows] = await medicinesPool.promise().query(
      `SELECT m.item_name, m.barcode, b.batch_number, b.expiry, b.quantity AS stock
       FROM medicines_table m
       JOIN batches b ON b.medicine_id = m.id
       WHERE b.expiry BETWEEN ? AND ?
       ORDER BY b.expiry ASC`,
      [start, end]
    );
    // Legacy fallback: medicines with no batch
    const [fallbackRows] = await medicinesPool.promise().query(
      `SELECT m.item_name, m.barcode, NULL AS batch_number, m.expiry, m.stock
       FROM medicines_table m
       LEFT JOIN batches b ON b.medicine_id = m.id
       WHERE b.medicine_id IS NULL AND m.expiry BETWEEN ? AND ?
       ORDER BY m.expiry ASC`,
      [start, end]
    );
    res.json([...batchRows, ...fallbackRows]);
  } catch (err) {
    console.error("Near expiry report error:", err);
    res.status(500).json({ error: "Near expiry report failed" });
  }
});

// Filtered near-expiry
app.post('/api/filter-expiry-D8k1P', async (req, res) => {
  const { startDate, endDate } = req.body || {};
  if (!startDate || !endDate) return res.status(400).json({ error: "Dates required" });
  try {
    // Batch rows
    const [batchRows] = await medicinesPool.promise().query(
      `SELECT m.item_name, m.barcode, b.batch_number, b.expiry, b.quantity AS stock
       FROM medicines_table m
       JOIN batches b ON b.medicine_id = m.id
       WHERE b.expiry BETWEEN ? AND ?
       ORDER BY b.expiry ASC`,
      [startDate, endDate]
    );
    // Legacy fallback
    const [fallbackRows] = await medicinesPool.promise().query(
      `SELECT m.item_name, m.barcode, NULL AS batch_number, m.expiry, m.stock
       FROM medicines_table m
       LEFT JOIN batches b ON b.medicine_id = m.id
       WHERE b.medicine_id IS NULL AND m.expiry BETWEEN ? AND ?
       ORDER BY m.expiry ASC`,
      [startDate, endDate]
    );
    res.json([...batchRows, ...fallbackRows]);
  } catch (err) {
    console.error("Filtered near expiry error:", err);
    res.status(500).json({ error: "Filtered near expiry report failed" });
  }
});

// --- 2. Advanced Filtering: Custom Date Range ---
app.post('/api/filter-expiry-D8k1P', (req, res) => {
    const { startDate, endDate } = req.body;
    if (!startDate || !endDate)
        return res.status(400).json({ error: 'Start and end dates required' });
    const sql = `SELECT item_name, barcode, stock, expiry FROM medicines_table
                 WHERE expiry BETWEEN ? AND ?
                 ORDER BY expiry ASC`;
    medicinesPool.query(sql, [startDate, endDate], (err, results) => {
        if (err) return res.status(500).json({ error: 'DB Error', details: err });
        res.json(results);
    });
});

// --- 3. Excel Export ---
app.post('/api/export-expiry-V2h5K', async (req, res) => {
    const { startDate, endDate } = req.body;
    const sql = `SELECT item_name, barcode, stock, expiry FROM medicines_table
                 WHERE expiry BETWEEN ? AND ?
                 ORDER BY expiry ASC`;
    medicinesPool.query(sql, [startDate, endDate], async (err, results) => {
        if (err) return res.status(500).json({ error: 'DB Error', details: err });

        // Excel creation
        const workbook = new ExcelJS.Workbook()
        const worksheet = workbook.addWorksheet('Near Expiry Report');

        worksheet.columns = [
            { header: 'Item Name', key: 'item_name', width: 32 },
            { header: 'Barcode', key: 'barcode', width: 22 },
            { header: 'Expiry Date', key: 'expiry', width: 18 },
            { header: 'Stock', key: 'stock', width: 12 }
        ];

        // Bold headers
        worksheet.getRow(1).eachCell(cell => {
            cell.font = { bold: true };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
        });

        // Add data
        results.forEach(row => {
            worksheet.addRow({
                item_name: row.item_name,
                barcode: row.barcode,
                stock: row.stock,
                expiry: row.expiry ? (new Date(row.expiry)).toLocaleDateString('en-GB') : ''
            });
        });

        // Auto-fit columns
        worksheet.columns.forEach(column => {
            let maxLength = column.header.length;
            column.eachCell({ includeEmpty: true }, cell => {
                const cellLength = cell.value ? cell.value.toString().length : 0;
                if (cellLength > maxLength) maxLength = cellLength;
            });
            column.width = maxLength + 2;
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="NearExpiryReport.xlsx"');
        await workbook.xlsx.write(res);
        res.end();
    });
});
//stock report
// Batch-aware stock report (paginated, with search and threshold)
app.get('/api/stock-report-BR51f', async (req, res) => {
  let { q = '', lowStockThreshold = 5, page = 1, perPage = 20 } = req.query;
  page = parseInt(page) || 1;
  perPage = parseInt(perPage) || 20;
  const offset = (page - 1) * perPage;
  const params = [`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, lowStockThreshold, perPage, offset];

  // Get paginated batch-aware stock summary
  const dataSql = `
    SELECT 
      m.id, 
      m.item_name, 
      m.barcode,
      m.price,
      IFNULL(SUM(b.quantity), m.stock) AS stock,
      IFNULL(MIN(b.expiry), m.expiry) AS expiry
    FROM medicines_table m
    LEFT JOIN batches b ON b.medicine_id = m.id
    WHERE (m.item_name LIKE ? OR m.barcode LIKE ? OR m.active_name_1 LIKE ? OR m.active_name_2 LIKE ?)
    GROUP BY m.id, m.item_name, m.barcode, m.price, m.stock, m.expiry
    HAVING stock IS NOT NULL AND stock < ? OR stock IS NULL
    ORDER BY m.item_name
    LIMIT ? OFFSET ?
  `;
  const countSql = `
    SELECT COUNT(*) AS total
    FROM (
      SELECT m.id
      FROM medicines_table m
      LEFT JOIN batches b ON b.medicine_id = m.id
      WHERE (m.item_name LIKE ? OR m.barcode LIKE ? OR m.active_name_1 LIKE ? OR m.active_name_2 LIKE ?)
      GROUP BY m.id
    ) sub
  `;

  try {
    const [dataRows] = await medicinesPool.promise().query(dataSql, params);
    const [countRows] = await medicinesPool.promise().query(countSql, params.slice(0, 4));
    res.json({ data: dataRows, total: (countRows[0] && countRows[0].total) || 0 });
  } catch (err) {
    console.error("Stock report error:", err);
    res.status(500).json({ error: "Stock report failed" });
  }
});

// POST /api/export-stock-report-RT65z
app.post('/api/export-stock-report-RT65z', (req, res) => {
  const { lowStockThreshold = 5, q = '' } = req.body;
  const sql = `
    SELECT item_name, barcode, price, expiry, stock
    FROM medicines_table
    WHERE item_name LIKE ? OR CAST(barcode AS CHAR) LIKE ?
    ORDER BY stock ASC, item_name ASC
  `;
  const likeQ = `%${q}%`;
  medicinesPool.query(sql, [likeQ, likeQ], async (err, results) => {
    if (err) return res.status(500).json({ error: 'DB error', details: err });
    const threshold = Number(lowStockThreshold) || 5;
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Stock Report');

    ws.columns = [
      { header: 'Item Name', key: 'item_name', width: 30 },
      { header: 'Barcode', key: 'barcode', width: 18 },
      { header: 'Price', key: 'price', width: 12 },
      { header: 'Expiry', key: 'expiry', width: 16 },
      { header: 'Stock', key: 'stock', width: 12 }
    ];
    ws.getRow(1).font = { bold: true };

    results.forEach(row => {
      const r = ws.addRow({
        item_name: row.item_name,
        barcode: row.barcode,
        price: row.price,
        expiry: row.expiry ? (new Date(row.expiry)).toLocaleDateString('en-GB') : '',
        stock: row.stock
      });
      if (Number(row.stock) < threshold) {
        r.eachCell(cell => {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFC107' } // amber highlight
          };
        });
      }
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=stock_report.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  });
});

// GET: Number of low stock items (<5 by default or set via query) - BATCH AWARE
app.get('/api/quick-stats/low-stock-count', async (req, res) => {
  const threshold = Number(req.query.threshold) || 5;
  
  try {
    // Get batch-aware stock counts (sum all batches per medicine)
    const [batchStockRows] = await medicinesPool.promise().query(`
      SELECT m.id, m.item_name, IFNULL(SUM(b.quantity), 0) AS total_batch_stock
      FROM medicines_table m
      LEFT JOIN batches b ON b.medicine_id = m.id
      GROUP BY m.id, m.item_name
    `);

    let lowStockCount = 0;
    
    for (const row of batchStockRows) {
      let effectiveStock = row.total_batch_stock;
      
      // If no batches exist, fallback to legacy stock column
      if (effectiveStock === 0 || effectiveStock === null) {
        // Get legacy stock from medicines_table
        const [legacyRow] = await medicinesPool.promise().query(
          'SELECT stock FROM medicines_table WHERE id = ?',
          [row.id]
        );
        effectiveStock = (legacyRow[0] && legacyRow[0].stock) ? Number(legacyRow[0].stock) : 0;
      }
      
      // Count if below threshold
      if (effectiveStock < threshold) {
        lowStockCount++;
      }
    }
    
    console.log(`[LOW STOCK] Found ${lowStockCount} items below threshold ${threshold}`);
    res.json({ count: lowStockCount });
    
  } catch (err) {
    console.error('[LOW STOCK] Error:', err);
    res.json({ count: 0 });
  }
});
// GET: Number of near expiry items (within X months, default 3) - BATCH AWARE
app.get('/api/quick-stats/near-expiry-count', async (req, res) => {
  const months = Number(req.query.months) || 3;
  const today = new Date();
  const from = today.toISOString().slice(0, 10);
  const toDate = new Date(today);
  toDate.setMonth(today.getMonth() + months);
  const to = toDate.toISOString().slice(0, 10);

  try {
    let nearExpiryCount = 0;
    
    // 1. Count items from batches table (batch-aware system)
    const [batchExpiryRows] = await medicinesPool.promise().query(`
      SELECT DISTINCT m.id
      FROM medicines_table m
      JOIN batches b ON b.medicine_id = m.id
      WHERE b.expiry BETWEEN ? AND ?
    `, [from, to]);
    
    nearExpiryCount += batchExpiryRows.length;
    
    // 2. Count items from medicines_table that don't have batches (legacy fallback)
    const [legacyExpiryRows] = await medicinesPool.promise().query(`
      SELECT m.id
      FROM medicines_table m
      LEFT JOIN batches b ON b.medicine_id = m.id
      WHERE b.medicine_id IS NULL 
        AND m.expiry IS NOT NULL 
        AND m.expiry BETWEEN ? AND ?
    `, [from, to]);
    
    nearExpiryCount += legacyExpiryRows.length;
    
    console.log(`[NEAR EXPIRY] Found ${nearExpiryCount} items expiring between ${from} and ${to}`);
    console.log(`[NEAR EXPIRY] Batch items: ${batchExpiryRows.length}, Legacy items: ${legacyExpiryRows.length}`);
    
    res.json({ count: nearExpiryCount });
    
  } catch (err) {
    console.error('[NEAR EXPIRY] Error:', err);
    res.json({ count: 0 });
  }
});

//item master
// GET /api/search-items?q=paracetamol
app.get('/api/search-items', (req, res) => {
  const q = req.query.q || '';
  if (!q) return res.json([]);
  const sql = `
    SELECT id, item_name, barcode, active_name_1, active_name_2
    FROM medicines_table
    WHERE item_name LIKE ? OR CAST(barcode AS CHAR) LIKE ? OR active_name_1 LIKE ? OR active_name_2 LIKE ?
    ORDER BY item_name ASC LIMIT 15
  `;
  const likeQ = `%${q}%`;
  medicinesPool.query(sql, [likeQ, likeQ, likeQ, likeQ], (err, results) => {
    if (err) return res.json([]);
    res.json(results);
  });
});
// FULL ENDPOINT FOR ITEM MASTER (batch-aware with legacy fallback)
app.get('/api/item-master/:id', async (req, res) => {
    try {
        const medicineId = req.params.id;
        // Get main medicine record
        const [medRows] = await medicinesPool.promise().query(
            'SELECT * FROM medicines_table WHERE id = ?', [medicineId]
        );
        if (!medRows.length) {
            return res.status(404).json({ error: 'Item not found' });
        }
        const medicine = medRows[0];

        // Get all batches for this medicine, sorted by expiry
        const [batches] = await medicinesPool.promise().query(
            'SELECT * FROM batches WHERE medicine_id = ? ORDER BY expiry ASC, batch_id ASC', [medicineId]
        );

        // Compute batch totals if any
        let batchStock = 0;
        let nearestExpiry = null;
        if (batches.length > 0) {
            batches.forEach(b => {
                if (b.quantity != null) batchStock += Number(b.quantity);
                if (b.expiry && (!nearestExpiry || new Date(b.expiry) < new Date(nearestExpiry))) {
                    nearestExpiry = b.expiry;
                }
            });
        }

        // Fallback: use legacy if no batches (or 0 batches)
        const useBatches = batches.length > 0;
        const result = {
            ...medicine,
            stock: useBatches ? batchStock : medicine.stock,
            expiry: useBatches ? nearestExpiry : medicine.expiry,
            batches // always send all batch data for UI
        };

        res.json(result);
    } catch (err) {
        console.error("Error in /api/item-master/:id:", err);
        res.status(500).json({ error: 'Failed to load item' });
    }
});

app.get('/api/pos/medicines/photo/:id', (req, res) => {
  const id = req.params.id;
  const query = 'SELECT item_pic FROM medicines_table WHERE id = ?';

  medicinesPool.query(query, [id], (err, rows) => {
    if (err || !rows.length || !rows[0].item_pic) {
      return res.status(404).send('Image not found');
    }

    // Convert BLOB buffer to string path
    const filePathString = rows[0].item_pic.toString('utf8'); // e.g., "/uploads/paracetamol.jpg"
    const absolutePath = path.join(__dirname, filePathString);

    // Serve the actual image file
    fs.access(absolutePath, fs.constants.F_OK, (err) => {
      if (err) {
        return res.status(404).send('Image file not found');
      }
      res.sendFile(absolutePath);
    });
  });
});

/** -- TASK MANAGEMENT ENDPOINTS (ALPHANUMERIC CONVENTION) -- **/

// 1. View all tasks + checklist items + status
app.get('/tsk-mgt-view-x7k2', isAuthenticated, (req, res) => {
  taskspool.query(
    `SELECT t.*, ti.id as itemId, ti.item_text, ti.completed, ti.completed_at
     FROM tasks t
     LEFT JOIN task_items ti ON t.id = ti.task_id
     ORDER BY t.created_at DESC`,
    (err, results) => {
      if (err) return res.status(500).json({ error: 'DB error' });
      // Group items by task
      const tasks = {};
      for (const row of results) {
        if (!tasks[row.id]) {
          tasks[row.id] = {
            id: row.id,
            title: row.title,
            type: row.type,
            created_by: row.created_by,
            created_at: row.created_at,
            updated_at: row.updated_at,
            items: []
          };
        }
        if (row.itemId) {
          tasks[row.id].items.push({
            id: row.itemId,
            text: row.item_text,
            completed: !!row.completed,
            completed_at: row.completed_at
          });
        }
      }
      res.json({ tasks: Object.values(tasks) });
    }
  );
});

// 2. Create new task (admin only)
app.post('/tsk-create-admin-p9m1', isAuthenticated, isAdmin, (req, res) => {
  const { title, type, items } = req.body; // items = array of strings
  if (!title || !type || !Array.isArray(items)) return res.status(400).json({ error: 'Invalid' });
  taskspool.query('INSERT INTO tasks (title, type, created_by) VALUES (?, ?, ?)', [title, type, req.session.user.userId], (err, result) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    const taskId = result.insertId;
    if (items.length === 0) return res.json({ success: true, taskId });
    const values = items.map(text => [taskId, text]);
    taskspool.query('INSERT INTO task_items (task_id, item_text) VALUES ?', [values], (err2) => {
      if (err2) return res.status(500).json({ error: 'DB error' });
      res.json({ success: true, taskId });
    });
  });
});

// 3. Update checklist item status
app.put('/tsk-update-item-q4n8', isAuthenticated, (req, res) => {
  const { itemId, completed } = req.body;
  taskspool.query(
    'UPDATE task_items SET completed = ?, completed_at = IF(? = 1, NOW(), NULL) WHERE id = ?',
    [completed ? 1 : 0, completed ? 1 : 0, itemId],
    (err, result) => {
      if (err) return res.status(500).json({ error: 'DB error' });
      res.json({ success: true });
    }
  );
});

// 4. Delete a task (admin only)
app.delete('/tsk-remove-admin-w2r7', isAuthenticated, isAdmin, (req, res) => {
  const { taskId } = req.body;
  taskspool.query('DELETE FROM tasks WHERE id = ?', [taskId], (err) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    taskspool.query('DELETE FROM task_items WHERE task_id = ?', [taskId], () => {});
    res.json({ success: true });
  });
});

// 5. Task renewal check & reset logic (run daily via cron or on login)
// Task auto-renewal endpoint - resets checklists if renewal is due
app.get('/tsk-renew-check-v5s3', async (req, res) => {
  try {
    // Fetch all tasks and their checklist items
    const [tasks] = await taskspool.promise().query('SELECT id, type FROM tasks');
    const now = new Date();

    for (const task of tasks) {
      // Get all checklist items for this task that are marked completed
      const [items] = await taskspool.promise().query(
        'SELECT id, completed, completed_at FROM task_items WHERE task_id = ? AND completed = 1',
        [task.id]
      );
      for (const item of items) {
        if (!item.completed_at) continue;

        const last = new Date(item.completed_at);
        let nextRenewal = null;
        switch (task.type) {
          case 'daily':
            nextRenewal = new Date(last);
            nextRenewal.setHours(0, 0, 0, 0);
            nextRenewal.setDate(nextRenewal.getDate() + 1);
            break;
          case 'weekly':
            nextRenewal = new Date(last);
            nextRenewal.setHours(0, 0, 0, 0);
            nextRenewal.setDate(nextRenewal.getDate() + 7);
            break;
          case 'monthly':
            nextRenewal = new Date(last);
            nextRenewal.setHours(0, 0, 0, 0);
            nextRenewal.setMonth(nextRenewal.getMonth() + 1);
            break;
          case 'yearly':
            nextRenewal = new Date(last);
            nextRenewal.setHours(0, 0, 0, 0);
            nextRenewal.setFullYear(nextRenewal.getFullYear() + 1);
            break;
          default:
            continue;
        }
        // If current time >= next renewal, reset
        if (now >= nextRenewal) {
          await taskspool.promise().query(
            'UPDATE task_items SET completed = 0, completed_at = NULL WHERE id = ?',
            [item.id]
          );
        }
      }
    }
    res.json({ message: 'Tasks checked and renewed as needed.' });
  } catch (err) {
    console.error('Error in /tsk-renew-check-v5s3:', err);
    res.status(500).json({ error: 'Task renewal failed.' });
  }
});

//6. // Update task (title, type, and checklist items)
app.put('/tsk-update-admin-b7u2', isAuthenticated, isAdmin, (req, res) => {
  const { taskId, title, type, items } = req.body;
  if (!taskId || !title || !type || !Array.isArray(items)) return res.status(400).json({ error: 'Invalid' });

  // Update main task
  taskspool.query(
    'UPDATE tasks SET title = ?, type = ?, updated_at = NOW() WHERE id = ?',
    [title, type, taskId],
    (err) => {
      if (err) return res.status(500).json({ error: 'DB error (update task)' });

      // Remove old items, insert new ones (simple way)
      taskspool.query('DELETE FROM task_items WHERE task_id = ?', [taskId], (err2) => {
        if (err2) return res.status(500).json({ error: 'DB error (clear items)' });

        const values = items.map(text => [taskId, text]);
        if (!values.length) return res.json({ success: true });

        taskspool.query('INSERT INTO task_items (task_id, item_text) VALUES ?', [values], (err3) => {
          if (err3) return res.status(500).json({ error: 'DB error (add items)' });
          res.json({ success: true });
        });
      });
    }
  );
});

//==========================Customer Requests ===========================================
// GET all customer requests
app.get('/api/cr-req-x7c1', (req, res) => {
  const query = `
    SELECT id, customer_name, phone_number, required_items, request_datetime, status,
      completion_datetime, recorded_by_pharmacist, completed_by_pharmacist
    FROM customer_requests
    ORDER BY request_datetime DESC
  `;
  customerRequestsPool.query(query, (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(results);
  });
});

// ADD NEW CUSTOMER REQUEST
app.post('/api/cr-req-x7c1', (req, res) => {
  const { customer_name, phone_number, required_items } = req.body;
  const recorded_by_pharmacist = req.session.user ? req.session.user.fullName : 'Unknown';

  if (!customer_name || !phone_number || !required_items) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const query = `
    INSERT INTO customer_requests (customer_name, phone_number, required_items, recorded_by_pharmacist)
    VALUES (?, ?, ?, ?)
  `;

  customerRequestsPool.query(query, [
    customer_name,
    phone_number,
    required_items,
    recorded_by_pharmacist
  ], (err, result) => {
    if (err) return res.status(500).json({ error: 'Insert failed' });
    res.json({ success: true, id: result.insertId });
  });
});


// UPDATE EXISTING REQUEST (EDIT OR COMPLETE)
app.put('/api/cr-req-x7c1/:id', (req, res) => {
  const { id } = req.params;
  const {
    customer_name,
    phone_number,
    required_items,
    status
  } = req.body;

  let query, params;

  // If completing the request
  if (status === 'completed') {
    const completed_by_pharmacist = req.session.user ? req.session.user.fullName : 'Unknown';
    const completion_datetime = new Date();

    query = `
      UPDATE customer_requests
      SET customer_name = ?, phone_number = ?, required_items = ?, status = ?, 
          completion_datetime = ?, completed_by_pharmacist = ?
      WHERE id = ?
    `;
    params = [
      customer_name,
      phone_number,
      required_items,
      status,
      completion_datetime,
      completed_by_pharmacist,
      id
    ];
  } else {
    // Normal edit
    query = `
      UPDATE customer_requests
      SET customer_name = ?, phone_number = ?, required_items = ?, status = ?
      WHERE id = ?
    `;
    params = [
      customer_name,
      phone_number,
      required_items,
      status,
      id
    ];
  }

  customerRequestsPool.query(query, params, (err, result) => {
    if (err) return res.status(500).json({ error: 'Update failed' });
    res.json({ success: true });
  });
});


// DELETE: Remove request
app.delete('/api/cr-req-x7c1/:id', isAuthenticated, (req, res) => {
  const { id } = req.params;
  customerRequestsPool.query(
    'DELETE FROM customer_requests WHERE id=?',
    [id],
    (err) => {
      if (err) return res.status(500).json({ error: 'Delete failed' });
      res.json({ success: true });
    }
  );
});

// Autocomplete for customer names from previous requests
app.get('/api/cr-req-x7k2/suggest-customer-name', (req, res) => {
  const { q } = req.query;
  const query = 'SELECT DISTINCT customer_name FROM customer_requests WHERE customer_name LIKE ? LIMIT 10';
  customerRequestsPool.query(query, [`%${q}%`], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(rows.map(r => r.customer_name));
  });
});

// Autocomplete for phone numbers from previous requests
app.get('/api/cr-req-x7k2/suggest-phone-number', (req, res) => {
  const { q } = req.query;
  const query = 'SELECT DISTINCT phone_number FROM customer_requests WHERE phone_number LIKE ? LIMIT 10';
  customerRequestsPool.query(query, [`%${q}%`], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(rows.map(r => r.phone_number));
  });
});

// Cart to Excel export (ExcelJS)
app.post('/api/pos/export-cart-excel', async (req, res) => {
  try {
    const { cart } = req.body;
    if (!Array.isArray(cart) || !cart.length) {
      return res.status(400).json({ error: 'No cart data provided' });
    }
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Cart');

    worksheet.columns = [
      { header: 'Item Name', key: 'item_name', width: 32 },
      { header: 'Price', key: 'price', width: 10 },
      { header: 'Quantity', key: 'quantity', width: 10 },
      { header: 'Expiry', key: 'expiry', width: 15 },
      { header: 'Stock', key: 'stock', width: 10 },
      { header: 'Packet Size', key: 'packet_size', width: 10 },
      { header: 'Subtotal', key: 'subtotal', width: 12 },
    ];
    worksheet.getRow(1).font = { bold: true };

    cart.forEach(row => worksheet.addRow(row));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=cart_${Date.now()}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Cart Excel export error:", err);
    res.status(500).json({ error: "Failed to generate Excel file" });
  }
});

//==============================================stock transactions app:

function safeParse(str, fallback = []) {
    if (Array.isArray(str)) return str; // <-- THIS LINE is the fix!
    if (str === null || str === undefined || str === "") return fallback;
    try {
        return JSON.parse(str);
    } catch (err) {
        console.error('safeParse error:', err, 'Input:', str);
        return fallback;
    }
}

// GET transaction history (filterable)
// Unified stock transactions dashboard (paginated, filtered, UNION-safe)
app.get('/api/stock-mgmt-x9z/dashboard', function (req, res) {
    var page = parseInt(req.query.page, 10) || 1;
    var limit = parseInt(req.query.limit, 10) || 20;
    var offset = (page - 1) * limit;

    var searchItem = req.query.item || '';
    var searchUser = req.query.user || '';
    var dateFrom = req.query.dateFrom || '';
    var dateTo = req.query.dateTo || '';
    var type = req.query.type || '';
    var idSearch = req.query.id || '';

    // Columns
    var columns = `
        id,
        transfer_id,
        receipt_id,
        items,
        quantities,
        batches,
        expiry_dates,
        transferring_user,
        sending_user,
        receiving_user,
        date,
        branch_from,
        branch_to,
        status,
        created_at,
        txn_type
    `;

    // Transfer select
    var transferSelect = `
        SELECT
            id,
            transfer_id,
            NULL AS receipt_id,
            items,
            quantities,
            batches,
            expiry_dates,
            transferring_user,
            NULL AS sending_user,
            NULL AS receiving_user,
            transfer_date AS date,
            branch_from,
            branch_to,
            status,
            created_at,
            'transfer' AS txn_type
        FROM stock_transfers
        WHERE 1
    `;
    // Receipt select
    var receiptSelect = `
        SELECT
            id,
            NULL AS transfer_id,
            receipt_id,
            items,
            quantities,
            batches,
            expiry_dates,
            NULL AS transferring_user,
            sending_user,
            receiving_user,
            receipt_date AS date,
            branch_from,
            branch_to,
            status,
            created_at,
            'receipt' AS txn_type
        FROM stock_receipts
        WHERE 1
    `;

    var params = [];
    var params2 = [];

    // Item filter: JSON_SEARCH for partial substring in JSON array
    if (searchItem) {
        transferSelect += ` AND (JSON_SEARCH(items, 'one', CONCAT('%', ?, '%'), NULL, '$[*]') IS NOT NULL)`;
        receiptSelect += ` AND (JSON_SEARCH(items, 'one', CONCAT('%', ?, '%'), NULL, '$[*]') IS NOT NULL)`;
        params.push(searchItem);
        params2.push(searchItem);
    }

    // User filter
    if (searchUser) {
        transferSelect += ` AND transferring_user LIKE ?`;
        receiptSelect += ` AND (sending_user LIKE ? OR receiving_user LIKE ?)`;
        params.push('%' + searchUser + '%');
        params2.push('%' + searchUser + '%', '%' + searchUser + '%');
    }

    // Date filters
    if (dateFrom) {
        transferSelect += ` AND transfer_date >= ?`;
        receiptSelect += ` AND receipt_date >= ?`;
        params.push(dateFrom);
        params2.push(dateFrom);
    }
    if (dateTo) {
        transferSelect += ` AND transfer_date <= ?`;
        receiptSelect += ` AND receipt_date <= ?`;
        params.push(dateTo + ' 23:59:59');
        params2.push(dateTo + ' 23:59:59');
    }

    // ID filter
    if (idSearch) {
        transferSelect += ` AND transfer_id LIKE ?`;
        receiptSelect += ` AND receipt_id LIKE ?`;
        params.push('%' + idSearch + '%');
        params2.push('%' + idSearch + '%');
    }

    // Type filter
    if (type === 'transfer') {
        receiptSelect = null;
    }
    if (type === 'receipt') {
        transferSelect = null;
    }
    if (type === 'cancelled') {
        transferSelect += ` AND status LIKE '%cancel%'`;
        receiptSelect += ` AND status LIKE '%reject%'`;
    }

    // Build queries
    var countSql = '', countParams = [];
    var unionSql = '';
    if (transferSelect && receiptSelect) {
        unionSql = `(${transferSelect}) UNION ALL (${receiptSelect}) ORDER BY date DESC LIMIT ? OFFSET ?`;
        countSql = `SELECT SUM(cnt) as total FROM (
            SELECT COUNT(*) as cnt FROM stock_transfers WHERE 1${searchItem ? ' AND (JSON_SEARCH(items, \'one\', CONCAT(\'%\', ?, \'%\'), NULL, \'$[*]\') IS NOT NULL)' : ''}${searchUser ? ' AND transferring_user LIKE ?' : ''}${dateFrom ? ' AND transfer_date >= ?' : ''}${dateTo ? ' AND transfer_date <= ?' : ''}${idSearch ? ' AND transfer_id LIKE ?' : ''}${type === 'cancelled' ? " AND status LIKE '%cancel%'" : ''}
            UNION ALL
            SELECT COUNT(*) as cnt FROM stock_receipts WHERE 1${searchItem ? ' AND (JSON_SEARCH(items, \'one\', CONCAT(\'%\', ?, \'%\'), NULL, \'$[*]\') IS NOT NULL)' : ''}${searchUser ? ' AND (sending_user LIKE ? OR receiving_user LIKE ?)' : ''}${dateFrom ? ' AND receipt_date >= ?' : ''}${dateTo ? ' AND receipt_date <= ?' : ''}${idSearch ? ' AND receipt_id LIKE ?' : ''}${type === 'cancelled' ? " AND status LIKE '%reject%'" : ''}
        ) x`;
        countParams = [].concat(params, params2);
    } else if (transferSelect) {
        unionSql = `${transferSelect} ORDER BY date DESC LIMIT ? OFFSET ?`;
        countSql = `SELECT COUNT(*) as total FROM stock_transfers WHERE 1${searchItem ? ' AND (JSON_SEARCH(items, \'one\', CONCAT(\'%\', ?, \'%\'), NULL, \'$[*]\') IS NOT NULL)' : ''}${searchUser ? ' AND transferring_user LIKE ?' : ''}${dateFrom ? ' AND transfer_date >= ?' : ''}${dateTo ? ' AND transfer_date <= ?' : ''}${idSearch ? ' AND transfer_id LIKE ?' : ''}${type === 'cancelled' ? " AND status LIKE '%cancel%'" : ''}`;
        countParams = params;
    } else if (receiptSelect) {
        unionSql = `${receiptSelect} ORDER BY date DESC LIMIT ? OFFSET ?`;
        countSql = `SELECT COUNT(*) as total FROM stock_receipts WHERE 1${searchItem ? ' AND (JSON_SEARCH(items, \'one\', CONCAT(\'%\', ?, \'%\'), NULL, \'$[*]\') IS NOT NULL)' : ''}${searchUser ? ' AND (sending_user LIKE ? OR receiving_user LIKE ?)' : ''}${dateFrom ? ' AND receipt_date >= ?' : ''}${dateTo ? ' AND receipt_date <= ?' : ''}${idSearch ? ' AND receipt_id LIKE ?' : ''}${type === 'cancelled' ? " AND status LIKE '%reject%'" : ''}`;
        countParams = params2;
    }

    // Params for data (add pagination)
    var queryParams = [];
    if (transferSelect && receiptSelect) {
        queryParams = [].concat(params, params2, [limit, offset]);
    } else if (transferSelect) {
        queryParams = [].concat(params, [limit, offset]);
    } else if (receiptSelect) {
        queryParams = [].concat(params2, [limit, offset]);
    }

    stockTransactionsPool.query(unionSql, queryParams, function (err, rows) {
        if (err) {
            console.error('Dashboard union error:', err);
            return res.status(500).json({ error: "Failed to fetch transactions" });
        }
        stockTransactionsPool.query(countSql, countParams, function (err2, countRows) {
            if (err2) {
                console.error('Dashboard count error:', err2);
                return res.status(500).json({ error: "Failed to fetch transactions" });
            }
            var total = countRows && countRows[0] && countRows[0].total ? countRows[0].total : 0;
            res.json({
                transactions: (rows || []).map(function (tx) {
                    ['items', 'quantities', 'batches', 'expiry_dates'].forEach(function (f) {
                        if (tx[f] && typeof tx[f] === 'string') {
                            try { tx[f] = JSON.parse(tx[f]); } catch (e) {}
                        }
                    });
                    return tx;
                }),
                total: total,
                page: page,
                limit: limit,
                totalPages: Math.ceil(total / limit)
            });
        });
    });
});




const { v4: uuidv4 } = require('uuid'); // At the top: npm i uuid

// Place this function near the top of your server.js (only once!)
function fixMaybeStringArray(val) {
    if (Array.isArray(val)) return val;
    try { return JSON.parse(val); } catch {}
    if (typeof val === "string" && val[0] === "[" && val.includes("'")) {
        try { return JSON.parse(val.replace(/'/g, '"')); } catch {}
    }
    if (typeof val === "string" && val.includes(",")) {
        return val.split(",").map(x => x.trim());
    }
    return [val];
}

// ----------- THE FULL ENDPOINT -----------
app.post('/api/stock-mgmt-x9z/process-transfer', async (req, res) => {
    try {
        function fixMaybeStringArray(val) {
            if (Array.isArray(val)) return val;
            try { return JSON.parse(val); } catch {}
            if (typeof val === "string" && val[0] === "[" && val.includes("'")) {
                try { return JSON.parse(val.replace(/'/g, '"')); } catch {}
            }
            if (typeof val === "string" && val.includes(",")) {
                return val.split(",").map(x => x.trim());
            }
            return [val];
        }

        const {
            items, quantities, batches, expiry_dates,
            branch_from, branch_to
        } = req.body;

        const itemsArr = fixMaybeStringArray(items);
        const quantitiesArr = fixMaybeStringArray(quantities);
        const batchesArr = fixMaybeStringArray(batches);
        const expiryArr = fixMaybeStringArray(expiry_dates);

        if (
            !Array.isArray(itemsArr) || !Array.isArray(quantitiesArr) ||
            !Array.isArray(batchesArr) || !Array.isArray(expiryArr) ||
            !branch_from || !branch_to ||
            itemsArr.length !== quantitiesArr.length ||
            itemsArr.length !== batchesArr.length ||
            itemsArr.length !== expiryArr.length ||
            itemsArr.length === 0
        ) {
            return res.status(400).json({ success: false, error: "Invalid transfer data." });
        }

        const transfer_id = "TRN" + Date.now();
        let transferring_user = (req.session && req.session.user && req.session.user.fullName) || 'Unknown';

        // Insert into DB
        const sql = `
            INSERT INTO stock_transfers
                (transfer_id, items, quantities, batches, expiry_dates, transferring_user, transfer_date, branch_from, branch_to, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, ?, 'pending', NOW())
        `;
        const values = [
            transfer_id,
            JSON.stringify(itemsArr),
            JSON.stringify(quantitiesArr),
            JSON.stringify(batchesArr),
            JSON.stringify(expiryArr),
            transferring_user,
            branch_from,
            branch_to
        ];

        await stockTransactionsPool.promise().query(sql, values);

        // Deduct stock for each batch
        for (let i = 0; i < itemsArr.length; i++) {
            const batchNum = batchesArr[i];
            const qty = parseFloat(quantitiesArr[i]);
            const updateSql = 'UPDATE batches SET quantity = quantity - ? WHERE batch_number = ?';
            await medicinesPool.promise().query(updateSql, [qty, batchNum]);
        }

        res.json({ success: true, transfer_id });
    } catch (err) {
        console.error('[TRANSFER SAVE] Error:', err, req.body);
        res.status(500).json({ success: false, error: "Failed to save transfer." });
    }
});

const PDFDocument = require('pdfkit');


app.get('/api/stock-mgmt-x9z/generate-stn/:transfer_id', async (req, res) => {
    const { transfer_id } = req.params;
    try {
        const [rows] = await stockTransactionsPool.promise().query(
            "SELECT * FROM stock_transfers WHERE transfer_id = ?", [transfer_id]
        );
        if (!rows.length) {
            console.error(`[PDF] No transfer found for ID: ${transfer_id}`);
            return res.status(404).send('Transfer not found');
        }

        const t = rows[0];
        const items = safeParse(t.items, []);
        const qtys = safeParse(t.quantities, []);
        const batches = safeParse(t.batches, []);
        const exps = safeParse(t.expiry_dates, []);

        console.log(`[PDF] Parsed transfer:`, {
            transfer_id, items, qtys, batches, exps, branch_from: t.branch_from, branch_to: t.branch_to
        });

        // PDF generation
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=STN_${transfer_id}.pdf`);
        const doc = new PDFDocument({ margin: 44, size: 'A4' });
        doc.pipe(res);

        // Company logo and heading
        const logoPath = path.join(__dirname, 'public/images/logo.png');
        if (fs.existsSync(logoPath)) {
            doc.image(logoPath, 50, 34, { width: 65 });
        }
        doc.fontSize(20).fillColor('#c1a95e').text('Stock Transfer Note (STN)', 130, 44);

        doc.moveDown(1.2);
        doc.fontSize(11).fillColor('#23232b');
        doc.text(`Transfer ID: ${transfer_id}`);
        doc.text(`Date: ${new Date(t.transfer_date).toLocaleString('en-GB', { hour12: false })}`);
        doc.text(`From Branch: ${t.branch_from || ''}`);
        doc.text(`To Branch: ${t.branch_to || ''}`);
        doc.text(`Transferred by: ${t.transferring_user || ''}`);

        // Table header
        doc.moveDown(1.5);
        doc.fontSize(12).fillColor('#c1a95e').text('Items Transferred:', { underline: true });
        doc.moveDown(0.6);

        // Table columns
        const tableTop = doc.y + 4;
        const colX = [50, 210, 320, 410, 470];
        doc.fontSize(11).fillColor('#222')
           .text('Item Name', colX[0], tableTop, { width: 155 })
           .text('Batch', colX[1], tableTop, { width: 90 })
           .text('Expiry', colX[2], tableTop, { width: 90 })
           .text('Quantity', colX[3], tableTop, { width: 50, align: 'center' })
           .text('Stock Out', colX[4], tableTop, { width: 50, align: 'center' });

        doc.moveTo(50, tableTop + 15).lineTo(540, tableTop + 15).strokeColor('#d1b464').stroke();

        // Table rows
        let y = tableTop + 22;
        for (let i = 0; i < items.length; i++) {
            doc.fontSize(10).fillColor('#23232b')
               .text(items[i] || '', colX[0], y, { width: 155 })
               .text(batches[i] || '', colX[1], y, { width: 90 })
               .text(exps[i] || '', colX[2], y, { width: 90 })
               .text(qtys[i] || '', colX[3], y, { width: 50, align: 'center' })
               .text(qtys[i] || '', colX[4], y, { width: 50, align: 'center' });
            y += 18;
            if (y > 700 && i < items.length - 1) { doc.addPage(); y = 50; }
        }

        // Footer: stamp/signature
        doc.moveDown(3);
        doc.fontSize(11).fillColor('#23232b');
        doc.text('Stamp: _________________________________', 50, y + 30);
        doc.text('Signature: ______________________________', 320, y + 30);

        // Company info footer (optional)
        doc.fontSize(9).fillColor('#c1a95e');
        doc.text(
            '© 2025 Pharmacy Management System | Designed by Pharmacist: MOHAMED HAMID | mhm.hamid@gmail.com',
            50, 790, { align: 'center', width: 500 }
        );
        doc.end();
    } catch (err) {
        console.error('[PDF] STN PDF generation error:', err);
        res.status(500).send('Error generating STN PDF');
    }
});

app.get('/api/stock-mgmt-x9z/generate-transfer-file/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await stockTransactionsPool.promise().query(
            "SELECT * FROM stock_transfers WHERE transfer_id = ?", [id]
        );
        if (!rows.length) {
            console.error(`[TXT] No transfer found for ID: ${id}`);
            return res.status(404).send('Not found');
        }
        const t = rows[0];

        const items = safeParse(t.items, []);
        const quantities = safeParse(t.quantities, []);
        const batches = safeParse(t.batches, []);
        const expiry_dates = safeParse(t.expiry_dates, []);

        console.log(`[TXT] Parsed transfer:`, {
            id, items, quantities, batches, expiry_dates, branch_from: t.branch_from, branch_to: t.branch_to
        });

        const txtData = {
            transfer_id: t.transfer_id,
            items,
            quantities,
            batches,
            expiry_dates,
            branch_from: t.branch_from,
            branch_to: t.branch_to,
            transferring_user: t.transferring_user,
            transfer_date: t.transfer_date
        };
        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Content-Disposition', `attachment; filename=STN_${id}.txt`);
        res.send(JSON.stringify(txtData, null, 2));
    } catch (err) {
        console.error('[TXT] Error generating transfer TXT:', err);
        res.status(500).send('Error generating transfer TXT');
    }
});

// Export stock dashboard to Excel (transactions)
app.post('/api/stock-mgmt-x9z/export-dashboard-excel', async (req, res) => {
    try {
        const { rows } = req.body;
        if (!Array.isArray(rows) || rows.length === 0) {
            return res.status(400).json({ error: 'No data to export.' });
        }

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Stock Transactions');

        // Define columns based on your export structure
        worksheet.columns = [
            { header: 'Type',      key: 'Type',      width: 12 },
            { header: 'ID',        key: 'ID',        width: 14 },
            { header: 'Items',     key: 'Items',     width: 32 },
            { header: 'Quantities',key: 'Quantities',width: 18 },
            { header: 'Batches',   key: 'Batches',   width: 20 },
            { header: 'From',      key: 'From',      width: 18 },
            { header: 'To',        key: 'To',        width: 18 },
            { header: 'User',      key: 'User',      width: 20 },
            { header: 'Date',      key: 'Date',      width: 22 },
            { header: 'Status',    key: 'Status',    width: 14 }
        ];

        // Add header style
        worksheet.getRow(1).font = { bold: true };

        // Add rows
        rows.forEach(row => worksheet.addRow(row));

        // Send file
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=stock_transactions_${Date.now()}.xlsx`);

        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error("Excel export error:", err);
        res.status(500).json({ error: "Failed to generate Excel." });
    }
});


app.post('/api/stock-mgmt-x9z/upload-stn', isAuthenticated, upload.single('transferfile'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    fs.readFile(req.file.path, 'utf8', (err, data) => {
        fs.unlinkSync(req.file.path);
        if (err) return res.status(500).json({ error: "Failed to read file" });
        try {
            const parsed = JSON.parse(data);
            res.json({ success: true, transfer: parsed });
        } catch {
            res.status(400).json({ error: "Invalid file format" });
        }
    });
});
app.post('/api/stock-mgmt-x9z/process-receipt', isAuthenticated, async (req, res) => {
    try {
        const {
            transfer_id, items, quantities, batches, expiry_dates,
            branch_from, branch_to, sending_user, receiving_user
        } = req.body;
        const receipt_id = "RCPT" + Date.now();
        const receipt_date = new Date();

        // For each item/batch, add to batch qty (or create new batch if not exist)
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const batch_number = batches[i];
            const expiry = expiry_dates[i];
            const qty = Number(quantities[i]);

            // Find medicine by name
            const [med] = await medicinesPool.promise().query(
                "SELECT id FROM medicines_table WHERE item_name = ?", [item]
            );
            let med_id;
            if (!med.length) {
                // Insert new medicine if not exist (barebones, you may want to expand)
                const r = await medicinesPool.promise().query(
                    "INSERT INTO medicines_table (item_name, stock) VALUES (?, ?)", [item, 0]
                );
                med_id = r[0].insertId;
            } else {
                med_id = med[0].id;
            }

            // Check if batch exists
            const [batch] = await medicinesPool.promise().query(
                "SELECT batch_id FROM batches WHERE batch_number = ? AND medicine_id = ?", [batch_number, med_id]
            );
            if (batch.length) {
                // Update qty
                await medicinesPool.promise().query(
                    "UPDATE batches SET quantity = quantity + ? WHERE batch_id = ?", [qty, batch[0].batch_id]
                );
            } else {
                // Create new batch
                await medicinesPool.promise().query(
                    "INSERT INTO batches (medicine_id, batch_number, expiry, quantity) VALUES (?, ?, ?, ?)",
                    [med_id, batch_number, expiry, qty]
                );
            }
        }

        // Log receipt
        await stockTransactionsPool.promise().query(
            `INSERT INTO stock_receipts 
            (receipt_id, transfer_id, items, quantities, batches, expiry_dates, sending_user, receiving_user, receipt_date, branch_from, branch_to, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'received')`,
            [
                receipt_id, transfer_id, JSON.stringify(items), JSON.stringify(quantities),
                JSON.stringify(batches), JSON.stringify(expiry_dates), sending_user, receiving_user,
                receipt_date, branch_from, branch_to
            ]
        );

        // Update transfer status
        await stockTransactionsPool.promise().query(
            "UPDATE stock_transfers SET status = 'completed' WHERE transfer_id = ?", [transfer_id]
        );

        res.json({ success: true, receipt_id });
    } catch (err) {
        console.error('process-receipt error', err);
        res.status(500).json({ error: "Failed to process receipt" });
    }
});
// Place this at the top of server.js
function fixMaybeStringArray(val) {
    if (Array.isArray(val)) return val;
    if (val == null) return [];
    try { return JSON.parse(val); } catch {}
    if (typeof val === "string" && val[0] === "[" && val.includes("'")) {
        try { return JSON.parse(val.replace(/'/g, '"')); } catch {}
    }
    if (typeof val === "string" && val.includes(",")) {
        return val.split(",").map(x => x.trim());
    }
    return [val];
}

// Your SRN PDF endpoint
app.get('/api/stock-mgmt-x9z/generate-srn/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await stockTransactionsPool.promise().query(
            "SELECT * FROM stock_receipts WHERE receipt_id = ?", [id]
        );
        if (!rows.length) return res.status(404).send('Receipt not found');
        const r = rows[0];

        // Parse all arrays
        const items = fixMaybeStringArray(r.items);
        const qtys = fixMaybeStringArray(r.quantities);
        const batches = fixMaybeStringArray(r.batches);
        const exps = fixMaybeStringArray(r.expiry_dates);

        // Also get transfer_id (STN this SRN is based on)
        const stnId = r.transfer_id || '';

        // PDF headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=SRN_${id}.pdf`);
        const doc = new PDFDocument({ margin: 44, size: 'A4' });
        doc.pipe(res);

        // Letterhead/logo
        const logoPath = path.join(__dirname, 'public/images/logo.png');
        if (fs.existsSync(logoPath)) {
            doc.image(logoPath, 50, 34, { width: 65 });
        }
        doc.fontSize(20).fillColor('#c1a95e').text('Stock Receipt Note (SRN)', 130, 44);

        doc.moveDown(1.2);
        doc.fontSize(11).fillColor('#23232b');
        doc.text(`Receipt ID: ${id}`);
        if (stnId) doc.text(`Based on STN: ${stnId}`); // ADD THIS LINE!
        doc.text(`Date: ${r.receipt_date ? new Date(r.receipt_date).toLocaleString('en-GB', { hour12: false }) : ''}`);
        doc.text(`From Branch: ${r.branch_from || ''}`);
        doc.text(`To Branch: ${r.branch_to || ''}`);
        doc.text(`Transferred by: ${r.sending_user || r.transferring_user || r.sent_by || ''}`);
        doc.text(`Received by: ${r.receiving_user || ''}`);

        // Table header
        doc.moveDown(1.5);
        doc.fontSize(12).fillColor('#c1a95e').text('Items Received:', { underline: true });
        doc.moveDown(0.6);

        // Table columns
        const tableTop = doc.y + 4;
        const colX = [50, 210, 320, 410, 470];
        doc.fontSize(11).fillColor('#222')
           .text('Item Name', colX[0], tableTop, { width: 155 })
           .text('Batch', colX[1], tableTop, { width: 90 })
           .text('Expiry', colX[2], tableTop, { width: 90 })
           .text('Quantity', colX[3], tableTop, { width: 50, align: 'center' })
           .text('Stock In', colX[4], tableTop, { width: 50, align: 'center' });

        doc.moveTo(50, tableTop + 15).lineTo(540, tableTop + 15).strokeColor('#d1b464').stroke();

        // Table rows
        let y = tableTop + 22;
        for (let i = 0; i < items.length; i++) {
            doc.fontSize(10).fillColor('#23232b')
               .text(items[i] || '', colX[0], y, { width: 155 })
               .text((batches[i] || ''), colX[1], y, { width: 90 })
               .text((exps[i] || ''), colX[2], y, { width: 90 })
               .text(qtys[i] != null ? qtys[i].toString() : '', colX[3], y, { width: 50, align: 'center' })
               .text(qtys[i] != null ? qtys[i].toString() : '', colX[4], y, { width: 50, align: 'center' });
            y += 18;
            if (y > 700 && i < items.length - 1) { doc.addPage(); y = 50; }
        }

        // Footer: stamp/signature
        doc.moveDown(3);
        doc.fontSize(11).fillColor('#23232b');
        doc.text('Stamp: _________________________________', 50, y + 30);
        doc.text('Signature: ______________________________', 320, y + 30);

        // Company info footer (optional)
        doc.fontSize(9).fillColor('#c1a95e');
        doc.text(
            '© 2025 Pharmacy Management System | Designed by Pharmacist: MOHAMED HAMID | mhm.hamid@gmail.com',
            50, 790, { align: 'center', width: 500 }
        );
        doc.end();
    } catch (err) {
        console.error('[SRN PDF generation error]', err);
        res.status(500).send('Error generating SRN PDF');
    }
});

app.get('/api/stock-mgmt-x9z/generate-stn/:transfer_id', isAuthenticated, async (req, res) => {
    const { transfer_id } = req.params;
    try {
        // Fetch transfer record
        const [rows] = await stockTransactionsPool.promise().query(
            "SELECT * FROM stock_transfers WHERE transfer_id = ?", [transfer_id]
        );
        if (!rows.length) return res.status(404).send('Transfer not found');

        const t = rows[0];
        const items = JSON.parse(t.items);
        const qtys = JSON.parse(t.quantities);
        const batches = JSON.parse(t.batches);
        const exps = JSON.parse(t.expiry_dates);

        // Create PDF
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=STN_${transfer_id}.pdf`);
        const doc = new PDFDocument({ margin: 44, size: 'A4' });
        doc.pipe(res);

        // Company logo and heading
        const logoPath = path.join(__dirname, 'public/images/logo.png');
        if (fs.existsSync(logoPath)) {
            doc.image(logoPath, 50, 34, { width: 65 });
        }
        doc.fontSize(20).fillColor('#c1a95e').text('Stock Transfer Note (STN)', 130, 44);

        doc.moveDown(1.2);
        doc.fontSize(11).fillColor('#23232b');
        doc.text(`Transfer ID: ${transfer_id}`);
        doc.text(`Date: ${new Date(t.transfer_date).toLocaleString('en-GB', { hour12: false })}`);
        doc.text(`From Branch: ${t.branch_from || ''}`);
        doc.text(`To Branch: ${t.branch_to || ''}`);
        doc.text(`Transferred by: ${t.transferring_user || ''}`);

        // Table header
        doc.moveDown(1.5);
        doc.fontSize(12).fillColor('#c1a95e').text('Items Transferred:', { underline: true });
        doc.moveDown(0.6);

        // Table columns
        const tableTop = doc.y + 4;
        const colX = [50, 210, 320, 410, 470];
        doc.fontSize(11).fillColor('#222')
           .text('Item Name', colX[0], tableTop, { width: 155 })
           .text('Batch', colX[1], tableTop, { width: 90 })
           .text('Expiry', colX[2], tableTop, { width: 90 })
           .text('Quantity', colX[3], tableTop, { width: 50, align: 'center' })
           .text('Stock Out', colX[4], tableTop, { width: 50, align: 'center' });

        doc.moveTo(50, tableTop + 15).lineTo(540, tableTop + 15).strokeColor('#d1b464').stroke();

        // Table rows
        let y = tableTop + 22;
        for (let i = 0; i < items.length; i++) {
            doc.fontSize(10).fillColor('#23232b')
               .text(items[i], colX[0], y, { width: 155 })
               .text(batches[i], colX[1], y, { width: 90 })
               .text(exps[i], colX[2], y, { width: 90 })
               .text(qtys[i], colX[3], y, { width: 50, align: 'center' })
               .text(qtys[i], colX[4], y, { width: 50, align: 'center' });
            y += 18;
            if (y > 700 && i < items.length - 1) { doc.addPage(); y = 50; }
        }

        // Footer: stamp/signature
        doc.moveDown(3);
        doc.fontSize(11).fillColor('#23232b');
        doc.text('Stamp: _________________________________', 50, y + 30);
        doc.text('Signature: ______________________________', 320, y + 30);

        // Company info footer (optional)
        doc.fontSize(9).fillColor('#c1a95e');
        doc.text(
            '© 2025 Pharmacy Management System | Designed by Pharmacist: MOHAMED HAMID | mhm.hamid@gmail.com',
            50, 790, { align: 'center', width: 500 }
        );
        doc.end();
    } catch (err) {
        console.error('STN PDF generation error:', err);
        res.status(500).send('Error generating STN PDF');
    }
});
//============================================================================stock transfer request
// 1. Create a Stock Request (SRR)
app.post('/api/stock-mgmt-x9z/create-request', async (req, res) => {
    const { from_branch, to_branch, requested_by, items } = req.body;
    if (!from_branch || !to_branch || !requested_by || !items || !Array.isArray(items) || !items.length) {
        return res.status(400).json({ success: false, message: 'Missing data.' });
    }
    const [result] = await stockTransactionsPool.promise().query(
        "INSERT INTO stock_requests (from_branch, to_branch, requested_by, request_date, items) VALUES (?, ?, ?, NOW(), ?)",
        [from_branch, to_branch, requested_by, JSON.stringify(items)]
    );
    res.json({ success: true, srr_id: result.insertId });
});

// 2. Download SRR as TXT
app.get('/api/stock-mgmt-x9z/generate-srr-file/:srr_id', async (req, res) => {
    const [rows] = await stockTransactionsPool.promise().query("SELECT * FROM stock_requests WHERE srr_id=?", [req.params.srr_id]);
    if (!rows.length) return res.status(404).send('SRR not found.');
    const srr = rows[0];
    let items;
if (Array.isArray(srr.items)) {
    items = srr.items;
} else if (typeof srr.items === "string") {
    try {
        items = JSON.parse(srr.items);
    } catch {
        // fallback: try to eval if it's a badly stringified array (not recommended, but covers old bugs)
        items = [];
    }
} else {
    items = [];
}

let content = `SRR No: ${srr.srr_id}\nFrom Branch: ${srr.from_branch}\nTo Branch: ${srr.to_branch}\nRequested By: ${srr.requested_by}\nRequest Date: ${srr.request_date}\n\nItem Name\tQuantity\n`;
items.forEach(itm => {
    content += `${itm.item_name}\t${itm.qty}\n`;
});
    res.setHeader('Content-Disposition', `attachment; filename=SRR_${srr.srr_id}.txt`);
    res.type('text/plain').send(content);
});

// 3. Parse SRR TXT file (for importing request into Transfer)
app.post('/api/stock-mgmt-x9z/parse-srr-file', upload.single('srrfile'), (req, res) => {
    const fs = require('fs');
    if (!req.file) return res.status(400).json({ error: "No file" });
    const txt = fs.readFileSync(req.file.path, 'utf8');
    // Basic parsing for: Item Name\tQuantity per line after first blank line
    const lines = txt.split('\n');
    let startIdx = lines.findIndex(l => l.trim().startsWith('Item Name'));
    if (startIdx < 0) return res.json({ error: "No item table in file." });
    let items = [];
    for (let i = startIdx + 1; i < lines.length; ++i) {
        let [item, qty] = lines[i].split('\t');
        if (item && qty && item.trim()) items.push({ item_name: item.trim(), qty: parseFloat(qty) });
    }
    res.json({ items });
});

//======================================================================bill return and bill reprint
// --- Bill Return Endpoint ---
app.post('/api/bill-returns/return', async (req, res) => {
  const { bill_ids } = req.body;
  if (!Array.isArray(bill_ids) || bill_ids.length === 0) {
    return res.json({ success: false, message: 'No bills selected.' });
  }

  const connection = await billsPool.promise().getConnection(); // Get a connection from the pool
  try {
    await connection.beginTransaction(); // Start a transaction

    let returnedBillsCount = 0;
    let successfulReturns = [];
    let failedReturns = [];

    for (let bill_id of bill_ids) {
      // 1. Fetch the original bill details AND item_name to get packet_size
      const [rows] = await connection.query(
        'SELECT bill_id, item_name, quantity, price, subtotal, payment_method, card_invoice_number, `E-commerce Invoice Number`, patient_name, patient_phone, user, batch_id, batch_number, expiry FROM bills WHERE bill_id = ?',
        [bill_id]
      );

      if (!rows.length) {
        console.warn(`Server: Bill with ID ${bill_id} not found for return.`);
        failedReturns.push(`Bill ID ${bill_id} not found.`);
        continue; // Skip this bill if not found
      }
      const b = rows[0];

      // 2. Fetch packet_size for the item from the medicines database
      let packetSize = 1; // Default to 1 if not found or error
      if (b.item_name) {
          try {
              const [medicineRows] = await medicinesPool.promise().query(
                  'SELECT packet_size FROM medicines_table WHERE item_name = ? LIMIT 1',
                  [b.item_name]
              );
              if (medicineRows.length > 0 && medicineRows[0].packet_size) {
                  packetSize = parseFloat(medicineRows[0].packet_size);
                  if (isNaN(packetSize) || packetSize <= 0) packetSize = 1;
              }
          } catch (medErr) {
              console.error(`Server: Error fetching packet_size for ${b.item_name}:`, medErr);
              // Continue with default packetSize = 1
          }
      }

      // 3. Calculate the actual quantity to return (number of packets)
      const originalQuantity = parseFloat(b.quantity) || 0;
      const quantityToReturn = (originalQuantity / packetSize);
      const subtotalToReturn = (originalQuantity * (parseFloat(b.price) || 0)) / packetSize; // Recalculate subtotal for return based on quantity unit

      if (quantityToReturn <= 0) {
          console.warn(`Server: Calculated quantity to return is zero or negative for Bill ID ${bill_id}. Skipping stock update.`);
          failedReturns.push(`Bill ID ${bill_id} has zero or negative effective quantity.`);
          continue;
      }
      
      // 4. Insert a negative bill (as a return transaction)
      // Use the calculated quantityToReturn for the 'quantity' column in the new bill record
      await connection.query(
        `INSERT INTO bills (
          bill_date, bill_time, item_name, quantity, price, subtotal,
          payment_method, card_invoice_number, \`E-commerce Invoice Number\`,
          patient_name, patient_phone, user, batch_id, batch_number, expiry
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          new Date().toISOString().slice(0, 10), // Current date
          new Date().toTimeString().slice(0, 8), // Current time
          b.item_name,
          -quantityToReturn, // Negative quantity
          b.price,
          -subtotalToReturn, // Negative subtotal based on calculated quantity
          b.payment_method,
          b.card_invoice_number,
          b['E-commerce Invoice Number'],
          b.patient_name,
          b.patient_phone,
          b.user,
          b.batch_id,    // Include original batch info for traceability
          b.batch_number,
          b.expiry
        ]
      );

      // 5. Add quantity back to stock (prioritize batch if available, else legacy stock)
      // The quantity to add back is the calculated quantityToReturn
      if (b.batch_id) {
        const [batchUpdateResult] = await medicinesPool.promise().query(
          'UPDATE batches SET quantity = quantity + ? WHERE batch_id = ?',
          [quantityToReturn, b.batch_id]
        );
        if (batchUpdateResult.affectedRows === 0) {
          console.warn(`Server: Batch ${b.batch_id} not found for stock update on bill return ${bill_id}. Attempting to find by medicine_id and batch_number.`);
          const [meds] = await medicinesPool.promise().query(
            'SELECT id FROM medicines_table WHERE item_name = ? LIMIT 1',
            [b.item_name]
          );
          if (meds.length && b.batch_number && b.expiry) {
              const medicineId = meds[0].id;
              const [existingBatch] = await medicinesPool.promise().query(
                  'SELECT batch_id FROM batches WHERE medicine_id = ? AND batch_number = ? AND expiry = ?',
                  [medicineId, b.batch_number, b.expiry]
              );
              if (existingBatch.length) {
                  await medicinesPool.promise().query(
                      'UPDATE batches SET quantity = quantity + ? WHERE batch_id = ?',
                      [quantityToReturn, existingBatch[0].batch_id]
                  );
                  console.log(`Server: Updated existing batch for item ${b.item_name} by batch_number/expiry for bill ${bill_id}`);
              } else {
                  await medicinesPool.promise().query(
                      'INSERT INTO batches (medicine_id, batch_number, expiry, quantity, received_date) VALUES (?, ?, ?, ?, CURDATE())',
                      [medicineId, b.batch_number, b.expiry, quantityToReturn, new Date().toISOString().slice(0, 10)]
                  );
                  console.log(`Server: Created new batch for returned item ${b.item_name} for bill ${bill_id}`);
              }
          } else if (meds.length) {
              await medicinesPool.promise().query(
                'UPDATE medicines_table SET stock = stock + ? WHERE id = ?',
                [quantityToReturn, medicineId]
              );
              console.log(`Server: Updated legacy stock for item ${b.item_name} for bill ${bill_id} (no specific batch match).`);
          } else {
              console.warn(`Server: Could not update stock for returned item ${b.item_name} (medicine not found) for bill ${bill_id}.`);
          }
        } else {
            console.log(`Server: Successfully updated batch ${b.batch_id} for bill ${bill_id}.`);
        }
      } else {
        // Fallback for items without batch_id in bill (legacy behavior)
        const [meds] = await medicinesPool.promise().query(
          'SELECT id FROM medicines_table WHERE item_name = ? LIMIT 1',
          [b.item_name]
        );
        if (meds.length) {
          await medicinesPool.promise().query(
            'UPDATE medicines_table SET stock = stock + ? WHERE id = ?',
            [quantityToReturn, meds[0].id]
          );
          console.log(`Server: Updated legacy stock for item ${b.item_name} for bill ${bill_id} (no batch in bill).`);
        } else {
          console.warn(`Server: Could not update stock for returned item ${b.item_name} (medicine not found) for bill ${bill_id}.`);
        }
      }
      returnedBillsCount++;
      successfulReturns.push(`Bill ID ${bill_id}: Returned ${quantityToReturn.toFixed(3)} unit(s) of ${b.item_name}.`);
    }

    await connection.commit(); // Commit the transaction

    let message = `${returnedBillsCount} bill(s) processed.`;
    if (successfulReturns.length > 0) {
        message += `\nSuccess: ${successfulReturns.join('\n')}`;
    }
    if (failedReturns.length > 0) {
        message += `\nFailures: ${failedReturns.join('\n')}`;
    }

    res.json({ success: true, message: message });

  } catch (err) {
    await connection.rollback(); // Rollback on error
    console.error('Server: Bill return error:', err);
    res.status(500).json({ success: false, message: 'Server error during bill return: ' + err.message });
  } finally {
    connection.release(); // Release the connection
  }
});



// --- Bill Reprint Endpoint ---
app.get('/api/bill-returns/reprint/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await billsPool.promise().query('SELECT * FROM bills WHERE bill_id = ?', [id]);
    if (!rows.length) {
      return res.json({ success: false, message: 'Bill not found.' });
    }
    res.json({ success: true, bill: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error during bill reprint.' });
  }
});

//====================================PURCHASE ORDERS MANAGEMENT ==============================================================
// Get agencies with pagination and search - FIXED VERSION
app.get('/api/pharma-agencies-xyz123', asyncHandler(async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const search = req.query.search || '';
        const offset = (page - 1) * limit;

        // Build search conditions
        let whereClause = '';
        let searchParams = [];
        
        if (search.trim()) {
            whereClause = `WHERE 
                name LIKE ? OR 
                agency_id LIKE ? OR 
                contact_person LIKE ? OR 
                phone LIKE ? OR 
                address LIKE ? OR
                email LIKE ?`;
            const searchPattern = `%${search.trim()}%`;
            searchParams = [searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern];
        }

        // Get total count - FIXED: Use query instead of execute for dynamic params
        const countQuery = `SELECT COUNT(*) as total FROM pharma_agencies ${whereClause}`;
        const [countResult] = await popool.promise().query(countQuery, searchParams);
        const totalRecords = countResult[0].total;
        const totalPages = Math.ceil(totalRecords / limit);

        // Get agencies data - FIXED: Use query instead of execute for dynamic params
        const dataQuery = `
            SELECT agency_id, name, contact_person, email, phone, address 
            FROM pharma_agencies 
            ${whereClause}
            ORDER BY agency_id DESC 
            LIMIT ? OFFSET ?
        `;
        const queryParams = [...searchParams, limit, offset];
        const [agencies] = await popool.promise().query(dataQuery, queryParams);

        const pagination = {
            currentPage: page,
            totalPages,
            total: totalRecords,
            limit,
            hasNext: page < totalPages,
            hasPrev: page > 1
        };

        res.json(formatResponse(true, agencies, 'Agencies retrieved successfully', pagination));
    } catch (error) {
        console.error('Error fetching agencies:', error);
        res.status(500).json(formatResponse(false, null, 'Internal server error'));
    }
}));

// Create new PO with items
app.post('/api/purchase-orders', async (req, res) => {
    const { po_code, agency_id, items, total_amount, created_by, remarks } = req.body;
    if (!agency_id || !items || !Array.isArray(items) || items.length === 0 || !created_by) {
        return res.status(400).json({ error: 'Agency, items, and creator are required' });
    }
    try {
        // Insert PO with created_by
        const [poResult] = await popool.promise().query(
            `INSERT INTO purchase_orders (po_code, agency_id, status, total_amount, created_by, remarks) VALUES (?, ?, 'Pending', ?, ?, ?)`,
            [po_code, agency_id, total_amount, created_by, remarks]
        );
        const po_id = poResult.insertId;
        // Insert items
        for (const it of items) {
            await popool.promise().query(
                `INSERT INTO purchase_order_items (po_id, medicine_id, quantity, wholesale_price, is_foc) VALUES (?, ?, ?, ?, ?)`,
                [po_id, it.medicine_id, it.quantity, it.wholesale_price, it.is_foc ? 1 : 0]
            );
        }
        res.json({ success: true, po_id });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to save PO' });
    }
});

app.get('/api/purchase-orders', async (req, res) => {
    // Optional: filter by ID, date, status (use req.query)
    let { po_code, status, from, to } = req.query;
    let where = [];
    let params = [];
    if (po_code) { where.push('po_code LIKE ?'); params.push(`%${po_code}%`); }
    if (status) { where.push('status = ?'); params.push(status); }
    if (from) { where.push('created_at >= ?'); params.push(from); }
    if (to) { where.push('created_at <= ?'); params.push(to); }
    let whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const sql = `
        SELECT po.*, a.name AS agency_name
        FROM purchase_orders po
        LEFT JOIN pharma_agencies a ON po.agency_id = a.agency_id
        ${whereClause}
        ORDER BY po.created_at DESC
        LIMIT 1000
    `;
    try {
        const [rows] = await popool.promise().query(sql, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch purchase orders' });
    }
});
app.get('/api/purchase-orders/:po_id', async (req, res) => {
    try {
        const [po] = await popool.promise().query(
            `SELECT po.*, a.name AS agency_name FROM purchase_orders po
             LEFT JOIN pharma_agencies a ON po.agency_id = a.agency_id
             WHERE po.po_id = ?`, [req.params.po_id]
        );
        if (!po.length) return res.status(404).json({ error: 'PO not found' });
        const [items] = await popool.promise().query(
            `SELECT i.*, m.item_name FROM purchase_order_items i
             LEFT JOIN medicines.medicines_table m ON i.medicine_id = m.id
             WHERE i.po_id = ?`, [req.params.po_id]
        );
        res.json({ ...po[0], items });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch PO' });
    }
});
app.put('/api/purchase-orders/:po_id', async (req, res) => {
    const { items, total_amount, updated_by, remarks, status } = req.body;
    try {
        // Update PO header
        await popool.promise().query(
            `UPDATE purchase_orders SET total_amount=?, updated_by=?, remarks=?, status=? WHERE po_id=?`,
            [total_amount, updated_by, remarks, status, req.params.po_id]
        );
        // (Re)insert items: For simplicity, delete then insert
        await popool.promise().query(`DELETE FROM purchase_order_items WHERE po_id=?`, [req.params.po_id]);
        for (const it of items) {
            await popool.promise().query(
                `INSERT INTO purchase_order_items (po_id, medicine_id, quantity, wholesale_price, is_foc) VALUES (?, ?, ?, ?, ?)`,
                [req.params.po_id, it.medicine_id, it.quantity, it.wholesale_price, it.is_foc ? 1 : 0]
            );
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update PO' });
    }
});

app.post('/api/goods-receipt-notes', async (req, res) => {
    const { grn_code, po_id, received_by, remarks, items } = req.body;
    if (!po_id || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'PO and items required' });
    }
    try {
        // Insert GRN
        const [grnResult] = await popool.promise().query(
            `INSERT INTO goods_receipt_notes (grn_code, po_id, received_by, remarks) VALUES (?, ?, ?, ?)`,
            [grn_code, po_id, received_by, remarks]
        );
        const grn_id = grnResult.insertId;
        // Insert items
        for (const it of items) {
            await popool.promise().query(
                `INSERT INTO grn_items (grn_id, poi_id, batch_number, expirydate, quantity) VALUES (?, ?, ?, ?, ?)`,
                [grn_id, it.poi_id, it.batch_number, it.expirydate, it.quantity]
            );
        }
        // Update PO status to 'Received'
        await popool.promise().query(`UPDATE purchase_orders SET status='Received' WHERE po_id=?`, [po_id]);
        res.json({ success: true, grn_id });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to save GRN' });
    }
});

app.get('/api/goods-receipt-notes', async (req, res) => {
    let { grn_code, from, to, po_id } = req.query;
    let where = [];
    let params = [];
    if (grn_code) { where.push('grn_code LIKE ?'); params.push(`%${grn_code}%`); }
    if (from) { where.push('received_at >= ?'); params.push(from); }
    if (to) { where.push('received_at <= ?'); params.push(to); }
    if (po_id) { where.push('po_id = ?'); params.push(po_id); }
    let whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const sql = `
        SELECT grn.*, po.po_code, po.agency_id, a.name AS agency_name
        FROM goods_receipt_notes grn
        LEFT JOIN purchase_orders po ON grn.po_id = po.po_id
        LEFT JOIN pharma_agencies a ON po.agency_id = a.agency_id
        ${whereClause}
        ORDER BY grn.received_at DESC
        LIMIT 1000
    `;
    try {
        const [rows] = await popool.promise().query(sql, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch GRN' });
    }
});
app.get('/api/goods-receipt-notes/:grn_id', async (req, res) => {
    try {
        const [grn] = await popool.promise().query(
            `SELECT grn.*, po.po_code, a.name AS agency_name FROM goods_receipt_notes grn
             LEFT JOIN purchase_orders po ON grn.po_id = po.po_id
             LEFT JOIN pharma_agencies a ON po.agency_id = a.agency_id
             WHERE grn.grn_id = ?`, [req.params.grn_id]
        );
        if (!grn.length) return res.status(404).json({ error: 'GRN not found' });
        const [items] = await popool.promise().query(
            `SELECT gi.*, poi.medicine_id, m.item_name FROM grn_items gi
             LEFT JOIN purchase_order_items poi ON gi.poi_id = poi.poi_id
             LEFT JOIN medicines.medicines_table m ON poi.medicine_id = m.id
             WHERE gi.grn_id = ?`, [req.params.grn_id]
        );
        res.json({ ...grn[0], items });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch GRN' });
    }
});
// Export POs as Excel
app.post('/api/export/purchase-orders', async (req, res) => {
    try {
        const [rows] = await popool.promise().query(
            `SELECT po.*, a.name AS agency_name FROM purchase_orders po
             LEFT JOIN pharma_agencies a ON po.agency_id = a.agency_id
             ORDER BY po.created_at DESC LIMIT 1000`
        );
        // ... Generate Excel file with ExcelJS (see your previous style)
        // (send as attachment)
        res.status(501).json({ error: 'Implement Excel export logic' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to export POs' });
    }
});

// Export GRN items to Excel (for current GRN form data)
app.post('/api/grn/export-excel', async (req, res) => {
    try {
        const { po_data, items, total_amount, grn_date, remarks } = req.body;
        
        if (!po_data || !items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'No GRN data provided to export' });
        }

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('GRN Items');

        // Set up worksheet properties
        worksheet.properties.defaultRowHeight = 20;

        // Add header information
        worksheet.addRow(['GOODS RECEIPT NOTE']);
        worksheet.addRow([]);
        worksheet.addRow(['PO Code:', po_data.po_code || 'N/A']);
        worksheet.addRow(['Agency:', po_data.agency_name || 'N/A']);
        worksheet.addRow(['GRN Date:', grn_date || new Date().toLocaleDateString()]);
        worksheet.addRow(['Remarks:', remarks || 'No remarks']);
        worksheet.addRow([]);

        // Style the header
        worksheet.getRow(1).font = { size: 16, bold: true, color: { argb: 'FF000000' } };
        worksheet.getRow(1).alignment = { horizontal: 'center' };
        worksheet.mergeCells('A1:H1');

        // Style info rows
        for (let i = 3; i <= 6; i++) {
            worksheet.getRow(i).font = { bold: true };
        }

        // Add table headers
        const headerRow = worksheet.addRow([
            'Medicine Name',
            'Batch Number',
            'Expiry Date',
            'Quantity',
            'Unit Price',
            'FOC',
            'Subtotal',
            'Notes'
        ]);

        // Style header row
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF4472C4' }
        };
        headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

        // Add data rows
        items.forEach(item => {
            const quantity = Number(item.received_qty || item.quantity || 0);
            const price = Number(item.received_price || item.wholesale_price || 0);
            const is_foc = Boolean(item.is_foc);
            const subtotal = is_foc ? 0 : quantity * price;
            
            const dataRow = worksheet.addRow([
                item.medicine_name || item.item_name || 'Unknown Medicine',
                item.batch_number || '',
                item.expirydate ? new Date(item.expirydate).toLocaleDateString('en-GB') : '',
                quantity.toFixed(3),
                is_foc ? '0.000 (FOC)' : price.toFixed(3),
                is_foc ? 'Yes' : 'No',
                is_foc ? '0.000 (FOC)' : subtotal.toFixed(3),
                is_foc ? 'Free of Charge' : ''
            ]);

            // Style FOC rows differently
            if (is_foc) {
                dataRow.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFE2EFDA' }
                };
                dataRow.font = { color: { argb: 'FF28A745' } };
            }
        });

        // Add total row
        worksheet.addRow([]);
        const totalRow = worksheet.addRow([
            '', '', '', '', '', 'TOTAL:',
            (total_amount || 0).toFixed(3) + ' OMR',
            '(Excluding FOC items)'
        ]);
        totalRow.font = { bold: true, size: 12 };
        totalRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF2F2F2' }
        };

        // Set column widths
        worksheet.columns = [
            { width: 25 }, // Medicine Name
            { width: 15 }, // Batch Number
            { width: 12 }, // Expiry Date
            { width: 10 }, // Quantity
            { width: 12 }, // Unit Price
            { width: 8 },  // FOC
            { width: 12 }, // Subtotal
            { width: 20 }  // Notes
        ];

        // Add borders to all cells with data
        const lastRow = worksheet.lastRow.number;
        const headerRowNum = 8; // The row where our table headers start
        
        for (let row = headerRowNum; row <= lastRow - 1; row++) {
            for (let col = 1; col <= 8; col++) {
                const cell = worksheet.getCell(row, col);
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
            }
        }

        // Set response headers
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=GRN_${po_data.po_code || 'Draft'}_${new Date().toISOString().slice(0, 10)}.xlsx`);

        // Write and send the workbook
        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error('Error generating GRN Excel:', error);
        res.status(500).json({ error: 'Failed to generate Excel file' });
    }
});
// Get single agency details
app.get('/api/pharma-agency-detail-xyz123/:id', asyncHandler(async (req, res) => {
    try {
        const agencyId = parseInt(req.params.id);
        
        if (!agencyId || agencyId <= 0) {
            return res.status(400).json(formatResponse(false, null, 'Invalid agency ID'));
        }

        const query = 'SELECT * FROM pharma_agencies WHERE agency_id = ?';
        const [result] = await popool.promise().execute(query, [agencyId]);

        if (result.length === 0) {
            return res.status(404).json(formatResponse(false, null, 'Agency not found'));
        }

        res.json(formatResponse(true, result[0], 'Agency details retrieved successfully'));
    } catch (error) {
        console.error('Error fetching agency details:', error);
        res.status(500).json(formatResponse(false, null, 'Internal server error'));
    }
}));

// Create new agency
app.post('/api/pharma-agency-create-xyz123', asyncHandler(async (req, res) => {
    try {
        const { name, contact_person, email, phone, address } = req.body;

        // Validate required fields
        if (!name || name.trim().length === 0) {
            return res.status(400).json(formatResponse(false, null, 'Agency name is required'));
        }

        // Validate field lengths
        if (name.length > 100) {
            return res.status(400).json(formatResponse(false, null, 'Agency name must be 100 characters or less'));
        }
        if (contact_person && contact_person.length > 100) {
            return res.status(400).json(formatResponse(false, null, 'Contact person must be 100 characters or less'));
        }
        if (email && email.length > 100) {
            return res.status(400).json(formatResponse(false, null, 'Email must be 100 characters or less'));
        }
        if (phone && phone.length > 30) {
            return res.status(400).json(formatResponse(false, null, 'Phone must be 30 characters or less'));
        }
        if (address && address.length > 255) {
            return res.status(400).json(formatResponse(false, null, 'Address must be 255 characters or less'));
        }

        // Validate email format if provided
        if (email && email.trim()) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email.trim())) {
                return res.status(400).json(formatResponse(false, null, 'Invalid email format'));
            }
        }

        // Check if agency name already exists
        const checkQuery = 'SELECT agency_id FROM pharma_agencies WHERE name = ?';
        const [existingAgency] = await popool.promise().execute(checkQuery, [name.trim()]);
        
        if (existingAgency.length > 0) {
            return res.status(400).json(formatResponse(false, null, 'Agency name already exists'));
        }

        // Insert new agency
        const insertQuery = `
            INSERT INTO pharma_agencies (name, contact_person, email, phone, address) 
            VALUES (?, ?, ?, ?, ?)
        `;
        const insertParams = [
            name.trim(),
            contact_person && contact_person.trim() || null,
            email && email.trim() || null,
            phone && phone.trim() || null,
            address && address.trim() || null
        ];

        const [result] = await popool.promise().execute(insertQuery, insertParams);

        if (result.affectedRows === 1) {
            const newAgency = {
                agency_id: result.insertId,
                name: name.trim(),
                contact_person: contact_person && contact_person.trim() || null,
                email: email && email.trim() || null,
                phone: phone && phone.trim() || null,
                address: address && address.trim() || null
            };

            res.status(201).json(formatResponse(true, newAgency, 'Agency created successfully'));
        } else {
            throw new Error('Failed to create agency');
        }
    } catch (error) {
        console.error('Error creating agency:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            res.status(400).json(formatResponse(false, null, 'Agency name already exists'));
        } else {
            res.status(500).json(formatResponse(false, null, 'Internal server error'));
        }
    }
}));

// Update existing agency
app.post('/api/pharma-agency-update-xyz123/:id', asyncHandler(async (req, res) => {
    try {
        const agencyId = parseInt(req.params.id);
        const { name, contact_person, email, phone, address } = req.body;

        if (!agencyId || agencyId <= 0) {
            return res.status(400).json(formatResponse(false, null, 'Invalid agency ID'));
        }

        // Validate required fields
        if (!name || name.trim().length === 0) {
            return res.status(400).json(formatResponse(false, null, 'Agency name is required'));
        }

        // Validate field lengths
        if (name.length > 100) {
            return res.status(400).json(formatResponse(false, null, 'Agency name must be 100 characters or less'));
        }
        if (contact_person && contact_person.length > 100) {
            return res.status(400).json(formatResponse(false, null, 'Contact person must be 100 characters or less'));
        }
        if (email && email.length > 100) {
            return res.status(400).json(formatResponse(false, null, 'Email must be 100 characters or less'));
        }
        if (phone && phone.length > 30) {
            return res.status(400).json(formatResponse(false, null, 'Phone must be 30 characters or less'));
        }
        if (address && address.length > 255) {
            return res.status(400).json(formatResponse(false, null, 'Address must be 255 characters or less'));
        }

        // Validate email format if provided
        if (email && email.trim()) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email.trim())) {
                return res.status(400).json(formatResponse(false, null, 'Invalid email format'));
            }
        }

        // Check if agency exists
        const checkQuery = 'SELECT agency_id FROM pharma_agencies WHERE agency_id = ?';
        const [existingAgency] = await popool.promise().execute(checkQuery, [agencyId]);
        
        if (existingAgency.length === 0) {
            return res.status(404).json(formatResponse(false, null, 'Agency not found'));
        }

        // Check if agency name already exists for different agency
        const nameCheckQuery = 'SELECT agency_id FROM pharma_agencies WHERE name = ? AND agency_id != ?';
        const [nameExists] = await popool.promise().execute(nameCheckQuery, [name.trim(), agencyId]);
        
        if (nameExists.length > 0) {
            return res.status(400).json(formatResponse(false, null, 'Agency name already exists'));
        }

        // Update agency
        const updateQuery = `
            UPDATE pharma_agencies 
            SET name = ?, contact_person = ?, email = ?, phone = ?, address = ?
            WHERE agency_id = ?
        `;
        const updateParams = [
            name.trim(),
            contact_person && contact_person.trim() || null,
            email && email.trim() || null,
            phone && phone.trim() || null,
            address && address.trim() || null,
            agencyId
        ];

        const [result] = await popool.promise().execute(updateQuery, updateParams);

        if (result.affectedRows === 1) {
            const updatedAgency = {
                agency_id: agencyId,
                name: name.trim(),
                contact_person: contact_person && contact_person.trim() || null,
                email: email && email.trim() || null,
                phone: phone && phone.trim() || null,
                address: address && address.trim() || null
            };

            res.json(formatResponse(true, updatedAgency, 'Agency updated successfully'));
        } else {
            throw new Error('Failed to update agency');
        }
    } catch (error) {
        console.error('Error updating agency:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            res.status(400).json(formatResponse(false, null, 'Agency name already exists'));
        } else {
            res.status(500).json(formatResponse(false, null, 'Internal server error'));
        }
    }
}));

// Delete agency
app.post('/api/pharma-agency-delete-xyz123/:id', asyncHandler(async (req, res) => {
    try {
        const agencyId = parseInt(req.params.id);

        if (!agencyId || agencyId <= 0) {
            return res.status(400).json(formatResponse(false, null, 'Invalid agency ID'));
        }

        // Check if agency exists
        const checkQuery = 'SELECT agency_id, name FROM pharma_agencies WHERE agency_id = ?';
        const [existingAgency] = await popool.promise().execute(checkQuery, [agencyId]);
        
        if (existingAgency.length === 0) {
            return res.status(404).json(formatResponse(false, null, 'Agency not found'));
        }

        // Check if agency is referenced in purchase orders
        const referencesQuery = 'SELECT COUNT(*) as count FROM purchase_orders WHERE agency_id = ?';
        const [references] = await popool.promise().execute(referencesQuery, [agencyId]);
        
        if (references[0].count > 0) {
            return res.status(400).json(formatResponse(false, null, 'Cannot delete agency. It is referenced in purchase orders.'));
        }

        // Delete agency
        const deleteQuery = 'DELETE FROM pharma_agencies WHERE agency_id = ?';
        const [result] = await popool.promise().execute(deleteQuery, [agencyId]);

        if (result.affectedRows === 1) {
            res.json(formatResponse(true, null, 'Agency deleted successfully'));
        } else {
            throw new Error('Failed to delete agency');
        }
    } catch (error) {
        console.error('Error deleting agency:', error);
        if (error.code === 'ER_ROW_IS_REFERENCED_2') {
            res.status(400).json(formatResponse(false, null, 'Cannot delete agency. It is referenced in other records.'));
        } else {
            res.status(500).json(formatResponse(false, null, 'Internal server error'));
        }
    }
}));

// Modify the /api/purchase-orders/create endpoint
app.post('/api/purchase-orders/create', async (req, res) => {
    try {
        const pool = popool; // Use the correct pool for 'purchase_goods'

        const { agency, date, remarks, items, created_by } = req.body;
        if (!agency || !date || !items || !Array.isArray(items) || items.length === 0 || !created_by) {
            return res.status(400).json({ success: false, message: 'Missing required fields.' });
        }

        // 1. Find or create agency
        const [agencyRows] = await pool.promise().query(
            "SELECT agency_id FROM pharma_agencies WHERE name = ? LIMIT 1",
            [agency]
        );
        let agencyId;
        if (agencyRows.length) {
            agencyId = agencyRows[0].agency_id;
        } else {
            const [agencyResult] = await pool.promise().query(
                "INSERT INTO pharma_agencies (name) VALUES (?)",
                [agency]
            );
            agencyId = agencyResult.insertId;
        }

        // 2. Generate PO code (PO-DDMMYYXXXX)
        const now = new Date();
        const datePrefix = `${String(now.getDate()).padStart(2, "0")}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getFullYear()).slice(-2)}`;
        const [maxPo] = await pool.promise().query(
            "SELECT po_code FROM purchase_orders WHERE po_code LIKE ? ORDER BY po_code DESC LIMIT 1",
            [`PO-${datePrefix}%`]
        );
        let runningNumber = 1;
        if (maxPo.length && maxPo[0].po_code) {
            const match = maxPo[0].po_code.match(/PO-\d{6}(\d{4})/);
            if (match) runningNumber = parseInt(match[1]) + 1;
        }
        const newPoCode = `PO-${datePrefix}${String(runningNumber).padStart(4, "0")}`;

        // 3. Calculate total
        const totalAmount = items.reduce((sum, item) => sum + (item.foc ? 0 : (parseFloat(item.quantity) * parseFloat(item.wholesale_price))), 0);

        // 4. Insert purchase_order with created_by
        const [orderResult] = await pool.promise().query(
            `INSERT INTO purchase_orders
             (po_code, agency_id, status, total_amount, created_by, remarks)
             VALUES (?, ?, 'Pending', ?, ?, ?)`,
            [newPoCode, agencyId, totalAmount, created_by, remarks || null]
        );
        const poId = orderResult.insertId;

        // 5. Insert items
        for (const item of items) {
            // Get medicine_id by name (must exist in medicines_table)
            const [medRows] = await medicinesPool.promise().query(
                "SELECT id FROM medicines_table WHERE item_name = ? LIMIT 1",
                [item.item_name]
            );
            if (!medRows.length) throw new Error(`Medicine "${item.item_name}" not found in database.`);
            const medicineId = medRows[0].id;
            await pool.promise().query(
                `INSERT INTO purchase_order_items
                 (po_id, medicine_id, quantity, wholesale_price, is_foc)
                 VALUES (?, ?, ?, ?, ?)`,
                [poId, medicineId, item.quantity, item.wholesale_price, item.foc ? 1 : 0]
            );
        }

        return res.json({ success: true, po_code: newPoCode, po_id: poId });
    } catch (err) {
        console.error('PO Create error:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
});

const PdfPrinter = require('pdfmake');
const fonts = {
    Roboto: {
        normal: path.join(__dirname, 'fonts/Roboto-Regular.ttf'),
        bold: path.join(__dirname, 'fonts/Roboto-Bold.ttf'),
        italics: path.join(__dirname, 'fonts/Roboto-Italic.ttf'),
        bolditalics: path.join(__dirname, 'fonts/Roboto-BoldItalic.ttf')
    }
};
const printer = new PdfPrinter(fonts);

app.post('/api/purchase-orders/export-pdf', async (req, res) => {
    try {
        const { po_id, pharmacist, agency, date, remarks, total, items } = req.body;
        // Convert items to pdfmake table rows
        const tableBody = [
            [
                { text: "Medicine Name", bold: true },
                { text: "Qty", bold: true },
                { text: "Price", bold: true },
                { text: "FOC", bold: true },
                { text: "Subtotal", bold: true }
            ],
            ...items.map(item => [
                item.item_name,
                item.quantity,
                item.wholesale_price,
                item.foc ? "Yes" : "",
                item.subtotal.toFixed(3)
            ]),
            [
                { text: 'Total', colSpan: 4, alignment: 'right', bold: true }, {}, {}, {},
                { text: (total || 0).toFixed(3), bold: true }
            ]
        ];
        // Load logo as base64
        const logoPath = path.join(__dirname, 'public/images/logo.png');
        let logoBase64 = '';
        if (fs.existsSync(logoPath)) {
            logoBase64 = 'data:image/png;base64,' + fs.readFileSync(logoPath).toString('base64');
        }

        const docDefinition = {
            content: [
                logoBase64 ? { image: logoBase64, width: 90, alignment: 'left', margin: [0, 0, 0, 12] } : {},
                { text: 'Local Purchase Order', fontSize: 18, bold: true, alignment: 'center', margin: [0,0,0,12] },
                {
                    columns: [
                        { width: '50%', text: `PO ID: ${po_id || '-'}` },
                        { width: '50%', text: `Date: ${date || '-'}`, alignment: 'right' }
                    ]
                },
                { text: `Pharmaceutical Agency: ${agency || '-'}`, margin: [0, 4] },
                { text: `Pharmacist: ${pharmacist || '-'}`, margin: [0, 0, 0, 8] },
                { text: `Remarks: ${remarks || '-'}`, margin: [0, 0, 0, 8] },
                { table: { headerRows: 1, widths: ['*', 'auto', 'auto', 'auto', 'auto'], body: tableBody }, margin: [0,8,0,0] },
                { text: 'Signature: ______________________', margin: [0,24,0,0] }
            ]
        };
        const pdfDoc = printer.createPdfKitDocument(docDefinition);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=purchase_order_${po_id}.pdf`);
        pdfDoc.pipe(res);
        pdfDoc.end();
    } catch (err) {
        console.error("PDF Export Error:", err);
        res.status(500).json({ error: "Failed to export PDF" });
    }
});

app.post('/api/purchase-orders/export-xlsx', async (req, res) => {
    try {
        const { agency, date, remarks, items } = req.body;
        if (!agency || !date || !items || !items.length) throw new Error("Missing data");

        const workbook = new ExcelJS.Workbook();
        const ws = workbook.addWorksheet('Purchase Order');

        // Header
        ws.addRow(['Pharmacy Management System']);
        ws.addRow(['Purchase Order']);
        ws.addRow([]);
        ws.addRow(['Agency:', agency, '', 'Date:', date]);
        ws.addRow(['Remarks:', remarks]);
        ws.addRow([]);

        // Table header
        ws.addRow(['Medicine', 'Quantity', 'Wholesale Price', 'FOC', 'Subtotal']);
        items.forEach(item => {
            ws.addRow([
                item.item_name,
                item.quantity,
                item.wholesale_price,
                item.foc ? 'Yes' : '',
                item.subtotal
            ]);
        });
        ws.addRow([]);
        let total = items.reduce((sum, i) => sum + (Number(i.subtotal) || 0), 0);
        ws.addRow(['', '', '', 'Total:', total.toFixed(3)]);

        // Formatting
        ws.getRow(1).font = { bold: true, size: 14 };
        ws.getRow(2).font = { bold: true, size: 12 };
        ws.getRow(7).font = { bold: true };
        ws.getRow(ws.lastRow.number).font = { bold: true };

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=purchase_order.xlsx');
        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error("XLSX export error:", err);
        res.status(500).json({ error: 'Failed to export Excel' });
    }
});
// Get PO details by ID (for view/edit)
app.get('/api/purchase-orders/:id', async (req, res) => {
  const { id } = req.params;
  try {
    // PO header
    const [poRows] = await popool.promise().query(
      `SELECT po.*, a.name AS agency_name
       FROM purchase_orders po
       LEFT JOIN pharma_agencies a ON po.agency_id = a.agency_id
       WHERE po.po_id = ?`,
      [id]
    );
    if (!poRows.length) return res.status(404).json({ error: 'PO not found' });

    // Items with medicine name - FIX: Ensure consistent field naming
    const [itemRows] = await popool.promise().query(
      `SELECT poi.poi_id,
              poi.medicine_id,
              m.item_name AS medicine_name,
              CAST(poi.quantity AS DECIMAL(10,2)) AS quantity,
              CAST(poi.wholesale_price AS DECIMAL(10,3)) AS wholesale_price,
              poi.is_foc
       FROM purchase_order_items poi
       JOIN medicines.medicines_table m ON poi.medicine_id = m.id
       WHERE poi.po_id = ?`,
      [id]
    );

    const items = itemRows.map(r => ({
      poi_id: r.poi_id,
      medicine_id: r.medicine_id,
      medicine_name: r.medicine_name, // Consistent naming
      item_name: r.medicine_name,     // Also provide item_name for compatibility
      quantity: Number(r.quantity),
      wholesale_price: Number(r.wholesale_price),
      is_foc: Boolean(r.is_foc),
      subtotal: Number(r.quantity) * Number(r.wholesale_price) * (r.is_foc ? 0 : 1)
    }));

    const po = poRows[0];
    po.items = items;
    po.total_amount = Number(items.reduce((sum, it) => sum + it.subtotal, 0));

    res.json(po);
  } catch (err) {
    console.error('GET PO error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET a specific GRN with item details, batch, expiry, medicine name - FIXED VERSION
app.get('/api/goods-receipt-notes/:id', async (req, res) => {
    const grn_id = req.params.id;
    console.log(`[GRN DEBUG] Fetching GRN ID: ${grn_id}`);
    
    try {
        // 1) Get GRN header with PO total
        const [grnRows] = await popool.promise().query(
            `SELECT grn.*, 
                    po.po_code, 
                    po.total_amount as po_total_amount, 
                    a.name as agency_name,
                    u.FullName as received_by_name
             FROM goods_receipt_notes grn
             LEFT JOIN purchase_orders po ON grn.po_id = po.po_id
             LEFT JOIN pharma_agencies a ON po.agency_id = a.agency_id
             LEFT JOIN userauthdb.users u ON grn.received_by = u.UserID
             WHERE grn.grn_id = ?`, [grn_id]
        );
        
        if (!grnRows.length) {
            return res.status(404).json({ error: 'GRN not found' });
        }

        const grn = grnRows[0];
        console.log(`[GRN DEBUG] Found GRN with PO total: ${grn.po_total_amount}`);

        // 2) Get GRN items with medicine names using separate queries (more reliable)
        const [itemRows] = await popool.promise().query(
            `SELECT gi.*,
                    poi.medicine_id,
                    poi.quantity as po_quantity,
                    poi.wholesale_price as po_wholesale_price,
                    poi.is_foc,
                    CAST(COALESCE(gi.quantity, 0) AS DECIMAL(10,3)) AS quantity,
                    CAST(COALESCE(gi.received_price, poi.wholesale_price, 0) AS DECIMAL(10,3)) AS received_price,
                    CAST(COALESCE(gi.received_subtotal, 0) AS DECIMAL(12,3)) AS received_subtotal
             FROM grn_items gi
             LEFT JOIN purchase_order_items poi ON gi.poi_id = poi.poi_id
             WHERE gi.grn_id = ?`, [grn_id]
        );

        console.log(`[GRN DEBUG] Found ${itemRows.length} GRN items`);

        // 3) Get medicine names separately for each item
        const items = [];
        let calculated_total = 0;
        let foc_items_count = 0;
        
        for (const row of itemRows) {
            let medicine_name = '(Unknown Medicine)';
            
            // Get medicine name from medicines database
            if (row.medicine_id) {
                try {
                    const [medRows] = await medicinesPool.promise().query(
                        'SELECT item_name FROM medicines_table WHERE id = ?', 
                        [row.medicine_id]
                    );
                    if (medRows.length > 0) {
                        medicine_name = medRows[0].item_name;
                        console.log(`[GRN DEBUG] Found medicine name: ${medicine_name} for ID: ${row.medicine_id}`);
                    } else {
                        console.warn(`[GRN DEBUG] No medicine found for ID: ${row.medicine_id}`);
                    }
                } catch (medErr) {
                    console.error(`[GRN DEBUG] Error getting medicine name for ID ${row.medicine_id}:`, medErr);
                }
            }

            const quantity = Number(row.quantity) || 0;
            const is_foc = Boolean(row.is_foc);
            let received_price = Number(row.received_price) || 0;
            let received_subtotal = Number(row.received_subtotal) || 0;
            
            // CORRECT FOC HANDLING
            if (is_foc) {
                // FOC items should have 0 price and subtotal
                received_price = 0;
                received_subtotal = 0;
                foc_items_count++;
                console.log(`[GRN DEBUG] Item ${row.grn_item_id} is FOC - price/subtotal set to 0`);
            } else {
                // For non-FOC items, ensure subtotal is correct
                const calculated_subtotal = quantity * received_price;
                if (Math.abs(received_subtotal - calculated_subtotal) > 0.001) {
                    console.log(`[GRN DEBUG] Correcting subtotal for item ${row.grn_item_id}: ${received_subtotal} -> ${calculated_subtotal}`);
                    received_subtotal = calculated_subtotal;
                }
                calculated_total += received_subtotal;
            }
            
            items.push({
                grn_item_id: row.grn_item_id,
                medicine_id: row.medicine_id,
                medicine_name: medicine_name,
                batch_number: row.batch_number || '',
                expirydate: row.expirydate || '',
                quantity: quantity,
                received_price: received_price,
                received_subtotal: received_subtotal,
                is_foc: is_foc
            });
        }

        // 4) Calculate and verify totals
        const grn_total = Number(grn.total_amount) || calculated_total;
        const po_total_amount = Number(grn.po_total_amount) || 0;
        const total_matches_po = Math.abs(grn_total - po_total_amount) < 0.01;

        console.log(`[GRN DEBUG] Final totals:`, {
            grn_total,
            po_total_amount,
            calculated_total,
            foc_items_count,
            total_matches_po
        });

        // 5) Update GRN total if it's wrong
        if (Math.abs(grn_total - calculated_total) > 0.001) {
            try {
                await popool.promise().query(
                    'UPDATE goods_receipt_notes SET total_amount = ? WHERE grn_id = ?',
                    [calculated_total, grn_id]
                );
                console.log(`[GRN DEBUG] Updated GRN total in database: ${calculated_total}`);
            } catch (updateErr) {
                console.error(`[GRN DEBUG] Failed to update GRN total:`, updateErr);
            }
        }

        const response = {
            grn_id: grn.grn_id,
            grn_code: grn.grn_code,
            po_id: grn.po_id,
            po_code: grn.po_code,
            agency_name: grn.agency_name,
            received_at: grn.received_at,
            received_by: grn.received_by,
            received_by_name: grn.received_by_name || 'Unknown User',
            remarks: grn.remarks,
            items: items,
            total_amount: calculated_total, // Use calculated total
            po_total_amount: po_total_amount,
            total_matches_po: total_matches_po,
            calculated_total: calculated_total,
            foc_items_count: foc_items_count,
            non_foc_items_count: items.length - foc_items_count
        };

        res.json(response);
    } catch (err) {
        console.error("[GRN DEBUG] Failed to fetch GRN details:", err);
        res.status(500).json({ error: 'Server error', details: err.message });
    }
});

// FIXED GRN CREATION: Properly handle FOC items
app.post('/api/goods-receipt-notes/from-po', async (req, res) => {
    const connection = await popool.promise().getConnection();
    
    try {
        await connection.beginTransaction();
        
        const { po_id, received_by, remarks, items } = req.body;
        
        if (!po_id || !items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, message: 'PO and at least one item required' });
        }

        // Generate GRN code
        const now = new Date();
        const ddmmyy = String(now.getDate()).padStart(2, '0') +
                       String(now.getMonth() + 1).padStart(2, '0') +
                       String(now.getFullYear()).slice(-2);
        
        const [maxGrn] = await connection.query(
            `SELECT grn_code FROM goods_receipt_notes WHERE grn_code LIKE ? ORDER BY grn_code DESC LIMIT 1`,
            [`GRN-${ddmmyy}%`]
        );
        
        let seq = 1;
        if (maxGrn.length && maxGrn[0].grn_code) {
            const match = maxGrn[0].grn_code.match(/(\d{4})$/);
            if (match) seq = parseInt(match[1], 10) + 1;
        }
        const grn_code = `GRN-${ddmmyy}${String(seq).padStart(4, '0')}`;

        // Process items with FOC handling
        let total_grn_amount = 0;
        const processedItems = [];
        
        for (const item of items) {
            // Get PO item details
            const [poiRows] = await connection.query(
                `SELECT poi_id, wholesale_price FROM purchase_order_items 
                 WHERE po_id = ? AND medicine_id = ? LIMIT 1`,
                [po_id, item.medicine_id]
            );
            
            if (!poiRows.length) {
                console.warn(`No PO item found for medicine_id ${item.medicine_id} in PO ${po_id}`);
                continue;
            }
            
            const poi_id = poiRows[0].poi_id;
            const po_wholesale_price = Number(poiRows[0].wholesale_price) || 0;
            
            // ✅ FIX: Use FOC status from CLIENT, not database
            const is_foc = Boolean(item.is_foc); // Use client's FOC status
            const quantity = Number(item.quantity) || 0;
            
            // CORRECT FOC HANDLING using client's value
            let received_price, received_subtotal;
            if (is_foc) {
                received_price = 0;
                received_subtotal = 0;
                console.log(`[GRN CREATE] Item ${item.medicine_id} is FOC - setting price/subtotal to 0`);
            } else {
                received_price = Number(item.received_price) || po_wholesale_price;
                received_subtotal = quantity * received_price;
                total_grn_amount += received_subtotal;
                console.log(`[GRN CREATE] Item ${item.medicine_id} non-FOC - subtotal: ${received_subtotal}`);
            }
            
            processedItems.push({
                poi_id,
                batch_number: item.batch_number,
                expirydate: item.expirydate,
                quantity,
                received_price,
                received_subtotal,
                is_foc
            });
        }

        console.log(`[GRN CREATE] Total amount (excluding FOC): ${total_grn_amount}`);
        console.log(`[GRN CREATE] FOC items count: ${processedItems.filter(i => i.is_foc).length}`);

        // Insert GRN header with correct total (excluding FOC)
        const [grnResult] = await connection.query(
            `INSERT INTO goods_receipt_notes (grn_code, po_id, received_by, remarks, received_at, total_amount)
             VALUES (?, ?, ?, ?, NOW(), ?)`,
            [grn_code, po_id, received_by, remarks || '', total_grn_amount]
        );
        const grn_id = grnResult.insertId;

        // Insert GRN items
        for (const item of processedItems) {
            await connection.query(
                `INSERT INTO grn_items (grn_id, poi_id, batch_number, expirydate, quantity, received_price, received_subtotal)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [grn_id, item.poi_id, item.batch_number, item.expirydate, item.quantity, item.received_price, item.received_subtotal]
            );
            
            // Update batch inventory (both FOC and non-FOC items get added to stock)
            try {
                // Get medicine_id from poi_id
                const [medIdRows] = await connection.query(
                    'SELECT medicine_id FROM purchase_order_items WHERE poi_id = ?',
                    [item.poi_id]
                );
                
                if (medIdRows.length) {
                    const medicine_id = medIdRows[0].medicine_id;
                    
                    const [existingBatch] = await medicinesPool.promise().query(
                        `SELECT batch_id FROM batches WHERE medicine_id = ? AND batch_number = ? AND expiry = ?`,
                        [medicine_id, item.batch_number, item.expirydate]
                    );
                    
                    if (existingBatch.length) {
                        await medicinesPool.promise().query(
                            `UPDATE batches SET quantity = quantity + ? WHERE batch_id = ?`,
                            [item.quantity, existingBatch[0].batch_id]
                        );
                    } else {
                        await medicinesPool.promise().query(
                            `INSERT INTO batches (medicine_id, batch_number, expiry, quantity, received_date)
                             VALUES (?, ?, ?, ?, CURDATE())`,
                            [medicine_id, item.batch_number, item.expirydate, item.quantity]
                        );
                    }
                }
            } catch (batchError) {
                console.error('Batch update error:', batchError);
            }
        }

        // Update PO status
        await connection.query(
            `UPDATE purchase_orders SET status = 'Received', updated_at = NOW() WHERE po_id = ?`,
            [po_id]
        );

        await connection.commit();
        
        res.json({ 
            success: true, 
            grn_code, 
            grn_id, 
            total_amount: total_grn_amount,
            items_processed: processedItems.length,
            foc_items: processedItems.filter(i => i.is_foc).length
        });
        
    } catch (err) {
        await connection.rollback();
        console.error('GRN receive error:', err);
        res.status(500).json({ 
            success: false, 
            message: err.message || 'Internal error processing GRN' 
        });
    } finally {
        connection.release();
    }
});

// UTILITY: Fix existing GRN #7 data
app.post('/api/debug/fix-grn-7', async (req, res) => {
    const connection = await popool.promise().getConnection();
    
    try {
        await connection.beginTransaction();
        
        console.log('[FIX GRN 7] Starting fix...');
        
        // 1. Get all items for GRN 7 with their FOC status
        const [grnItems] = await connection.query(
            `SELECT gi.*, poi.is_foc, poi.wholesale_price
             FROM grn_items gi
             LEFT JOIN purchase_order_items poi ON gi.poi_id = poi.poi_id
             WHERE gi.grn_id = 7`
        );
        
        let correctedTotal = 0;
        
        // 2. Fix each item
        for (const item of grnItems) {
            const is_foc = Boolean(item.is_foc);
            const quantity = Number(item.quantity) || 0;
            
            if (is_foc) {
                // FOC items should have 0 price and subtotal
                await connection.query(
                    'UPDATE grn_items SET received_price = 0, received_subtotal = 0 WHERE grn_item_id = ?',
                    [item.grn_item_id]
                );
                console.log(`[FIX GRN 7] Fixed FOC item ${item.grn_item_id}`);
            } else {
                // Non-FOC items should have correct subtotal
                const price = Number(item.received_price) || Number(item.wholesale_price) || 0;
                const subtotal = quantity * price;
                await connection.query(
                    'UPDATE grn_items SET received_subtotal = ? WHERE grn_item_id = ?',
                    [subtotal, item.grn_item_id]
                );
                correctedTotal += subtotal;
                console.log(`[FIX GRN 7] Fixed non-FOC item ${item.grn_item_id}, subtotal: ${subtotal}`);
            }
        }
        
        // 3. Update GRN total
        await connection.query(
            'UPDATE goods_receipt_notes SET total_amount = ? WHERE grn_id = 7',
            [correctedTotal]
        );
        
        await connection.commit();
        
        console.log(`[FIX GRN 7] Fixed total: ${correctedTotal}`);
        res.json({ 
            success: true, 
            message: `Fixed GRN #7, new total: ${correctedTotal.toFixed(3)}`,
            corrected_total: correctedTotal
        });
        
    } catch (err) {
        await connection.rollback();
        console.error('[FIX GRN 7] Error:', err);
        res.status(500).json({ error: 'Failed to fix GRN #7' });
    } finally {
        connection.release();
    }
});
// Update Purchase Order (header + items)
// --- Update Purchase Order (only changed fields/items) ---
app.put('/api/purchase-orders/:poId/update', async (req, res) => {
    const { poId } = req.params;
    const { header, items } = req.body;
    if (!poId || typeof header !== 'object' || !Array.isArray(items)) {
        return res.status(400).json({ error: "Invalid input" });
    }

    const conn = await popool.promise().getConnection();
    try {
        await conn.beginTransaction();

        // Only update changed header fields + always audit
        let set = [];
        let params = [];
        if ('agency_id' in header) { set.push('agency_id = ?'); params.push(header.agency_id); }
        if ('date' in header)      { set.push('created_at = ?'); params.push(header.date); }
        if ('remarks' in header)   { set.push('remarks = ?'); params.push(header.remarks); }
        // Always set updated_by/updated_at
        set.push('updated_by = ?'); params.push(header.updated_by);
        set.push('updated_at = NOW()');
        params.push(poId);

        if (set.length > 2) { // >2 = at least 1 field other than audit columns
            await conn.query(
                `UPDATE purchase_orders SET ${set.join(', ')} WHERE po_id = ?`,
                params
            );
        }

        // Only update changed items (with quantity, price, is_foc)
        for (const item of items) {
            let updateCols = [];
            let vals = [];
            if ('quantity' in item)        { updateCols.push('quantity = ?'); vals.push(item.quantity); }
            if ('wholesale_price' in item) { updateCols.push('wholesale_price = ?'); vals.push(item.wholesale_price); }
            if ('is_foc' in item)          { updateCols.push('is_foc = ?'); vals.push(item.is_foc); }
            if (updateCols.length) {
                vals.push(poId, item.medicine_id);
                await conn.query(
                    `UPDATE purchase_order_items SET ${updateCols.join(', ')} WHERE po_id = ? AND medicine_id = ?`,
                    vals
                );
            }
        }

        await conn.commit();
        res.json({ success: true });
    } catch (err) {
        await conn.rollback();
        console.error("Failed to update PO:", err);
        res.status(500).json({ error: "Failed to update PO" });
    } finally {
        conn.release();
    }
});

// REPLACE the existing /api/goods-receipt-notes/from-po endpoint in server.js with this:
app.post('/api/goods-receipt-notes/from-po', async (req, res) => {
  const connection = await popool.promise().getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { po_id, received_by, remarks, items } = req.body;
    
    if (!po_id || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'PO and at least one item required' });
    }

    // ✅ FIXED: Use actual user ID from session if received_by is not provided
    const actualReceivedBy = received_by || (req.session.user ? req.session.user.userId : null);
    
    if (!actualReceivedBy) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    // Generate GRN code
    const now = new Date();
    const ddmmyy = String(now.getDate()).padStart(2, '0') +
                   String(now.getMonth() + 1).padStart(2, '0') +
                   String(now.getFullYear()).slice(-2);
    
    const [maxGrn] = await connection.query(
      `SELECT grn_code FROM goods_receipt_notes WHERE grn_code LIKE ? ORDER BY grn_code DESC LIMIT 1`,
      [`GRN-${ddmmyy}%`]
    );
    
    let seq = 1;
    if (maxGrn.length && maxGrn[0].grn_code) {
      const match = maxGrn[0].grn_code.match(/(\d{4})$/);
      if (match) seq = parseInt(match[1], 10) + 1;
    }
    const grn_code = `GRN-${ddmmyy}${String(seq).padStart(4, '0')}`;

    // Process items with FOC handling
    let total_grn_amount = 0;
    const processedItems = [];
    
    for (const item of items) {
      // Get PO item details
      const [poiRows] = await connection.query(
        `SELECT poi_id, wholesale_price, is_foc FROM purchase_order_items 
         WHERE po_id = ? AND medicine_id = ? LIMIT 1`,
        [po_id, item.medicine_id]
      );
      
      if (!poiRows.length) {
        console.warn(`No PO item found for medicine_id ${item.medicine_id} in PO ${po_id}`);
        continue;
      }
      
      const poi_id = poiRows[0].poi_id;
      const po_wholesale_price = Number(poiRows[0].wholesale_price) || 0;
      const po_is_foc = Boolean(poiRows[0].is_foc);
      
      // Use FOC status from PO item (most reliable source)
      const is_foc = po_is_foc;
      const quantity = Number(item.quantity) || 0;
      
      // CORRECT FOC HANDLING
      let received_price, received_subtotal;
      if (is_foc) {
        received_price = 0;
        received_subtotal = 0;
        console.log(`[GRN CREATE] Item ${item.medicine_id} is FOC - setting price/subtotal to 0`);
      } else {
        received_price = Number(item.received_price) || po_wholesale_price;
        received_subtotal = quantity * received_price;
        total_grn_amount += received_subtotal;
        console.log(`[GRN CREATE] Item ${item.medicine_id} non-FOC - subtotal: ${received_subtotal}`);
      }
      
      processedItems.push({
        poi_id,
        batch_number: item.batch_number,
        expirydate: item.expirydate,
        quantity,
        received_price,
        received_subtotal,
        is_foc
      });
    }

    console.log(`[GRN CREATE] Total amount (excluding FOC): ${total_grn_amount}`);
    console.log(`[GRN CREATE] FOC items count: ${processedItems.filter(i => i.is_foc).length}`);

    // Insert GRN header with correct total (excluding FOC)
    const [grnResult] = await connection.query(
      `INSERT INTO goods_receipt_notes (grn_code, po_id, received_by, remarks, received_at, total_amount)
       VALUES (?, ?, ?, ?, NOW(), ?)`,
      [grn_code, po_id, actualReceivedBy, remarks || '', total_grn_amount]
    );
    const grn_id = grnResult.insertId;

    // Insert GRN items
    for (const item of processedItems) {
      await connection.query(
        `INSERT INTO grn_items (grn_id, poi_id, batch_number, expirydate, quantity, received_price, received_subtotal)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [grn_id, item.poi_id, item.batch_number, item.expirydate, item.quantity, item.received_price, item.received_subtotal]
      );
      
      // Update batch inventory (both FOC and non-FOC items get added to stock)
      try {
        // Get medicine_id from poi_id
        const [medIdRows] = await connection.query(
          'SELECT medicine_id FROM purchase_order_items WHERE poi_id = ?',
          [item.poi_id]
        );
        
        if (medIdRows.length) {
          const medicine_id = medIdRows[0].medicine_id;
          
          const [existingBatch] = await medicinesPool.promise().query(
            `SELECT batch_id FROM batches WHERE medicine_id = ? AND batch_number = ? AND expiry = ?`,
            [medicine_id, item.batch_number, item.expirydate]
          );
          
          if (existingBatch.length) {
            await medicinesPool.promise().query(
              `UPDATE batches SET quantity = quantity + ? WHERE batch_id = ?`,
              [item.quantity, existingBatch[0].batch_id]
            );
          } else {
            await medicinesPool.promise().query(
              `INSERT INTO batches (medicine_id, batch_number, expiry, quantity, received_date)
               VALUES (?, ?, ?, ?, CURDATE())`,
              [medicine_id, item.batch_number, item.expirydate, item.quantity]
            );
          }
        }
      } catch (batchError) {
        console.error('Batch update error:', batchError);
      }
    }

    // Update PO status
    await connection.query(
      `UPDATE purchase_orders SET status = 'Received', updated_at = NOW() WHERE po_id = ?`,
      [po_id]
    );

    await connection.commit();
    
    res.json({ 
      success: true, 
      grn_code, 
      grn_id, 
      total_amount: total_grn_amount,
      items_processed: processedItems.length,
      foc_items: processedItems.filter(i => i.is_foc).length
    });
    
  } catch (err) {
    await connection.rollback();
    console.error('GRN receive error:', err);
    res.status(500).json({ 
      success: false, 
      message: err.message || 'Internal error processing GRN' 
    });
  } finally {
    connection.release();
  }
});
// Get items for a purchase order
app.get('/api/purchase-orders/:poId/items', (req, res) => {
    const poId = req.params.poId;
    popool.query(
        `SELECT poi.*, m.item_name as medicine_name
         FROM purchase_order_items poi
         JOIN medicines.medicines_table m ON poi.medicine_id = m.id
         WHERE poi.po_id = ?`,
        [poId],
        (err, rows) => {
            if (err) {
                console.error("Failed to fetch PO items:", err);
                return res.status(500).json({ error: 'Failed to fetch PO items' });
            }
            res.json(rows);
        }
    );
});
app.get('/api/goods-receipt-notes/:grnId/items', (req, res) => {
    const grnId = req.params.grnId;
    popool.query(
        `SELECT gi.*, m.item_name as medicine_name
         FROM grn_items gi
         JOIN purchase_order_items poi ON gi.poi_id = poi.poi_id
         JOIN medicines.medicines_table m ON poi.medicine_id = m.id
         WHERE gi.grn_id = ?`,
        [grnId],
        (err, rows) => {
            if (err) {
                console.error("Failed to fetch GRN items:", err);
                return res.status(500).json({ error: 'Failed to fetch GRN items' });
            }
            res.json(rows);
        }
    );
});
// Return ALL PO items with latest price and name
app.get('/api/purchase-orders/:po_id/items', async (req, res) => {
    try {
        const po_id = req.params.po_id;
        const [items] = await popool.promise().query(
            `SELECT poi.*, 
                    m.item_name AS medicine_name, 
                    COALESCE(poi.wholesale_price, m.price, 0) AS wholesale_price
             FROM purchase_order_items poi
             LEFT JOIN medicines_table m ON poi.medicine_id = m.id
             WHERE poi.po_id = ?`,
            [po_id]
        );
        res.json(items);
    } catch (err) {
        console.error("Failed to fetch PO items:", err);
        res.status(500).json({ error: "Failed to fetch PO items" });
    }
});
// Node/Express pseudocode
app.put('/api/purchase-orders/:po_id/update', async (req, res) => {
    const po_id = req.params.po_id;
    const { header, items } = req.body;
    const conn = await pool.promise().getConnection();
    try {
        await conn.beginTransaction();

        // Update PO header
        await conn.query(
            `UPDATE purchase_orders SET agency_name=?, created_at=?, remarks=?, total_amount=?, updated_by=?, updated_at=NOW() WHERE po_id=?`,
            [header.agency_name, header.date, header.remarks, header.total_amount, header.updated_by, po_id]
        );

        // For max reliability, update each item row:
        for (const item of items) {
            await conn.query(
                `UPDATE purchase_order_items SET quantity=?, wholesale_price=?, is_foc=? WHERE po_id=? AND medicine_id=?`,
                [item.quantity, item.wholesale_price, item.is_foc, po_id, item.medicine_id]
            );
        }

        // Recalc total just in case (optional)
        const [rows] = await conn.query(
            `SELECT SUM(quantity * wholesale_price) AS total FROM purchase_order_items WHERE po_id=? AND (is_foc IS NULL OR is_foc=0)`,
            [po_id]
        );
        const total = (rows[0] && rows[0].total) ? rows[0].total : 0;
        await conn.query(`UPDATE purchase_orders SET total_amount=? WHERE po_id=?`, [total, po_id]);

        await conn.commit();
        res.json({ success: true });
    } catch (err) {
        await conn.rollback();
        res.status(500).json({ error: "Failed to update PO" });
    } finally {
        conn.release();
    }
});
// Update PO by ID
// UPDATE existing Purchase Order by ID
app.put('/api/purchase-orders/:id/update', async (req, res) => {
    const poId = req.params.id;
    const { header, items } = req.body;

    try {
        // 1. Update main PO header
        await popool.promise().query(
            `UPDATE purchase_orders
             SET agency_name=?, remarks=?, total_amount=?, updated_by=?, updated_at=NOW()
             WHERE po_id=?`,
            [header.agency, header.remarks, header.total_amount, header.updated_by, poId]
        );

        // 2. Remove all existing items for this PO (simple + safe)
        await popool.promise().query(
            `DELETE FROM purchase_order_items WHERE po_id=?`,
            [poId]
        );

        // 3. Insert all items fresh (with proper mapping)
        for (const it of items) {
            await popool.promise().query(
                `INSERT INTO purchase_order_items 
                  (po_id, medicine_id, quantity, wholesale_price, is_foc)
                 VALUES (?, ?, ?, ?, ?)`,
                [poId, it.medicine_id, it.quantity, it.wholesale_price, it.foc ? 1 : 0]
            );
        }

        res.json({ success: true });
    } catch (err) {
        console.error('PO update error:', err);
        res.status(500).json({ success: false, message: 'Failed to update PO', error: err.message });
    }
});
// PATCH: only update specified fields on specified rows
app.patch('/api/purchase-orders/:id/partial-update', async (req, res) => {
    const poId = req.params.id;
    const { header, items } = req.body;
    const pool = popool; // use your main purchase_goods pool

    try {
        // Update header if needed
        if (header) {
            let agency_id = null;
            if (header.agency) {
                const [agencyRows] = await pool.promise().query(
                    "SELECT agency_id FROM pharma_agencies WHERE name=? LIMIT 1", [header.agency]
                );
                if (!agencyRows.length) {
                    return res.status(400).json({ success: false, message: 'Invalid agency name' });
                }
                agency_id = agencyRows[0].agency_id;
            }
            await pool.promise().query(
                `UPDATE purchase_orders
                 SET agency_id=?, remarks=?, total_amount=?, updated_by=?, updated_at=NOW()
                 WHERE po_id=?`,
                [agency_id, header.remarks, header.total_amount, header.updated_by, poId]
            );
        }

        // Items: patch only the exact row by poi_id
        for (const it of items || []) {
            if (!it.poi_id) continue; // skip if somehow not provided
            await pool.promise().query(
                `UPDATE purchase_order_items
                 SET quantity=?, wholesale_price=?, is_foc=?
                 WHERE poi_id=? AND po_id=?`,
                [it.quantity, it.wholesale_price, it.foc ? 1 : 0, it.poi_id, poId]
            );
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Partial PO update error:', err);
        res.status(500).json({ success: false, message: 'Failed to partial update PO', error: err.message });
    }
});
// DELETE a row from purchase_order_items by poi_id
app.delete('/api/purchase-orders/items/:poi_id', (req, res) => {
    const poi_id = req.params.poi_id;
    if (!poi_id) return res.status(400).json({ success: false, message: 'poi_id is required' });

    const sql = 'DELETE FROM purchase_order_items WHERE poi_id = ?';
    popool.query(sql, [poi_id], (err, result) => {
        if (err) {
            console.error('Failed to delete PO item:', err);
            return res.status(500).json({ success: false, message: 'Failed to delete PO item' });
        }
        res.json({ success: true, affectedRows: result.affectedRows });
    });
});
// DEBUG: Test medicine table connection and data integrity
app.get('/api/debug/grn-medicine-check/:grn_id', async (req, res) => {
    const grn_id = req.params.grn_id;
    console.log(`[DEBUG] Starting medicine check for GRN: ${grn_id}`);
    
    try {
        // Step 1: Get GRN items with POI IDs
        const [grnItems] = await popool.promise().query(
            `SELECT gi.grn_item_id, gi.poi_id, gi.batch_number, gi.quantity, gi.received_subtotal
             FROM grn_items gi WHERE gi.grn_id = ?`, [grn_id]
        );
        
        console.log(`[DEBUG] Found ${grnItems.length} GRN items`);
        
        const debug_info = [];
        
        for (const item of grnItems) {
            const itemDebug = {
                grn_item_id: item.grn_item_id,
                poi_id: item.poi_id,
                batch_number: item.batch_number,
                quantity: item.quantity,
                received_subtotal: item.received_subtotal
            };
            
            // Step 2: Get PO item to find medicine_id
            const [poItems] = await popool.promise().query(
                `SELECT poi.medicine_id, poi.wholesale_price FROM purchase_order_items poi WHERE poi.poi_id = ?`, 
                [item.poi_id]
            );
            
            if (poItems.length) {
                itemDebug.medicine_id = poItems[0].medicine_id;
                itemDebug.po_wholesale_price = poItems[0].wholesale_price;
                
                // Step 3: Try to get medicine name from medicines database
                try {
                    const [medicines] = await medicinesPool.promise().query(
                        `SELECT id, item_name FROM medicines_table WHERE id = ?`, 
                        [poItems[0].medicine_id]
                    );
                    
                    if (medicines.length) {
                        itemDebug.medicine_name = medicines[0].item_name;
                        itemDebug.medicine_found = true;
                    } else {
                        itemDebug.medicine_name = null;
                        itemDebug.medicine_found = false;
                        itemDebug.error = `Medicine ID ${poItems[0].medicine_id} not found in medicines_table`;
                    }
                } catch (medErr) {
                    itemDebug.medicine_name = null;
                    itemDebug.medicine_found = false;
                    itemDebug.error = `Error querying medicines_table: ${medErr.message}`;
                }
            } else {
                itemDebug.medicine_id = null;
                itemDebug.error = `POI ID ${item.poi_id} not found in purchase_order_items`;
            }
            
            debug_info.push(itemDebug);
        }
        
        // Test cross-database query
        let cross_db_test = null;
        try {
            const [crossTest] = await popool.promise().query(
                `SELECT gi.grn_item_id, poi.medicine_id, m.item_name
                 FROM grn_items gi
                 LEFT JOIN purchase_order_items poi ON gi.poi_id = poi.poi_id
                 LEFT JOIN medicines.medicines_table m ON poi.medicine_id = m.id
                 WHERE gi.grn_id = ? LIMIT 1`, [grn_id]
            );
            cross_db_test = crossTest[0] || { error: "No results from cross-database query" };
        } catch (crossErr) {
            cross_db_test = { error: `Cross-database query failed: ${crossErr.message}` };
        }
        
        res.json({
            grn_id,
            items_count: grnItems.length,
            debug_info,
            cross_db_test,
            timestamp: new Date().toISOString()
        });
        
    } catch (err) {
        console.error('[DEBUG] Medicine check error:', err);
        res.status(500).json({ 
            error: err.message,
            grn_id,
            timestamp: new Date().toISOString()
        });
    }
});
// Get user by ID (for displaying names)
app.get('/api/user/:id', (req, res) => {
  const userId = req.params.id;
  const query = `
    SELECT UserID, Username, FullName, JobTitle
    FROM users 
    WHERE UserID = ?
  `;
  connection.query(query, [userId], (err, results) => {
    if (err) {
      console.error('Error fetching user by ID:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    if (results.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json(results[0]);
  });
});
// Print Purchase Order as PDF
app.get('/api/purchase-orders/:id/print-pdf', async (req, res) => {
    try {
        const poId = req.params.id;
        
        // Fetch PO with items
        const [poRows] = await popool.promise().query(
            `SELECT po.*, a.name AS agency_name, u.FullName as created_by_name
             FROM purchase_orders po
             LEFT JOIN pharma_agencies a ON po.agency_id = a.agency_id
             LEFT JOIN userauthdb.users u ON po.created_by = u.UserID
             WHERE po.po_id = ?`,
            [poId]
        );
        
        if (!poRows.length) {
            return res.status(404).json({ error: 'Purchase Order not found' });
        }
        
        const po = poRows[0];
        
        // Get PO items with medicine names
        const [itemRows] = await popool.promise().query(
            `SELECT poi.*, m.item_name AS medicine_name
             FROM purchase_order_items poi
             LEFT JOIN medicines.medicines_table m ON poi.medicine_id = m.id
             WHERE poi.po_id = ?`,
            [poId]
        );

        // Process items
        const items = itemRows.map(item => {
            const quantity = Number(item.quantity || 0);
            const price = Number(item.wholesale_price || 0);
            const is_foc = Boolean(item.is_foc);
            const subtotal = is_foc ? 0 : quantity * price;
            
            return {
                medicine_name: item.medicine_name || 'Unknown Medicine',
                quantity: quantity.toFixed(3),
                wholesale_price: is_foc ? '0.000 (FOC)' : price.toFixed(3),
                foc_indicator: is_foc ? 'Yes' : '',
                subtotal: is_foc ? '0.000 (FOC)' : subtotal.toFixed(3)
            };
        });

        // Calculate totals
        const totalAmount = itemRows.reduce((sum, item) => {
            if (Boolean(item.is_foc)) return sum;
            return sum + (Number(item.quantity || 0) * Number(item.wholesale_price || 0));
        }, 0);

        // Load logo as base64
        const logoPath = path.join(__dirname, 'public/images/logo.png');
        let logoBase64 = '';
        if (fs.existsSync(logoPath)) {
            logoBase64 = 'data:image/png;base64,' + fs.readFileSync(logoPath).toString('base64');
        }

        // Create PDF document definition
        const docDefinition = {
            pageSize: 'A4',
            pageMargins: [40, 60, 40, 60],
            content: [
                // Header with logo and title
                {
                    columns: [
                        logoBase64 ? { image: logoBase64, width: 80 } : { text: '', width: 80 },
                        {
                            stack: [
                                { text: 'PURCHASE ORDER', style: 'header', alignment: 'center' },
                                { text: 'Pharmacy Management System', style: 'subheader', alignment: 'center' }
                            ],
                            width: '*'
                        },
                        { text: '', width: 80 } // Balance the layout
                    ],
                    margin: [0, 0, 0, 20]
                },

                // PO Details
                {
                    columns: [
                        {
                            stack: [
                                { text: `PO Number: ${po.po_code || 'N/A'}`, style: 'details' },
                                { text: `Agency: ${po.agency_name || 'N/A'}`, style: 'details' },
                                { text: `Created By: ${po.created_by_name || 'Unknown'}`, style: 'details' }
                            ],
                            width: '50%'
                        },
                        {
                            stack: [
                                { text: `Date: ${new Date(po.created_at).toLocaleDateString('en-GB')}`, style: 'details', alignment: 'right' },
                                { text: `Status: ${po.status}`, style: 'details', alignment: 'right' },
                                { text: `Total: ${totalAmount.toFixed(3)} OMR`, style: 'totalAmount', alignment: 'right' }
                            ],
                            width: '50%'
                        }
                    ],
                    margin: [0, 0, 0, 20]
                },

                // Remarks
                po.remarks ? {
                    text: `Remarks: ${po.remarks}`,
                    style: 'remarks',
                    margin: [0, 0, 0, 15]
                } : {},

                // Items Table
                {
                    table: {
                        headerRows: 1,
                        widths: ['*', 'auto', 'auto', 'auto', 'auto'],
                        body: [
                            // Header
                            [
                                { text: 'Medicine Name', style: 'tableHeader' },
                                { text: 'Quantity', style: 'tableHeader', alignment: 'center' },
                                { text: 'Unit Price', style: 'tableHeader', alignment: 'center' },
                                { text: 'FOC', style: 'tableHeader', alignment: 'center' },
                                { text: 'Subtotal', style: 'tableHeader', alignment: 'right' }
                            ],
                            // Items
                            ...items.map(item => [
                                { text: item.medicine_name, style: 'tableCell' },
                                { text: item.quantity, style: 'tableCell', alignment: 'center' },
                                { text: item.wholesale_price, style: 'tableCell', alignment: 'center' },
                                { text: item.foc_indicator, style: 'tableCell', alignment: 'center' },
                                { text: item.subtotal, style: 'tableCell', alignment: 'right' }
                            ]),
                            // Total row
                            [
                                { text: '', border: [false, false, false, false] },
                                { text: '', border: [false, false, false, false] },
                                { text: '', border: [false, false, false, false] },
                                { text: 'TOTAL:', style: 'totalLabel', alignment: 'right', border: [false, true, false, false] },
                                { text: `${totalAmount.toFixed(3)} OMR`, style: 'totalValue', alignment: 'right', border: [false, true, false, false] }
                            ]
                        ]
                    },
                    layout: {
                        hLineWidth: function (i, node) {
                            return (i === 0 || i === 1 || i === node.table.body.length) ? 1 : 0.5;
                        },
                        vLineWidth: function (i, node) {
                            return 0.5;
                        },
                        hLineColor: function (i, node) {
                            return '#cccccc';
                        },
                        vLineColor: function (i, node) {
                            return '#cccccc';
                        }
                    },
                    margin: [0, 10, 0, 30]
                },

                // Signature section
                {
                    columns: [
                        {
                            stack: [
                                { text: 'Prepared By:', style: 'signatureLabel' },
                                { text: '________________________________', margin: [0, 10, 0, 0] },
                                { text: 'Name & Signature', style: 'signatureText' }
                            ],
                            width: '45%'
                        },
                        { text: '', width: '10%' },
                        {
                            stack: [
                                { text: 'Approved By:', style: 'signatureLabel' },
                                { text: '________________________________', margin: [0, 10, 0, 0] },
                                { text: 'Name & Signature', style: 'signatureText' }
                            ],
                            width: '45%'
                        }
                    ],
                    margin: [0, 20, 0, 0]
                }
            ],
            styles: {
                header: {
                    fontSize: 20,
                    bold: true,
                    color: '#c1a95e'
                },
                subheader: {
                    fontSize: 12,
                    color: '#666666',
                    margin: [0, 5, 0, 0]
                },
                details: {
                    fontSize: 11,
                    margin: [0, 2, 0, 0]
                },
                totalAmount: {
                    fontSize: 12,
                    bold: true,
                    color: '#c1a95e',
                    margin: [0, 2, 0, 0]
                },
                remarks: {
                    fontSize: 10,
                    italics: true,
                    color: '#666666'
                },
                tableHeader: {
                    fontSize: 11,
                    bold: true,
                    fillColor: '#f5f5f5',
                    margin: [5, 8, 5, 8]
                },
                tableCell: {
                    fontSize: 10,
                    margin: [5, 5, 5, 5]
                },
                totalLabel: {
                    fontSize: 11,
                    bold: true,
                    margin: [5, 8, 5, 8]
                },
                totalValue: {
                    fontSize: 11,
                    bold: true,
                    color: '#c1a95e',
                    margin: [5, 8, 5, 8]
                },
                signatureLabel: {
                    fontSize: 10,
                    bold: true,
                    margin: [0, 0, 0, 5]
                },
                signatureText: {
                    fontSize: 9,
                    color: '#666666',
                    margin: [0, 5, 0, 0]
                }
            },
            footer: function(currentPage, pageCount) {
                return {
                    text: `Page ${currentPage} of ${pageCount} | © 2025 Pharmacy Management System | Designed by Pharmacist: MOHAMED HAMID`,
                    alignment: 'center',
                    fontSize: 8,
                    color: '#666666',
                    margin: [40, 0, 40, 0]
                };
            }
        };

        // Generate PDF
        const pdfDoc = printer.createPdfKitDocument(docDefinition);
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=PO_${po.po_code || poId}.pdf`);
        
        pdfDoc.pipe(res);
        pdfDoc.end();

    } catch (error) {
        console.error('Error generating PO PDF:', error);
        res.status(500).json({ error: 'Failed to generate PDF' });
    }
});

// Print GRN as PDF
app.get('/api/goods-receipt-notes/:id/print-pdf', async (req, res) => {
    try {
        const grnId = req.params.id;
        
        // Fetch GRN with details
        const [grnRows] = await popool.promise().query(
            `SELECT grn.*, po.po_code, a.name as agency_name, u.FullName as received_by_name
             FROM goods_receipt_notes grn
             LEFT JOIN purchase_orders po ON grn.po_id = po.po_id
             LEFT JOIN pharma_agencies a ON po.agency_id = a.agency_id
             LEFT JOIN userauthdb.users u ON grn.received_by = u.UserID
             WHERE grn.grn_id = ?`,
            [grnId]
        );
        
        if (!grnRows.length) {
            return res.status(404).json({ error: 'GRN not found' });
        }
        
        const grn = grnRows[0];
        
        // Get GRN items with medicine names
        const [itemRows] = await popool.promise().query(
            `SELECT gi.*, poi.medicine_id, poi.is_foc, m.item_name
             FROM grn_items gi
             LEFT JOIN purchase_order_items poi ON gi.poi_id = poi.poi_id
             LEFT JOIN medicines.medicines_table m ON poi.medicine_id = m.id
             WHERE gi.grn_id = ?`,
            [grnId]
        );

        // Process items
        const items = await Promise.all(itemRows.map(async (item) => {
            const quantity = Number(item.quantity || 0);
            const receivedPrice = Number(item.received_price || 0);
            const receivedSubtotal = Number(item.received_subtotal || 0);
            const is_foc = Boolean(item.is_foc);
            
            // Get medicine name if not available
            let medicineName = item.item_name;
            if (!medicineName && item.medicine_id) {
                try {
                    const [medRows] = await medicinesPool.promise().query(
                        'SELECT item_name FROM medicines_table WHERE id = ?', 
                        [item.medicine_id]
                    );
                    medicineName = medRows.length > 0 ? medRows[0].item_name : 'Unknown Medicine';
                } catch (err) {
                    medicineName = 'Unknown Medicine';
                }
            }
            
            return {
                medicine_name: medicineName || 'Unknown Medicine',
                batch_number: item.batch_number || 'N/A',
                expiry_date: item.expirydate ? new Date(item.expirydate).toLocaleDateString('en-GB') : 'N/A',
                quantity: quantity.toFixed(3),
                received_price: is_foc ? '0.000 (FOC)' : receivedPrice.toFixed(3),
                received_subtotal: is_foc ? '0.000 (FOC)' : receivedSubtotal.toFixed(3),
                is_foc: is_foc
            };
        }));

        const totalAmount = Number(grn.total_amount || 0);
        const focItemsCount = items.filter(item => item.is_foc).length;
        const paidItemsCount = items.length - focItemsCount;

        // Load logo as base64
        const logoPath = path.join(__dirname, 'public/images/logo.png');
        let logoBase64 = '';
        if (fs.existsSync(logoPath)) {
            logoBase64 = 'data:image/png;base64,' + fs.readFileSync(logoPath).toString('base64');
        }

        // Create PDF document definition
        const docDefinition = {
            pageSize: 'A4',
            pageMargins: [40, 60, 40, 60],
            content: [
                // Header with logo and title
                {
                    columns: [
                        logoBase64 ? { image: logoBase64, width: 80 } : { text: '', width: 80 },
                        {
                            stack: [
                                { text: 'GOODS RECEIPT NOTE', style: 'header', alignment: 'center' },
                                { text: 'Pharmacy Management System', style: 'subheader', alignment: 'center' }
                            ],
                            width: '*'
                        },
                        { text: '', width: 80 } // Balance the layout
                    ],
                    margin: [0, 0, 0, 20]
                },

                // GRN Details
                {
                    columns: [
                        {
                            stack: [
                                { text: `GRN Number: ${grn.grn_code || 'N/A'}`, style: 'details' },
                                { text: `Related PO: ${grn.po_code || 'N/A'}`, style: 'details' },
                                { text: `Agency: ${grn.agency_name || 'N/A'}`, style: 'details' },
                                { text: `Received By: ${grn.received_by_name || 'Unknown'}`, style: 'details' }
                            ],
                            width: '50%'
                        },
                        {
                            stack: [
                                { text: `Date: ${new Date(grn.received_at).toLocaleDateString('en-GB')}`, style: 'details', alignment: 'right' },
                                { text: `Time: ${new Date(grn.received_at).toLocaleTimeString('en-GB')}`, style: 'details', alignment: 'right' },
                                { text: `Total Items: ${items.length}`, style: 'details', alignment: 'right' },
                                { text: `Total Value: ${totalAmount.toFixed(3)} OMR`, style: 'totalAmount', alignment: 'right' }
                            ],
                            width: '50%'
                        }
                    ],
                    margin: [0, 0, 0, 20]
                },

                // Summary boxes
                {
                    columns: [
                        {
                            stack: [
                                { text: 'Items Summary', style: 'summaryTitle' },
                                { text: `FOC Items: ${focItemsCount}`, style: 'summaryText', color: '#28a745' },
                                { text: `Paid Items: ${paidItemsCount}`, style: 'summaryText', color: '#007bff' }
                            ],
                            width: '50%',
                            margin: [0, 0, 10, 0]
                        },
                        {
                            stack: [
                                { text: 'Financial Summary', style: 'summaryTitle' },
                                { text: `Total Value: ${totalAmount.toFixed(3)} OMR`, style: 'summaryText', color: '#c1a95e' },
                                { text: `(Excluding FOC items)`, style: 'summaryNote' }
                            ],
                            width: '50%',
                            margin: [10, 0, 0, 0]
                        }
                    ],
                    margin: [0, 0, 0, 20]
                },

                // Remarks
                grn.remarks ? {
                    text: `Remarks: ${grn.remarks}`,
                    style: 'remarks',
                    margin: [0, 0, 0, 15]
                } : {},

                // Items Table
                {
                    table: {
                        headerRows: 1,
                        widths: ['*', 'auto', 'auto', 'auto', 'auto', 'auto'],
                        body: [
                            // Header
                            [
                                { text: 'Medicine Name', style: 'tableHeader' },
                                { text: 'Batch', style: 'tableHeader', alignment: 'center' },
                                { text: 'Expiry', style: 'tableHeader', alignment: 'center' },
                                { text: 'Quantity', style: 'tableHeader', alignment: 'center' },
                                { text: 'Unit Price', style: 'tableHeader', alignment: 'center' },
                                { text: 'Subtotal', style: 'tableHeader', alignment: 'right' }
                            ],
                            // Items
                            ...items.map(item => [
                                { text: item.medicine_name, style: 'tableCell' },
                                { text: item.batch_number, style: 'tableCell', alignment: 'center' },
                                { text: item.expiry_date, style: 'tableCell', alignment: 'center' },
                                { text: item.quantity, style: 'tableCell', alignment: 'center' },
                                { text: item.received_price, style: item.is_foc ? 'tableCellFoc' : 'tableCell', alignment: 'center' },
                                { text: item.received_subtotal, style: item.is_foc ? 'tableCellFoc' : 'tableCell', alignment: 'right' }
                            ]),
                            // Total row
                            [
                                { text: '', border: [false, false, false, false] },
                                { text: '', border: [false, false, false, false] },
                                { text: '', border: [false, false, false, false] },
                                { text: '', border: [false, false, false, false] },
                                { text: 'TOTAL:', style: 'totalLabel', alignment: 'right', border: [false, true, false, false] },
                                { text: `${totalAmount.toFixed(3)} OMR`, style: 'totalValue', alignment: 'right', border: [false, true, false, false] }
                            ]
                        ]
                    },
                    layout: {
                        hLineWidth: function (i, node) {
                            return (i === 0 || i === 1 || i === node.table.body.length) ? 1 : 0.5;
                        },
                        vLineWidth: function (i, node) {
                            return 0.5;
                        },
                        hLineColor: function (i, node) {
                            return '#cccccc';
                        },
                        vLineColor: function (i, node) {
                            return '#cccccc';
                        }
                    },
                    margin: [0, 10, 0, 30]
                },

                // Signature section
                {
                    columns: [
                        {
                            stack: [
                                { text: 'Received By:', style: 'signatureLabel' },
                                { text: '________________________________', margin: [0, 10, 0, 0] },
                                { text: 'Name & Signature', style: 'signatureText' }
                            ],
                            width: '45%'
                        },
                        { text: '', width: '10%' },
                        {
                            stack: [
                                { text: 'Verified By:', style: 'signatureLabel' },
                                { text: '________________________________', margin: [0, 10, 0, 0] },
                                { text: 'Name & Signature', style: 'signatureText' }
                            ],
                            width: '45%'
                        }
                    ],
                    margin: [0, 20, 0, 0]
                }
            ],
            styles: {
                header: {
                    fontSize: 20,
                    bold: true,
                    color: '#c1a95e'
                },
                subheader: {
                    fontSize: 12,
                    color: '#666666',
                    margin: [0, 5, 0, 0]
                },
                details: {
                    fontSize: 11,
                    margin: [0, 2, 0, 0]
                },
                totalAmount: {
                    fontSize: 12,
                    bold: true,
                    color: '#c1a95e',
                    margin: [0, 2, 0, 0]
                },
                summaryTitle: {
                    fontSize: 11,
                    bold: true,
                    margin: [0, 0, 0, 5]
                },
                summaryText: {
                    fontSize: 10,
                    margin: [0, 2, 0, 0]
                },
                summaryNote: {
                    fontSize: 8,
                    color: '#666666',
                    italics: true,
                    margin: [0, 2, 0, 0]
                },
                remarks: {
                    fontSize: 10,
                    italics: true,
                    color: '#666666'
                },
                tableHeader: {
                    fontSize: 11,
                    bold: true,
                    fillColor: '#f5f5f5',
                    margin: [5, 8, 5, 8]
                },
                tableCell: {
                    fontSize: 10,
                    margin: [5, 5, 5, 5]
                },
                tableCellFoc: {
                    fontSize: 10,
                    margin: [5, 5, 5, 5],
                    color: '#28a745'
                },
                totalLabel: {
                    fontSize: 11,
                    bold: true,
                    margin: [5, 8, 5, 8]
                },
                totalValue: {
                    fontSize: 11,
                    bold: true,
                    color: '#c1a95e',
                    margin: [5, 8, 5, 8]
                },
                signatureLabel: {
                    fontSize: 10,
                    bold: true,
                    margin: [0, 0, 0, 5]
                },
                signatureText: {
                    fontSize: 9,
                    color: '#666666',
                    margin: [0, 5, 0, 0]
                }
            },
            footer: function(currentPage, pageCount) {
                return {
                    text: `Page ${currentPage} of ${pageCount} | © 2025 Pharmacy Management System | Designed by Pharmacist: MOHAMED HAMID`,
                    alignment: 'center',
                    fontSize: 8,
                    color: '#666666',
                    margin: [40, 0, 40, 0]
                };
            }
        };

        // Generate PDF
        const pdfDoc = printer.createPdfKitDocument(docDefinition);
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=GRN_${grn.grn_code || grnId}.pdf`);
        
        pdfDoc.pipe(res);
        pdfDoc.end();

    } catch (error) {
        console.error('Error generating GRN PDF:', error);
        res.status(500).json({ error: 'Failed to generate PDF' });
    }
});
// Endpoint to fetch packet sizes for given medicines
app.post('/api/medicines/packet-sizes', (req, res) => {
  const { itemNames } = req.body;
  if (!Array.isArray(itemNames) || itemNames.length === 0) {
    return res.status(400).json({ error: 'No item names provided' });
  }

  const query = `
    SELECT item_name, packet_size
    FROM medicines_table
    WHERE item_name IN (?)
  `;

  medicinesPool.query(query, [itemNames], (err, rows) => {
    if (err) {
      console.error("Error fetching packet sizes:", err);
      return res.status(500).json({ error: 'Failed to fetch packet sizes' });
    }

    const packetSizes = {};
    rows.forEach(row => {
      packetSizes[row.item_name] = parseFloat(row.packet_size);
    });

    res.json({ packetSizes });
  });
});
// Serve user management page
app.get('/user-management', isAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'user-management.html'));
});

  /*port*/
  app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});