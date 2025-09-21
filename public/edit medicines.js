document.addEventListener("DOMContentLoaded", function () {
    const addForm = document.getElementById("add-medicine-form");
    const editForm = document.getElementById("edit-medicine-form");
    const searchBar = document.getElementById("search-bar");
    const deleteButton = document.getElementById("delete-medicine-btn");

    // ADD MEDICINE
    addForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const formData = new FormData();
        formData.append("item_name", document.getElementById("new-medicine-name").value);
        formData.append("price", document.getElementById("new-medicine-price").value);
        formData.append("barcode", document.getElementById("new-medicine-barcode").value);
        formData.append("expiry", document.getElementById("new-medicine-expiry").value);
        formData.append("stock", document.getElementById("new-medicine-stock").value);
        formData.append("packet_size", document.getElementById("new-medicine-packet").value);
        formData.append("active_name_1", document.getElementById("new-active-name-1").value);
        formData.append("active_name_2", document.getElementById("new-active-name-2").value);
        formData.append("cross_selling", document.getElementById("new-cross-selling").value);
        formData.append("significant_side_effects", document.getElementById("new-side-effects").value);
        formData.append("significant_interactions", document.getElementById("new-interactions").value);
        formData.append("uses", document.getElementById("new-uses").value);
        formData.append("dosage", document.getElementById("new-dosage").value);
        formData.append("location", document.getElementById("new-location").value);

        const imageFile = document.getElementById("new-image").files[0];
        if (imageFile) {
            formData.append("item_pic", imageFile);
        }

        try {
            const response = await fetch("/add-medicine", {
                method: "POST",
                body: formData,
            });
            const result = await response.json();
            alert(result.message);
            addForm.reset();
        } catch (error) {
            console.error("Error adding medicine:", error);
            alert("Failed to add medicine.");
        }
    });

    // SEARCH + DROPDOWN
    const searchDropdown = document.createElement("div");
    searchDropdown.id = "search-dropdown";
    searchDropdown.style.position = "absolute";
    searchDropdown.style.background = "white";
    searchDropdown.style.border = "1px solid #ccc";
    searchDropdown.style.width = searchBar.offsetWidth + "px";
    searchDropdown.style.maxHeight = "200px";
    searchDropdown.style.overflowY = "auto";
    searchDropdown.style.display = "none";
    searchDropdown.style.zIndex = "1000";
    document.body.appendChild(searchDropdown);

    let currentMedicineList = [];

    searchBar.addEventListener("input", async () => {
        const query = searchBar.value.trim();
        if (query.length < 2) {
            searchDropdown.style.display = "none";
            return;
        }

        try {
            const response = await fetch(`/search-medicine?query=${query}`);
            if (!response.ok) throw new Error("Failed to fetch medicines");

            const medicines = await response.json();
            currentMedicineList = medicines;
            showDropdown(medicines);
        } catch (error) {
            console.error("Error searching medicine:", error);
            searchDropdown.innerHTML = "<div>Error fetching results</div>";
            searchDropdown.style.display = "block";
        }
    });

    function showDropdown(medicines) {
        searchDropdown.innerHTML = "";
        if (medicines.length === 0) {
            searchDropdown.innerHTML = "<div style='padding: 8px;'>No results found</div>";
        } else {
            medicines.forEach((med) => {
                const div = document.createElement("div");
                div.textContent = `${med.item_name} - $${med.price} - Barcode: ${med.barcode || "N/A"}`;
                div.style.padding = "8px";
                div.style.cursor = "pointer";
                div.style.borderBottom = "1px solid #ddd";

                div.addEventListener("click", async () => {
                    // --- Always fetch medicine with batch data! ---
                    const medWithBatch = await fetchMedicineWithBatch(med.id);
                    populateEditForm(medWithBatch);
                    searchDropdown.style.display = "none";
                });

                searchDropdown.appendChild(div);
            });
        }

        positionDropdown();
        searchDropdown.style.display = "block";
    }

    function positionDropdown() {
        const rect = searchBar.getBoundingClientRect();
        searchDropdown.style.top = `${rect.bottom + window.scrollY}px`;
        searchDropdown.style.left = `${rect.left + window.scrollX}px`;
        searchDropdown.style.width = `${rect.width}px`;
    }

    // Fetch the medicine using the batch-aware endpoint
    async function fetchMedicineWithBatch(id) {
        const res = await fetch(`/api/medicine-with-batch/${id}`);
        if (!res.ok) {
            alert("Failed to fetch medicine details with batch");
            return {};
        }
        return res.json();
    }

    // Used throughout: now expects data in batch-aware format!
    function populateEditForm(med) {
        document.getElementById("edit-medicine-id").value = med.id;
        document.getElementById("edit-medicine-name").value = med.item_name || "";
        document.getElementById("edit-medicine-price").value = med.price || "";
        document.getElementById("edit-medicine-barcode").value = med.barcode || "";
        document.getElementById("edit-medicine-expiry").value = med.expiry
            ? new Date(med.expiry).toISOString().split("T")[0]
            : "";
        document.getElementById("edit-medicine-stock").value = med.stock ?? "";
        document.getElementById("edit-medicine-packet").value = med.packet_size || "";
        document.getElementById("edit-active-name-1").value = med.active_name_1 || "";
        document.getElementById("edit-active-name-2").value = med.active_name_2 || "";
        document.getElementById("edit-cross-selling").value = med.cross_selling || "";
        document.getElementById("edit-side-effects").value = med.significant_side_effects || "";
        document.getElementById("edit-interactions").value = med.significant_interactions || "";
        document.getElementById("edit-uses").value = med.uses || "";
        document.getElementById("edit-dosage").value = med.dosage || "";
        document.getElementById("edit-location").value = med.location || "";

        // These two will be refreshed again after batch modal closes as well
        refreshStockAndExpiry(med.id);
    }

    document.addEventListener("click", (event) => {
        if (!searchDropdown.contains(event.target) && event.target !== searchBar) {
            searchDropdown.style.display = "none";
        }
    });

    window.addEventListener("resize", positionDropdown);

    // EDIT MEDICINE
    editForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const formData = new FormData();

        formData.append("id", document.getElementById("edit-medicine-id").value);
        formData.append("item_name", document.getElementById("edit-medicine-name").value);
        formData.append("price", document.getElementById("edit-medicine-price").value);
        formData.append("barcode", document.getElementById("edit-medicine-barcode").value);
        formData.append("expiry", document.getElementById("edit-medicine-expiry").value);
        formData.append("stock", document.getElementById("edit-medicine-stock").value);
        formData.append("packet_size", document.getElementById("edit-medicine-packet").value);
        formData.append("active_name_1", document.getElementById("edit-active-name-1").value);
        formData.append("active_name_2", document.getElementById("edit-active-name-2").value);
        formData.append("cross_selling", document.getElementById("edit-cross-selling").value);
        formData.append("significant_side_effects", document.getElementById("edit-side-effects").value);
        formData.append("significant_interactions", document.getElementById("edit-interactions").value);
        formData.append("uses", document.getElementById("edit-uses").value);
        formData.append("dosage", document.getElementById("edit-dosage").value);
        formData.append("location", document.getElementById("edit-location").value);

        const imageFile = document.getElementById("edit-image").files[0];
        if (imageFile) {
            formData.append("item_pic", imageFile);
        }

        try {
            const response = await fetch("/update-medicine", {
                method: "POST",
                body: formData,
            });
            const result = await response.json();
            alert(result.message);

            // Always refresh stock and expiry after update
            const medId = document.getElementById("edit-medicine-id").value;
            if (medId) {
                const medWithBatch = await fetchMedicineWithBatch(medId);
                populateEditForm(medWithBatch);
            }
        } catch (error) {
            console.error("Error updating medicine:", error);
            alert("Failed to update medicine.");
        }
    });

    // DELETE MEDICINE
    deleteButton.addEventListener("click", async () => {
        const medicineId = document.getElementById("edit-medicine-id").value;
        if (!medicineId) {
            alert("No medicine selected to delete.");
            return;
        }

        if (!confirm("Are you sure you want to delete this medicine?")) return;

        try {
            const response = await fetch("/delete-medicine", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: medicineId }),
            });

            const result = await response.json();
            alert(result.message);
            editForm.reset();
        } catch (error) {
            console.error("Error deleting medicine:", error);
            alert("Failed to delete medicine.");
        }
    });

    // === BATCHES LOGIC ===
    const manageBatchesBtn = document.getElementById('manage-batches-btn');
    const batchModal = document.getElementById('batch-modal');
    const closeBatchModal = document.getElementById('close-batch-modal');
    const batchTableBody = document.querySelector('#batch-table tbody');
    const batchForm = document.getElementById('batch-form');

    let currentMedicineId = null;
    let editingBatchId = null;

    manageBatchesBtn.addEventListener('click', () => {
        currentMedicineId = document.getElementById("edit-medicine-id").value;
        if (!currentMedicineId) return alert("No medicine selected.");
        openBatchModal(currentMedicineId);
    });
    closeBatchModal.onclick = () => { batchModal.style.display = "none"; };
    window.onclick = (e) => { if (e.target == batchModal) batchModal.style.display = "none"; };

    function openBatchModal(medicineId) {
        batchModal.style.display = "block";
        loadBatches(medicineId);
    }

   function loadBatches(medicineId) {
    fetch(`/api/batches/for-medicine/${medicineId}`)
        .then(res => res.json())
        .then(batches => {
            batchTableBody.innerHTML = "";
            if (!Array.isArray(batches)) batches = [];
            batches.forEach(batch =>  {
                const row = document.createElement("tr");
                row.innerHTML = `
                    <td>${batch.batch_number || ""}</td>
                    <td>${batch.expiry ? batch.expiry.split('T')[0] : ""}</td>
                    <td>${batch.quantity ?? ""}</td>
                    <td>${batch.received_date ? batch.received_date.split('T')[0] : ""}</td>
                    <td></td>
                `;
                // Create Edit Button
                const editBtn = document.createElement("button");
                editBtn.textContent = "Edit";
                editBtn.classList.add("edit-batch-btn");
                editBtn.onclick = function() {
                    window.editBatch(
                        batch.batch_id || "",
                        batch.batch_number || "",
                        batch.expiry ? batch.expiry.split('T')[0] : "",
                        batch.quantity ?? "",
                        batch.received_date ? batch.received_date.split('T')[0] : ""
                    );
                };
                // Create Delete Button (optional, you can keep your existing delete logic)
                const delBtn = document.createElement("button");
                delBtn.textContent = "Delete";
                delBtn.onclick = function() { window.deleteBatch(batch.batch_id); };

                row.querySelector("td:last-child").append(editBtn, delBtn);
                batchTableBody.appendChild(row);
            });
        });
}



    // Make batch edit/delete globally accessible
    window.editBatch = (batch_id, batch_number, expiry, quantity, received_date) => {
        editingBatchId = batch_id;
        document.getElementById("batch-id").value = batch_id;
        document.getElementById("batch-number").value = batch_number || "";
        document.getElementById("batch-expiry").value = expiry ? expiry.split('T')[0] : "";
        document.getElementById("batch-qty").value = quantity ?? "";
        document.getElementById("batch-received").value = received_date ? received_date.split('T')[0] : "";
    };
    window.deleteBatch = (batch_id) => {
        if (!confirm("Delete this batch?")) return;
        fetch('/api/batches/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ batch_id })
        })
        .then(res => res.json()).then(() => {
            loadBatches(currentMedicineId);
            resetBatchForm();
            refreshStockAndExpiry(currentMedicineId);
        });
    };

    batchForm.onsubmit = function (e) {
        e.preventDefault();
        const batch_id = document.getElementById("batch-id").value;
        const batch_number = document.getElementById("batch-number").value;
        const expiry = document.getElementById("batch-expiry").value;
        const quantity = document.getElementById("batch-qty").value;
        const received_date = document.getElementById("batch-received").value;

        const url = batch_id ? '/api/batches/edit' : '/api/batches/add';
        const data = batch_id ? { batch_id, batch_number, expiry, quantity, received_date }
            : { medicine_id: currentMedicineId, batch_number, expiry, quantity, received_date };

        fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        }).then(r => r.json()).then(() => {
            loadBatches(currentMedicineId);
            resetBatchForm();
            refreshStockAndExpiry(currentMedicineId);
        });
    };

    document.getElementById("reset-batch-form").onclick = resetBatchForm;
    function resetBatchForm() {
        editingBatchId = null;
        batchForm.reset();
        document.getElementById("batch-id").value = "";
    }

    // Refresh stock and expiry after batch modal closes or edits
    async function refreshStockAndExpiry(medicineId) {
        if (!medicineId) return;
        const res = await fetch(`/api/medicine-with-batch/${medicineId}`);
        if (!res.ok) return;
        const med = await res.json();
        document.getElementById("edit-medicine-stock").value = med.stock ?? "";
        document.getElementById("edit-medicine-expiry").value = med.expiry ? new Date(med.expiry).toISOString().split("T")[0] : "";
    }

    // Check Admin
    (function checkAdmin() {
        const userInfoString = sessionStorage.getItem("userInfo");
        if (!userInfoString) {
            console.log("No userInfo found in session storage, redirecting to login page");
            window.location.href = "index.html";
            return false;
        }
        try {
            const userInfo = JSON.parse(userInfoString);
            if (!userInfo.isAdmin) {
                alert("Access denied. Admins only.");
                window.location.href = "index.html";
                return false;
            }
            document.getElementById("pharmacist-name").textContent = userInfo.fullName || userInfo.username;
            document.getElementById("job-title").textContent = userInfo.jobTitle || "Staff";
            const userPhoto = document.getElementById("user-photo");
            if (userPhoto && userInfo.userId) {
                userPhoto.onerror = () => userPhoto.src = "images/default-profile.png";
                userPhoto.src = `/api/user-photo/${userInfo.userId}`;
            }
            return true;
        } catch (error) {
            console.error("Error parsing user info:", error);
            alert("There was an error loading your profile. Please log in again.");
            window.location.href = "index.html";
        }
    })();

    // Trigger Save Edits on F2
    document.addEventListener("keydown", function (event) {
        if (event.key === "F2") {
            event.preventDefault();
            if (editForm) editForm.requestSubmit();
        }
    });
});
