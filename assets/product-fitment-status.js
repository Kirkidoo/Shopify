document.addEventListener('DOMContentLoaded', () => {
  const fitmentStatusContainers = document.querySelectorAll('.product-fitment-status-container');

  fitmentStatusContainers.forEach(container => {
    const sectionId = container.dataset.sectionId;
    const apiToken = container.dataset.apiToken;
    const apiBaseUrl = container.dataset.apiBaseUrl;
    const productSku = container.dataset.productSku; // SKU of the current product on the page

    const placeholder = container.querySelector('.fitment-status-placeholder');

    const sectionElement = document.querySelector(`#shopify-section-${sectionId}`) || container.closest('.shopify-section');

    // Get messages from section settings, with defaults
    let fitsMessage = (sectionElement && sectionElement.dataset.fitsMessage) || "This product fits your {vehicle_name}.";
    let doesNotFitMessage = (sectionElement && sectionElement.dataset.doesNotFitMessage) || "This product does not fit your {vehicle_name}.";
    let noVehicleSelectedMessage = (sectionElement && sectionElement.dataset.noVehicleSelectedMessage) || "Select your vehicle using the Product Finder to check fitment.";
    let apiErrorMessage = (sectionElement && sectionElement.dataset.apiErrorMessage) || "Could not retrieve fitment information. Please try again later.";

    const displayMessage = (message, type = 'info') => {
      if (placeholder) {
        placeholder.textContent = message;
        placeholder.className = `fitment-status-message type-${type}`; // Add class for styling
      } else {
        // Fallback if placeholder somehow isn't there
        container.innerHTML = `<p class="fitment-status-message type-${type}">${message}</p>`;
      }
    };

    if (!apiToken || !apiBaseUrl) {
      console.error('Product Fitment Status (' + sectionId + '): API token or base URL is missing.');
      if (placeholder) placeholder.style.display = 'none'; // Hide loading message
      return; // Cannot make API calls
    }

    if (!productSku) {
      console.warn('Product Fitment Status (' + sectionId + '): Product SKU not found on the page. Cannot check fitment.');
      if (placeholder) placeholder.style.display = 'none'; // Hide loading message
      return; // Cannot proceed without a product SKU
    }

    const lastSelectedVehicleString = localStorage.getItem('lastSelectedVehicle');
    if (!lastSelectedVehicleString) {
      displayMessage(noVehicleSelectedMessage, 'no-vehicle');
      return;
    }

    let lastSelectedVehicle;
    try {
      lastSelectedVehicle = JSON.parse(lastSelectedVehicleString);
    } catch (e) {
      console.error('Product Fitment Status (' + sectionId + '): Error parsing lastSelectedVehicle from localStorage.', e);
      displayMessage(apiErrorMessage, 'error');
      return;
    }

    // Validate required fields from localStorage
    if (!lastSelectedVehicle || !lastSelectedVehicle.type || !lastSelectedVehicle.make || !lastSelectedVehicle.year || !lastSelectedVehicle.model || !lastSelectedVehicle.category) {
      console.warn('Product Fitment Status (' + sectionId + '): Last selected vehicle data from localStorage is incomplete.', lastSelectedVehicle);
      displayMessage(noVehicleSelectedMessage, 'no-vehicle'); // Or a more specific error like "Incomplete vehicle selection."
      return;
    }

    const vehicleName = `${lastSelectedVehicle.year} ${lastSelectedVehicle.make} ${lastSelectedVehicle.model} (${lastSelectedVehicle.type} - ${lastSelectedVehicle.category}${lastSelectedVehicle.subCategory ? ' - ' + lastSelectedVehicle.subCategory : ''})`;

    // --- Updated API Call Logic ---
    // Endpoint: GET {{api_url}}/fitment/getFitmentProducts
    // Key Parameters for this use case: make, year, model, category, subCategory (optional), itemList (for SKU)
    const apiUrl = new URL(`${apiBaseUrl.replace(/\/$/, '')}/fitment/getFitmentProducts`);

    apiUrl.searchParams.append('make', lastSelectedVehicle.make);
    apiUrl.searchParams.append('year', lastSelectedVehicle.year);
    apiUrl.searchParams.append('model', lastSelectedVehicle.model);
    apiUrl.searchParams.append('category', lastSelectedVehicle.category);
    if (lastSelectedVehicle.subCategory) {
      apiUrl.searchParams.append('subCategory', lastSelectedVehicle.subCategory);
    }
    apiUrl.searchParams.append('itemList', productSku); // Use itemList for the current product's SKU
    // apiUrl.searchParams.append('type', lastSelectedVehicle.type); // Type is not a direct filter for getFitmentProducts, but response includes it.

    fetch(apiUrl.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Accept': 'application/json'
      }
    })
    .then(response => {
      if (!response.ok) {
        // Attempt to get more info from response body for error logging
        return response.json().catch(() => null).then(errorBody => {
          const errorMsg = `API request failed with status ${response.status}.`;
          console.error('Product Fitment Status (' + sectionId + '): ' + errorMsg, errorBody);
          throw new Error(errorMsg); // Re-throw to be caught by main .catch
        });
      }
      return response.json();
    })
    .then(data => {
      if (data && data.data && Array.isArray(data.data.fitmentProducts)) {
        // Check if the returned list of products (that fit the vehicle) contains our current productSku
        const productIsFit = data.data.fitmentProducts.some(
          fitProduct => fitProduct.itemNumber === productSku && fitProduct.type === lastSelectedVehicle.type
        );

        if (productIsFit) {
          displayMessage(fitsMessage.replace('{vehicle_name}', vehicleName), 'fits');
        } else {
          // Product SKU not found in the list of products that fit the selected vehicle
          displayMessage(doesNotFitMessage.replace('{vehicle_name}', vehicleName), 'does-not-fit');
        }
      } else if (data && data.status === 404) {
        // This might indicate the API endpoint itself is wrong, or less likely, the vehicle itself isn't found.
        // For this specific endpoint, a 404 is less likely for "no products fit" (that would be an empty array).
        // More often, it's "product not found" or "no fitment data for THIS vehicle".
        // Given our logic, if the vehicle itself was invalid, it should have been caught earlier by localStorage checks.
        // So, if API returns products, but not ours, it's a "does not fit". If it returns empty, also "does not fit".
        console.warn(`Product Fitment Status (${sectionId}): API returned an unexpected response or 404 for vehicle ${vehicleName} and SKU ${productSku}. Raw Response:`, data);
        displayMessage(doesNotFitMessage.replace('{vehicle_name}', vehicleName), 'does-not-fit');
      }
      else {
        // Fallback for unexpected API response structure
        console.warn('Product Fitment Status (' + sectionId + '): Unexpected API response structure.', data);
        displayMessage(apiErrorMessage, 'error');
      }
    })
    .catch(error => {
      console.error('Product Fitment Status (' + sectionId + '): API call failed or error processing response.', error);
      displayMessage(apiErrorMessage, 'error');
    });
  });
});
