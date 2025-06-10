const SAVED_VEHICLES_STORAGE_KEY = 'userSavedVehicles';
const ACTIVE_VEHICLE_ID_STORAGE_KEY = 'activeVehicleId';

document.addEventListener('DOMContentLoaded', () => {
  console.log('[FitmentStatus] DOMContentLoaded');
  const fitmentStatusContainers = document.querySelectorAll('.product-fitment-status-container');
  console.log(`[FitmentStatus] Found ${fitmentStatusContainers.length} container(s).`);

  // Moved displayMessage outside forEach to define it once, but it needs sectionId and placeholder.
  // Let's define it inside forEach or pass placeholder and sectionId to it.
  // For now, keeping it inside forEach but adapting its signature.

  fitmentStatusContainers.forEach((container, index) => {
    const sectionId = container.dataset.sectionId || `block-${index}`; // Fallback ID for logging if sectionId is missing
    console.log(`[FitmentStatus ${sectionId}] Processing container.`);

    const apiToken = container.dataset.apiToken;
    const apiBaseUrl = container.dataset.apiBaseUrl;
    const productSku = container.dataset.productSku;

    console.log(`[FitmentStatus ${sectionId}] API Token:`, apiToken ? '****** (loaded)' : 'MISSING or empty');
    console.log(`[FitmentStatus ${sectionId}] API Base URL:`, apiBaseUrl);
    console.log(`[FitmentStatus ${sectionId}] Product SKU:`, productSku);

    const placeholder = container.querySelector('.fitment-status-placeholder');
    
    const sectionElement = container; // Assuming container is the section/block element itself with data attributes
    
    let fitsMessage = (sectionElement && sectionElement.dataset.fitsMessage) || "This product fits your {vehicle_name}.";
    let doesNotFitMessage = (sectionElement && sectionElement.dataset.doesNotFitMessage) || "This product does not fit your {vehicle_name}.";
    let noVehicleSelectedMessage = (sectionElement && sectionElement.dataset.noVehicleSelectedMessage) || "Select your vehicle using the Product Finder to check fitment.";
    let apiErrorMessage = (sectionElement && sectionElement.dataset.apiErrorMessage) || "Could not retrieve fitment information. Please try again later.";

    console.log(`[FitmentStatus ${sectionId}] Message - Fits:`, sectionElement.dataset.fitsMessage || 'Using default');
    console.log(`[FitmentStatus ${sectionId}] Message - No Fit:`, sectionElement.dataset.doesNotFitMessage || 'Using default');
    console.log(`[FitmentStatus ${sectionId}] Message - No Vehicle:`, sectionElement.dataset.noVehicleSelectedMessage || 'Using default');
    console.log(`[FitmentStatus ${sectionId}] Message - API Error:`, sectionElement.dataset.apiErrorMessage || 'Using default');

    // Adapted displayMessage to take placeholderElem and currentSectionId
    const displayMessage = (message, type = 'info', placeholderElem, currentSectionId) => {
      console.log(`[FitmentStatus ${currentSectionId || sectionId}] Displaying message: "${message}", type: ${type}`);
      if (placeholderElem) {
        // Reset to base class then add specific type class
        placeholderElem.className = 'fitment-status-message';
        placeholderElem.classList.add(`type-${type}`);
        placeholderElem.textContent = message;
      } else {
        console.error(`[FitmentStatus ${currentSectionId || sectionId}] Placeholder element not found! Attempting to write to container.`);
        const targetContainer = document.querySelector(`[data-section-id="${currentSectionId}"]`) || container;
        if (targetContainer) {
            targetContainer.innerHTML = `<p class="fitment-status-message type-${type}">${message}</p>`;
        } else {
            console.error(`[FitmentStatus ${currentSectionId || sectionId}] Target container also not found.`);
        }
      }
    };

    // Define checkFitmentForVehicle function
    const checkFitmentForVehicle = async (vehicle, currentProductSku, currentApiToken, currentApiBaseUrl, currentFitsMessage, currentDoesNotFitMessage, currentApiErrorMessage, currentNoVehicleSelectedMessage, placeholderEl, currentCheckSectionId) => {
      if (!vehicle || !vehicle.type || !vehicle.make || !vehicle.year || !vehicle.model || !vehicle.category) {
        console.warn(`[FitmentStatus ${currentCheckSectionId}] Provided vehicle data is incomplete for fitment check.`, vehicle);
        displayMessage(currentNoVehicleSelectedMessage, 'no-vehicle', placeholderEl, currentCheckSectionId);
        return;
      }

      const vehicleName = vehicle.name || `${vehicle.year} ${vehicle.make} ${vehicle.model}`; // Use pre-generated name or construct
      console.log(`[FitmentStatus ${currentCheckSectionId}] Checking fitment for: ${vehicleName}, SKU: ${currentProductSku}`);

      const apiUrl = new URL(`${currentApiBaseUrl.replace(/\/$/, '')}/fitment/getFitmentProducts`);
      apiUrl.searchParams.append('make', vehicle.make);
      apiUrl.searchParams.append('year', vehicle.year);
      apiUrl.searchParams.append('model', vehicle.model);
      apiUrl.searchParams.append('category', vehicle.category);
      if (vehicle.subCategory) {
        apiUrl.searchParams.append('subCategory', vehicle.subCategory);
      }
      apiUrl.searchParams.append('itemList', currentProductSku); // Ensure productSku is in scope or passed

      console.log(`[FitmentStatus ${currentCheckSectionId}] Constructed API URL:`, apiUrl.toString());
      // Show loading indicator in placeholder - optional
      displayMessage(`Checking fitment for ${vehicleName}...`, 'loading', placeholderEl, currentCheckSectionId);


      try {
        const response = await fetch(apiUrl.toString(), {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${currentApiToken}`, // Ensure apiToken is in scope or passed
            'Accept': 'application/json'
          }
        });

        console.log(`[FitmentStatus ${currentCheckSectionId}] API response status:`, response.status);
        if (!response.ok) {
          const responseText = await response.text();
          const errorMsg = `API request failed with status ${response.status}. Response: ${responseText}`;
          console.error(`[FitmentStatus ${currentCheckSectionId}] ${errorMsg}`);
          throw new Error(errorMsg);
        }

        const data = await response.json();
        console.log(`[FitmentStatus ${currentCheckSectionId}] API response data:`, data);

        if (data && data.data && Array.isArray(data.data.fitmentProducts)) {
          const productIsFit = data.data.fitmentProducts.some(
            fitProduct => fitProduct.itemNumber === currentProductSku && fitProduct.type === vehicle.type // Compare against the current vehicle's type
          );
          console.log(`[FitmentStatus ${currentCheckSectionId}] Product is fit for ${vehicleName}:`, productIsFit);
          if (productIsFit) {
            displayMessage(currentFitsMessage.replace('{vehicle_name}', vehicleName), 'fits', placeholderEl, currentCheckSectionId);
          } else {
            displayMessage(currentDoesNotFitMessage.replace('{vehicle_name}', vehicleName), 'does-not-fit', placeholderEl, currentCheckSectionId);
          }
        } else {
          // This case includes 404s that might return JSON like {status: 404, message: "..."} but are !response.ok
          // And also cases where response is ok but data structure is unexpected
          console.warn(`[FitmentStatus ${currentCheckSectionId}] Unexpected API response structure or no fitment data. Data:`, data);
          displayMessage(currentDoesNotFitMessage.replace('{vehicle_name}', vehicleName), 'does-not-fit', placeholderEl, currentCheckSectionId); // Assume does not fit for unexpected
        }
      } catch (error) {
        console.error(`[FitmentStatus ${currentCheckSectionId}] API call failed or error processing response for ${vehicleName}.`, error);
        displayMessage(currentApiErrorMessage, 'error', placeholderEl, currentCheckSectionId);
      }
    };

    if (!apiToken || !apiBaseUrl) {
      console.error(`[FitmentStatus ${sectionId}] API token or base URL is missing. Cannot proceed.`);
      // displayMessage("API configuration missing.", "error", placeholder, sectionId); // Optionally show error
      if (placeholder) placeholder.style.display = 'none';
      return;
    }

    if (!productSku) {
      console.warn(`[FitmentStatus ${sectionId}] Product SKU not found on the page. Cannot check fitment.`);
      if (placeholder) placeholder.style.display = 'none';
      return;
    }

    // --- Start of new logic for handling saved vehicles list ---
    const savedVehiclesString = localStorage.getItem(SAVED_VEHICLES_STORAGE_KEY);
    console.log(`[FitmentStatus ${sectionId}] Raw savedVehiclesString from localStorage:`, savedVehiclesString);

    if (!savedVehiclesString) {
      console.log(`[FitmentStatus ${sectionId}] No saved vehicles found in localStorage. Displaying no vehicle message or hiding.`);
      // Display no vehicle selected message, or hide container if placeholder isn't suitable for this message.
      // For now, assume product-finder is primary way to add vehicles, so this message is appropriate.
      displayMessage(noVehicleSelectedMessage, 'no-vehicle', placeholder, sectionId);
      // container.style.display = 'none'; // Alternative: hide if no selection is ever expected
      return;
    }

    let savedVehicles = [];
    try {
      savedVehicles = JSON.parse(savedVehiclesString);
      if (!Array.isArray(savedVehicles)) {
        console.warn(`[FitmentStatus ${sectionId}] Parsed savedVehicles is not an array, treating as empty. Value:`, savedVehicles);
        savedVehicles = [];
      }
      console.log(`[FitmentStatus ${sectionId}] Parsed savedVehicles:`, savedVehicles);
    } catch (e) {
      console.error(`[FitmentStatus ${sectionId}] Error parsing savedVehicles from localStorage.`, e);
      displayMessage(apiErrorMessage, 'error', placeholder, sectionId); // Show API error as it's a data issue
      return;
    }

    if (savedVehicles.length === 0) {
      console.log(`[FitmentStatus ${sectionId}] No vehicles in the saved list. Displaying no vehicle message.`);
      displayMessage(noVehicleSelectedMessage, 'no-vehicle', placeholder, sectionId);
      return;
    }

    // At this point, we have productSku, apiToken, apiBaseUrl, and a list of one or more vehicles.
    // The messages (fitsMessage, etc.) are also available in the outer scope.

    let vehicleToUseForFitment = null;
    let preSelectedByHeader = false;
    const activeVehicleIdFromHeader = localStorage.getItem(ACTIVE_VEHICLE_ID_STORAGE_KEY);

    if (activeVehicleIdFromHeader) {
      vehicleToUseForFitment = savedVehicles.find(v => String(v.id) === activeVehicleIdFromHeader);
      if (vehicleToUseForFitment) {
        preSelectedByHeader = true;
        console.log(`[FitmentStatus ${sectionId}] Active vehicle from header found:`, vehicleToUseForFitment.name);
      } else {
        console.log(`[FitmentStatus ${sectionId}] Active vehicle ID ${activeVehicleIdFromHeader} from header not found in saved list, or list is empty.`);
      }
    }

    if (!vehicleToUseForFitment && savedVehicles.length === 1) {
      vehicleToUseForFitment = savedVehicles[0];
      console.log(`[FitmentStatus ${sectionId}] Single vehicle found, using it:`, vehicleToUseForFitment.name);
    }

    // Clear any existing product-page-specific dropdown if a vehicle is pre-selected or if there's only one.
    if (vehicleToUseForFitment) {
        const existingProductPageDropdown = container.querySelector('.fitment-vehicle-selector-area');
        if (existingProductPageDropdown) existingProductPageDropdown.remove();

        checkFitmentForVehicle(vehicleToUseForFitment, productSku, apiToken, apiBaseUrl, fitsMessage, doesNotFitMessage, apiErrorMessage, noVehicleSelectedMessage, placeholder, sectionId);
    } else if (savedVehicles.length > 1) { // No vehicle pre-selected by header, and more than one saved vehicle
        console.log(`[FitmentStatus ${sectionId}] Multiple vehicles (${savedVehicles.length}) found, no active one from header. Creating product-page select dropdown.`);

        const vehicleSelectorContainer = document.createElement('div');
        vehicleSelectorContainer.className = 'fitment-vehicle-selector-area';

        const label = document.createElement('label');
        label.textContent = 'Check fitment for: ';
        label.htmlFor = `vehicle-select-${sectionId}`;

        const vehicleSelectDropdown = document.createElement('select');
        vehicleSelectDropdown.id = `vehicle-select-${sectionId}`;
        vehicleSelectDropdown.className = 'fitment-vehicle-select'; // For styling

        const defaultOption = document.createElement('option');
        defaultOption.value = "";
        defaultOption.textContent = "-- Select Your Vehicle --";
        vehicleSelectDropdown.appendChild(defaultOption);

        savedVehicles.forEach(vehicle => {
          if (vehicle && vehicle.id && vehicle.name) { // Ensure vehicle object is valid
            const option = document.createElement('option');
            option.value = String(vehicle.id);
            option.textContent = vehicle.name;
            vehicleSelectDropdown.appendChild(option);
          } else {
            console.warn(`[FitmentStatus ${sectionId}] Skipping invalid vehicle in list:`, vehicle);
          }
        });

        vehicleSelectorContainer.appendChild(label);
        vehicleSelectorContainer.appendChild(vehicleSelectDropdown);

        if (placeholder && placeholder.parentNode) {
          placeholder.parentNode.insertBefore(vehicleSelectorContainer, placeholder);
        } else {
          container.appendChild(vehicleSelectorContainer);
        }

        displayMessage("Select a vehicle above to check fitment.", 'info', placeholder, sectionId);

        vehicleSelectDropdown.addEventListener('change', (event) => {
          const selectedVehicleId = event.target.value;
          if (selectedVehicleId) {
            const vehicleObject = savedVehicles.find(v => String(v.id) === selectedVehicleId);
            if (vehicleObject) {
              // When product-page dropdown changes, we don't need to update global active ID
              checkFitmentForVehicle(vehicleObject, productSku, apiToken, apiBaseUrl, fitsMessage, doesNotFitMessage, apiErrorMessage, noVehicleSelectedMessage, placeholder, sectionId);
            } else {
              console.error(`[FitmentStatus ${sectionId}] Selected vehicle ID ${selectedVehicleId} not found in savedVehicles list.`);
              displayMessage(apiErrorMessage, 'error', placeholder, sectionId);
            }
          } else {
            displayMessage("Select a vehicle above to check fitment.", 'info', placeholder, sectionId);
          }
        });
    } else {
        // This case should ideally be covered by earlier checks (no savedVehiclesString or savedVehicles.length === 0)
        // but as a fallback, if somehow we reach here with no vehicle to use and not multiple vehicles.
        console.log(`[FitmentStatus ${sectionId}] No vehicle to use for fitment and not multiple vehicles to choose from. Displaying no vehicle message.`);
        displayMessage(noVehicleSelectedMessage, 'no-vehicle', placeholder, sectionId);
    }
    // --- End of new logic ---

    document.addEventListener('activeVehicleChanged', (event) => {
      if (!document.body.contains(container)) {
        return;
      }
      console.log(`[FitmentStatus ${sectionId}] Event 'activeVehicleChanged' detected. Detail:`, event.detail);

      const currentProductSku = container.dataset.productSku;
      const currentApiToken = container.dataset.apiToken;
      const currentApiBaseUrl = container.dataset.apiBaseUrl;
      const currentPlaceholder = container.querySelector('.fitment-status-placeholder'); // Re-query inside handler

      if (!currentProductSku) {
        console.warn(`[FitmentStatus ${sectionId}] Product SKU not found on container. Cannot update fitment status.`);
        if(currentPlaceholder) displayMessage("Fitment status cannot be determined: product data missing.", 'error', currentPlaceholder, sectionId);
        return;
      }
      if (!currentApiToken || !currentApiBaseUrl) {
        console.warn(`[FitmentStatus ${sectionId}] API token or base URL missing. Cannot update fitment status.`);
        if(currentPlaceholder) displayMessage("Fitment status cannot be determined: API configuration missing.", 'error', currentPlaceholder, sectionId);
        return;
      }
      if (!currentPlaceholder) {
        console.warn(`[FitmentStatus ${sectionId}] Placeholder element not found. Cannot display fitment status.`);
        return;
      }

      const existingProductPageDropdown = container.querySelector('.fitment-vehicle-selector-area');
      if (existingProductPageDropdown) {
        existingProductPageDropdown.remove();
        console.log(`[FitmentStatus ${sectionId}] Removed product-page specific vehicle selector.`);
      }

      // Re-fetch message strings from dataset at the time of event handling
      const currentFitsMessage = container.dataset.fitsMessage || "This product fits your {vehicle_name}.";
      const currentDoesNotFitMessage = container.dataset.doesNotFitMessage || "This product does not fit your {vehicle_name}.";
      const currentApiErrorMessage = container.dataset.apiErrorMessage || "Could not retrieve fitment information. Please try again later.";
      let currentNoVehicleSelectedMessage = container.dataset.noVehicleSelectedMessage || "Select your vehicle to check fitment."; // Default used if event.detail is null

      if (event.detail && event.detail.vehicle) {
        const newActiveVehicle = event.detail.vehicle;
        console.log(`[FitmentStatus ${sectionId}] New active vehicle received:`, newActiveVehicle);

        checkFitmentForVehicle(
          newActiveVehicle,
          currentProductSku,
          currentApiToken,
          currentApiBaseUrl,
          currentFitsMessage,
          currentDoesNotFitMessage,
          currentApiErrorMessage,
          currentNoVehicleSelectedMessage, // This specific message might not be used if vehicle is present
          currentPlaceholder,
          sectionId
        );
      } else {
        console.log(`[FitmentStatus ${sectionId}] Active vehicle was cleared or not provided in event.`);
        // If active vehicle is cleared, we should re-evaluate the UI.
        // This means checking localStorage for any remaining saved vehicles.
        // For simplicity in this step, just display "no vehicle selected".
        // A more advanced implementation might re-trigger the logic that shows the dropdown if savedVehicles.length > 1
        displayMessage(currentNoVehicleSelectedMessage, 'no-vehicle', currentPlaceholder, sectionId);

        // Attempt to re-initialize UI for this container if active vehicle is cleared
        // This will re-evaluate if the product-page dropdown should be shown
        const currentSavedVehiclesString = localStorage.getItem(SAVED_VEHICLES_STORAGE_KEY);
        let currentSavedVehicles = [];
        if (currentSavedVehiclesString) {
            try {
                currentSavedVehicles = JSON.parse(currentSavedVehiclesString);
                if (!Array.isArray(currentSavedVehicles)) currentSavedVehicles = [];
            } catch(e) {
                console.error(`[FitmentStatus ${sectionId}] Error parsing savedVehicles for UI re-evaluation:`, e);
                currentSavedVehicles = [];
            }
        }

        if (currentSavedVehicles.length > 1) {
            // Re-create the product-page dropdown. This logic is simplified here.
            // Ideally, the original dropdown creation logic would be callable.
            // For now, we'll just log and keep the "no vehicle selected" message.
            console.log(`[FitmentStatus ${sectionId}] Active vehicle cleared. Multiple vehicles still saved. Product page dropdown should ideally reappear.`);
            // displayMessage("Select a vehicle from the list to check fitment.", 'info', currentPlaceholder, sectionId); // More accurate message
            // The original dropdown creation logic is complex and tied to the initial forEach loop.
            // A full re-initialization of this specific container would be better if this state is critical.
        } else if (currentSavedVehicles.length === 1) {
            // If only one vehicle remains, it should become active (product-finder.js logic should handle this).
            // And this event listener should shortly receive another 'activeVehicleChanged' with that vehicle.
            // Or, we can directly check it here.
             console.log(`[FitmentStatus ${sectionId}] Active vehicle cleared, but one vehicle remains in storage. Attempting to check it.`);
             checkFitmentForVehicle(
                currentSavedVehicles[0],
                currentProductSku, currentApiToken, currentApiBaseUrl,
                currentFitsMessage, currentDoesNotFitMessage, currentApiErrorMessage, currentNoVehicleSelectedMessage,
                currentPlaceholder, sectionId
            );
        }
        // If currentSavedVehicles.length is 0, the "no vehicle" message is already appropriate.
      }
    });
  });
});
