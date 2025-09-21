document.addEventListener("DOMContentLoaded", () => {
  const patientName = document.getElementById("patient-name");
  const patientPhone = document.getElementById("patient-phone");
  const medicineInput = document.getElementById("medicine-input");
  const discountInput = document.getElementById("discount");
  const searchResults = document.getElementById("search-results");
  const cartBody = document.getElementById("cart-body");
  const grandTotal = document.getElementById("grand-total");
  const cashGiven = document.getElementById("cash-given");
  const cashChange = document.getElementById("cash-change");
  const saveBillBtn = document.getElementById("save-bill");
  const clearCartBtn = document.getElementById("clear-cart");
  const addFrequentBtn = document.getElementById("add-frequent");
  const frequentBillList = document.getElementById("frequent-bill-list");
  const infoDisplay = document.getElementById("info-display");
  const printBillBtn = document.getElementById("print-bill");

  // Barcode scan detection using medicine search field
let barcodeBuffer = "";
let barcodeTimeout;
 let cart = [];
  let focusedIndex = -1;

medicineInput.addEventListener("keydown", function (e) {
  // Only handle printable keys and Enter (ignore arrows, ctrl, etc)
  if (
    (e.key.length === 1 && !e.ctrlKey && !e.altKey) ||
    e.key === "Enter"
  ) {
    if (e.key === "Enter") {
      // Barcode: all digits, 6-14 chars (customize as needed)
      if (/^\d{6,14}$/.test(barcodeBuffer)) {
        processBarcode(barcodeBuffer);
        medicineInput.value = "";
        barcodeBuffer = "";
        e.preventDefault();
        return;
      }
      barcodeBuffer = "";
    } else {
      barcodeBuffer += e.key;
      clearTimeout(barcodeTimeout);
      barcodeTimeout = setTimeout(() => {
        barcodeBuffer = "";
      }, 200); // 200ms: adjust if needed
    }
  }

  

 

  // Shortcuts
  document.addEventListener("keydown", (e) => {
    if (e.key === "F1") {
      e.preventDefault();
      medicineInput.focus();
    }
  
    if (e.key === "F2") {
  e.preventDefault();
  if (confirm("Are you sure you want to save this bill?")) {
    saveBill();
  }
}
  
    if (e.key === "F3") {
      e.preventDefault();
      // Delay to ensure any pending render is completed
      setTimeout(focusLastQtyInput, 10);
    }
  
    if (e.key === "F4") {
      e.preventDefault();
      cashGiven.focus();
    }
  
    if (e.key === "Delete") {
  if (confirm("Are you sure you want to clear the cart?")) {
    clearCart();
  }
}
  });
  

  // Live search
 medicineInput.addEventListener("input", async () => {
  const term = medicineInput.value.trim();
  if (term === "") return (searchResults.innerHTML = "");
  const res = await fetch(`/api/pos/medicines/search-with-batches?q=${encodeURIComponent(term)}`);
  const items = await res.json();
  renderSearchDropdown(items);
});


  medicineInput.addEventListener("keydown", (e) => {
    const items = searchResults.querySelectorAll("div");
    if (e.key === "ArrowDown") {
      if (items.length === 0) return;
      focusedIndex = (focusedIndex + 1) % items.length;
      highlightDropdownItem(items);
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      if (items.length === 0) return;
      focusedIndex = (focusedIndex - 1 + items.length) % items.length;
      highlightDropdownItem(items);
      e.preventDefault();
    } else if (e.key === "Enter" && items[focusedIndex]) {
      items[focusedIndex].click();
      e.preventDefault();
    }
  });
  
  // This function handles the dropdown arrow highlight
  function highlightDropdownItem(items) {
    items.forEach((item, idx) => {
      if (idx === focusedIndex) {
        item.style.backgroundColor = 'goldenrod';
        item.style.color = 'white';
      } else {
        item.style.backgroundColor = '';
        item.style.color = '';
      }
    });
  }
  

 function renderSearchDropdown(items) {
  if (!Array.isArray(items)) {
    console.error("Expected array from search, got:", items);
    return;
  }

  focusedIndex = -1;
  searchResults.innerHTML = items
    .map(item => `
      <div data-id="${item.id}" data-batch-id="${item.batch_id || ''}" data-barcode="${item.barcode}">
        ${item.item_name}
        ${item.batch_number ? `<span class="batch-label">[Batch: ${item.batch_number}]</span>` : ''}
        <span class="expiry-label">${item.expiry ? `Exp: ${item.expiry.split("T")[0]}` : ''}</span>
        <span class="stock-label">Stock: ${item.stock ?? ''}</span>
        <strong>${parseFloat(item.price).toFixed(3)}</strong>
      </div>
    `)
    .join("");

  searchResults.querySelectorAll("div").forEach(div => {
    div.addEventListener("click", () => {
      addItemToCart(div.dataset.id, div.dataset.batchId);
      searchResults.innerHTML = "";
      medicineInput.value = "";
    });
  });
}

// End of DOMContentLoaded event listener
});

async function addItemToCart(medicineId, batchId) {
    // Always fetch the medicine by medicineId (never batchId!)
    let medRes = await fetch(`/api/pos/medicines/get-by-id/${medicineId}`);
    let med = await medRes.json();

    // If a batch is selected, fetch batch info
    let batch = null;
    if (batchId && batchId !== "null" && batchId !== "") {
        let batchRes = await fetch(`/api/batches/${batchId}`);
        batch = await batchRes.json();
    }

    // Prevent adding duplicate medicine+batch to cart
    const exists = cart.find(
        item => item.id == medicineId && item.batch_id == (batch ? batch.batch_id : null)
    );
    if (exists) return;

    // Add to cart: combine medicine info and batch info
    cart.push({
        ...med,
        batch_id: batch ? batch.batch_id : null,
        batch_number: batch ? batch.batch_number : null,
        expiry: batch ? batch.expiry : med.expiry || null,
        stock: batch ? batch.quantity : med.stock || null,
        quantity: 0 // default, user will edit
    });

    renderCart();
}

async function processBarcode(code) {
  try {
    const res = await fetch(`/api/pos/medicines/get-by-barcode/${code}`);
    const med = await res.json();
    if (!med) return alert("No medicine found for this barcode");

    if (cart.find(i => i.item_name === med.item_name)) return;

    cart.push({ ...med, quantity: 0 });
    renderCart();
    focusLastQtyInput();
  } catch (err) {
    alert("Error processing barcode.");
  }
}

   function formatDate(dateStr) {
  const date = new Date(dateStr);
  if (isNaN(date)) return dateStr;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

 function renderCart() {
  cartBody.innerHTML = cart.map((item, index) => `
    <tr>
      <td>${item.item_name}</td>
      <td>${item.price}</td>
      <td><input type="number" step="0.001" data-index="${index}" class="qty-input" value="${item.quantity}" /></td>
      <td style="color: ${isNearExpiry(item.expiry) ? 'red' : 'inherit'}; font-weight: ${isNearExpiry(item.expiry) ? 'bold' : 'normal'}">${formatDate(item.expiry)}</td>
      <td style="color: ${item.stock < 5 ? 'red' : 'inherit'}; font-weight: ${item.stock < 5 ? 'bold' : 'normal'}">${item.stock}</td>
      <td>${item.packet_size || 1}</td>
      <td>${calcSubtotal(item).toFixed(3)}</td>
      <td><button onclick="removeFromCart(${index})">Remove</button></td>
    </tr>
  `).join("");

  // Attach input listeners AFTER render (no renderCart call here)
  cartBody.querySelectorAll(".qty-input").forEach(input => {
    input.addEventListener("input", () => {
      const i = input.dataset.index;
      cart[i].quantity = parseFloat(input.value) || 0;

      // Update this row's subtotal immediately
      const row = input.closest("tr");
      const subtotalCell = row.querySelector("td:nth-child(7)");
      subtotalCell.textContent = calcSubtotal(cart[i]).toFixed(3);

      updateTotal();
      updateMedicineInfo();
    });
  });

  updateTotal();
  updateMedicineInfo();
} 
  

  function calcSubtotal(item) {
    const size = item.packet_size || 1;
    return (item.quantity / size) * item.price;
  }

  function updateTotal() {
    let total = cart.reduce((sum, item) => sum + calcSubtotal(item), 0);
    const discount = parseFloat(discountInput.value) || 0;
    total = total - (total * discount / 100);
    grandTotal.textContent = `Total: ${total.toFixed(3)}`;

    const given = parseFloat(cashGiven.value) || 0;
    const change = given - total;
    cashChange.textContent = `Change: ${change.toFixed(3)}`;
  }

  discountInput.addEventListener("input", updateTotal);
  cashGiven.addEventListener("input", updateTotal);

  window.removeFromCart = (index) => {
    cart.splice(index, 1);
    renderCart();
  };

  function clearCart() {
  cart = [];
  cartBody.innerHTML = "";
  updateTotal();
  updateMedicineInfo();

  // Also clear all patient/payment fields just like after saving bill
  if (patientName) patientName.value = "";
  if (patientPhone) patientPhone.value = "";
  if (cashGiven) cashGiven.value = "";
  if (cardInvoice) cardInvoice.value = "";
  if (ecommerceInvoice) ecommerceInvoice.value = "";

  // Reset payment method to cash
  const cashRadio = document.querySelector('input[name="payment-method"][value="cash"]');
  if (cashRadio) cashRadio.checked = true;
  focusPaymentInput("cash");
}


  function focusLastQtyInput() {
    const qtyInputs = document.querySelectorAll(".qty-input");
    if (qtyInputs.length > 0) {
      const last = qtyInputs[qtyInputs.length - 1];
      last.focus();
      last.select();
    }
  }

  
  async function saveBill() {
  const patient_name = patientName.value.trim();
  const patient_phone = patientPhone.value.trim();
  const payment_method = document.querySelector('input[name="payment-method"]:checked')?.value || '';
  const card_invoice_number = document.getElementById("card-invoice")?.value || '';
  const ecommerce_invoice_number = document.getElementById("ecommerce-invoice")?.value || '';

  const items = cart.map(item => ({
    item_name: item.item_name,
    quantity: item.quantity,
    price: item.price,
    subtotal: calcSubtotal(item)
  }));

  const userInfoString = sessionStorage.getItem('userInfo');
  const userInfo = userInfoString ? JSON.parse(userInfoString) : {};
  const user = userInfo.fullName || 'Unknown User';

  const payload = {
    patient_name,
    patient_phone,
    payment_method,
    card_invoice_number,
    ecommerce_invoice_number,
    items,
    user
  };

  try {
    const res = await fetch("/api/pos/bills/save", {
      method: "POST",
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.success) {
      alert("Bill saved successfully.");
      clearCart();

      // Clear patient info fields as well
      patientName.value = "";
      patientPhone.value = "";

      // Clear payment inputs after saving bill
      if (cashGiven) cashGiven.value = "";
      if (cardInvoice) cardInvoice.value = "";
      if (ecommerceInvoice) ecommerceInvoice.value = "";

      // Optionally reset payment method to cash
      const cashRadio = document.querySelector('input[name="payment-method"][value="cash"]');
      if (cashRadio) cashRadio.checked = true;
      focusPaymentInput("cash");
    } else {
      alert("Failed to save bill.");
    }
  } catch (err) {
    console.error("Save bill error:", err);
    alert("An error occurred while saving the bill.");
  }
}
  
   // --- Payment Method Autofocus/Highlight ---
  const paymentRadios = document.querySelectorAll('input[name="payment-method"]');
  const cardInvoice = document.getElementById("card-invoice");
  const ecommerceInvoice = document.getElementById("ecommerce-invoice");
  const insuranceBtn = document.getElementById("insurance-details-btn");

  function focusPaymentInput(method) {
    // Remove custom highlight if any (you can style with .input-highlight if desired)
    [cashGiven, cardInvoice, ecommerceInvoice].forEach(el => {
      if (el) el.classList.remove("input-highlight");
    });

    switch (method) {
      case "cash":
        if (cashGiven) {
          cashGiven.value = ""; // Optionally clear when selected
          cashGiven.focus();
          cashGiven.classList.add("input-highlight");
        }
        break;
      case "card":
        if (cardInvoice) {
          cardInvoice.value = "";
          cardInvoice.focus();
          cardInvoice.classList.add("input-highlight");
        }
        break;
      case "ecommerce":
        if (ecommerceInvoice) {
          ecommerceInvoice.value = "";
          ecommerceInvoice.focus();
          ecommerceInvoice.classList.add("input-highlight");
        }
        break;
      case "insurance":
        if (insuranceBtn) {
          insuranceBtn.focus();
          // Optionally: visually highlight the button if you want
        }
        break;
    }
  }

  paymentRadios.forEach(radio => {
    radio.addEventListener("change", (e) => {
      focusPaymentInput(e.target.value);
    });
  });
  

  // Load Frequent Bills
  function loadFrequentBills() {
    fetch('/api/pos/frequent-bills/get-all')
      .then(res => res.json())
      .then(bills => {
        if (!Array.isArray(bills)) {
          console.error("Expected array from /frequent-bills/get-all, got:", bills);
          return;
        }
  
        frequentBillList.innerHTML = "";
        bills.forEach(bill => {
          const btn = document.createElement("button");
          btn.textContent = bill.bill_name;
          btn.onclick = () => loadFrequentBillItems(bill.items);
  
          const del = document.createElement("span");
          del.textContent = "❌";
          del.className = "remove";
          del.onclick = async (e) => {
            e.stopPropagation();
            if (confirm("Delete this frequent bill?")) {
              await fetch(`/api/pos/frequent-bills/delete/${bill.id}`, { method: "DELETE" });
              loadFrequentBills();
            }
          };
  
          btn.appendChild(del);
          frequentBillList.appendChild(btn);
        });
      })
      .catch(err => {
        console.error("Failed to load frequent bills:", err);
      });
  }
  
  function loadFrequentBillItems(items) {
    try {
      (Array.isArray(items) ? items : JSON.parse(items)).forEach(async (entry) => {
        const res = await fetch(`/api/pos/medicines/get-by-name/${encodeURIComponent(entry.item_name)}`);
        const med = await res.json();
  
        if (!med || cart.find(i => i.item_name === med.item_name)) return;
  
        cart.push({ ...med, quantity: entry.quantity });
        renderCart();
        focusLastQtyInput();
      });
    } catch (err) {
      console.error("Invalid frequent bill data:", err);
    }
  }
   
  // Add Frequent Bill
  addFrequentBtn.addEventListener("click", async () => {
    if (cart.length === 0) {
      alert("Cart is empty. Add items before saving as a frequent bill.");
      return;
    }

    const billName = prompt("Enter a name for this frequent bill:");
    if (!billName || billName.trim() === "") {
      alert("Frequent bill name is required.");
      return;
    }

    const itemsToSave = cart.map(item => ({
      item_name: item.item_name,
      quantity: item.quantity
    }));

    const res = await fetch("/api/pos/frequent-bills/add", {
      method: "POST",
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bill_name: billName.trim(),
        items: itemsToSave
      })
    });

    const data = await res.json();
    if (data.success) {
      alert("Frequent bill saved successfully.");
      loadFrequentBills();
    } else {
      alert("Failed to save frequent bill.");
    }
  });

  // Patient Name/Phone Autocomplete
  const patientNameSuggestions = document.getElementById("patient-name-suggestions");
  const patientPhoneSuggestions = document.getElementById("patient-phone-suggestions");

  patientName.addEventListener("input", async () => {
    const q = patientName.value.trim();
    if (q === "") return (patientNameSuggestions.innerHTML = "");
    const res = await fetch(`/api/pos/bills/suggest-patient-name?q=${encodeURIComponent(q)}`);
    const names = await res.json();
    renderSuggestions(names, patientName, patientNameSuggestions);
  });

  patientPhone.addEventListener("input", async () => {
    const q = patientPhone.value.trim();
    if (q === "") return (patientPhoneSuggestions.innerHTML = "");
    const res = await fetch(`/api/pos/bills/suggest-patient-phone?q=${encodeURIComponent(q)}`);
    const phones = await res.json();
    renderSuggestions(phones, patientPhone, patientPhoneSuggestions);
  });

  function renderSuggestions(list, inputEl, containerEl) {
    containerEl.innerHTML = list.map(v => `<div>${v}</div>`).join("");
    containerEl.querySelectorAll("div").forEach(div => {
      div.addEventListener("click", () => {
        inputEl.value = div.textContent;
        containerEl.innerHTML = "";
      });
    });
  }

  // Medicine Info Display
  function updateMedicineInfo() {
    infoDisplay.innerHTML = "";
  
    // Use a Set to track unique item IDs already displayed
    const shownIds = new Set();
  
    cart.forEach(item => {
      if (shownIds.has(item.id)) return; // Skip duplicate items
      shownIds.add(item.id);
  
      const section = document.createElement("div");
      section.innerHTML = `
        <h4>${item.item_name}</h4>
        <p><span class="highlight">Cross Selling:</span> ${item.cross_selling || "—"}</p>
        <p><span class="highlight">Side Effects:</span> ${item.significant_side_effects || "—"}</p>
        <p><span class="highlight">Interactions:</span> ${item.significant_interactions || "—"}</p>
        <p><strong>Uses:</strong> ${item.uses || "—"}</p>
        <p><strong>Dosage:</strong> ${item.dosage || "—"}</p>
        <p><strong>Location:</strong> ${item.location || "—"}</p>
        ${item.item_pic ? `<img src="/api/pos/medicines/photo/${item.id}" alt="${item.item_name}" style="max-width:100px;" />` : ""}
        <hr/>
      `;
      infoDisplay.appendChild(section);
    });
  }
  

  // Print Bill
  printBillBtn.addEventListener("click", () => {
  if (cart.length === 0) return alert("No items in the cart to print.");

  const patient_name = patientName.value.trim();
  const patient_phone = patientPhone.value.trim();
  const payment_method = document.querySelector('input[name="payment-method"]:checked').value;
  const card_invoice_number = document.getElementById("card-invoice").value;
  const ecommerce_invoice_number = document.getElementById("ecommerce-invoice").value;
  const discount = parseFloat(discountInput.value) || 0;

  const items = cart.map(item => ({
    item_name: item.item_name,
    quantity: item.quantity,
    price: item.price,
    subtotal: calcSubtotal(item)
  }));

  const total = items.reduce((sum, i) => sum + i.subtotal, 0);
  const final_total = total - (total * discount / 100);

  const html = `
    <style>
      body { font-family: Arial; padding: 30px; }
      h2 { text-align: center; }
      table { width: 100%; border-collapse: collapse; margin-top: 20px; }
      th, td { border: 1px solid #ccc; padding: 10px; text-align: center; }
      .total { font-size: 1.2em; font-weight: bold; margin-top: 20px; text-align: right; }
      .footer { text-align: center; margin-top: 30px; font-style: italic; }
    </style>
    <h2>This is for the purposes of knowing the prices - NOT AN INVOICE</h2>
    <p><strong>Patient Name:</strong> ${patient_name}</p>
    <p><strong>Phone:</strong> ${patient_phone}</p>
    <p><strong>Payment Method:</strong> ${payment_method}</p>
    ${card_invoice_number ? `<p><strong>Card Invoice:</strong> ${card_invoice_number}</p>` : ""}
    ${ecommerce_invoice_number ? `<p><strong>E-commerce Invoice:</strong> ${ecommerce_invoice_number}</p>` : ""}
    <table>
      <thead>
        <tr><th>Item</th><th>Qty</th><th>Price</th><th>Subtotal</th></tr>
      </thead>
      <tbody>
        ${items.map(item => `
          <tr>
            <td>${item.item_name}</td>
            <td>${item.quantity}</td>
            <td>${item.price}</td>
            <td>${item.subtotal.toFixed(3)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
    <p class="total">Discount: ${discount}%</p>
    <p class="total">Grand Total: ${final_total.toFixed(3)}</p>
    <div class="footer">Thanks for shopping with us. Get well soon!</div>
  `;

  // Use a print window to keep the main page untouched!
  const win = window.open('', '', 'width=800,height=600');
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
  // Optionally auto-close after print:
  win.onafterprint = () => win.close();
});


  async function processBarcode(code) {
    try {
      const res = await fetch(`/api/pos/medicines/get-by-barcode/${code}`);
      const med = await res.json();
      if (!med) return alert("No medicine found for this barcode");

      if (cart.find(i => i.item_name === med.item_name)) return;

      cart.push({ ...med, quantity: 0 });
      renderCart();
      focusLastQtyInput();
    } catch (err) {
      alert("Error processing barcode.");
    }
  }

  function isNearExpiry(dateStr) {
    const expiry = new Date(dateStr);
    const now = new Date();
    const threeMonthsLater = new Date(now.setMonth(now.getMonth() + 3));
    return expiry <= threeMonthsLater;
  }

  // Initial Load
  loadFrequentBills();
  document.getElementById("save-bill").addEventListener("click", () => {
    const f2Event = new KeyboardEvent("keydown", {
      key: "F2",
      code: "F2",
      keyCode: 113,
      which: 113,
      bubbles: true
    });
    document.dispatchEvent(f2Event);
  });
  
  clearCartBtn.addEventListener("click", () => {
  if (confirm("Are you sure you want to clear the cart?")) {
    clearCart();
  }
});

document.getElementById("export-cart-excel").addEventListener("click", async () => {
  if (!cart.length) {
    alert("Cart is empty.");
    return;
  }

  // Build rows to send (same columns as your cart table)
  const exportRows = cart.map(item => ({
    item_name: item.item_name,
    price: item.price,
    quantity: item.quantity,
    expiry: item.expiry,
    stock: item.stock,
    packet_size: item.packet_size,
    subtotal: calcSubtotal(item),
  }));

  // Send cart to backend and trigger Excel download
  fetch("/api/pos/export-cart-excel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cart: exportRows }),
  })
    .then(async (res) => {
      if (!res.ok) throw new Error("Export failed");
      // Get filename from header if available
      const disposition = res.headers.get('Content-Disposition');
      let filename = "cart.xlsx";
      if (disposition && disposition.indexOf("filename=") !== -1) {
        filename = disposition.split("filename=")[1].replace(/"/g, "");
      }
      const blob = await res.blob();
      // Download file
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    })
    .catch(() => alert("Failed to export cart to Excel."));
});

});
