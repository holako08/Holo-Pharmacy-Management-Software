// bill-return.js

let bills = []; // Declare bills in a higher scope

document.addEventListener('DOMContentLoaded', () => {
  const userInfoString = sessionStorage.getItem('userInfo');
  if (!userInfoString) {
    window.location.href = 'index.html';
    return;
  }
  try {
    const userInfo = JSON.parse(userInfoString);
    document.getElementById('pharmacist-name').textContent = userInfo.fullName || userInfo.username;
    document.getElementById('job-title').textContent = userInfo.jobTitle || 'Staff';
    document.getElementById('user-photo').src = '/api/user-photo/' + userInfo.userId;
  } catch (error) {
    window.location.href = 'index.html';
  }
});

function logout() {
  window.location.href = 'index.html';
}

function formatDate(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  if (isNaN(d)) return dateString;
  return d.toLocaleDateString('en-GB');
}

function formatTime(timeString) {
  if (!timeString) return '';
  if (timeString.length === 8 && timeString[2] === ':' && timeString[5] === ':') return timeString;
  const d = new Date(timeString);
  if (!isNaN(d)) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return timeString;
}

// Fetch bills within date range
document.getElementById('fetchBillsBtn').onclick = fetchBills;
document.getElementById('returnSelectedBtn').onclick = returnSelectedBills;
document.getElementById('reprintSelectedBtn').onclick = reprintSelectedBills;
document.getElementById('selectAll').onclick = function(e) {
  document.querySelectorAll('.row-select').forEach(cb => cb.checked = e.target.checked);
};

function fetchBills() {
  const from = document.getElementById('billFromDate').value;
  const to = document.getElementById('billToDate').value;
  fetch(`/api/bill-mgmt/fetch?from=${from}&to=${to}&role=user`)
    .then(res => {
      if (!res.ok) {
        if (res.status === 401) window.location.href = 'index.html';
        if (res.status === 403) {
          alert("You do not have permission to view bills.");
          return [];
        }
        throw new Error("Failed to fetch bills");
      }
      return res.json();
    })
    .then(fetchedBills => {
      bills = fetchedBills;
      if (!Array.isArray(bills)) return;
      showBills(bills);
    });
}

function showBills(billsToShow) {
  const tbody = document.querySelector('#billReturnTable tbody');
  tbody.innerHTML = '';
  console.log("Bills to show:", billsToShow); // Debugging log
  billsToShow.forEach(bill => {
    console.log("Processing bill:", bill); // Debugging log
    const row = document.createElement('tr');
    row.innerHTML = `
      <td><input type="checkbox" class="row-select" data-id="${bill.bill_id}"></td>
      <td>${bill.bill_id}</td>
      <td>${bill.patient_name || ''}</td>
      <td>${bill.item_name}</td>
      <td>${bill.quantity}</td>
      <td>${bill.subtotal}</td>
      <td>${bill.batch_number || '-'}</td>
      <td>${formatDate(bill.bill_date)}</td>
      <td>${formatTime(bill.bill_time)}</td>
    `;
    tbody.appendChild(row);
  });
}

function getSelectedBillIds() {
  const selectedCheckboxes = Array.from(document.querySelectorAll('.row-select:checked'));
  const ids = selectedCheckboxes.map(cb => cb.dataset.id);
  console.log("Selected IDs:", ids); // Debugging log
  return ids;
}

// UPDATED FUNCTION
async function reprintSelectedBills() {
  const ids = getSelectedBillIds();
  if (ids.length === 0) {
    return alert("No bills selected to reprint.");
  }

  // Fetch all selected bill *rows*
  const fetchedBillsFiltered = await Promise.all(ids.map(id =>
    fetch(`/api/bill-returns/reprint/${id}`)
    .then(res => res.json())
    .then(data => data.success ? data.bill : null)
  ));
  
  const validBillsForPrint = fetchedBillsFiltered.filter(b => b);
  
  if (!validBillsForPrint.length) {
    return alert("No valid bills could be fetched for reprinting.");
  }

  // --- START MODIFIED LOGIC ---
  
  // 1. Sort to find the main invoice ID (lowest bill_id)
  validBillsForPrint.sort((a, b) => Number(a.bill_id) - Number(b.bill_id));
  const invoiceId = validBillsForPrint[0].bill_id;
  
  // 2. Get common data from the first bill row
  const firstBill = validBillsForPrint[0];
  
  // 3. Create the 'items' array, fetching full details for each
  const items = [];
  for (const bill of validBillsForPrint) {
      try {
          // Fetch full medicine details to get arabic_name and packet_size
          const res = await fetch(`/api/pos/medicines/get-by-name/${encodeURIComponent(bill.item_name)}`);
          if (!res.ok) throw new Error(`Medicine not found: ${bill.item_name}`);
          const medDetails = await res.json();
          
          // --- FIX: Calculate subtotal for each item ---
          const packet_size = medDetails.packet_size || 1;
          const quantity = parseFloat(bill.quantity) || 0;
          const price = parseFloat(bill.price) || 0;
          const subtotal = (quantity / packet_size) * price;
          // --- END FIX ---

          items.push({
              item_name: bill.item_name,
              arabic_name: medDetails.arabic_name || '', // From fetched details
              quantity: quantity,
              price: price,
              packet_size: packet_size, // From fetched details
              subtotal: subtotal // <-- ADDED subtotal
          });
      } catch (err) {
          console.error(err);
          // Add item even if details fail, to show *something*
          items.push({
              item_name: bill.item_name,
              arabic_name: '(details fetch failed)',
              quantity: parseFloat(bill.quantity) || 0,
              price: parseFloat(bill.price) || 0,
              packet_size: 1,
              subtotal: 0 // Set 0 if fetch fails
          });
      }
  }
  
  // 4. Create the billPayload
  const billPayload = {
      patient_name: firstBill.patient_name || "",
      patient_phone: firstBill.patient_phone || "",
      payment_method: firstBill.payment_method || "",
      card_invoice_number: firstBill.card_invoice_number || "",
      ecommerce_invoice_number: firstBill["E-commerce Invoice Number"] || "",
      items: items // The new array we just built (now with subtotals)
  };

  // 5. Call the tax invoice print function (which is now in this same file)
  // NOTE: We pass 0 for discount, as the original discount isn't stored on the bill row.
  await printInvoiceFrontend(billPayload, 0, invoiceId); // <-- CHANGED to call the new function

  // --- END MODIFIED LOGIC ---
}

// Send bill return request
function returnBills(billIds) {
  console.log("returnBills: IDs to process:", billIds, "Length:", billIds.length); // Debugging log
  if (billIds.length === 0) {
    console.log("returnBills: Alerting 'No bills selected.' because length is 0."); // Debugging log
    return alert("No bills selected to return."); // More specific alert
  }
  if (!confirm("Are you sure you want to return these bill(s)? This will reverse the sale and add stock back.")) return; // More descriptive confirmation

  // The server-side /api/bill-returns/return will now handle fetching bill details,
  // fetching packet size, calculating the correct return quantity, and updating stock.
  fetch('/api/bill-returns/return', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bill_ids: billIds }) // Sending just the bill IDs
  }).then(res => res.json()).then(data => {
    console.log("returnBills: API response:", data); // Debugging log
    if (data.success) {
      alert("Bills returned successfully! " + (data.message || '')); // Success alert with server message
      fetchBills(); // Refresh the bills list
    } else {
      alert(data.message || "Return failed.");
    }
  }).catch(error => {
    console.error("returnBills: Fetch error:", error); // Debugging log
    alert("An error occurred during return request: " + error.message);
  });
}


function returnSelectedBills() {
  const ids = getSelectedBillIds();
  if (ids.length === 0) return alert("No bills selected.");
  returnBills(ids);
}


//
// --- REMOVED FUNCTIONS ---
// `getBillTotals` and `printTaxInvoice` have been removed.
//

// --- NEW FUNCTION (Copied from pos.js) ---
/**
 * Generates an HTML invoice from a template and opens it in a new window for printing.
 */
async function printInvoiceFrontend(billPayload, discountPercent, billId) {
    try {
      // 1. Fetch the HTML template
      const res = await fetch('invoice-template.html');
      if (!res.ok) throw new Error('Could not load invoice-template.html');
      let templateHtml = await res.text();
  
      // 2. Get User & Branch Info from Session
      const userInfoString = sessionStorage.getItem('userInfo');
      const userInfo = userInfoString ? JSON.parse(userInfoString) : {};
      const pharmacist = userInfo.fullName || 'N/A';
      const branch = userInfo.branch || 'Main';
  
      // 3. Get Bill Info from Payload
      const { patient_name, patient_phone, payment_method, items } = billPayload;
  
      // 4. Get Date & Time
      const now = new Date();
      const printDate = now.toLocaleDateString('en-GB'); // dd/mm/yyyy
      const printTime = now.toLocaleTimeString('en-US', { hour12: true });
  
      // 5. Calculate Totals (now uses item.subtotal)
      const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
      const discountVal = parseFloat(discountPercent) || 0;
      const discountAmount = (subtotal * discountVal) / 100;
      const total = subtotal - discountAmount;
  
      // 6. Build Items HTML Table Rows
      const itemsHtml = items.map(item => {
          // Calculate unit price based on subtotal and quantity
          const quantity = parseFloat(item.quantity) || 0;
          const size = parseFloat(item.packet_size) || 1;
          const units = (quantity / size);
          const unitPrice = (units > 0) ? (item.subtotal / units) : (parseFloat(item.price) || 0);

          return `
            <tr>
              <td class="ar-font">${item.arabic_name || item.item_name} / <span class="ltr">${item.item_name}</span></td>
              <td class="center">${item.quantity}</td>
              <td class="ltr center">${unitPrice.toFixed(3)}</td>
              <td class="ltr center">${item.subtotal.toFixed(3)}</td>
            </tr>
          `
      }).join('');
  
      // 7. Define Pharmacy Details (You can customize these)
      const pharmacyData = {
          Ghubrah: {
              en: "Al Salam Pharmacy",
              ar: "صيدلية السلام",
              addressEn: "Ghubrah, Muscat",
              addressAr: "الغبرة، مسقط",
              phone: "72699414"
          },
          Azaiba: {
              en: "Al Salam Pharmacy",
              ar: "صيدلية السلام",
              addressEn: "Azaiba, Muscat",
              addressAr: "العذيبة، مسقط",
              phone: "72699414"
          }
      };
      
      const currentPharmacy = pharmacyData[branch] || pharmacyData['Ghubrah']; // Default to Ghubrah

      // 8. Replace all placeholders in the template
      templateHtml = templateHtml.replace('{{logoImage}}', '<img src="/images/logo.png" alt="Logo" style="width:100%;">');
      
      // Pharmacy Info
      templateHtml = templateHtml.replace(/{{pharmacyNameEn}}/g, currentPharmacy.en);
      templateHtml = templateHtml.replace(/{{pharmacyNameAr}}/g, currentPharmacy.ar);
      templateHtml = templateHtml.replace(/{{addressEn}}/g, currentPharmacy.addressEn);
      templateHtml = templateHtml.replace(/{{addressAr}}/g, currentPharmacy.addressAr);
      templateHtml = templateHtml.replace(/{{phone}}/g, currentPharmacy.phone);
      templateHtml = templateHtml.replace(/{{branch}}/g, branch);
      
      // Titles
      templateHtml = templateHtml.replace(/{{titleAr}}/g, 'فاتورة ضريبية');
      templateHtml = templateHtml.replace(/{{titleEn}}/g, 'Tax Invoice');

      // Meta Info
      templateHtml = templateHtml.replace(/{{billId}}/g, billId);
      templateHtml = templateHtml.replace(/{{patientName}}/g, patient_name || 'N/A');
      templateHtml = templateHtml.replace(/{{patientPhone}}/g, patient_phone || 'N/A');
      templateHtml = templateHtml.replace(/{{date}}/g, printDate);
      templateHtml = templateHtml.replace(/{{time}}/g, printTime);
      templateHtml = templateHtml.replace(/{{pharmacist}}/g, pharmacist);
      
      // Items
      templateHtml = templateHtml.replace('{{itemsHtml}}', itemsHtml);
      
      // Totals
      templateHtml = templateHtml.replace('{{subtotal}}', subtotal.toFixed(3));
      templateHtml = templateHtml.replace('{{discountPercent}}', discountVal.toFixed(2));
      templateHtml = templateHtml.replace('{{discount}}', discountAmount.toFixed(3));
      templateHtml = templateHtml.replace('{{total}}', total.toFixed(3));

      // Footer
      templateHtml = templateHtml.replace(/{{paymentMethod}}/g, payment_method || 'N/A');

      // 9. Open a new window and print
      const printWindow = window.open('', '_blank', 'width=800,height=600');
      printWindow.document.open();
      printWindow.document.write(templateHtml);
      printWindow.document.close();
      
      // Give the browser a moment to render the content
      setTimeout(() => {
          printWindow.print();
          printWindow.onafterprint = () => printWindow.close();
      }, 250);

    } catch (err) {
      console.error('Error during frontend print:', err);
      alert('Failed to generate invoice for printing. ' + err.message);
    }
}