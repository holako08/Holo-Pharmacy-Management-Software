document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');
  const cartItems = document.getElementById('cart-items');
  let activeIndex = -1;

  // Function to fetch search results and populate the dropdown
  function fetchSearchResults(searchTerm) {
    fetch('/api/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ searchTerm })
    })
    .then(response => response.json())
    .then(data => {
      displaySearchResults(data);
      searchResults.style.display = 'block'; // Ensure dropdown is visible
    })
    .catch(error => console.error('Error:', error));
  }

  // Function to display search results in the dropdown
  function displaySearchResults(results) {
    searchResults.innerHTML = '';
    if (results.length === 0) {
      searchResults.innerHTML = '<p>No results found</p>';
      searchResults.style.display = 'none'; // Hide the dropdown if no results
      return;
    }

    results.forEach(item => {
      const resultItem = document.createElement('div');
      resultItem.classList.add('search-result-item');
      resultItem.innerHTML = `
        <span>${item.item_name}</span>
        <span>${item.price}</span>
      `;
      resultItem.dataset.itemName = item.item_name;
      resultItem.dataset.itemPrice = item.price;
      resultItem.dataset.itemExpiry = item.expiry;
      resultItem.dataset.itemStock = item.stock;

      resultItem.addEventListener('click', () => {
        addItemToCart(item);
      });

      searchResults.appendChild(resultItem);
    });

    // Show the dropdown
    searchResults.style.display = 'block';
    
  }

 // Function to add an item to the cart
 function addItemToCart(item) {
  const row = document.createElement('tr');
  row.innerHTML = `
    <td>${item.item_name}</td>
    <td>${item.price}</td>
    <td><input type="number" class="quantity" value="1"></td>
    <td class="expiry">${item.expiry}</td>
    <td class="stock">${item.stock}</td>
    <td>${item.price}</td>
    <td><button class="remove-btn">Remove</button></td>
  `;
  cartItems.appendChild(row);

  // Check stock and apply red color if less than 5 or null
  const stockCell = row.querySelector('.stock');
  if (item.stock < 5 || item.stock === null) {
    stockCell.style.color = 'red';
  }

  // Check expiry date and apply red color if within three months or null
  const expiryCell = row.querySelector('.expiry');
  if (item.expiry) {
    const expiryDate = new Date(item.expiry);
    const threeMonthsFromNow = new Date();
    threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);
    if (expiryDate <= threeMonthsFromNow) {
      expiryCell.style.color = 'red';
    }
  } else {
    expiryCell.style.color = 'red';
  }

  searchResults.innerHTML = ''; // Clear the dropdown after selection
  searchResults.style.display = 'none'; // Hide the dropdown
  activeIndex = -1; // Reset active index

  // Call updateSubtotal for the newly added row
  window.updateSubtotal(row);

  // Call updateTotal to recalculate the total amount
  window.updateTotal();

  // Get the info box elements
  const crossSellingContent = document.querySelector('.cross-selling .info-box-content');
  const sideEffectsContent = document.querySelector('.side-effects .info-box-content');
  const interactionsContent = document.querySelector('.interactions .info-box-content');

  // Function to append new information to the existing content with styling
  function appendInfo(element, newText) {
    if (newText) {
      const existingText = element.innerHTML;
      if (existingText) {
        // Append new information with line breaks
        element.innerHTML = `${existingText}<br><strong style="font-size: 1.2em;">${newText}</strong>`;
      } else {
        // Add new information with styling if the box was empty
        element.innerHTML = `<strong style="font-size: 1.2em;">${newText}</strong>`;
      }
    } else if (!element.innerHTML) {
      // If no information is available and the box is empty, display a default message
      element.textContent = 'No information available';
    }
  }
  

  // Append cross-selling, side-effects, and interactions information with styling
  appendInfo(crossSellingContent, item.cross_selling);
  appendInfo(sideEffectsContent, item.significant_side_effects);
  appendInfo(interactionsContent, item.significant_interactions);
}
  // Event listener for real-time search
  searchInput.addEventListener('input', (event) => {
    const searchTerm = event.target.value;
    if (searchTerm.trim() === '') {
      searchResults.innerHTML = '';
      searchResults.style.display = 'none'; // Hide the dropdown if input is empty
      activeIndex = -1; // Reset active index
      return;
    }
    fetchSearchResults(searchTerm);
  });

  // Handle key navigation in the dropdown
  searchInput.addEventListener('keydown', handleKeyNavigation);

  function handleKeyNavigation(event) {
    const items = Array.from(searchResults.children);
    
    if (items.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      activeIndex = (activeIndex + 1) % items.length;
      
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      activeIndex = (activeIndex - 1 + items.length) % items.length;
      
    } else if (event.key === 'Enter' && activeIndex !== -1) {
      items[activeIndex].click();
      
      activeIndex = -1;
    }

    highlightActiveItem();
    
  }

  function highlightActiveItem() {
    const items = Array.from(searchResults.children);
    items.forEach((item, index) => {
      if (index === activeIndex) {
        item.classList.add('active'); // Add active class to the selected item
      } else {
        item.classList.remove('active'); // Remove active class from other items
      }
    });
  }

  // Add global keydown event listener for shortcuts
  document.addEventListener("keydown", handleGlobalKeyDown);

  function handleGlobalKeyDown(event) {
    switch (event.key) {
      case "F1":
        event.preventDefault();
        focusAndSelect("search-input");
        break;
      case "F3":
        event.preventDefault();
        focusLastCartItem();
        break;
      case "F4":
        event.preventDefault();
        focusAndSelect("cash-received");
        break;
      case "Delete":
        event.preventDefault();
        window.location.reload(); // Refresh the page to clear the cart and all fields
        alert('Cart cleared');
        break;
    }
  }

  function focusAndSelect(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
      element.focus();
      element.select();
      
    } else {
      console.log(`Element with ID: ${elementId} not found`);
    }
  }

  function focusLastCartItem() {
    // Ensure the cart is populated
    if (cartItems.children.length === 0) {
      console.log("Cart is empty, no items to focus on.");
      return;
    }

    // Focus on the last cart item's quantity input
    const lastCartItemInput = cartItems.querySelector("tr:last-child .quantity");
    if (lastCartItemInput) {
      lastCartItemInput.focus();
      lastCartItemInput.select();
      
    } else {
      console.log("No quantity input found in the last cart item.");
    }
  }

  function clearCart() {
    cartItems.innerHTML = '';
    
    alert('Cart cleared');

    // Call updateTotal to reset the total amount
    window.updateTotal();
  }
});