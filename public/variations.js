document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.getElementById("searchInput");
  const dropdown = document.getElementById("searchDropdown");
  const filterTableInput = document.getElementById("filterTableInput");
  const tableBody = document.getElementById("selectedMedicinesBody");
  const footer = document.getElementById("variationTotalsFooter");

  let currentTableItems = []; // Stores { element: rowElement, itemName: string, visible: boolean }

  // Function to load user information from session storage
  const loadUser = () => {
    const user = JSON.parse(sessionStorage.getItem("userInfo") || "{}");
    if (!user.username) {
      window.location.href = "index.html"; // Redirect if no user is logged in
      return;
    }
    document.getElementById("pharmacist-name").textContent = user.fullName || user.username;
    document.getElementById("job-title").textContent = user.jobTitle || "Staff";
    const userPhoto = document.getElementById('user-photo');
    if (userPhoto && user.userId) {
      userPhoto.onerror = () => userPhoto.src = 'images/default-profile.png';
      userPhoto.src = `/api/user-photo/${user.userId}`;
    }
  };

  // Logout button functionality
  document.getElementById("logout-btn").onclick = () => {
    sessionStorage.clear();
    window.location.href = "index.html";
  };

  // Search input event listener for adding new medicines
  searchInput.addEventListener("input", async () => {
    const term = searchInput.value.trim();
    dropdown.innerHTML = ""; // Clear previous dropdown items
    if (term.length < 2) {
      dropdown.style.display = "none";
      return;
    }

    try {
      // Use the new endpoint that searches with batches
      const res = await fetch(`/api/pos/medicines/search-with-batches?q=${encodeURIComponent(term)}`);
      const data = await res.json();

      if (data.length > 0) {
        dropdown.style.display = "block";
        data.forEach(item => {
          const div = document.createElement("div");
          // Display item name, price, batch number, and stock
          div.textContent = `${item.item_name} - ${item.price} OMR (Batch: ${item.batch_number || 'N/A'}, Stock: ${item.stock || 0})`;
          div.classList.add('dropdown-item'); // Add class for styling
          div.onclick = async () => {
            // When an item is selected from the dropdown, add it to the table
            addItem({
              id: item.id, // Medicine ID
              item_name: item.item_name,
              price: item.price,
              barcode: item.barcode,
              batch_id: item.batch_id, // Batch ID
              batch_number: item.batch_number,
              expiry: item.expiry,
              system_qty: item.stock // Use the stock from the batch search
            });
            dropdown.innerHTML = "";
            dropdown.style.display = "none";
            searchInput.value = "";
          };
          dropdown.appendChild(div);
        });
      } else {
        dropdown.style.display = "none";
      }
    } catch (error) {
      console.error("Error fetching medicines with batches:", error);
      dropdown.style.display = "none";
    }
  });

  // Hide dropdown when clicking outside
  document.addEventListener("click", (event) => {
    if (!searchInput.contains(event.target) && !dropdown.contains(event.target)) {
      dropdown.style.display = "none";
    }
  });

  // Function to add an item to the variations table
  const addItem = (item) => {
    // Check if item already exists in the table (by item_name and batch_number if available)
    const existingRow = Array.from(tableBody.rows).find(row => {
      const rowItemName = row.cells[0].textContent;
      const rowBatchNumber = row.dataset.batchNumber; // Assuming batch number is stored in dataset
      return rowItemName === item.item_name && (item.batch_number ? rowBatchNumber === item.batch_number : true);
    });

    if (existingRow) {
      showCustomModal("Duplicate Item", `"${item.item_name}" (Batch: ${item.batch_number || 'N/A'}) is already in the table.`);
      return;
    }

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${item.item_name}</td>
      <td>${item.price}</td>
      <td><input type="number" class="phyQty" value="0" min="0"></td>
      <td><input type="number" class="sysQty" value="${item.system_qty || 0}" min="0"></td> <td class="variationResult">no variation</td>
      <td>
        <button class="delBtn">Delete</button>
        ${item.id ? `<button class="saveBtn">Save</button>` : ''}
      </td>
    `;
    row.dataset.id = item.id; // Store medicine ID
    row.dataset.barcode = item.barcode;
    row.dataset.price = item.price;
    row.dataset.variation = 0;
    row.dataset.itemName = item.item_name;
    row.dataset.batchId = item.batch_id || ''; // Store batch ID
    row.dataset.batchNumber = item.batch_number || ''; // Store batch number
    row.dataset.expiry = item.expiry || ''; // Store expiry

    tableBody.appendChild(row);
    updateVariationEvents(row);
    updateFooter();

    currentTableItems.push({ element: row, itemName: item.item_name, visible: true });
  };

  // Update event listeners and calculate variation for a given row
  const updateVariationEvents = (row) => {
    const phy = row.querySelector(".phyQty");
    const sys = row.querySelector(".sysQty"); // Now sysQty is also editable
    const result = row.querySelector(".variationResult");

    const calc = () => {
      const diff = parseInt(phy.value || 0) - parseInt(sys.value || 0);
      row.dataset.variation = diff;
      result.classList.remove("variation-more", "variation-less", "variation-none");
      if (diff > 0) {
        result.textContent = `${diff} more physically`;
        result.classList.add("variation-more");
      } else if (diff < 0) {
        result.textContent = `${Math.abs(diff)} less physically`;
        result.classList.add("variation-less");
      } else {
        result.textContent = "no variation";
        result.classList.add("variation-none");
      }
      updateFooter();
    };

    phy.oninput = calc;
    sys.oninput = calc; // Add event listener for sysQty input
    calc(); // Calculate initial variation

    row.querySelector(".delBtn").onclick = () => {
      const id = row.dataset.id;
      // Check if the row has an ID (meaning it's from the database)
      if (id && id !== 'null') { // Check for 'null' string in case it's set that way
        showCustomModal("Delete Confirmation", "Delete this saved variation?", async (confirmed) => {
          if (confirmed) {
            try {
              const res = await fetch(`/api/delete-variation-rw52x/${id}`, { method: "DELETE" });
              const result = await res.json();
              if (result.affectedRows) {
                row.remove();
                currentTableItems = currentTableItems.filter(item => item.element !== row);
                updateFooter();
                showCustomModal("Success", "Variation deleted successfully!");
              } else {
                showCustomModal("Error", "Failed to delete variation from database.");
              }
            } catch (error) {
              console.error("Error deleting variation:", error);
              showCustomModal("Error", "Failed to delete variation due to network or server error.");
            }
          }
        }, true);
      } else {
        // If no ID, it's a new unsaved row, just remove from UI
        showCustomModal("Delete Row", "Are you sure you want to remove this row?", (confirmed) => {
          if (confirmed) {
            row.remove();
            currentTableItems = currentTableItems.filter(item => item.element !== row);
            updateFooter();
            showCustomModal("Success", "Row removed successfully!");
          }
        }, true);
      }
    };


    // Save button handler for existing (id) variations
    const saveBtn = row.querySelector('.saveBtn');
    if (saveBtn) {
      saveBtn.onclick = async () => {
        const phyQty = parseInt(row.querySelector('.phyQty').value);
        const sysQty = parseInt(row.querySelector('.sysQty').value); // Get current value
        const newVariation = phyQty - sysQty;
        const variationId = row.dataset.id;

        try {
          const patchRes = await fetch(`/api/update-variation-rw52x/${variationId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              physical_qty: phyQty,
              system_qty: sysQty, // Send updated system_qty
              variation: newVariation
            })
          });
          const patchResult = await patchRes.json();
          if (patchResult.success) {
            // Update the row's dataset and UI after successful save
            row.dataset.variation = newVariation;
            const resultCell = row.querySelector('.variationResult');
            resultCell.classList.remove("variation-more", "variation-less", "variation-none");
            if (newVariation > 0) {
              resultCell.textContent = `${newVariation} more physically`;
              resultCell.classList.add("variation-more");
            } else if (newVariation < 0) {
              resultCell.textContent = `${Math.abs(newVariation)} less physically`;
              resultCell.classList.add("variation-less");
            } else {
              resultCell.textContent = "no variation";
              resultCell.classList.add("variation-none");
            }
            updateFooter();
            showCustomModal("Success", "Variation updated successfully!");
          } else {
            showCustomModal("Error", "Failed to update variation.");
          }
        } catch (error) {
          console.error("Error updating variation:", error);
          showCustomModal("Error", "Failed to update variation due to network or server error.");
        }
      };
    }
  };

  // Update footer totals based on visible table items
  const updateFooter = () => {
    let moreCount = 0;
    let lessCount = 0;
    let moreValue = 0;
    let lessValue = 0;

    currentTableItems.filter(item => item.visible).forEach(item => {
      const row = item.element;
      const variation = parseInt(row.dataset.variation || 0);
      const price = parseFloat(row.dataset.price || 0);

      if (variation > 0) {
        moreCount += variation;
        moreValue += variation * price;
      } else if (variation < 0) {
        lessCount += Math.abs(variation);
        lessValue += Math.abs(variation * price);
      }
    });

    footer.innerHTML = `
      <tr id="unique_total_row">
        <td colspan="6" class="total-summary-cell">
          <strong>Total:</strong> 
          ${moreCount > 0 ? `<span class="variation-more">${moreCount} more physically (+${moreValue.toFixed(2)} OMR)</span>` : ""}
          ${lessCount > 0 ? ` ${lessCount > 0 && moreCount > 0 ? " | " : ""} <span class="variation-less">${lessCount} less physically (-${lessValue.toFixed(2)} OMR)</span>` : ""}
          ${moreCount + lessCount === 0 ? "<span class='variation-none'>No variations</span>" : ""}
        </td>
      </tr>
    `;
  };

  // Ignore button: Clears all items from the table
  document.getElementById("ignoreButton").onclick = () => {
    showCustomModal("Clear Table", "Are you sure you want to clear all items from the table? Unsaved changes will be lost.", (confirmed) => {
      if (confirmed) {
        tableBody.innerHTML = "";
        footer.innerHTML = "";
        currentTableItems = []; // Clear all items
        showCustomModal("Success", "Table cleared successfully.");
      }
    }, true);
  };

  // Save All button: Saves all current variations in the table to the database
  document.getElementById("saveAllButton").onclick = async () => {
    const user = JSON.parse(sessionStorage.getItem("userInfo") || "{}");
    if (currentTableItems.length === 0) {
      showCustomModal("No Data", "There are no items in the table to save.");
      return;
    }

    const dataToSave = currentTableItems.map(item => {
      const row = item.element;
      return {
        item_name: row.dataset.itemName,
        price: parseFloat(row.dataset.price),
        physical_qty: parseInt(row.querySelector(".phyQty").value),
        system_qty: parseInt(row.querySelector(".sysQty").value),
        variation: parseInt(row.dataset.variation || 0),
        barcode: row.dataset.barcode,
        batch_id: row.dataset.batchId || null,
        batch_number: row.dataset.batchNumber || null,
        expiry: row.dataset.expiry || null,
        recorded_by: user.username
      };
    });

    try {
      const res = await fetch("/api/save-variations-ky12z", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dataToSave)
      });

      const result = await res.json();
      if (result.message) {
        showCustomModal("Success", "Variations saved successfully!");
        // Optionally clear table after saving all
        tableBody.innerHTML = "";
        footer.innerHTML = "";
        currentTableItems = [];
      } else {
        showCustomModal("Error", "Failed to save variations.");
      }
    } catch (error) {
      console.error("Error saving variations:", error);
      showCustomModal("Error", "Failed to save variations due to network or server error.");
    }
  };

  // Download Excel button: Exports current table data to an Excel file
  document.getElementById("downloadButton").onclick = () => {
    if (currentTableItems.filter(item => item.visible).length === 0) {
      showCustomModal("No Data", "There is no data in the table to download.");
      return;
    }

    const wb = XLSX.utils.book_new();
    const rows = [["Item Name", "Price", "Physical Qty", "System Qty", "Variation", "Batch Number", "Expiry Date"]];

    currentTableItems.filter(item => item.visible).forEach(item => {
      const row = item.element;
      rows.push([
        row.cells[0].textContent,
        row.cells[1].textContent,
        row.querySelector(".phyQty").value,
        row.querySelector(".sysQty").value,
        row.querySelector(".variationResult").textContent,
        row.dataset.batchNumber || 'N/A',
        row.dataset.expiry ? new Date(row.dataset.expiry).toLocaleDateString() : 'N/A'
      ]);
    });

    const footerRow = document.querySelector("#variationTotalsFooter tr");
    if (footerRow) {
      const totalText = footerRow.innerText.trim();
      rows.push([]); // Empty row for spacing
      rows.push(["", "", "", "", "", "Totals:", totalText]); // Add totals to the last row
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Variations");
    XLSX.writeFile(wb, "Stock_Variations.xlsx");
  };

  // Fetch Variations button: Fetches saved variations from the database
  document.getElementById("fetchVariationsButton").onclick = async () => {
    const start = document.getElementById("startDate").value;
    const end = document.getElementById("endDate").value;
    if (!start || !end) {
      showCustomModal("Warning", "Please select a date range.");
      return;
    }

    try {
      const res = await fetch("/api/fetch-variations-dt98q", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: start, endDate: end })
      });

      const data = await res.json();
      console.log("Fetched variations:", data);

      tableBody.innerHTML = "";
      currentTableItems = []; // Clear items before adding new ones

      if (data.length === 0) {
        tableBody.innerHTML = "<tr><td colspan='6' class='no-data-message'>No variations found for this range.</td></tr>";
        footer.innerHTML = "";
        return;
      }

      // Fetch current system quantities for all fetched items concurrently
      const itemsWithCurrentStockPromises = data.map(async (item) => {
        try {
          // Fetch current stock by medicine ID (preferred) or name
          let stockRes;
          // Prioritize fetching by item.medicine_id if available, otherwise fallback to item_name
          if (item.medicine_id) { // Assuming item.medicine_id is now part of the fetched variation data
            stockRes = await fetch(`/api/pos/medicines/get-by-id/${item.medicine_id}`);
          } else if (item.item_name) {
            stockRes = await fetch(`/api/pos/medicines/get-by-name/${encodeURIComponent(item.item_name)}`);
          } else {
            console.warn(`Cannot fetch current stock for item with no ID or name:`, item);
            return { ...item, current_system_qty: 0 };
          }
          
          const stockData = await stockRes.json();
          let currentSystemStock = 0;

          if (stockData && stockData.batches && stockData.batches.length > 0) {
            // If batches exist, sum quantities from all batches
            currentSystemStock = stockData.batches.reduce((sum, batch) => sum + batch.quantity, 0);
          } else if (stockData && stockData.stock !== undefined) {
            // Fallback to main stock if no batches or batches array is empty
            currentSystemStock = stockData.stock;
          }

          return { ...item, current_system_qty: currentSystemStock };
        } catch (error) {
          console.error(`Error fetching current stock for ${item.item_name}:`, error);
          return { ...item, current_system_qty: 0 }; // Default to 0 if fetch fails
        }
      });

      const itemsWithCurrentStock = await Promise.all(itemsWithCurrentStockPromises);

      itemsWithCurrentStock.forEach(item => {
        const itemName = item.item_name || "Unknown";
        const price = item.price || 0;
        const physicalQty = item.physical_qty || 0;
        // Use the fetched current system quantity for the input field
        const currentSystemQty = item.current_system_qty || 0; 
        const variation = physicalQty - currentSystemQty; // Recalculate variation based on current stock
        const id = item.id || null; // Saved variation ID (from stock_variations table)
        const barcode = item.barcode || "";
        const batchId = item.batch_id || '';
        const batchNumber = item.batch_number || '';
        const expiry = item.expiry || '';

        let variationText = "no variation";
        let variationClass = "variation-none";
        if (variation > 0) {
          variationText = `${variation} more physically`;
          variationClass = "variation-more";
        } else if (variation < 0) {
          variationText = `${Math.abs(variation)} less physically`;
          variationClass = "variation-less";
        }

        const row = document.createElement("tr");
        row.dataset.id = id; // This is the ID of the saved variation record
        row.dataset.price = price;
        row.dataset.barcode = barcode;
        row.dataset.variation = variation; // Store recalculated variation
        row.dataset.itemName = itemName;
        row.dataset.batchId = batchId;
        row.dataset.batchNumber = batchNumber;
        row.dataset.expiry = expiry;

        row.innerHTML = `
          <td>${itemName}</td>
          <td>${price}</td>
          <td><input type="number" class="phyQty" value="${physicalQty}" min="0"></td>
          <td><input type="number" class="sysQty" value="${currentSystemQty}" min="0"></td> <td class="variationResult ${variationClass}">${variationText}</td>
          <td>
            <button class="delBtn">Delete</button>
            <button class="saveBtn">Save</button>
          </td>
        `;

        tableBody.appendChild(row);
        updateVariationEvents(row); // Attach event listeners and re-calculate variation for each row
        currentTableItems.push({ element: row, itemName: itemName, visible: true });
      });
      updateFooter();
    } catch (error) {
      console.error("Error fetching variations:", error);
      showCustomModal("Error", "Failed to fetch variations due to network or server error.");
    }
  };

  // Filter table functionality
  filterTableInput.addEventListener("input", () => {
    const filterTerm = filterTableInput.value.toLowerCase().trim();

    currentTableItems.forEach(item => {
      const row = item.element;
      const itemName = item.itemName.toLowerCase();

      if (itemName.includes(filterTerm)) {
        row.style.display = ""; // Show row
        item.visible = true;
      } else {
        row.style.display = "none"; // Hide row
        item.visible = false;
      }
    });
    updateFooter(); // Update footer based on visible items
  });

  // Custom Modal implementation (replaces alert/confirm)
  function showCustomModal(title, message, callback = null, isConfirm = false) {
    const modalOverlay = document.createElement('div');
    modalOverlay.classList.add('modal-overlay');

    const modalContent = document.createElement('div');
    modalContent.classList.add('modal-content');

    const modalTitle = document.createElement('h3');
    modalTitle.classList.add('modal-title');
    modalTitle.textContent = title;

    const modalMessage = document.createElement('p');
    modalMessage.classList.add('modal-message');
    modalMessage.textContent = message;

    const buttonContainer = document.createElement('div');
    buttonContainer.classList.add('modal-button-container');

    const okButton = document.createElement('button');
    okButton.classList.add('modal-button', 'ok');
    okButton.textContent = 'OK';
    okButton.onclick = () => {
      document.body.removeChild(modalOverlay);
      if (callback) callback(true);
    };
    buttonContainer.appendChild(okButton);

    if (isConfirm) {
      const cancelButton = document.createElement('button');
      cancelButton.classList.add('modal-button', 'cancel');
      cancelButton.textContent = 'Cancel';
      cancelButton.onclick = () => {
        document.body.removeChild(modalOverlay);
        if (callback) callback(false);
      };
      buttonContainer.appendChild(cancelButton);
    }

    modalContent.appendChild(modalTitle);
    modalContent.appendChild(modalMessage);
    modalContent.appendChild(buttonContainer);
    modalOverlay.appendChild(modalContent);
    document.body.appendChild(modalOverlay);
  }

  loadUser();
});