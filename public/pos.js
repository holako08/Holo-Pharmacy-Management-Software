// Global cart variable
let cart = [];
let focusedIndex = -1;
let selectedMedicineForAssignment = null; // For barcode assignment modal

document.addEventListener("DOMContentLoaded", () => {
  // --- Element Cache ---
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
  const paymentRadios = document.querySelectorAll('input[name="payment-method"]');
  const cardInvoice = document.getElementById("card-invoice");
  const ecommerceInvoice = document.getElementById("ecommerce-invoice");
  const insuranceBtn = document.getElementById("insurance-details-btn");
  const patientNameSuggestions = document.getElementById("patient-name-suggestions");
  const patientPhoneSuggestions = document.getElementById("patient-phone-suggestions");
  
  // --- Assign Barcode Modal ---
  const assignModal = document.getElementById('assign-barcode-modal');
  const closeModalBtn = document.getElementById('close-button11');
  const unassignedBarcodeSpan = document.getElementById('unassigned-barcode-value');
  const assignSearchInput = document.getElementById('assign-medicine-search');
  const assignSearchResultsDiv = document.getElementById('assign-search-results11');
  const selectedMedicineSpan = document.getElementById('selected-medicine-display');
  const confirmAssignBtn = document.getElementById('confirm-assign-barcode-btn');
  
  // --- Interaction Modal ---
  const checkInteractionsBtn = document.getElementById('check-interactions-btn');
  const interactionModal = document.getElementById('interaction-modal');
  const closeInteractionModalBtn = document.getElementById('close-interaction-modal');
  const interactionItemsList = document.getElementById('interaction-items-list');
  const interactionReportContent = document.getElementById('interaction-report-content');

  let barcodeBuffer = "";
  let barcodeTimeout;

  // ===================================================================
  // === EVENT LISTENERS & SHORTCUTS
  // ===================================================================

  // --- Global Shortcuts ---
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
      setTimeout(focusLastQtyInput, 10);
    }
    if (e.key === "F4") {
      e.preventDefault();
      cashGiven.focus();
    }
    if (e.key === "Delete" && document.activeElement.tagName !== 'INPUT') {
      e.preventDefault();
      if (confirm("Are you sure you want to clear the cart?")) {
        clearCart();
      }
    }
  });

  // --- Barcode/Search Input Listeners ---
  medicineInput.addEventListener("keydown", function (e) {
    if (
      (e.key.length === 1 && !e.ctrlKey && !e.altKey) ||
      e.key === "Enter"
    ) {
      if (e.key === "Enter") {
        if (focusedIndex > -1) {
            // If dropdown is open, handle selection
            const items = searchResults.querySelectorAll("div");
            if (items[focusedIndex]) {
                items[focusedIndex].click();
                e.preventDefault();
                return;
            }
        }
        
        if (/^\d{6,14}$/.test(barcodeBuffer)) {
          // If it looks like a barcode, process it
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
        }, 200);
      }
    } else if (e.key === "ArrowDown") {
      const items = searchResults.querySelectorAll("div");
      if (items.length === 0) return;
      focusedIndex = (focusedIndex + 1) % items.length;
      highlightDropdownItem(items);
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      const items = searchResults.querySelectorAll("div");
      if (items.length === 0) return;
      focusedIndex = (focusedIndex - 1 + items.length) % items.length;
      highlightDropdownItem(items);
      e.preventDefault();
    }
  });

  // Live search
  medicineInput.addEventListener("input", async () => {
    const term = medicineInput.value.trim();
    if (term === "") {
        searchResults.innerHTML = "";
        return;
    }
    // Only search if not a barcode number
    if (/^\d{6,14}$/.test(term)) {
        searchResults.innerHTML = "";
        return;
    }
    
    const res = await fetch(`/api/pos/medicines/search-with-batches?q=${encodeURIComponent(term)}`);
    const items = await res.json();
    renderSearchDropdown(items);
  });

  // --- Main Action Buttons ---
  saveBillBtn.addEventListener("click", () => {
    if (confirm("Are you sure you want to save this bill?")) {
      saveBill();
    }
  });
  
  clearCartBtn.addEventListener("click", () => {
    if (confirm("Are you sure you want to clear the cart?")) {
      clearCart();
    }
  });
  
  // MODIFIED: Print button now calls the new frontend print function
  printBillBtn.addEventListener("click", async () => {
      if (cart.length === 0) {
        alert("No items in the cart to print.");
        return;
      }
    
      const payload = getBillPayload();
      const discount = discountInput.value;
      const tempBillId = `PREVIEW-${Date.now()}`;
      
      try {
        printBillBtn.disabled = true;
        printBillBtn.textContent = "Generating...";
        // Call the new, robust print function
        await printInvoiceFrontend(payload, discount, tempBillId);
      } catch (printErr) {
        console.error("Tax Invoice print failed:", printErr);
        alert("The tax invoice print failed: " + printErr.message);
      } finally {
        printBillBtn.disabled = false;
        printBillBtn.textContent = "Print Bill";
      }
  });

  // --- Other Listeners ---
  discountInput.addEventListener("input", updateTotal);
  cashGiven.addEventListener("input", updateTotal);
  addFrequentBtn.addEventListener("click", addFrequentBill);
  checkInteractionsBtn.addEventListener('click', checkInteractions);
  
  paymentRadios.forEach(radio => {
    radio.addEventListener("change", (e) => {
      focusPaymentInput(e.target.value);
    });
  });

  patientName.addEventListener("input", () => suggest(patientName, patientNameSuggestions, 'suggest-patient-name'));
  patientPhone.addEventListener("input", () => suggest(patientPhone, patientPhoneSuggestions, 'suggest-patient-phone'));

  // ===================================================================
  // === CORE BILLING & CART FUNCTIONS
  // ===================================================================

  /**
   * Saves the current cart as a bill to the server.
   */
  async function saveBill() {
    const payload = getBillPayload();
    const discount = discountInput.value;
    
    if (!payload.items || payload.items.length === 0) {
        alert("Cart is empty.");
        return;
    }

    const hasCrossBranchItem = cart.some((item) => item.isCrossBranch);
    if (hasCrossBranchItem) {
      const confirmed = confirm(
        "WARNING: This bill contains items from another branch's inventory.\n\n" +
        "Proceeding will deduct stock from that branch.\n\n" +
        "Are you sure you want to continue?"
      );
      if (!confirmed) return;
    }

    try {
      saveBillBtn.disabled = true;
      saveBillBtn.textContent = "Saving...";
      
      const res = await fetch("/api/pos/bills/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        alert("Bill saved successfully.");
        
        // Call the new robust print function
        await printInvoiceFrontend(payload, discount, data.firstBillId);
        
        clearCart();
      } else {
        alert("Failed to save bill: " + data.message);
      }
    } catch (err) {
      console.error("Save bill error:", err);
      alert("An error occurred while saving the bill.");
    } finally {
        saveBillBtn.disabled = false;
        saveBillBtn.textContent = "Save Bill (F2)";
    }
  }
  
  /**
   * Gathers all bill information into a single payload object.
   */
  function getBillPayload() {
      const patient_name = patientName.value.trim();
      const patient_phone = patientPhone.value.trim();
      const payment_method = document.querySelector('input[name="payment-method"]:checked')?.value || "";
      const card_invoice_number = cardInvoice.value || "";
      const ecommerce_invoice_number = ecommerceInvoice.value || "";
    
      const items = cart.map((item) => ({
        item_name: item.item_name,
        arabic_name: item.arabic_name || "",
        quantity: item.quantity,
        price: item.price,
        subtotal: calcSubtotal(item), // Subtotal per item
        packet_size: item.packet_size || 1,
        batch_id: item.batch_id || null,
        batch_number: item.batch_number || null,
        expiry: item.expiry || null,
      }));
    
      return {
        patient_name,
        patient_phone,
        payment_method,
        card_invoice_number,
        ecommerce_invoice_number,
        items,
      };
  }
  
  /**
   * Fetches full item details and adds the item to the cart.
   */
  async function addItemToCart(medicineId, batchId, itemBranch) {
    try {
        let medRes = await fetch(`/api/pos/medicines/get-by-id/${medicineId}`);
        if (!medRes.ok) throw new Error('Medicine not found');
        let med = await medRes.json();
        
        let batch = null;
        if (batchId && batchId !== "null" && batchId !== "") {
          let batchRes = await fetch(`/api/batches/${batchId}`);
          if (batchRes.ok) {
              batch = await batchRes.json();
          }
        }
        
        // --- MODIFIED LOGIC ---
        // Find the index of the existing item in the cart
        const existingItemIndex = cart.findIndex(
          item => item.id == medicineId && item.batch_id == (batch ? batch.batch_id : null)
        );
        
        if (existingItemIndex > -1) {
            // If item already exists, increment its quantity by 1
            cart[existingItemIndex].quantity += 1;
            
            // Re-render the cart to show the new quantity and subtotal
            renderCart(); 
            
            // Focus the quantity input of the item that was just updated
            const itemRow = cartBody.querySelector(`tr[data-index="${existingItemIndex}"]`);
            if (itemRow) {
                const qtyInput = itemRow.querySelector('.qty-input');
                if (qtyInput) {
                    qtyInput.focus();
                    qtyInput.select();
                    return; // Stop execution
                }
            }
            // Fallback if row isn't found for some reason
            focusLastQtyInput();
            return;
        }
        // --- END MODIFIED LOGIC ---
        
        // Check for cross-branch sale
        const userInfoString = sessionStorage.getItem('userInfo');
        const userInfo = userInfoString ? JSON.parse(userInfoString) : {};
        const userBranch = userInfo.branch;
        let isCrossBranch = false;
        if (itemBranch && userBranch && itemBranch.toLowerCase() !== userBranch.toLowerCase()) {
            isCrossBranch = true;
        }
        
        cart.push({
          ...med,
          batch_id: batch ? batch.batch_id : null,
          batch_number: batch ? batch.batch_number : null,
          expiry: batch ? batch.expiry : med.expiry || null,
          stock: batch ? batch.quantity : med.stock || null,
          quantity: 1, // Default quantity to 1 instead of 0
          isCrossBranch: isCrossBranch
        });
        
        renderCart();
        focusLastQtyInput();
        
    } catch(err) {
        console.error("Error adding item to cart:", err);
        alert("Could not add item to cart. " + err.message);
    }
  }
  
  /**
   * Renders the cart table from the global 'cart' array.
   */
  function renderCart() {
    cartBody.innerHTML = cart.map((item, index) => `
      <tr class="${item.isCrossBranch ? 'cross-branch-warning' : ''}" data-index="${index}">
        <td>
          ${item.item_name} ${item.isCrossBranch ? '<strong>(Cross-Branch)</strong>' : ''}<br>
          <small style="font-style: italic; color: #555;">${item.arabic_name || ''}</small><br>
          <small style="font-weight: bold; color: #0056b3;">${item.supplier || ''}</small>
        </td>
        <td>${item.price}</td>
        <td><input type="number" step="0.001" data-index="${index}" class="qty-input" value="${item.quantity}" /></td>
        <td style="color: ${isNearExpiry(item.expiry) ? 'red' : 'inherit'}; font-weight: ${isNearExpiry(item.expiry) ? 'bold' : 'normal'}">${formatDate(item.expiry)}</td>
        <td style="color: ${item.stock < 5 ? 'red' : 'inherit'}; font-weight: ${item.stock < 5 ? 'bold' : 'normal'}">${item.stock}</td>
        <td>${item.packet_size || 1}</td>
        <td class="item-subtotal">${calcSubtotal(item).toFixed(3)}</td>
        <td><button class="btn-remove-item" data-index="${index}">Remove</button></td>
      </tr>
    `).join("");
    
    // Add event listeners efficiently
    cartBody.querySelectorAll(".qty-input").forEach(input => {
      input.addEventListener("input", handleQtyChange);
      input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
              e.preventDefault();
              medicineInput.focus();
          }
      });
    });
    
    cartBody.querySelectorAll(".btn-remove-item").forEach(button => {
        button.addEventListener("click", () => {
            removeFromCart(button.dataset.index);
        });
    });
    
    updateTotal();
    updateMedicineInfo();
  }
  
  /**
   * Updates cart item quantity and subtotal on input.
   */
  function handleQtyChange(e) {
      const index = e.target.dataset.index;
      cart[index].quantity = parseFloat(e.target.value) || 0;
      const row = e.target.closest("tr");
      const subtotalCell = row.querySelector(".item-subtotal");
      subtotalCell.textContent = calcSubtotal(cart[index]).toFixed(3);
      updateTotal();
      updateMedicineInfo();
  }
  
  /**
   * Removes an item from the cart by index.
   */
  function removeFromCart(index) {
    cart.splice(index, 1);
    renderCart();
  }

  /**
   * Clears the entire cart and resets patient info.
   */
  function clearCart() {
    cart = [];
    cartBody.innerHTML = "";
    updateTotal();
    updateMedicineInfo();
    patientName.value = "";
    patientPhone.value = "";
    cashGiven.value = "";
    cardInvoice.value = "";
    ecommerceInvoice.value = "";
    discountInput.value = "";
    const cashRadio = document.querySelector('input[name="payment-method"][value="cash"]');
    if (cashRadio) cashRadio.checked = true;
    focusPaymentInput("cash");
    medicineInput.focus();
  }

  /**
   * Calculates the subtotal for a single cart item.
   */
  function calcSubtotal(item) {
    const size = parseFloat(item.packet_size) || 1;
    const quantity = parseFloat(item.quantity) || 0;
    const price = parseFloat(item.price) || 0;
    return (quantity / size) * price;
  }

  /**
   * Recalculates and displays the grand total, discount, and change.
   */
  function updateTotal() {
    let total = cart.reduce((sum, item) => sum + calcSubtotal(item), 0);
    const discount = parseFloat(discountInput.value) || 0;
    total = total - (total * discount / 100);
    grandTotal.textContent = `Total: ${total.toFixed(3)}`;
    const given = parseFloat(cashGiven.value) || 0;
    const change = given - total;
    cashChange.textContent = `Change: ${change.toFixed(3)}`;
  }
  
  // ===================================================================
  // === NEW FRONTEND-ONLY PRINTING FUNCTION
  // ===================================================================
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
  
      // 5. Calculate Totals
      const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
      const discountVal = parseFloat(discountPercent) || 0;
      const discountAmount = (subtotal * discountVal) / 100;
      const total = subtotal - discountAmount;
  
      // 6. Build Items HTML Table Rows
      const itemsHtml = items.map(item => `
        <tr>
          <td class="ar-font">${item.arabic_name || item.item_name} / <span class="ltr">${item.item_name}</span></td>
          <td class="center">${item.quantity}</td>
          <td class="ltr center">${(item.subtotal / (item.quantity / (item.packet_size || 1))).toFixed(3)}</td>
          <td class="ltr center">${item.subtotal.toFixed(3)}</td>
        </tr>
      `).join('');
  
      // 7. Define Pharmacy Details (You can customize these)
      // These are hardcoded as an example; you could fetch them or store them in session
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
      // This uses a logo from your images folder as a placeholder
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

  // ===================================================================
  // === SEARCH & DROPDOWN FUNCTIONS
  // ===================================================================

  function renderSearchDropdown(items) {
    if (!Array.isArray(items)) {
      console.error("Expected array from search, got:", items);
      return;
    }
    focusedIndex = -1;
     searchResults.innerHTML = items
      .map(item => `
        <div data-id="${item.id}" data-batch-id="${item.batch_id || ''}" data-barcode="${item.barcode}" data-branch="${item.branch || ''}">
          ${item.item_name}
          ${item.batch_number ? `<span class="batch-label">[Batch: ${item.batch_number}]</span>` : ''}
          ${item.branch ? `<span class="branch-label">(${item.branch})</span>` : ''}
          <span class="expiry-label">${item.expiry ? `Exp: ${item.expiry.split("T")[0]}` : ''}</span>
          <span class="stock-label">Stock: ${item.stock ?? ''}</span>
          <strong>${parseFloat(item.price).toFixed(3)}</strong>
        </div>
      `)
      .join("");
      
    searchResults.querySelectorAll("div").forEach(div => {
      div.addEventListener("click", () => {
        // Pass the branch data from the div's dataset
        addItemToCart(div.dataset.id, div.dataset.batchId, div.dataset.branch);
        searchResults.innerHTML = "";
        medicineInput.value = "";
        medicineInput.focus();
      });
    });
  }
  
  function highlightDropdownItem(items) {
    items.forEach((item, idx) => {
      if (idx === focusedIndex) {
        item.style.backgroundColor = 'goldenrod';
        item.style.color = 'white';
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.style.backgroundColor = '';
        item.style.color = '';
      }
    });
  }

  // ===================================================================
  // === BARCODE FUNCTIONS
  // ===================================================================

  /**
   * Processes a barcode string: adds to cart or opens assign modal.
   */
  async function processBarcode(code) {
    try {
      const res = await fetch(`/api/pos/medicines/get-by-barcode/${code}`);

      if (res.status === 404) {
        // Barcode not found: open the assignment modal
        medicineInput.value = ""; // Clear the main search input
        showAssignBarcodeModal(code);
        return; // Stop execution
      }

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Barcode lookup failed');
      }

      const med = await res.json();
      
      // Use the consistent addItemToCart function
      await addItemToCart(med.id, med.batch_id, med.branch);

    } catch (err) {
      console.error("Error processing barcode:", err);
      alert(`Error processing barcode: ${err.message}`);
    }
  }

  // --- Assign Barcode Modal Logic ---
  function showAssignBarcodeModal(barcode) {
    unassignedBarcodeSpan.textContent = barcode;
    selectedMedicineForAssignment = null; // Reset selection
    selectedMedicineSpan.textContent = 'None';
    assignSearchInput.value = '';
    assignSearchResultsDiv.innerHTML = '';
    confirmAssignBtn.disabled = true;
    assignModal.style.display = 'block';
    assignSearchInput.focus();
  }

  function hideAssignBarcodeModal() {
    assignModal.style.display = 'none';
    medicineInput.focus();
  }

  closeModalBtn.addEventListener('click', hideAssignBarcodeModal);
  
  assignSearchInput.addEventListener('input', async () => {
    const term = assignSearchInput.value.trim();
    confirmAssignBtn.disabled = true;
    selectedMedicineSpan.textContent = 'Searching...';

    if (term.length < 2) {
      assignSearchResultsDiv.innerHTML = '';
      selectedMedicineSpan.textContent = 'None';
      return;
    }

    const res = await fetch(`/api/pos/medicines/search?q=${encodeURIComponent(term)}`);
    const items = await res.json();
    
    assignSearchResultsDiv.innerHTML = items.map(item => `
      <div data-id="${item.id}" data-name="${item.item_name}">
        ${item.item_name} (Barcode: ${item.barcode || 'N/A'})
      </div>
    `).join('');

    assignSearchResultsDiv.querySelectorAll('div').forEach(div => {
      div.addEventListener('click', () => {
        selectedMedicineForAssignment = {
          id: div.dataset.id,
          name: div.dataset.name
        };
        selectedMedicineSpan.textContent = selectedMedicineForAssignment.name;
        assignSearchResultsDiv.innerHTML = '';
        assignSearchInput.value = '';
        confirmAssignBtn.disabled = false;
      });
    });
  });

  confirmAssignBtn.addEventListener('click', async () => {
    if (!selectedMedicineForAssignment) {
      alert('Please select a medicine first.');
      return;
    }

    const barcode = unassignedBarcodeSpan.textContent;
    const medicineId = selectedMedicineForAssignment.id;

    const formData = new FormData();
    formData.append('id', medicineId);
    formData.append('barcode', barcode);

    try {
      const res = await fetch('/update-medicine-pos', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to update medicine.');
      }
      
      alert(`Barcode ${barcode} successfully assigned to ${selectedMedicineForAssignment.name}.`);
      hideAssignBarcodeModal();
      // Automatically process the barcode again to add the item to the cart
      await processBarcode(barcode);

    } catch (err) {
      console.error('Error assigning barcode:', err);
      alert(`Error: ${err.message}`);
    }
  });

  // ===================================================================
  // === DRUG INTERACTION FUNCTIONS
  // ===================================================================

  async function checkInteractions() {
      if (cart.length < 2) {
        alert('You must have at least two items in the cart to check for interactions.');
        return;
      }
    
      const allIngredients = cart.flatMap(item => [
        item.active_name_1,
        item.active_name_2,
        item.active_name_3
      ]);
      
      const uniqueIngredients = [...new Set(
        allIngredients.filter(ing => ing && ing.trim() !== '')
      )];
    
      if (uniqueIngredients.length < 2) {
         alert('Could not find at least two unique active ingredients in the cart to check.');
         return;
      }
    
      interactionItemsList.textContent = uniqueIngredients.join(', ');
      interactionReportContent.innerHTML = 'Checking... Please wait.';
      interactionModal.style.display = 'block';
      checkInteractionsBtn.disabled = true;
      checkInteractionsBtn.textContent = 'Checking...';
    
      try {
        const res = await fetch('/api/pos/check-interactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ activeIngredients: uniqueIngredients }) 
        });
    
        const data = await res.json();
    
        if (data.success) {
          const report = data.interaction_report;
          if (report.trim().startsWith('<table')) {
            interactionReportContent.innerHTML = report;
          } else {
            interactionReportContent.textContent = report;
          }
        } else {
          interactionReportContent.textContent = `Error: ${data.error}`;
        }
    
      } catch (err) {
        console.error('Interaction check fetch error:', err);
        interactionReportContent.textContent = 'Error: Could not connect to the server.';
      } finally {
        checkInteractionsBtn.disabled = false;
        checkInteractionsBtn.textContent = 'Check Interactions';
      }
  }
  
  closeInteractionModalBtn.addEventListener('click', () => {
    interactionModal.style.display = 'none';
  });

  // ===================================================================
  // === HELPER & UI FUNCTIONS
  // ===================================================================

  /**
   * Fetches and displays info for items in the cart.
   */
  function updateMedicineInfo() {
    infoDisplay.innerHTML = "";
    const shownIds = new Set();
    cart.forEach(item => {
      if (shownIds.has(item.id)) return;
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
  
  /**
   * Loads and displays the list of frequent bills.
   */
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

  /**
   * Adds items from a frequent bill to the cart.
   */
  function loadFrequentBillItems(items) {
    try {
      (Array.isArray(items) ? items : JSON.parse(items)).forEach(async (entry) => {
        try {
            const res = await fetch(`/api/pos/medicines/get-by-name/${encodeURIComponent(entry.item_name)}`);
            if (!res.ok) return;
            
            const med = await res.json();
            if (!med || cart.find(i => i.item_name === med.item_name)) return;
            
            // Find the nearest expiry batch if available
            let batch = null;
            if (med.batches && med.batches.length > 0) {
                batch = med.batches[0]; // Batches are pre-sorted by expiry
            }
            
            cart.push({ 
                ...med,
                batch_id: batch ? batch.batch_id : null,
                batch_number: batch ? batch.batch_number : null,
                expiry: batch ? batch.expiry : med.expiry || null,
                stock: batch ? batch.quantity : med.stock || null,
                quantity: entry.quantity 
            });
            renderCart();
            focusLastQtyInput();
        } catch(err) {
            console.warn(`Could not load frequent item ${entry.item_name}:`, err);
        }
      });
    } catch (err) {
      console.error("Invalid frequent bill data:", err);
    }
  }

  /**
   * Saves the current cart as a new frequent bill.
   */
  async function addFrequentBill() {
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
  }

  /**
   * Fetches and renders patient name/phone suggestions.
   */
  async function suggest(inputEl, containerEl, endpoint) {
    const q = inputEl.value.trim();
    if (q === "") {
        containerEl.innerHTML = "";
        return;
    }
    try {
        const res = await fetch(`/api/pos/bills/${endpoint}?q=${encodeURIComponent(q)}`);
        const suggestions = await res.json();
        
        containerEl.innerHTML = suggestions.map(v => `<div>${v}</div>`).join("");
        containerEl.querySelectorAll("div").forEach(div => {
          div.addEventListener("click", () => {
            inputEl.value = div.textContent;
            containerEl.innerHTML = "";
          });
        });
    } catch(err) {
        console.error("Suggestion fetch error:", err);
    }
  }
  
  /**
   * Highlights the relevant payment input field.
   */
  function focusPaymentInput(method) {
    [cashGiven, cardInvoice, ecommerceInvoice].forEach(el => {
      if (el) el.classList.remove("input-highlight");
    });
    switch (method) {
      case "cash":
        if (cashGiven) {
          cashGiven.value = "";
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
        }
        break;
    }
  }
  
  /**
   * Focuses the last quantity input in the cart.
   */
  function focusLastQtyInput() {
    const qtyInputs = document.querySelectorAll(".qty-input");
    if (qtyInputs.length > 0) {
      const last = qtyInputs[qtyInputs.length - 1];
      last.focus();
      last.select();
    }
  }
  
  // --- Misc Helpers ---
  function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    if (isNaN(date)) return dateStr;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function isNearExpiry(dateStr) {
    if (!dateStr) return false;
    const expiry = new Date(dateStr);
    if (isNaN(expiry)) return false;
    const now = new Date();
    const threeMonthsLater = new Date(now.setMonth(now.getMonth() + 3));
    return expiry <= threeMonthsLater;
  }
  
  // Close modals on outside click
  window.addEventListener('click', (event) => {
    if (event.target == assignModal) {
      hideAssignBarcodeModal();
    }
    if (event.target == interactionModal) {
      interactionModal.style.display = 'none';
    }
  });

  // --- Initial Load ---
  loadFrequentBills();
  
  // Export Cart to Excel
  document.getElementById("export-cart-excel").addEventListener("click", async () => {
    if (!cart.length) {
      alert("Cart is empty.");
      return;
    }
    const exportRows = cart.map(item => ({
      item_name: item.item_name,
      price: item.price,
      quantity: item.quantity,
      expiry: item.expiry,
      stock: item.stock,
      packet_size: item.packet_size,
      subtotal: calcSubtotal(item),
    }));
    
    try {
        const res = await fetch("/api/pos/export-cart-excel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cart: exportRows }),
        });
        
        if (!res.ok) throw new Error("Export failed");
        
        const disposition = res.headers.get('Content-Disposition');
        let filename = "cart.xlsx";
        if (disposition && disposition.indexOf("filename=") !== -1) {
          filename = disposition.split("filename=")[1].replace(/"/g, "");
        }
        
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
      
    } catch(err) {
        alert("Failed to export cart to Excel.");
        console.error("Excel export error:", err);
    }
  });
  
}); // END DOMContentLoaded