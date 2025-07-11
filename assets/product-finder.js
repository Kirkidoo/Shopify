console.log('product-finder.js executing...'); // Version indicator - Enhanced

document.addEventListener('DOMContentLoaded', () => {
  console.log('DOMContentLoaded event fired.');

  // --- Cache-Related Constants ---
  const CACHE_VERSION_KEY = 'fitmentGlobalCacheVersion';
  const CURRENT_CACHE_VERSION = 'v1.0.1'; // Manually update to force invalidation of localStorage
  const LONG_CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; /* 24 hours */
  const SHORT_CACHE_EXPIRY_MS = 30 * 60 * 1000; /* 30 minutes (this was CACHE_EXPIRY_MS) */
  const CACHE_PREFIX = 'fitmentCache_'; // Used for both localStorage and sessionStorage items

  // --- Other Constants ---
  const PLACEHOLDERS = { TYPE: '-- Select Type --', CATEGORY: '-- Select Category --', MAKE: '-- Select Make --', YEAR: '-- Select Year --', MODEL: '-- Select Model --' };
  const API_RESPONSE_KEYS = { TYPES: 'types', CATEGORIES: 'fitmentCategories', MAKES: 'makes', YEARS: 'years', MODELS: 'models', PRODUCTS: 'fitmentProducts', PRODUCT_SKU: 'itemNumber', PRODUCT_DESC: 'description', CATEGORY_MAIN: 'category', CATEGORY_SUB: 'subCategory' };
  // const CACHE_EXPIRY_MS = SHORT_CACHE_EXPIRY_MS; // Replaced by SHORT_CACHE_EXPIRY_MS
  const DESKTOP_BREAKPOINT = 769;
  const STORAGE_KEY_PREFIX = 'fitmentToggleState_'; // For section collapse state
  const SAVED_VEHICLES_STORAGE_KEY = 'userSavedVehicles'; // For remembering user's saved vehicles
  const ACTIVE_VEHICLE_ID_STORAGE_KEY = 'activeVehicleId'; // For storing the ID of the active vehicle
  const SKELETON_CARD_COUNT = 6; // Number of skeleton cards to show while loading products


  // --- Global Cache Version Validation ---
  const initOrValidateLocalCacheVersion = () => {
    try {
      if (typeof localStorage === 'undefined') {
        console.warn('localStorage is not available. Skipping cache version validation.');
        return;
      }
      const storedVersion = localStorage.getItem(CACHE_VERSION_KEY);
      if (storedVersion !== CURRENT_CACHE_VERSION) {
        console.log(`Fitment Cache: Version mismatch (stored: ${storedVersion}, current: ${CURRENT_CACHE_VERSION}). Clearing fitment-related localStorage.`);
        let clearedCount = 0;
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (key && key.startsWith(CACHE_PREFIX)) {
            localStorage.removeItem(key);
            clearedCount++;
          }
        }
        localStorage.setItem(CACHE_VERSION_KEY, CURRENT_CACHE_VERSION);
        console.log(`Fitment Cache: Cleared ${clearedCount} localStorage items and set version to ${CURRENT_CACHE_VERSION}.`);
      } // else {
        // console.log(`Fitment Cache: Version ${CURRENT_CACHE_VERSION} is up to date.`); // Removed for less verbosity
      //}
    } catch (e) {
      console.error('Fitment Cache: Error during localStorage cache version validation:', e);
    }
  };

  initOrValidateLocalCacheVersion(); // Call once before processing sections

  const getStorage = (typeStr) => {
    try {
      if (typeStr === 'local' && typeof localStorage !== 'undefined') return localStorage;
      if (typeStr === 'session' && typeof sessionStorage !== 'undefined') return sessionStorage;
    } catch (e) { /* ignore, will return null */ }
    console.warn(`Fitment Cache: Storage type '${typeStr}' is not available.`);
    return null;
  };

  // Check if Choices library is loaded globally
  if (typeof Choices === 'undefined') {
    console.error('Choices.js library not found. Please ensure it is loaded globally before this script.');
  }

  const sectionStates = {}; // To store state per section, like last retryable action

  const fitmentSections = document.querySelectorAll('.fitment-selector-section');
  console.log(`Found ${fitmentSections.length} fitment sections.`);

  fitmentSections.forEach((section) => {
    const sectionId = section.dataset.sectionId;
    // Initialize state for this section
    sectionStates[sectionId] = {
      currentActionInProgress: null,
      // storageKey below is for the toggle state, not the retry mechanism directly
      storageKey: `${STORAGE_KEY_PREFIX}${sectionId}`
    };
    console.log(`Processing section: ${sectionId}`);

    // --- Configuration & Element References ---
    const apiBaseUrl = section.dataset.apiBaseUrl;
    const apiToken = section.dataset.apiToken;
    // const storefrontApiUrl = section.dataset.storefrontApiUrl || SHOPIFY_STOREFRONT_API_URL_PLACEHOLDER; // Removed
    // const storefrontAccessToken = section.dataset.storefrontAccessToken || SHOPIFY_STOREFRONT_ACCESS_TOKEN_PLACEHOLDER; // Removed
    const isToggleEnabled = section.dataset.toggleEnabled === 'true';

    const apiEndpoints = {
      types: section.dataset.apiGetTypes,
      categories: section.dataset.apiGetCategories,
      makes: section.dataset.apiGetMakes,
      years: section.dataset.apiGetYears,
      models: section.dataset.apiGetModels,
      products: section.dataset.apiGetProducts,
    };

    const elements = {
        typeSelect: section.querySelector(`#fitment-type-${sectionId}`),
        categorySelect: section.querySelector(`#fitment-category-${sectionId}`),
        makeSelect: section.querySelector(`#fitment-make-${sectionId}`),
        yearSelect: section.querySelector(`#fitment-year-${sectionId}`),
        modelSelect: section.querySelector(`#fitment-model-${sectionId}`),
        findPartsButton: section.querySelector(`#fitment-find-parts-${sectionId}`),
        resetButton: section.querySelector(`#fitment-reset-${sectionId}`),
        resultsContainer: section.querySelector(`#fitment-results-${sectionId}`),
        errorMessageContainer: section.querySelector(`#fitment-error-message-${sectionId}`),
        typeLoading: section.querySelector('.fitment-type-loading'),
        categoryLoading: section.querySelector('.fitment-category-loading'),
        makeLoading: section.querySelector('.fitment-make-loading'),
        yearLoading: section.querySelector('.fitment-year-loading'),
        modelLoading: section.querySelector('.fitment-model-loading'),
        searchLoading: section.querySelector('.fitment-search-loading'),
        toggleButton: section.querySelector('.fitment-toggle-button'),
        contentWrapper: section.querySelector('.fitment-content-wrapper'),
    };

    // Create "Save This Vehicle" button (moved slightly lower to group with other button, but functionally same place)
    // const saveVehicleButton = ... (defined below)


    // --- Create UI elements for 'My Saved Vehicles' dropdown ---
    const savedVehicleSelectorWrapper = document.createElement('div');
    savedVehicleSelectorWrapper.id = `pf-saved-vehicles-wrapper-${sectionId}`;
    savedVehicleSelectorWrapper.className = 'pf-saved-vehicles-wrapper fitment-form-row';
    savedVehicleSelectorWrapper.style.display = 'none'; // Initially hidden
    savedVehicleSelectorWrapper.style.marginBottom = '15px';
    savedVehicleSelectorWrapper.style.alignItems = 'center';
    savedVehicleSelectorWrapper.style.display = 'flex'; // Use flex for better alignment of label and select

    const savedVehicleLabel = document.createElement('label');
    savedVehicleLabel.id = `pf-saved-vehicles-label-${sectionId}`;
    savedVehicleLabel.htmlFor = `pf-saved-vehicles-select-${sectionId}`;
    savedVehicleLabel.textContent = 'My Saved Vehicles:';
    savedVehicleLabel.className = 'pf-saved-vehicles-label fitment-label';
    savedVehicleLabel.style.marginRight = '10px';
    // Optional: make label take up less space or ensure consistent sizing with other labels
    savedVehicleLabel.style.flexShrink = '0';


    const savedVehicleSelect = document.createElement('select');
    savedVehicleSelect.id = `pf-saved-vehicles-select-${sectionId}`;
    savedVehicleSelect.name = `pf-saved-vehicles-select-${sectionId}`;
    savedVehicleSelect.className = 'pf-saved-vehicles-select fitment-select';
    savedVehicleSelect.style.flexGrow = '1';
    savedVehicleSelect.style.padding = '8px'; // Match other selects if theme has specific styles

    savedVehicleSelectorWrapper.appendChild(savedVehicleLabel);
    savedVehicleSelectorWrapper.appendChild(savedVehicleSelect);

    // Insert the saved vehicle dropdown wrapper into the DOM
    if (elements.contentWrapper) {
      elements.contentWrapper.insertBefore(savedVehicleSelectorWrapper, elements.contentWrapper.firstChild);
    } else {
      console.warn(`[ProductFinder ${sectionId}] elements.contentWrapper not found. Could not append saved vehicle dropdown.`);
      // Fallback: insert before the type selector if it exists
      if (elements.typeSelect && elements.typeSelect.parentNode) {
        elements.typeSelect.parentNode.insertBefore(savedVehicleSelectorWrapper, elements.typeSelect);
      }
    }

    // Add to elements object for later use
    elements.savedVehicleSelectorWrapper = savedVehicleSelectorWrapper;
    elements.savedVehicleLabel = savedVehicleLabel;
    elements.savedVehicleSelect = savedVehicleSelect;
    // --- End of UI elements for 'My Saved Vehicles' ---


    // Create "Save This Vehicle" button
    const saveVehicleButton = document.createElement('button');
    saveVehicleButton.id = `fitment-save-vehicle-${sectionId}`;
    saveVehicleButton.textContent = 'Save This Vehicle';
    saveVehicleButton.className = 'button fitment-save-vehicle-button'; // Added custom class
    saveVehicleButton.type = 'button';
    saveVehicleButton.style.display = 'none'; // Initially hidden

    // Add to elements object
    elements.saveVehicleButton = saveVehicleButton;

    // Insert the button into the DOM - after the findPartsButton
    if (elements.findPartsButton && elements.findPartsButton.parentNode) {
        elements.findPartsButton.parentNode.insertBefore(saveVehicleButton, elements.findPartsButton.nextSibling);
        // Add some margin if they are inline-block or similar
        if (elements.findPartsButton.nextSibling === saveVehicleButton) { // Check if successfully inserted
             saveVehicleButton.style.marginLeft = '10px'; // Example margin
        }
    } else if (elements.contentWrapper) { // Fallback: append to contentWrapper if button group not structured as expected
        elements.contentWrapper.appendChild(saveVehicleButton);
        saveVehicleButton.style.marginTop = '10px'; // Example margin
    }


    let categoryChoicesInstance = null;
    let currentCategoryOptions = [];

    if (!elements.typeSelect || !elements.categorySelect || !elements.makeSelect || !elements.yearSelect || !elements.modelSelect || !elements.findPartsButton || !elements.resetButton || !elements.resultsContainer || !elements.errorMessageContainer || (isToggleEnabled && (!elements.toggleButton || !elements.contentWrapper))) {
        console.error(`Fitment Selector (${sectionId}): Missing essential HTML elements. Initialization aborted.`);
        if (elements.errorMessageContainer) {
            elements.errorMessageContainer.textContent = 'Initialization failed: Required elements not found.';
            elements.errorMessageContainer.style.display = 'block';
        }
        return;
    }

    if (!apiToken) {
        console.error(`Fitment Selector (${sectionId}): API Token is missing.`);
        displayError('API Token is missing. Please configure it in the Theme Settings under API Integrations.', sectionId);
        disableAllSelectors();
        if(elements.findPartsButton) elements.findPartsButton.disabled = true;
        if(elements.resetButton) elements.resetButton.disabled = true;
        return;
    }

    // --- Helper Functions ---

    const getCache = (key, storageTypeStr = 'session') => {
      const storage = getStorage(storageTypeStr);
      if (!storage) return null;

      const cacheKey = `${CACHE_PREFIX}${sectionId}_${key}`;
      try {
        const itemStr = storage.getItem(cacheKey);
        if (!itemStr) return null;
        const item = JSON.parse(itemStr);
        if (new Date().getTime() > item.expiry) {
          storage.removeItem(cacheKey);
          console.log(`Fitment Cache: Expired key ${cacheKey} from ${storageTypeStr}Storage.`);
          return null;
        }
        return item.value;
      } catch (e) {
        console.error(`Fitment Cache: Error reading from ${storageTypeStr}Storage key ${cacheKey}:`, e);
        try { storage.removeItem(cacheKey); } catch (removeError) { /* Failsafe */ }
        return null;
      }
    };

    const setCache = (key, value, storageTypeStr = 'session') => {
      const storage = getStorage(storageTypeStr);
      if (!storage) return;

      const cacheKey = `${CACHE_PREFIX}${sectionId}_${key}`;
      const expiryDuration = storageTypeStr === 'local' ? LONG_CACHE_EXPIRY_MS : SHORT_CACHE_EXPIRY_MS;
      const item = { value: value, expiry: new Date().getTime() + expiryDuration };

      try {
        storage.setItem(cacheKey, JSON.stringify(item));
      } catch (e) {
        console.error(`Fitment Cache: Error setting ${storageTypeStr}Storage key ${cacheKey}:`, e);
        if (e.name === 'QuotaExceededError' || (e.code && (e.code === 22 || e.code === 1014))) { // DOMException codes for quota errors
          console.warn(`Fitment Cache: Quota exceeded for ${storageTypeStr}Storage. Attempting to clear old items for section ${sectionId}...`);
          try {
            let clearedCount = 0;
            // Iterate and remove items with the same prefix and sectionId from the failing storage
            for (let i = storage.length - 1; i >= 0; i--) {
              const k = storage.key(i);
              if (k && k.startsWith(`${CACHE_PREFIX}${sectionId}_`)) {
                // Potentially add more logic here: e.g., don't remove the item we are trying to set, or sort by expiry if available
                storage.removeItem(k);
                clearedCount++;
              }
            }
            console.log(`Fitment Cache: Cleared ${clearedCount} items from ${storageTypeStr}Storage for section ${sectionId}.`);
            // Try setting again
            storage.setItem(cacheKey, JSON.stringify(item));
            console.log(`Fitment Cache: Successfully set ${cacheKey} after clearing space.`);
          } catch (retryError) {
            console.error(`Fitment Cache: Failed to set ${cacheKey} even after attempting to clear space:`, retryError);
          }
        }
      }
    };

    // Clears only SESSION storage for the current section. Local storage is managed by versioning.
    const clearCache = () => {
      const storage = getStorage('session');
      if (!storage) return;
      try {
        let clearedCount = 0;
        // Iterate backwards when removing items from a collection being modified
        for (let i = storage.length - 1; i >= 0; i--) {
          const key = storage.key(i);
          if (key && key.startsWith(`${CACHE_PREFIX}${sectionId}_`)) {
            storage.removeItem(key);
            clearedCount++;
          }
        }
        console.log(`Fitment Cache: Cleared ${clearedCount} session storage items for section ${sectionId}.`);
      } catch (e) {
        console.error(`Fitment Cache: Error clearing session cache for section ${sectionId}:`, e);
      }
    };

    const toggleLoading = (loader, show) => {
      if (loader) {
        loader.style.display = show ? 'inline-flex' : 'none';
      }
    };

    /** Displays an error message in the designated container. Provides user-friendly messages. */
    const displayError = (message, currentSectionId, isRetryableError = false) => {
      const errorContainer = document.querySelector(`#fitment-error-message-${currentSectionId}`);
      let userFriendlyMessage = message;

      // Standardize user-friendly messages
      if (message.toLowerCase().includes("failed to fetch") || message.toLowerCase().includes("network error")) {
          userFriendlyMessage = "A network error occurred. Please check your internet connection and try again.";
          isRetryableError = true; // Always consider these retryable
      } else if (message.toLowerCase().includes("timed out")) {
          userFriendlyMessage = "The request took too long to respond. Please try again shortly.";
          isRetryableError = true; // Always consider these retryable
      } else if (message.toLowerCase().includes("server encountered an error")) {
          userFriendlyMessage = "The server encountered an error. Please try again shortly.";
          isRetryableError = true; // Often retryable
      } else if (message.toLowerCase().includes("api token")) {
          userFriendlyMessage = message; // Keep specific token messages, usually not retryable by user action
          isRetryableError = false;
      }


      console.error(`Fitment Error (${currentSectionId}): ${message}. Retryable: ${isRetryableError}`);
      if (errorContainer) {
        // Clear previous error content, especially if there was a try again button
        errorContainer.innerHTML = '';

        const textNode = document.createTextNode(`Error: ${userFriendlyMessage} `); // Space for button
        errorContainer.appendChild(textNode);

        if (isRetryableError && sectionStates[currentSectionId]?.currentActionInProgress) {
          const tryAgainButton = document.createElement('button');
          tryAgainButton.textContent = 'Try Again';
          tryAgainButton.className = 'fitment-try-again-button'; // For styling
          tryAgainButton.type = 'button';

          tryAgainButton.addEventListener('click', () => {
            console.log(`Retrying action for section ${currentSectionId}`);
            clearError(currentSectionId); // Clear the error message
            tryAgainButton.disabled = true; // Prevent multiple clicks
            // Show a small loading indicator or message if desired here
            const actionToRetry = sectionStates[currentSectionId].currentActionInProgress;
            if (typeof actionToRetry === 'function') {
                actionToRetry(); // Re-execute the stored action
            } else {
                console.error('No valid action to retry or action was cleared.');
                // If no action, display a generic error or do nothing further.
                // This path should ideally not be hit if button is only shown when action is present.
            }
          });
          errorContainer.appendChild(tryAgainButton);
        }
        errorContainer.style.display = 'block';
      }
    };

    const clearError = (currentSectionId) => {
      const errorContainer = document.querySelector(`#fitment-error-message-${currentSectionId}`);
      if (errorContainer) {
        errorContainer.innerHTML = ''; // Clear all content, including try again button
        errorContainer.style.display = 'none';
      }
    };

    const resetSelect = (selectElement, placeholder, disable = true) => {
      if (!selectElement) return;
      let placeholderOption = selectElement.querySelector('option[value=""]');
      if (!placeholderOption) {
          placeholderOption = document.createElement('option');
          placeholderOption.value = "";
          placeholderOption.disabled = true;
          placeholderOption.selected = true;
          placeholderOption.textContent = placeholder;
          selectElement.innerHTML = '';
          selectElement.appendChild(placeholderOption);
      } else {
          selectElement.innerHTML = '';
          selectElement.appendChild(placeholderOption);
          placeholderOption.selected = true;
      }
      selectElement.disabled = disable;
      if (selectElement === elements.categorySelect) {
          destroyCategoryChoices();
      }
    };

    const populateSelect = (selectElement, options, valueKey = 'value', textKey = 'text') => {
      if (!selectElement || !Array.isArray(options)) {
        console.error(`populateSelect (${selectElement?.id}): Invalid options or selectElement. Options:`, options);
        if (selectElement) selectElement.disabled = true;
        return;
      }
      const placeholder = selectElement.options[0];
      selectElement.innerHTML = '';
      selectElement.appendChild(placeholder);
      placeholder.selected = true;

      options.forEach((option) => {
        const optionElement = document.createElement('option');
        if (typeof option === 'object' && option !== null) {
          optionElement.value = option[valueKey];
          optionElement.textContent = option[textKey];
        } else {
          optionElement.value = option;
          optionElement.textContent = option;
        }
        selectElement.appendChild(optionElement);
      });

      selectElement.disabled = options.length === 0;
      if (selectElement === elements.categorySelect) {
          initializeCategoryChoices();
      }
    };

    const destroyCategoryChoices = () => {
        if (categoryChoicesInstance) {
            try { categoryChoicesInstance.destroy(); }
            catch(e) { console.error(`Error destroying Choices.js instance for section ${sectionId}:`, e); e = null; }
            finally {
                 categoryChoicesInstance = null;
                 if (elements.categorySelect) elements.categorySelect.style.display = '';
            }
        }
    };

    const initializeCategoryChoices = () => {
        destroyCategoryChoices();
        if (typeof Choices !== 'undefined' && elements.categorySelect && elements.categorySelect.options.length > 1) {
            try {
                categoryChoicesInstance = new Choices(elements.categorySelect, {
                    searchEnabled: true, itemSelectText: '', shouldSort: false, placeholder: true, removeItemButton: false, searchPlaceholderValue: "Type to filter categories...",
                });
                console.log(`Choices.js initialized for section ${sectionId} category select.`);
                elements.categorySelect.disabled = false;
            } catch (e) {
                console.error(`Error initializing Choices.js for section ${sectionId}:`, e);
                if (elements.categorySelect) {
                    elements.categorySelect.style.display = '';
                    elements.categorySelect.disabled = (elements.categorySelect.options.length <= 1);
                }
            }
        } else {
            if (elements.categorySelect) {
                elements.categorySelect.style.display = '';
                elements.categorySelect.disabled = (elements.categorySelect.options.length <= 1);
            }
        }
    };

    const resetSubsequentDropdowns = (currentLevel) => {
      const levels = ['type', 'category', 'make', 'year', 'model'];
      const startIndex = levels.indexOf(currentLevel) + 1;
      for (let i = startIndex; i < levels.length; i++) {
        const level = levels[i];
        let selectElement; let placeholder;
        switch (level) {
          case 'category': selectElement = elements.categorySelect; placeholder = PLACEHOLDERS.CATEGORY; break;
          case 'make': selectElement = elements.makeSelect; placeholder = PLACEHOLDERS.MAKE; break;
          case 'year': selectElement = elements.yearSelect; placeholder = PLACEHOLDERS.YEAR; break;
          case 'model': selectElement = elements.modelSelect; placeholder = PLACEHOLDERS.MODEL; break;
        }
        if (selectElement) resetSelect(selectElement, placeholder);
      }
      if(elements.findPartsButton) elements.findPartsButton.disabled = true;
      if(elements.saveVehicleButton) elements.saveVehicleButton.style.display = 'none'; // Hide save button
      if (['type', 'category', 'make', 'year'].includes(currentLevel)) {
        if(elements.resultsContainer) elements.resultsContainer.innerHTML = '<p>Please select your vehicle details above to find compatible parts.</p>';
        clearError(sectionId);
      }
    };

    const disableAllSelectors = () => {
        if(elements.typeSelect) elements.typeSelect.disabled = true;
        if (elements.categorySelect) {
            destroyCategoryChoices();
            elements.categorySelect.disabled = true;
        }
        if(elements.makeSelect) elements.makeSelect.disabled = true;
        if(elements.yearSelect) elements.yearSelect.disabled = true;
        if(elements.modelSelect) elements.modelSelect.disabled = true;
        if(elements.findPartsButton) elements.findPartsButton.disabled = true;
        if(elements.saveVehicleButton) elements.saveVehicleButton.style.display = 'none'; // Hide save button
    };

    const resetAllSelectorsAndResults = () => {
      console.log(`Resetting all selectors for section ${sectionId}`);
      clearCache(); // Clears session storage for this section
      try {
          const localSt = getStorage('local');
          if (localSt) {
            localSt.removeItem(SAVED_VEHICLES_STORAGE_KEY);
            localSt.removeItem(ACTIVE_VEHICLE_ID_STORAGE_KEY); // Also remove active vehicle ID
            console.log(`Cleared saved vehicles list and active vehicle ID from localStorage.`);
            document.dispatchEvent(new CustomEvent('userSavedVehiclesChanged')); // Dispatch event
            // Clean up the old key as well
            localSt.removeItem('lastSelectedVehicle');
            console.log(`Ensured old 'lastSelectedVehicle' key is also removed from localStorage.`);
          }
      } catch (e) {
        console.warn(`Could not clear saved vehicles and active ID from localStorage:`, e);
      }

      // Reset type selector and trigger re-initialization, which will load types from localStorage or API.
      resetSelect(elements.typeSelect, PLACEHOLDERS.TYPE, true); // true to disable initially

      // Other dropdowns will be reset by the re-initialization process starting with types.
      resetSelect(elements.categorySelect, PLACEHOLDERS.CATEGORY, true);
      resetSelect(elements.makeSelect, PLACEHOLDERS.MAKE, true);
      resetSelect(elements.yearSelect, PLACEHOLDERS.YEAR, true);
      resetSelect(elements.modelSelect, PLACEHOLDERS.MODEL, true);

      if(elements.findPartsButton) elements.findPartsButton.disabled = true;
      if(elements.saveVehicleButton) {
        elements.saveVehicleButton.style.display = 'none'; // Hide save button
        elements.saveVehicleButton.textContent = 'Save This Vehicle'; // Reset text
        // elements.saveVehicleButton.disabled = false; // Ensure enabled, if previously disabled on save
      }
      if(elements.resultsContainer) elements.resultsContainer.innerHTML = '<p>Please select your vehicle details above to find compatible parts.</p>';
      clearError(sectionId); // Clear any existing error messages

      // Call initialize to refresh the selectors, starting with types from (local) cache or API.
      initialize();

      // Ensure all loaders are off after a reset. Initialize might turn some on.
      toggleLoading(elements.typeLoading, false); // Initialize handles its own loading for types
      toggleLoading(elements.categoryLoading, false);
      toggleLoading(elements.makeLoading, false);
      toggleLoading(elements.yearLoading, false);
      toggleLoading(elements.modelLoading, false);
      toggleLoading(elements.searchLoading, false);

       if (isToggleEnabled && elements.toggleButton) {
            setInitialToggleState();
       }
    };

    const saveSelectedVehicle = () => {
        // Saves the currently selected vehicle details to a list in localStorage.
        const selectedType = elements.typeSelect?.value;
        const selectedCombinedCategory = elements.categorySelect?.value;
        const selectedMake = elements.makeSelect?.value;
        const selectedYear = elements.yearSelect?.value;
        const selectedModel = elements.modelSelect?.value;

        if (selectedType && selectedCombinedCategory && selectedMake && selectedYear && selectedModel) {
            let category = '', subCategory = '';
            if (selectedCombinedCategory) {
                 const parts = selectedCombinedCategory.split(' - ');
                 category = parts[0].trim();
                 if (parts.length > 1) { subCategory = parts.slice(1).join(' - ').trim(); }
            }

            const newVehicle = {
                id: Date.now(), // Unique ID
                name: `${selectedMake} ${selectedModel} ${selectedYear}`, // Placeholder name
                type: selectedType,
                category: category,
                subCategory: subCategory,
                make: selectedMake,
                year: selectedYear,
                model: selectedModel
            };

            try {
                const storage = getStorage('local');
                if (!storage) {
                    console.warn('localStorage is not available. Cannot save vehicle list.');
                    return;
                }

                let savedVehicles = [];
                const existingVehiclesStr = storage.getItem(SAVED_VEHICLES_STORAGE_KEY);
                if (existingVehiclesStr) {
                    try {
                        savedVehicles = JSON.parse(existingVehiclesStr);
                        if (!Array.isArray(savedVehicles)) { // Ensure it's an array
                            console.warn('Existing saved vehicles data is not an array, resetting.');
                            savedVehicles = [];
                        }
                    } catch (parseError) {
                        console.error('Error parsing saved vehicles from localStorage, resetting list:', parseError);
                        savedVehicles = [];
                    }
                }

                // Check for duplicates (based on type, make, model, year)
                const isDuplicate = savedVehicles.some(vehicle =>
                    vehicle.type === newVehicle.type &&
                    vehicle.make === newVehicle.make &&
                    vehicle.model === newVehicle.model &&
                    vehicle.year === newVehicle.year &&
                    vehicle.category === newVehicle.category && // Also check category for stricter duplication
                    vehicle.subCategory === newVehicle.subCategory
                );

                if (!isDuplicate) {
                    savedVehicles.push(newVehicle);
                    storage.setItem(SAVED_VEHICLES_STORAGE_KEY, JSON.stringify(savedVehicles));
                    console.log('Updated saved vehicles list in localStorage:', savedVehicles);
                    document.dispatchEvent(new CustomEvent('userSavedVehiclesChanged')); // Dispatch event

                    // Set active vehicle if needed
                    const newlySavedVehicleId = String(newVehicle.id); // Ensure it's a string

                    // Always set the newly saved vehicle as the active one.
                    storage.setItem(ACTIVE_VEHICLE_ID_STORAGE_KEY, newlySavedVehicleId);
                    console.log(`[ProductFinder ${sectionId}] Set active vehicle ID to newly saved vehicle: ${newlySavedVehicleId}`);

                    // Dispatch the 'activeVehicleChanged' event so other components can react.
                    document.dispatchEvent(new CustomEvent('activeVehicleChanged', { detail: { vehicle: newVehicle } }));
                } else {
                    console.log(`[ProductFinder ${sectionId}] Vehicle already exists in the saved list, not adding duplicate:`, newVehicle);
                    // If the vehicle is a duplicate of an existing one, we might still want to make it active.
                    // Find the existing vehicle to get its ID, as newVehicle.id would be different if not added.
                    const existingVehicle = savedVehicles.find(v =>
                        v.type === newVehicle.type &&
                        v.make === newVehicle.make &&
                        v.model === newVehicle.model &&
                        v.year === newVehicle.year &&
                        v.category === newVehicle.category &&
                        v.subCategory === newVehicle.subCategory
                    );
                    if (existingVehicle) {
                        const existingVehicleId = String(existingVehicle.id);
                        storage.setItem(ACTIVE_VEHICLE_ID_STORAGE_KEY, existingVehicleId);
                        console.log(`[ProductFinder ${sectionId}] Set active vehicle ID to existing duplicate vehicle: ${existingVehicleId}`);
                        document.dispatchEvent(new CustomEvent('activeVehicleChanged', { detail: { vehicle: existingVehicle } }));
                    }
                }
            } catch (e) {
                console.warn(`[ProductFinder ${sectionId}] Could not update saved vehicles list or active vehicle ID in localStorage:`, e);
            }
        } else {
            // No change in behavior if selection is incomplete - we don't clear the list,
            // as the user might be in the process of selecting.
            // The old logic cleared the single selected vehicle, which is not applicable to a list.
            console.log('Selection is incomplete, not attempting to save vehicle to list.');
        }
    };

    // --- API and Shopify Fetching Functions ---

    // const fetchShopifyProductsGraphQL = ...; // Removed

    const fetchAPI = async (url, method = 'GET', body = null) => {
        // Generic API fetching function, used for the Gamma Powersports API.
        // Includes timeout, error handling, and retryability flags.
        if (!url || typeof url !== 'string' || !url.startsWith('http')) {
            if (!url.startsWith('/')) { // Allow relative URLs for Shopify proxy/suggest calls (though not used by Gamma)
                 const err = new Error(`Invalid API endpoint URL: ${url}`);
                 err.isRetryable = false;
                 throw err;
            }
        }
        const headers = { 'Accept': 'application/json' };
        if (!url.startsWith('/search/suggest.json') && !url.startsWith('/products/')) {
            if (!apiToken) {
                const err = new Error("API Token is missing.");
                err.isRetryable = false; // Not retryable if token is missing
                throw err;
            }
            headers['Authorization'] = `Bearer ${apiToken}`;
        }

        const options = { method: method, headers: headers, signal: AbortSignal.timeout(15000) }; // 15 second timeout
        if (body && (method === 'POST' || method === 'PUT')) {
            options.body = JSON.stringify(body);
            headers['Content-Type'] = 'application/json';
        }

        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                let errorData = null;
                let responseText = '';
                try { responseText = await response.text(); } catch (e) { /* ignore */ }
                try { errorData = JSON.parse(responseText); } catch (e) { /* ignore if not json */ }

                let errorMessage = `API Error: ${response.status} ${response.statusText}`;
                let isRetryable = false;

                 switch (response.status) {
                      case 401: errorMessage = "Authentication failed. Please check the API Token (if applicable for this endpoint)."; isRetryable = false; break;
                      case 403: errorMessage = "Permission denied for this request."; isRetryable = false; break;
                      case 404: errorMessage = "API endpoint not found. Please check configuration."; isRetryable = false; break;
                      case 429: errorMessage = "Too many requests to the server. Please wait and try again."; isRetryable = true; break;
                      case 500: case 502: case 503: case 504: errorMessage = "The server encountered an error. Please try again later."; isRetryable = true; break;
                      default: errorMessage = errorData?.error?.message || errorData?.message || responseText.substring(0,100) || errorMessage; isRetryable = false;
                 }
                 console.error(`API Error Data for ${url}:`, errorData || responseText);
                 const err = new Error(errorMessage);
                 err.isRetryable = isRetryable;
                 err.statusCode = response.status;
                 throw err;
            }
            if (response.status === 204) return null; // No Content
            const data = await response.json();
            // Assuming Gamma API specific error structure if data.status is present and not success
            if (data.status && data.status !== 'success' && data.status !== 200) {
                const appErrorMessage = data.error?.message || data.message || 'API returned a non-success status.';
                const err = new Error(appErrorMessage);
                err.isRetryable = false; // Application-level errors from API usually not retryable
                throw err;
            }
            return data.data || data; // Assuming actual data is nested under 'data' key or is the response itself
        } catch (error) {
            // Re-throw if it's already our custom error with isRetryable, or enhance it
            if (error.name === 'AbortError') {
                error.message = "Request timed out."; // Standardize message
                error.isRetryable = true;
            } else if (error.message && error.message.toLowerCase().includes('failed to fetch')) {
                // This is a generic network error from fetch itself
                error.message = "Network error. Failed to connect to the API.";
                error.isRetryable = true;
            } else if (typeof error.isRetryable === 'undefined') {
                // For other unexpected errors, mark as not retryable by default
                error.isRetryable = false;
            }
            console.error(`Fetch API error for ${url}:`, error.message, `Retryable: ${error.isRetryable}`);
            throw error; // Propagate the (potentially enhanced) error
        }
    };

    /**
     * Fetches Shopify product/variant data by SKU using older multi-step method.
     * Kept for potential reference or if GraphQL is unavailable, but primary path is GraphQL.
     * This function fetches product data using a two-step REST-based approach:
     * 1. Uses Shopify's search suggest API to find a product handle by SKU.
     * 2. Fetches the full product data using the obtained handle via product.js.
     */
    const fetchShopifyProductBySkuMultiStep = async (sku) => {
        if (!sku) {
            console.warn('fetchShopifyProductBySkuMultiStep: Called with no SKU.');
            return null;
        }
        const normalizedSku = String(sku).trim().toLowerCase();
        if (!normalizedSku) {
            console.warn(`fetchShopifyProductBySkuMultiStep: SKU normalized to empty string (original: ${sku}).`);
            return null;
        }

        let productHandle = null;

        // Step 1: Fetch product handle using /search/suggest.json
        try {
            const encodedSkuQuery = encodeURIComponent(`variants.sku:"${normalizedSku}"`);
            const suggestUrl = `/search/suggest.json?q=${encodedSkuQuery}&resources[type]=product&resources[limit]=1&resources[options][unavailable_products]=show&resources[fields]=handle`;

            const suggestResponse = await fetch(suggestUrl);
            if (!suggestResponse.ok) {
                console.error(`Shopify suggest fetch error for SKU ${normalizedSku}: ${suggestResponse.status} ${suggestResponse.statusText}`);
                return null;
            }
            const suggestions = await suggestResponse.json();

            // Validate suggestions structure
            if (suggestions && suggestions.resources && suggestions.resources.results && Array.isArray(suggestions.resources.results.products) && suggestions.resources.results.products.length > 0) {
                productHandle = suggestions.resources.results.products[0].handle;
            } else {
                console.warn(`No product handle found for SKU ${normalizedSku} via suggest API. Response:`, suggestions);
                return null;
            }
        } catch (error) {
            console.error(`Shopify suggest fetch exception for SKU ${normalizedSku}:`, error);
            return null;
        }

        if (!productHandle) { // Should have already returned null if handle wasn't found
             console.warn(`fetchShopifyProductBySkuMultiStep: No productHandle derived for SKU ${normalizedSku} after suggest call.`);
             return null;
        }

        // Step 2: Fetch full product data using the handle
        try {
            const productJsonUrl = `/products/${productHandle}.js`;
            const productResponse = await fetch(productJsonUrl);

            if (!productResponse.ok) {
                console.error(`Shopify product JSON fetch error for handle ${productHandle} (SKU ${normalizedSku}): ${productResponse.status} ${productResponse.statusText}`);
                return null;
            }
            const fullProductData = await productResponse.json();

            // Validate product data and variants
            if (!fullProductData || !Array.isArray(fullProductData.variants)) {
                console.warn(`No variants found in product data for handle ${productHandle} (SKU ${normalizedSku}). Product data:`, fullProductData);
                return null;
            }

            const matchingVariant = fullProductData.variants.find(v => v.sku && String(v.sku).trim().toLowerCase() === normalizedSku);
            if (matchingVariant) {
                return {
                    product: {
                        handle: fullProductData.handle,
                        title: fullProductData.title,
                        featured_image: fullProductData.featured_image,
                    },
                    variant: {
                        id: String(matchingVariant.id),
                        sku: matchingVariant.sku,
                        title: matchingVariant.title,
                        price: matchingVariant.price,
                        available: matchingVariant.available,
                        featured_image: matchingVariant.featured_image,
                    }
                };
            } else {
                 console.warn(`SKU ${normalizedSku} not found in variants for product handle ${productHandle}.`);
                 return null;
            }
        } catch (error) {
            console.error(`Shopify product JSON fetch exception for handle ${productHandle} (SKU ${normalizedSku}):`, error);
            return null;
        }
    };

    /** Creates an HTML product card element. Adapts to GraphQL and REST-like structures. */
    const createProductCard = (product, variant) => {
        if (!product || !variant) return null;
        const cardLink = document.createElement('a');
        cardLink.className = 'fitment-product-card card-fade-in';

        // Extract numeric variant ID for URL (works for GID "gid://shopify/ProductVariant/12345" and simple "12345")
        const variantIdNumber = variant.id ? String(variant.id).substring(String(variant.id).lastIndexOf('/') + 1) : null;
        cardLink.href = variantIdNumber ? `/products/${product.handle}?variant=${variantIdNumber}` : `/products/${product.handle}`;

        const imageContainer = document.createElement('div');
        imageContainer.className = 'fitment-product-image-container';

        const imageElement = document.createElement('img');
        imageElement.className = 'fitment-product-image';

        // Image handling: GraphQL provides objects like { url, altText }, REST .js gives string or { src, alt }
        let imageUrl, imageAlt;
        const pfi = product.featured_image; // Product Featured Image
        const vfi = variant.featured_image; // Variant Featured Image (could be from variant.image or product.featuredImage in GraphQL)

        if (vfi) { // Variant image takes precedence
            imageUrl = vfi.url || vfi.src;
            imageAlt = vfi.altText || vfi.alt || product.title;
        } else if (pfi) { // Fallback to product image
            imageUrl = pfi.url || pfi.src || pfi; // pfi could be a string URL directly
            imageAlt = pfi.altText || pfi.alt || product.title;
        }
        imageElement.src = imageUrl || 'https://placehold.co/180x120/e9ecef/6c757d?text=No+Image';
        imageElement.alt = imageAlt || 'Product Image';
        imageElement.loading = 'lazy';
        imageElement.onerror = (e) => {
            e.target.src = 'https://placehold.co/180x120/e9ecef/6c757d?text=Load+Error';
            e.target.onerror = null;
            e.target.closest('.fitment-product-image-container')?.classList.add('image-load-error');
        };
        imageContainer.appendChild(imageElement);
        cardLink.appendChild(imageContainer);

        const infoElement = document.createElement('div');
        infoElement.className = 'fitment-product-info';

        const titleElement = document.createElement('div');
        titleElement.className = 'fitment-product-title';
        titleElement.textContent = product.title || 'Product Title Missing';
        if (variant.title && variant.title.toLowerCase() !== 'default title') {
            const variantTitleSpan = document.createElement('span');
            variantTitleSpan.className = 'fitment-product-variant-title';
            variantTitleSpan.textContent = variant.title;
            titleElement.appendChild(variantTitleSpan);
        }
        infoElement.appendChild(titleElement);

        const stockElement = document.createElement('div');
        stockElement.className = 'fitment-product-stock';
        stockElement.textContent = variant.available ? 'In Stock' : 'Out of Stock';
        stockElement.classList.add(variant.available ? 'stock-in' : 'stock-out');
        infoElement.appendChild(stockElement);

        const priceElement = document.createElement('div');
        priceElement.className = 'fitment-product-price';
        // Price is expected in cents (e.g., from GraphQL or .js variant.price)
        priceElement.textContent = typeof variant.price === 'number' ? `$${(variant.price / 100).toFixed(2)}` : 'N/A';
        infoElement.appendChild(priceElement);

        cardLink.appendChild(infoElement);
        return cardLink;
    };

    const createSkeletonCard = () => {
        const skeletonCard = document.createElement('div');
        skeletonCard.className = 'fitment-product-card skeleton-card';
        skeletonCard.innerHTML = `
            <div class="skeleton-image"></div>
            <div class="skeleton-info">
                <div class="skeleton-line title"></div>
                <div class="skeleton-line short"></div>
                <div class="skeleton-line price"></div>
            </div>
        `;
        return skeletonCard;
    };

    const createUnmatchedSkuCard = (sku, description) => {
        const cardDiv = document.createElement('div');
        cardDiv.className = 'fitment-product-not-found card-fade-in'; // Added card-fade-in
        const displaySku = sku || 'N/A';
        const displayDesc = description || 'Unknown Description';
        cardDiv.innerHTML = `<p>Part Found:</p><strong>${displayDesc}</strong><small>(SKU: ${displaySku})</small><span>Not available in this store.</span>`;
        return cardDiv;
    };

    /**
     * Fetches Shopify data and displays results. Shows skeleton loaders during fetch.
     * PERFORMANCE NOTE: For a very large number of product cards, consider appending
     * them to a DocumentFragment first, then appending the fragment to the DOM once
     * to minimize reflows/repaints.
     */
    const displayResults = async (fitmentProducts) => {
        if (!elements.resultsContainer) return;
        elements.resultsContainer.innerHTML = ''; // Clear previous results or "select vehicle" message

        if (!Array.isArray(fitmentProducts) || fitmentProducts.length === 0) {
            elements.resultsContainer.innerHTML = '<p>No matching part numbers found for the selected vehicle.</p>';
            return;
        }

        const productGrid = document.createElement('div');
        productGrid.className = 'fitment-product-grid';

        // Show skeleton loaders
        for (let i = 0; i < Math.min(fitmentProducts.length, SKELETON_CARD_COUNT); i++) {
            productGrid.appendChild(createSkeletonCard());
        }
        elements.resultsContainer.appendChild(productGrid);

        // Revert to using fetchShopifyProductBySkuMultiStep for each product
        const shopifyDataPromises = fitmentProducts.map(gammaProduct => {
            const sku = gammaProduct ? gammaProduct[API_RESPONSE_KEYS.PRODUCT_SKU] : undefined;
            const description = gammaProduct ? gammaProduct[API_RESPONSE_KEYS.PRODUCT_DESC] : undefined;
            if (!sku) {
                // Return a resolved promise with null shopifyResult for SKUs missing from API response
                return Promise.resolve({ sku: 'MISSING_SKU', description, shopifyResult: null });
            }
            return fetchShopifyProductBySkuMultiStep(sku)
                .then(shopifyResult => ({ sku, description, shopifyResult })) // shopifyResult is {product, variant} or null
                .catch(error => {
                    // This catch is a fallback, as fetchShopifyProductBySkuMultiStep should handle its own errors and return null.
                    // However, if it somehow throws an unhandled error, we catch it here.
                    console.error(`Critical Error during fetchShopifyProductBySkuMultiStep for SKU ${sku}:`, error);
                    return { sku, description, shopifyResult: null, error: true }; // Mark error for potential specific handling
                });
        });

        const shopifyResultsSettled = await Promise.allSettled(shopifyDataPromises);

        productGrid.innerHTML = ''; // Clear skeletons before adding actual cards
        let foundCount = 0;
        let unmatchedCount = 0;
        const fragment = document.createDocumentFragment();

        shopifyResultsSettled.forEach(result => {
            if (result.status === 'fulfilled') {
                const { sku, description, shopifyResult, error } = result.value;
                if (error) { // If marked with an error from the catch block above
                    unmatchedCount++;
                    fragment.appendChild(createUnmatchedSkuCard(sku, description));
                    // Optionally, log that this specific item failed due to an unexpected error in fetch step
                    console.warn(`SKU ${sku} processing failed due to an unexpected error in fetchShopifyProductBySkuMultiStep.`);
                } else if (shopifyResult?.product && shopifyResult?.variant) {
                    const productCardElement = createProductCard(shopifyResult.product, shopifyResult.variant);
                    if (productCardElement) {
                        foundCount++;
                        fragment.appendChild(productCardElement);
                    } else { // Should not happen if shopifyResult is valid and createProductCard is robust
                        unmatchedCount++;
                        fragment.appendChild(createUnmatchedSkuCard(sku, description));
                    }
                } else { // shopifyResult is null (handled error in fetchShopifyProductBySkuMultiStep or missing SKU)
                    unmatchedCount++;
                    fragment.appendChild(createUnmatchedSkuCard(sku, description));
                }
            } else { // Promise was rejected (should be rare if fetchShopifyProductBySkuMultiStep catches its own errors)
                unmatchedCount++;
                // result.reason might contain error info. For simplicity, use SKU if available from context.
                // This path implies a more fundamental issue with a promise not settling as expected.
                const sku = result.reason?.sku || 'UNKNOWN_SKU_REJECTED';
                const description = result.reason?.description || 'Unknown Description';
                console.error(`Promise rejected for SKU '${sku}'. Reason:`, result.reason);
                fragment.appendChild(createUnmatchedSkuCard(sku, description));
            }
        });

        productGrid.appendChild(fragment);

        if (foundCount === 0 && unmatchedCount === 0 && fitmentProducts.length > 0) {
             elements.resultsContainer.innerHTML = '<p>No products could be processed or displayed.</p>';
        } else if (foundCount === 0 && unmatchedCount > 0) {
            const summaryMessage = document.createElement('p');
            summaryMessage.textContent = `Found ${unmatchedCount} part number(s) from your vehicle selection, but they are not currently available in this store.`;
            summaryMessage.style.textAlign = 'center';
            summaryMessage.style.marginBottom = 'var(--fitment-spacing-sm)';
            elements.resultsContainer.insertBefore(summaryMessage, productGrid);
        }
        // No specific message if some products are found, even if others are unmatched.
    };

    // --- Event Listeners and Action Handlers ---

    const loadCategoriesData = async () => {
      sectionStates[sectionId].currentActionInProgress = loadCategoriesData;
      const selectedType = elements.typeSelect?.value;
      if (!selectedType) return; // Should be guarded by UI logic

      toggleLoading(elements.categoryLoading, true);
      clearError(sectionId);
      const cacheKey = `categories_${selectedType}`;
      const cachedData = getCache(cacheKey, 'session');

      try {
        let apiResponse;
        if (cachedData) {
          apiResponse = { [API_RESPONSE_KEYS.CATEGORIES]: cachedData };
        } else {
          const apiUrl = `${apiEndpoints.categories}?type=${encodeURIComponent(selectedType)}`;
          apiResponse = await fetchAPI(apiUrl); // No sectionId needed for fetchAPI if it's not using it
          const categoriesToCache = apiResponse?.[API_RESPONSE_KEYS.CATEGORIES] || apiResponse || [];
          setCache(cacheKey, Array.isArray(categoriesToCache) ? categoriesToCache : [], 'session');
        }
        const categoryData = apiResponse?.[API_RESPONSE_KEYS.CATEGORIES] || apiResponse || [];
        if (!Array.isArray(categoryData)) throw new Error('Invalid category data format received from API.');

        currentCategoryOptions = categoryData
            .map(item => {
                const cat = String(item?.[API_RESPONSE_KEYS.CATEGORY_MAIN] || '').trim();
                const subCat = String(item?.[API_RESPONSE_KEYS.CATEGORY_SUB] || '').trim();
                return cat ? (subCat ? `${cat} - ${subCat}` : cat) : null;
            })
            .filter(item => item !== null);
        currentCategoryOptions = [...new Set(currentCategoryOptions)].sort((a, b) => a.localeCompare(b));

        if (currentCategoryOptions.length === 0) {
            displayError(`No categories found for type '${selectedType}'. Please try a different type.`, sectionId, elements.categorySelect);
            resetSelect(elements.categorySelect, PLACEHOLDERS.CATEGORY);
        } else {
            populateSelect(elements.categorySelect, currentCategoryOptions);
        }
      } catch (error) {
        displayError(
            `Failed to load categories: ${error.message}`,
            sectionId,
            error.isRetryable // Pass retryable status
        );
        resetSelect(elements.categorySelect, PLACEHOLDERS.CATEGORY);
      } finally {
        toggleLoading(elements.categoryLoading, false);
        sectionStates[sectionId].currentActionInProgress = null;
      }
    };

    const loadMakesData = async () => {
      sectionStates[sectionId].currentActionInProgress = loadMakesData;
      const selectedType = elements.typeSelect?.value;
      const selectedCombinedCategory = elements.categorySelect?.value;
      if (!selectedCombinedCategory || !selectedType) return;

      let category = '', subCategory = '';
      if (selectedCombinedCategory) {
          const parts = selectedCombinedCategory.split(' - ');
          category = parts[0].trim();
          if (parts.length > 1) { subCategory = parts.slice(1).join(' - ').trim(); }
      }

      toggleLoading(elements.makeLoading, true);
      clearError(sectionId);
      const cacheKey = `makes_${selectedType}_${category}_${subCategory}`;
      const cachedData = getCache(cacheKey, 'session');

      try {
          let apiResponse;
          if (cachedData) {
            apiResponse = { [API_RESPONSE_KEYS.MAKES]: cachedData };
          } else {
              const params = new URLSearchParams({ type: selectedType });
              if (category) params.append('category', category);
              if (subCategory) params.append('subCategory', subCategory);
              const apiUrl = `${apiEndpoints.makes}?${params.toString()}`;
              apiResponse = await fetchAPI(apiUrl);
              const makesToCache = apiResponse?.[API_RESPONSE_KEYS.MAKES] || apiResponse || [];
              setCache(cacheKey, Array.isArray(makesToCache) ? makesToCache : [], 'session');
          }
          const data = apiResponse?.[API_RESPONSE_KEYS.MAKES] || apiResponse || [];
          if (!Array.isArray(data)) throw new Error('Invalid makes data format received from API.');
          if (data.length === 0) {
               displayError(`No Makes found for category '${selectedCombinedCategory}'. Please select a different Category.`, sectionId, elements.makeSelect);
               console.warn(`No makes found for: Type='${selectedType}', Category='${selectedCombinedCategory}'`);
               resetSelect(elements.makeSelect, PLACEHOLDERS.MAKE);
          } else {
               populateSelect(elements.makeSelect, data);
          }
      } catch (error) {
           displayError(
            `Failed to load makes: ${error.message}`,
            sectionId,
            error.isRetryable // Pass retryable status
           );
           resetSelect(elements.makeSelect, PLACEHOLDERS.MAKE);
      } finally {
          toggleLoading(elements.makeLoading, false);
          sectionStates[sectionId].currentActionInProgress = null;
      }
    };

    const loadYearsData = async () => {
      sectionStates[sectionId].currentActionInProgress = loadYearsData;
      const selectedType = elements.typeSelect?.value;
      const selectedCombinedCategory = elements.categorySelect?.value;
      const selectedMake = elements.makeSelect?.value;
      if (!selectedMake || !selectedType || !selectedCombinedCategory) return;

      let category = '', subCategory = '';
      if (selectedCombinedCategory) {
           const parts = selectedCombinedCategory.split(' - ');
           category = parts[0].trim();
           if (parts.length > 1) { subCategory = parts.slice(1).join(' - ').trim(); }
      }

      toggleLoading(elements.yearLoading, true);
      clearError(sectionId);
      const cacheKey = `years_${selectedType}_${category}_${subCategory}_${selectedMake}`;
      const cachedData = getCache(cacheKey, 'session');

      try {
          let apiResponse;
          if (cachedData) {
            apiResponse = { [API_RESPONSE_KEYS.YEARS]: cachedData };
          } else {
              const params = new URLSearchParams({ type: selectedType, make: selectedMake });
              if (category) params.append('category', category);
              if (subCategory) params.append('subCategory', subCategory);
              const apiUrl = `${apiEndpoints.years}?${params.toString()}`;
              apiResponse = await fetchAPI(apiUrl);
              const yearsToCache = apiResponse?.[API_RESPONSE_KEYS.YEARS] || apiResponse || [];
              setCache(cacheKey, Array.isArray(yearsToCache) ? yearsToCache : [], 'session');
          }
          const data = apiResponse?.[API_RESPONSE_KEYS.YEARS] || apiResponse || [];
          if (!Array.isArray(data)) throw new Error('Invalid years data format received from API.');
          const sortedYears = data.map(Number).filter(y => !isNaN(y)).sort((a, b) => b - a);
           if (sortedYears.length === 0) {
               displayError(`No years found for the selected make. Please try a different make.`, sectionId, elements.yearSelect);
               resetSelect(elements.yearSelect, PLACEHOLDERS.YEAR);
          } else { populateSelect(elements.yearSelect, sortedYears); }
      } catch (error) {
           displayError(
            `Failed to load years: ${error.message}`,
            sectionId,
            error.isRetryable // Pass retryable status
           );
           resetSelect(elements.yearSelect, PLACEHOLDERS.YEAR);
      } finally {
          toggleLoading(elements.yearLoading, false);
          sectionStates[sectionId].currentActionInProgress = null;
      }
    };

    const loadModelsData = async () => {
      sectionStates[sectionId].currentActionInProgress = loadModelsData;
      const selectedType = elements.typeSelect?.value;
      const selectedCombinedCategory = elements.categorySelect?.value;
      const selectedMake = elements.makeSelect?.value;
      const selectedYear = elements.yearSelect?.value;
      if (!selectedYear || !selectedType || !selectedCombinedCategory || !selectedMake) return;

      let category = '', subCategory = '';
      if (selectedCombinedCategory) {
           const parts = selectedCombinedCategory.split(' - ');
           category = parts[0].trim();
           if (parts.length > 1) { subCategory = parts.slice(1).join(' - ').trim(); }
      }

      toggleLoading(elements.modelLoading, true);
      clearError(sectionId);
      const cacheKey = `models_${selectedType}_${category}_${subCategory}_${selectedMake}_${selectedYear}`;
      const cachedData = getCache(cacheKey, 'session');

      try {
          let apiResponse;
          if (cachedData) {
            apiResponse = { [API_RESPONSE_KEYS.MODELS]: cachedData };
          } else {
              const params = new URLSearchParams({ type: selectedType, make: selectedMake, year: selectedYear });
              if (category) params.append('category', category);
              if (subCategory) params.append('subCategory', subCategory);
              const apiUrl = `${apiEndpoints.models}?${params.toString()}`;
              apiResponse = await fetchAPI(apiUrl);
              const modelsToCache = apiResponse?.[API_RESPONSE_KEYS.MODELS] || apiResponse || [];
              setCache(cacheKey, Array.isArray(modelsToCache) ? modelsToCache : [], 'session');
          }
          const data = apiResponse?.[API_RESPONSE_KEYS.MODELS] || apiResponse || [];
          if (!Array.isArray(data)) throw new Error('Invalid models data format received from API.');
          const sortedModels = data.sort((a, b) => a.localeCompare(b));
           if (sortedModels.length === 0) {
               displayError(`No models found for the selected year. Please try a different year.`, sectionId, elements.modelSelect);
               resetSelect(elements.modelSelect, PLACEHOLDERS.MODEL);
          } else { populateSelect(elements.modelSelect, sortedModels); }
      } catch (error) {
           displayError(
            `Failed to load models: ${error.message}`,
            sectionId,
            error.isRetryable // Pass retryable status
           );
           resetSelect(elements.modelSelect, PLACEHOLDERS.MODEL);
      } finally {
          toggleLoading(elements.modelLoading, false);
          sectionStates[sectionId].currentActionInProgress = null;
      }
    };

    const performSearch = async () => {
      sectionStates[sectionId].currentActionInProgress = performSearch;
      saveSelectedVehicle(); // Saves to local storage, separate from retryable state
      const type = elements.typeSelect?.value;
      const combinedCategoryValue = elements.categorySelect?.value;
      const make = elements.makeSelect?.value;
      const year = elements.yearSelect?.value;
      const model = elements.modelSelect?.value;

      if (!type || !combinedCategoryValue || !make || !year || !model) {
          displayError('Please ensure Type, Category, Make, Year, and Model are all selected before finding parts.', sectionId);
          sectionStates[sectionId].currentActionInProgress = null; // Clear action if validation fails early
          return;
      }
      let category = '', subCategory = '';
      if (combinedCategoryValue) {
           const parts = combinedCategoryValue.split(' - ');
           category = parts[0].trim();
           if (parts.length > 1) { subCategory = parts.slice(1).join(' - ').trim(); }
      }
      console.log(`Searching Parts: Type='${type}', Category='${category}', SubCategory='${subCategory}', Make='${make}', Year='${year}', Model='${model}'`);
      toggleLoading(elements.searchLoading, true);
      if(elements.findPartsButton) elements.findPartsButton.disabled = true;
      clearError(sectionId);

      try {
          const params = new URLSearchParams({ type, make, year, model });
          if (category) params.append('category', category);
          if (subCategory) params.append('subCategory', subCategory);
          const apiUrl = `${apiEndpoints.products}?${params.toString()}`;
          const gammaData = await fetchAPI(apiUrl);
          const productsData = gammaData?.[API_RESPONSE_KEYS.PRODUCTS] || gammaData || [];
          if (!Array.isArray(productsData)) {
            const err = new Error('Invalid product data format received from API.');
            err.isRetryable = false; throw err;
          }
          await displayResults(productsData); // displayResults is already async
      } catch (error) {
          displayError(
            `Failed to find parts: ${error.message}`,
            sectionId,
            error.isRetryable // Pass retryable status
          );
          if(elements.resultsContainer) elements.resultsContainer.innerHTML = '<p>Could not load products due to an error. Please check the selections or try again.</p>';
      } finally {
          toggleLoading(elements.searchLoading, false);
          if(elements.findPartsButton && elements.modelSelect?.value) { // Re-enable button only if a model is still selected
              elements.findPartsButton.disabled = false;
          }
          sectionStates[sectionId].currentActionInProgress = null;
      }
    };

    elements.typeSelect?.addEventListener('change', (event) => {
      resetSubsequentDropdowns('type');
      // saveSelectedVehicle(); // Removed: Save only on explicit action
      if (event.target.value) loadCategoriesData();
      // Ensure save button is hidden if selection becomes incomplete
      if(elements.saveVehicleButton) elements.saveVehicleButton.style.display = 'none';
    });
    elements.categorySelect?.addEventListener('change', (event) => {
      resetSubsequentDropdowns('category');
      // saveSelectedVehicle(); // Removed: Save only on explicit action
      if (event.target.value) loadMakesData();
      // Ensure save button is hidden if selection becomes incomplete
      if(elements.saveVehicleButton) elements.saveVehicleButton.style.display = 'none';
    });
    elements.makeSelect?.addEventListener('change', (event) => {
      resetSubsequentDropdowns('make');
      // saveSelectedVehicle(); // Removed: Save only on explicit action
      if (event.target.value) loadYearsData();
      // Ensure save button is hidden if selection becomes incomplete
      if(elements.saveVehicleButton) elements.saveVehicleButton.style.display = 'none';
    });
    elements.yearSelect?.addEventListener('change', (event) => {
      resetSubsequentDropdowns('year');
      // saveSelectedVehicle(); // Removed: Save only on explicit action
      if (event.target.value) loadModelsData();
      // Ensure save button is hidden if selection becomes incomplete
      if(elements.saveVehicleButton) elements.saveVehicleButton.style.display = 'none';
    });
    elements.modelSelect?.addEventListener('change', (event) => {
      resetSubsequentDropdowns('model'); // This will disable findPartsButton and saveVehicleButton initially

      const modelValue = event.target.value;
      const typeValue = elements.typeSelect?.value;
      const categoryValue = elements.categorySelect?.value;
      const makeValue = elements.makeSelect?.value;
      const yearValue = elements.yearSelect?.value;

      // Enable find parts button and save vehicle button if all selections are made
      if (modelValue && typeValue && categoryValue && makeValue && yearValue) {
        if(elements.findPartsButton) elements.findPartsButton.disabled = false;
        if(elements.saveVehicleButton) elements.saveVehicleButton.style.display = 'inline-block';
      } else {
        // This else might be redundant if resetSubsequentDropdowns already handles disabling, but kept for clarity
        if(elements.findPartsButton) elements.findPartsButton.disabled = true;
        if(elements.saveVehicleButton) elements.saveVehicleButton.style.display = 'none';
      }
    });

    elements.findPartsButton?.addEventListener('click', performSearch);
    elements.resetButton?.addEventListener('click', resetAllSelectorsAndResults);

    // Event listener for the new "Save This Vehicle" button
    elements.saveVehicleButton?.addEventListener('click', () => {
        saveSelectedVehicle(); // Call the existing function to save the vehicle
        if (elements.saveVehicleButton) {
            elements.saveVehicleButton.textContent = 'Vehicle Saved!';
            // elements.saveVehicleButton.disabled = true; // Optionally disable
            setTimeout(() => {
                if (elements.saveVehicleButton) {
                    elements.saveVehicleButton.textContent = 'Save This Vehicle';
                    // elements.saveVehicleButton.disabled = false; // Optionally re-enable
                }
            }, 3000); // Reset text after 3 seconds
        }
    });


    // --- Toggle Button Logic ---
    const setInitialToggleState = (key) => { // Accept key as a parameter
        if (!isToggleEnabled || !elements.toggleButton) return;
        let isInitiallyCollapsed;
        try {
            const savedState = localStorage.getItem(key); // Use the passed key
            if (savedState === 'true') isInitiallyCollapsed = true;
            else if (savedState === 'false') isInitiallyCollapsed = false;
            else isInitiallyCollapsed = window.innerWidth < DESKTOP_BREAKPOINT;
        } catch (e) {
            console.warn("Could not read toggle state from localStorage", e);
            isInitiallyCollapsed = window.innerWidth < DESKTOP_BREAKPOINT;
        }
        section.classList.toggle('is-collapsed', isInitiallyCollapsed);
        elements.toggleButton.setAttribute('aria-expanded', String(!isInitiallyCollapsed));
    };

    if (isToggleEnabled && elements.toggleButton && elements.contentWrapper) {
        elements.toggleButton.addEventListener('click', (e) => {
            e.preventDefault();
            const isNowCollapsed = section.classList.toggle('is-collapsed');
            elements.toggleButton.setAttribute('aria-expanded', String(!isNowCollapsed));
            // Use sectionStates[sectionId].storageKey for setting item, as it's the correct key for this section
            try { localStorage.setItem(sectionStates[sectionId].storageKey, String(isNowCollapsed)); }
            catch (error) { console.warn(`Could not save toggle state for ${sectionId} to localStorage:`, error); }
        });
        setInitialToggleState(sectionStates[sectionId].storageKey); // Pass the correct key
    }

    // --- Saved Vehicle Dropdown & Prefill Logic ---

    function populateSavedVehicleDropdown(currentElements, currentSectionId) {
      const { savedVehicleSelect, savedVehicleSelectorWrapper } = currentElements;
      if (!savedVehicleSelect || !savedVehicleSelectorWrapper) {
        console.warn(`[ProductFinder ${currentSectionId}] Saved vehicle select/wrapper not found. Cannot populate.`);
        return;
      }

      try {
        const savedVehiclesString = localStorage.getItem(SAVED_VEHICLES_STORAGE_KEY);
        let activeVehicleId = localStorage.getItem(ACTIVE_VEHICLE_ID_STORAGE_KEY); // Use let as it might be updated
        savedVehicleSelect.innerHTML = ''; // Clear existing options

        let savedVehicles = [];
        if (savedVehiclesString) {
          try {
            savedVehicles = JSON.parse(savedVehiclesString);
            if (!Array.isArray(savedVehicles)) savedVehicles = [];
          } catch (e) {
            console.error(`[ProductFinder ${currentSectionId}] Error parsing savedVehiclesString:`, e);
            savedVehicles = [];
          }
        }

        if (savedVehicles.length > 0) {
          // Add a default "Select from saved" option
          const defaultOption = document.createElement('option');
          defaultOption.value = "";
          defaultOption.textContent = "-- Select from Saved --";
          savedVehicleSelect.appendChild(defaultOption);

          savedVehicles.forEach(vehicle => {
            if (vehicle && vehicle.id && vehicle.name) {
              const option = document.createElement('option');
              option.value = String(vehicle.id);
              option.textContent = vehicle.name;
              savedVehicleSelect.appendChild(option);
            }
          });

          const activeVehicleInList = activeVehicleId ? savedVehicles.some(v => String(v.id) === activeVehicleId) : false;

          if (!activeVehicleId || !activeVehicleInList) {
            // If no active ID, or active ID not in current list, make the first vehicle active
            // (but user still needs to select it from dropdown to trigger prefill by default)
            // For now, we won't automatically prefill from here, just ensure an active ID is set if none valid.
            // The prefill on load happens in initialize().
            // activeVehicleId = String(savedVehicles[0].id);
            // localStorage.setItem(ACTIVE_VEHICLE_ID_STORAGE_KEY, activeVehicleId);
            // console.log(`[ProductFinder ${currentSectionId}] No valid active vehicle ID. Defaulted to first in list: ${activeVehicleId}, but not auto-prefilling.`);
            // document.dispatchEvent(new CustomEvent('activeVehicleChanged', { detail: { vehicle: savedVehicles[0] } }));
             // Set select value to empty to show "-- Select from Saved --"
            savedVehicleSelect.value = "";
          } else {
             savedVehicleSelect.value = activeVehicleId; // Pre-select the active one if it's valid
          }

          savedVehicleSelectorWrapper.style.display = 'flex';
        } else {
          savedVehicleSelectorWrapper.style.display = 'none';
          if (activeVehicleId) { // If there was an active ID but no vehicles, clear it
            localStorage.removeItem(ACTIVE_VEHICLE_ID_STORAGE_KEY);
            document.dispatchEvent(new CustomEvent('activeVehicleChanged', { detail: { vehicle: null } }));
            console.log(`[ProductFinder ${currentSectionId}] No saved vehicles. Cleared active vehicle ID.`);
          }
        }
      } catch (e) {
        console.error(`[ProductFinder ${currentSectionId}] Error populating saved vehicles dropdown:`, e);
        if (savedVehicleSelectorWrapper) savedVehicleSelectorWrapper.style.display = 'none';
      }
    }

    if (elements.savedVehicleSelect) {
        elements.savedVehicleSelect.addEventListener('change', async (event) => {
            const selectedId = event.target.value;
            if (selectedId) {
                localStorage.setItem(ACTIVE_VEHICLE_ID_STORAGE_KEY, selectedId);
                console.log(`[ProductFinder ${sectionId}] Active vehicle changed by product finder dropdown to: ${selectedId}`);

                const savedVehiclesString = localStorage.getItem(SAVED_VEHICLES_STORAGE_KEY);
                let activeVehicleObject = null;
                if (savedVehiclesString) {
                    try {
                        const savedVehicles = JSON.parse(savedVehiclesString);
                        activeVehicleObject = savedVehicles.find(v => String(v.id) === selectedId);
                    } catch (e) { console.error('Error parsing saved vehicles for event dispatch:', e); }
                }
                document.dispatchEvent(new CustomEvent('activeVehicleChanged', { detail: { vehicle: activeVehicleObject } }));

                // DO NOT prefill or reset main selectors here.
                // The active vehicle change will be handled by other components / page load logic if necessary.
                // console.log(`[ProductFinder ${sectionId}] Main selectors NOT being changed by saved vehicle dropdown selection.`);
            } else {
                // "-- Select from Saved --" chosen, clear active ID.
                localStorage.removeItem(ACTIVE_VEHICLE_ID_STORAGE_KEY);
                document.dispatchEvent(new CustomEvent('activeVehicleChanged', { detail: { vehicle: null } }));
                // DO NOT reset main selectors here.
                console.log(`[ProductFinder ${sectionId}] '-- Select from Saved --' chosen. Active vehicle cleared. Main selectors not reset by this action.`);
            }
        });
    }


    async function prefillSelectorsWithVehicle(vehicle, elements, sectionId, loadFunctions, currentCategoryChoicesInstance) {
      console.log(`[ProductFinder ${sectionId}] Attempting to prefill with active vehicle:`, vehicle);

      // Helper to set value, dispatch change, and await next load function
      async function setValueAndLoadNext(selectElement, value, nextLoadFn, selectNameForLog) {
        if (!selectElement) {
          console.warn(`[ProductFinder ${sectionId}] Cannot prefill ${selectNameForLog}: select element not found.`);
          return false;
        }

        // Wait for options to be available. This is a simplified polling mechanism.
        // A more robust solution might use MutationObserver or specific events if available from Choices.js/dependent loads.
        let attempt = 0;
        const maxAttempts = 20; // Try for up to 2 seconds (20 * 100ms)
        let optionExists = false;

        while(attempt < maxAttempts) {
            optionExists = Array.from(selectElement.options).some(opt => opt.value === String(value));
            if (optionExists) break;
            // console.log(`[ProductFinder ${sectionId}] Waiting for options in ${selectNameForLog}... Attempt ${attempt + 1}`);
            await new Promise(resolve => setTimeout(resolve, 100)); // Wait 100ms
            attempt++;
        }

        if (!optionExists) {
          console.warn(`[ProductFinder ${sectionId}] Cannot prefill ${selectNameForLog}: value '${String(value)}' not found in options after waiting. Available:`, Array.from(selectElement.options).map(opt => opt.value));
          return false;
        }

        selectElement.value = String(value);

        if (selectElement === elements.categorySelect && currentCategoryChoicesInstance) {
            // Find the label corresponding to the value for Choices.js
            const selectedOption = Array.from(selectElement.options).find(opt => opt.value === String(value));
            const label = selectedOption ? selectedOption.textContent : String(value);
            currentCategoryChoicesInstance.setValue([{ value: String(value), label: label }]);
        }

        // Dispatch change event *after* Choices.js has been updated, if applicable
        selectElement.dispatchEvent(new Event('change', { bubbles: true }));
        console.log(`[ProductFinder ${sectionId}] Prefilled ${selectNameForLog} with '${String(value)}'.`);

        if (nextLoadFn) {
          console.log(`[ProductFinder ${sectionId}] Calling next load function for ${selectNameForLog}.`);
          try {
            await nextLoadFn();
          } catch (error) {
            console.error(`[ProductFinder ${sectionId}] Error during ${selectNameForLog}'s next load function:`, error);
            return false;
          }
        }
        return true;
      }

      // Start prefill sequence
      if (!(await setValueAndLoadNext(elements.typeSelect, vehicle.type, loadFunctions.loadCategoriesData, 'Type'))) {
        console.warn(`[ProductFinder ${sectionId}] Prefill failed at Type stage.`); return;
      }

      let combinedCategoryValue = vehicle.category;
      if (vehicle.subCategory && vehicle.subCategory.trim() !== '') {
        combinedCategoryValue += ` - ${vehicle.subCategory.trim()}`;
      }
      if (!(await setValueAndLoadNext(elements.categorySelect, combinedCategoryValue, loadFunctions.loadMakesData, 'Category'))) {
        console.warn(`[ProductFinder ${sectionId}] Prefill failed at Category stage.`); return;
      }

      if (!(await setValueAndLoadNext(elements.makeSelect, vehicle.make, loadFunctions.loadYearsData, 'Make'))) {
        console.warn(`[ProductFinder ${sectionId}] Prefill failed at Make stage.`); return;
      }
      if (!(await setValueAndLoadNext(elements.yearSelect, String(vehicle.year), loadFunctions.loadModelsData, 'Year'))) {
        console.warn(`[ProductFinder ${sectionId}] Prefill failed at Year stage.`); return;
      }
      // For the last step (Model), there's no 'nextLoadFn'
      if (!(await setValueAndLoadNext(elements.modelSelect, vehicle.model, null, 'Model'))) {
        console.warn(`[ProductFinder ${sectionId}] Prefill failed at Model stage.`); return;
      }

      // After all selections are made and respective 'change' events dispatched:
      if (elements.findPartsButton && elements.modelSelect.value) {
          elements.findPartsButton.disabled = false;
          console.log(`[ProductFinder ${sectionId}] Find Parts button enabled after prefill.`);
      }
      if (elements.saveVehicleButton && elements.modelSelect.value) {
          elements.saveVehicleButton.style.display = 'inline-block';
          console.log(`[ProductFinder ${sectionId}] Save Vehicle button shown after prefill.`);
      }
      console.log(`[ProductFinder ${sectionId}] Successfully prefilled all selectors for vehicle:`, vehicle.name);
    }

    // Extracted type loading logic into its own function for retry purposes
    const loadTypesData = async () => {
      sectionStates[sectionId].currentActionInProgress = loadTypesData;
      toggleLoading(elements.typeLoading, true);
      clearError(sectionId);
      // Reset subsequent dropdowns as type is the first in the chain
      resetSelect(elements.categorySelect, PLACEHOLDERS.CATEGORY, true);
      resetSelect(elements.makeSelect, PLACEHOLDERS.MAKE, true);
      resetSelect(elements.yearSelect, PLACEHOLDERS.YEAR, true);
      resetSelect(elements.modelSelect, PLACEHOLDERS.MODEL, true);
      if(elements.findPartsButton) elements.findPartsButton.disabled = true; // Ensure Find Parts is disabled
      if(elements.saveVehicleButton) elements.saveVehicleButton.style.display = 'none'; // Hide save button during type loading too

      const cacheKey = 'types'; // Cache key for vehicle types
      const cachedData = getCache(cacheKey, 'local');
      try {
          let apiResponse;
          if (cachedData) {
              apiResponse = { [API_RESPONSE_KEYS.TYPES]: cachedData };
          } else {
              if (!apiEndpoints.types) {
                const err = new Error("Types API endpoint URL is missing in configuration.");
                err.isRetryable = false; throw err;
              }
              apiResponse = await fetchAPI(apiEndpoints.types);
              const typesToCache = apiResponse?.[API_RESPONSE_KEYS.TYPES] || apiResponse || [];
              setCache(cacheKey, Array.isArray(typesToCache) ? typesToCache : [], 'local');
          }
          const data = apiResponse?.[API_RESPONSE_KEYS.TYPES] || apiResponse || [];
          if (!Array.isArray(data)) {
            const err = new Error('Invalid types data format received from API.');
            err.isRetryable = false; // Data format error is not typically retryable
            throw err;
          }
          const sortedTypes = data.sort((a, b) => a.localeCompare(b));
          populateSelect(elements.typeSelect, sortedTypes);
          if (sortedTypes.length === 0) {
              // This isn't an "error" in the fetch sense, but a state where UI can't proceed.
              // Not marking as retryable for displayError as it's a data state.
              displayError("No vehicle types are currently available. Please check back later.", sectionId, false);
              disableAllSelectors();
          }
      } catch (error) {
          console.error(`loadTypesData: Error caught for section ${sectionId}:`, error);
          // Pass error.isRetryable if set by fetchAPI, otherwise default to false or infer.
          displayError(
            `Initialization failed: Could not load vehicle types. ${error.message}`,
            sectionId,
            error.isRetryable // Pass retryable status from fetchAPI or other thrown errors
          );
          disableAllSelectors(); // Still disable if types can't be loaded.
      } finally {
          toggleLoading(elements.typeLoading, false);
          sectionStates[sectionId].currentActionInProgress = null;
      }
    };

    const initialize = async () => { // Main initialization entry point for the section
      try {
        populateSavedVehicleDropdown(elements, sectionId); // Populate the saved vehicle dropdown first
        await loadTypesData(); // This populates the Type dropdown first.

        const activeVehicleId = localStorage.getItem(ACTIVE_VEHICLE_ID_STORAGE_KEY);
        // Check if the active vehicle (selected in dropdown or from localStorage) should prefill main selectors
        // This prefill only happens if the "My Saved Vehicles" dropdown itself has this value selected.
        // Or if there is an active ID and the saved vehicle dropdown is not empty.
        if (elements.savedVehicleSelect.value && elements.savedVehicleSelect.value === activeVehicleId) {
             console.log(`[ProductFinder ${sectionId}] Active vehicle ID ${activeVehicleId} matches saved vehicle dropdown. Attempting prefill.`);
             const savedVehiclesString = localStorage.getItem(SAVED_VEHICLES_STORAGE_KEY);
             if (savedVehiclesString) {
                let savedVehicles = [];
                try { savedVehicles = JSON.parse(savedVehiclesString); } catch(e){ console.error("Error parsing saved vehicles for prefill", e); }
                if (!Array.isArray(savedVehicles)) savedVehicles = [];

                const vehicleToPrefill = savedVehicles.find(v => String(v.id) === activeVehicleId);
                if (vehicleToPrefill) {
                    const sectionLoadFunctions = { loadCategoriesData, loadMakesData, loadYearsData, loadModelsData };
                    await prefillSelectorsWithVehicle(vehicleToPrefill, elements, sectionId, sectionLoadFunctions, categoryChoicesInstance);
                } else {
                     console.log(`[ProductFinder ${sectionId}] Active vehicle ID ${activeVehicleId} not found in saved vehicles list during init prefill. Clearing stale ID.`);
                     localStorage.removeItem(ACTIVE_VEHICLE_ID_STORAGE_KEY);
                     elements.savedVehicleSelect.value = ""; // Reset dropdown to default
                }
             }
        } else if (activeVehicleId && elements.savedVehicleSelect.options.length > 1) { // More than just "-- Select --"
            // Active ID exists, but dropdown isn't set to it (e.g. page just loaded). Try to set and prefill.
            // This case might be redundant if populateSavedVehicleDropdown correctly sets the value.
            console.log(`[ProductFinder ${sectionId}] Active vehicle ID ${activeVehicleId} exists, dropdown not set. Attempting to set and prefill.`);
            elements.savedVehicleSelect.value = activeVehicleId; // Try to set it
            if (elements.savedVehicleSelect.value === activeVehicleId) { // Check if successfully set
                const savedVehiclesString = localStorage.getItem(SAVED_VEHICLES_STORAGE_KEY);
                if (savedVehiclesString) {
                    let savedVehicles = [];
                    try { savedVehicles = JSON.parse(savedVehiclesString); } catch(e){ console.error("Error parsing saved vehicles for prefill", e); }
                    if (!Array.isArray(savedVehicles)) savedVehicles = [];
                    const vehicleToPrefill = savedVehicles.find(v => String(v.id) === activeVehicleId);
                    if (vehicleToPrefill) {
                        const sectionLoadFunctions = { loadCategoriesData, loadMakesData, loadYearsData, loadModelsData };
                        await prefillSelectorsWithVehicle(vehicleToPrefill, elements, sectionId, sectionLoadFunctions, categoryChoicesInstance);
                    }
                }
            } else {
                 console.log(`[ProductFinder ${sectionId}] Could not set saved vehicle dropdown to active ID ${activeVehicleId}. Stale ID?`);
                 localStorage.removeItem(ACTIVE_VEHICLE_ID_STORAGE_KEY); // Clear stale ID
            }
        }
        else {
          console.log(`[ProductFinder ${sectionId}] No active vehicle ID selected in dropdown for initial prefill, or no saved vehicles.`);
        }
      } catch (error) {
        console.error(`[ProductFinder ${sectionId}] Error during initialization or prefill:`, error);
      }
    };

    // Listener for global changes to saved vehicles (e.g., cleared from header)
    document.addEventListener('userSavedVehiclesChanged', () => {
        if (document.body.contains(elements.savedVehicleSelectorWrapper)) { // Check if element is still in DOM
            console.log(`[ProductFinder ${sectionId}] 'userSavedVehiclesChanged' event detected. Repopulating saved vehicles dropdown.`);
            populateSavedVehicleDropdown(elements, sectionId); // This will also hide the dropdown if no vehicles are saved.

            // Check the actual source of truth (localStorage) to decide if a full reset is warranted.
            const savedVehiclesString = localStorage.getItem(SAVED_VEHICLES_STORAGE_KEY);
            let savedVehicles = [];
            if (savedVehiclesString) {
                try {
                    savedVehicles = JSON.parse(savedVehiclesString);
                    if (!Array.isArray(savedVehicles)) savedVehicles = [];
                } catch (e) {
                    savedVehicles = []; // Treat parse error as no vehicles
                }
            }

            if (savedVehicles.length === 0) {
                console.log(`[ProductFinder ${sectionId}] All saved vehicles have been cleared. Resetting main selectors.`);
                // Call a version of reset that doesn't re-dispatch 'userSavedVehiclesChanged' if possible,
                // or ensure resetAllSelectorsAndResults's dispatch is safe (it is, as this listener just re-evaluates).
                resetAllSelectorsAndResults();
            }
            // If there are still vehicles, but none is selected in this finder's "My Saved Vehicles" dropdown
            // (e.g. user selected "-- Select --"), we should NOT reset the main finder.
            // The main finder might be in use for a new, unsaved vehicle configuration.
        }
    });

    initialize(); // Call the section's initialize function

  }); // End forEach loop

}); // End DOMContentLoaded

/**
 * SCRIPT LOADING NOTE:
 * For optimal performance, ensure this script and any dependencies like Choices.js
 * are loaded with the `defer` attribute in your theme's main layout file (e.g., theme.liquid).
 * Example: <script src="{{ 'product-finder.js' | asset_url }}" defer></script>
 */
