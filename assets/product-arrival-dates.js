/**
 * Product Arrival Dates
 * Displays estimated arrival dates for backordered products
 * For use with the Gamma Powersports API
 */
document.addEventListener('DOMContentLoaded', function() {
  console.log('Product Arrival Dates: DOM Content Loaded event fired');

  // Add global error handler to catch unhandled errors specifically from this script
  window.addEventListener('error', function(event) {
    const scriptName = 'product-arrival-dates.js';
    if (event.error && event.error.stack && event.error.stack.includes(scriptName)) {
      console.error('Product Arrival Dates: Unhandled error caught by global handler:', event.error);
    }
  });

  // Create the ProductArrivalDates object to encapsulate functionality
  const ProductArrivalDates = {
    // Default configuration values
    DEFAULT_API_URL: "https://api.gammapowersports.com",
    API_ENDPOINT_ARRIVAL_DATES: "/inventory/getEstimatedArrivalsForItem",
    DEBOUNCE_DELAY_MS: 250,

    config: {}, // Will be populated from window.arrivalDatesConfig
    elements: {
      container: null, // Initialized in init()
      content: null,   // Initialized in init()
      loading: null,   // Initialized in init()
      error: null,     // Initialized in init()
      noData: null     // Initialized in init()
    },
    state: {
      arrivalDates: [], // Stores the fetched and processed arrival dates
      hasLoaded: false,   // True if data has been successfully loaded at least once
      isLoading: false,  // True while an API call is in progress
      hasError: false    // True if the last operation resulted in an error
    },

    /**
     * Debounce utility function.
     * Returns a new function that will only execute the original function
     * after a specified delay has passed without any new calls.
     * @param {function} func - The function to debounce.
     * @param {number} delay - The debounce delay in milliseconds.
     * @returns {function} The debounced function.
     */
    debounce: function(func, delay) {
      let timeoutId;
      return function(...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          func.apply(this, args);
        }, delay);
      };
    },

    /**
     * Initializes the component:
     * - Sets up configuration and elements.
     * - Creates a debounced handler for variant selector changes.
     * - Sets up event listeners for variant changes.
     * - Loads initial arrival dates if applicable.
     */
    init: function() {
      console.log('Product Arrival Dates: Initializing...');

      this.elements.container = document.getElementById('product-arrival-dates');
      if (!this.elements.container) {
        console.warn('PA Dates: Main container #product-arrival-dates not found. Aborting.');
        return;
      }
      // Initialize other elements
      // Theme developers: Ensure these IDs also have corresponding classes for flexible styling, e.g.:
      // #arrival-dates-content -> class="product-arrival-dates__content-area"
      // #arrival-dates-loading -> class="product-arrival-dates__loading-indicator"
      // #arrival-dates-error -> class="product-arrival-dates__error-message"
      // #arrival-dates-no-data -> class="product-arrival-dates__no-data-message"
      this.elements.content = document.getElementById('arrival-dates-content');
      this.elements.loading = document.getElementById('arrival-dates-loading'); // Should have class product-arrival-dates__loading-indicator
      this.elements.error = document.getElementById('arrival-dates-error');     // Should have class product-arrival-dates__error-message
      this.elements.noData = document.getElementById('arrival-dates-no-data');   // Should have class product-arrival-dates__no-data-message

      if (window.arrivalDatesConfig) {
        this.config = window.arrivalDatesConfig;
        console.log('PA Dates: Global config loaded:', this.config);
      } else {
        console.warn('PA Dates: Global arrivalDatesConfig missing.');
        this.showError('Configuration is missing.'); // User-friendly message
        return;
      }

      // Create debounced version of the variant selector change handler
      this.debouncedHandleVariantSelectorChange = this.debounce(this.handleVariantSelectorChange, this.DEBOUNCE_DELAY_MS);

      if (!this.config.productSku) {
        console.warn('PA Dates: Initial product SKU missing in config.');
        this.hideAllElements(); // Hide all specific content sections
        this.elements.container.style.display = 'none'; // Hide the main container
        return;
      }

      // Handles both boolean true and string 'true' for productInStock
      const isInStock = String(this.config.productInStock).toLowerCase() === 'true';
      if (isInStock && !this.config.forceCheck) {
        console.log(`PA Dates: Skipping initial fetch for SKU ${this.config.productSku} (in stock and forceCheck is false).`);
        this.hideAllElements();
        this.elements.container.style.display = 'none';
        return;
      }

      this.setupVariantListeners();
      this.loadArrivalDates(); // Load dates for the initial SKU if needed
    },

    /**
     * Sets up event listeners for product variant changes.
     * Listens to a custom 'variant:changed' event and standard 'change' events on variant selectors.
     */
    setupVariantListeners: function() {
      console.log('PA Dates: Setting up variant listeners...');

      // Primary listener for theme-fired variant changes (e.g., Shopify's 'variant:changed')
      document.addEventListener('variant:changed', this.handleVariantChange.bind(this));

      // Fallback listeners for direct input changes on various common variant selector elements
      // This is debounced to handle rapid changes gracefully.
      const variantSelectors = document.querySelectorAll(
        'select[name^="options"], input[type="radio"][name^="options"], ' + // Common input names
        'form[action*="/cart/add"] select, form[action*="/cart/add"] input[type="radio"], ' + // Inputs within cart forms
        '[data-variant-selector], .single-option-selector, .variant-input' // Common classes and data attributes
      );
      variantSelectors.forEach(selector => {
        selector.addEventListener('change', this.debouncedHandleVariantSelectorChange.bind(this));
      });
      console.log(`PA Dates: Attached 'variant:changed' listener and 'change' listeners to ${variantSelectors.length} selectors.`);
    },

    /**
     * Handles the 'variant:changed' event.
     * This event is typically dispatched by Shopify themes when a variant is selected.
     * Updates the SKU and availability from the event details and reloads arrival dates.
     * @param {CustomEvent} event - The 'variant:changed' event, expected to have `event.detail.variant`.
     */
    handleVariantChange: function(event) {
      console.log('PA Dates: Custom variant event detected (e.g., variant:changed). Details:', event.detail);
      if (event.detail && event.detail.variant) {
        const newVariant = event.detail.variant;
        const newSku = newVariant.sku;
        const newAvailability = newVariant.available;

        // Determine if SKU or availability has actually changed
        const skuChanged = newSku && newSku !== this.config.productSku;
        const availabilityChanged = typeof newAvailability !== 'undefined' && newAvailability !== this.config.productInStock;

        if (skuChanged || availabilityChanged) {
          console.log(`PA Dates: Variant data changed. New SKU: ${skuChanged ? newSku : '(no change)'}, Available: ${availabilityChanged ? newAvailability : '(no change)'}`);
          if (skuChanged) { this.config.productSku = newSku; }
          if (availabilityChanged) { this.config.productInStock = newAvailability; }
          this.loadArrivalDates(); // Reload data based on new variant state
        } else {
          console.log('PA Dates: Variant event detected, but SKU and availability are the same as current. No update needed.');
        }
      } else {
        console.log('PA Dates: Variant event missing `event.detail.variant` data. Falling back to debounced selector change handler.');
        this.debouncedHandleVariantSelectorChange(); // Attempt to get data via direct DOM query
      }
    },

    /**
     * Handles direct changes on variant selector inputs (e.g., dropdowns, radio buttons).
     * This function is debounced by `this.debouncedHandleVariantSelectorChange`.
     * It fetches the current SKU and availability from the page and reloads arrival dates if changed.
     */
    handleVariantSelectorChange: function() {
      console.log('PA Dates: Debounced direct selector change executing.');

      // These methods are assumed to query the DOM or relevant JS objects for current selections
      const newSku = this.getCurrentProductSku();
      const newAvailability = this.isCurrentVariantAvailable();

      const skuChanged = newSku && newSku !== this.config.productSku;
      const availabilityChanged = typeof newAvailability !== 'undefined' && newAvailability !== this.config.productInStock;

      if (skuChanged || availabilityChanged) {
        console.log(`PA Dates: Selector change detected. New SKU: ${skuChanged ? newSku : '(no change)'}, Available: ${availabilityChanged ? newAvailability : '(no change)'}`);
        if (skuChanged) { this.config.productSku = newSku; }
        if (availabilityChanged) { this.config.productInStock = newAvailability; }
        this.loadArrivalDates();
      } else {
        console.log('PA Dates: Selector change, but SKU and availability are the same as current. No update needed.');
      }
    },

    /**
     * Gets the current product SKU.
     * Placeholder: Assumes implementation queries the DOM or a Shopify product object.
     * @returns {string|null} The current SKU or null if not found.
     */
    getCurrentProductSku: function() {
      // Condensed implementation in original problem. Real implementation would query
      // the active variant from the product form or a Shopify JS object.
      // Example: return Shopify.getProduct().selected_or_first_available_variant.sku;
      console.warn('PA Dates: getCurrentProductSku() is using placeholder logic.');
      return this.config.productSku; // Fallback to existing config for this example
    },

    /**
     * Checks if the current variant is available/in stock.
     * Placeholder: Assumes implementation queries the DOM or a Shopify product object.
     * @returns {boolean|undefined} True if available, false if not, undefined if unknown.
     */
    isCurrentVariantAvailable: function() {
      // Condensed implementation in original problem. Real implementation would query
      // the active variant from the product form or a Shopify JS object.
      // Example: return Shopify.getProduct().selected_or_first_available_variant.available;
      console.warn('PA Dates: isCurrentVariantAvailable() is using placeholder logic.');
      return this.config.productInStock; // Fallback to existing config for this example
    },

    // --- UI Helper Functions ---

    /** Shows the loading state for the arrival dates container. */
    showLoading: function() {
      // Theme developers: CSS transitions can be applied to opacity or transform for smoother state changes.
      // e.g., #product-arrival-dates[data-state="loading"] .product-arrival-dates__loading-indicator { opacity: 1; }
      this.state.isLoading = true;
      this.state.hasError = false;
      this.hideAllElements();
      if (this.elements.loading) {
        this.elements.loading.style.display = 'flex'; // Use flex for potential centering of spinner
      }
      if (this.elements.container) {
        this.elements.container.setAttribute('data-state', 'loading');
        this.elements.container.style.display = 'block';
      }
    },
    /**
     * Shows the error state, displaying a message.
     * @param {string} [message='Error loading arrival dates.'] - The error message to display.
     */
    showError: function(message = 'Error loading arrival dates.') {
      // Theme developers: CSS transitions can be applied for smoother appearance.
      this.state.isLoading = false;
      this.state.hasError = true;
      this.hideAllElements();
      if (this.elements.error) {
        this.elements.error.textContent = this.sanitizeText(message);
        this.elements.error.style.display = 'block';
      }
      if (this.elements.container) {
        this.elements.container.setAttribute('data-state', 'error');
        this.elements.container.style.display = 'block';
      }
    },
    /**
     * Shows the no data state, displaying a message.
     * @param {string} [message='No estimated arrival dates available.'] - The message to display.
     */
    showNoData: function(message = 'No estimated arrival dates available.') {
      // Theme developers: CSS transitions can be applied for smoother appearance.
      this.state.isLoading = false;
      this.state.hasError = false;
      this.hideAllElements();
      if (this.elements.noData) {
        this.elements.noData.textContent = this.sanitizeText(message);
        this.elements.noData.style.display = 'block';
      }
      if (this.elements.container) {
        this.elements.container.setAttribute('data-state', 'no-data');
        this.elements.container.style.display = 'block';
      }
    },
    /** Hides all dynamic content elements (loading, error, noData, content). */
    hideAllElements: function() {
      // Theme developers: CSS transitions can be applied for smoother disappearance.
      if (this.elements.loading) this.elements.loading.style.display = 'none';
      if (this.elements.error) this.elements.error.style.display = 'none';
      if (this.elements.noData) this.elements.noData.style.display = 'none';
      if (this.elements.content) this.elements.content.style.display = 'none';
    },

    // --- Core Logic ---

    /**
     * Loads arrival dates from the API for the current product SKU.
     * Skips API call if product is in stock and forceCheck is not enabled.
     * Handles API response, errors, and updates UI accordingly.
     */
    loadArrivalDates: function() {
      const partNumber = this.config.productSku;
      // Handles both boolean true and string 'true' for productInStock config
      const isInStock = String(this.config.productInStock).toLowerCase() === 'true';

      if (isInStock && !this.config.forceCheck) {
        console.log(`PA Dates: Skipping API fetch for SKU ${partNumber} because it's in stock and forceCheck is false.`);
        this.hideAllElements();
        if (this.elements.container) this.elements.container.style.display = 'none'; // Hide container if in stock
        return;
      }

      console.log(`PA Dates: Preparing to load arrival data for SKU: ${partNumber}`);
      if (!partNumber || typeof partNumber !== 'string' || partNumber.trim() === '') {
        console.warn('PA Dates: Invalid or missing SKU. Cannot fetch arrival dates.');
        this.showNoData('No valid SKU selected or available.'); // User-friendly message
        return;
      }

      const apiBase = this.config.apiUrl || this.DEFAULT_API_URL;
      const requestUrl = `${apiBase}${this.API_ENDPOINT_ARRIVAL_DATES}?partNumber=${encodeURIComponent(partNumber)}`;

      this.showLoading();
      console.log(`PA Dates: Making API request to: ${requestUrl}`);

      fetch(requestUrl, {
        method: 'GET',
        headers: {
          ...(this.config.authToken && {'Authorization': `Bearer ${this.config.authToken}`}), // Conditionally add Auth token
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
      })
      .then(response => {
        console.log(`PA Dates: API response status: ${response.status} for SKU: ${partNumber}`);
        if (!response.ok) {
          // Handle common HTTP errors by returning a structured error object for the next .then()
          if (response.status === 401) return { error: { message: 'Authentication failed. Please check configuration.' }, status: 'error' };
          if (response.status === 403) return { error: { message: 'Access denied. Please check permissions.' }, status: 'error' };
          if (response.status === 404) {
            console.warn(`PA Dates: API 404 (Not Found) for SKU ${partNumber}.`);
            return null; // Will be handled as no data
          }
          if (response.status >= 500) return { error: { message: 'Server error encountered. Please try again later.' }, status: 'error' };

          // For other non-ok statuses (e.g., 400, 429), throw an error to be caught by .catch()
          const error = new Error(`Request failed with HTTP status: ${response.status}`);
          error.response = response; // Attach response for more context in .catch()
          throw error;
        }
        if (response.status === 204) { /* HTTP 204 No Content */
          console.log(`PA Dates: API returned 204 (No Content) for SKU ${partNumber}.`);
          return null; // Will be handled as no data
        }
        // Attempt to parse JSON, return null if body is empty
        return response.text().then(text => {
          if (!text) {
            console.log(`PA Dates: API response body empty for SKU ${partNumber}.`);
            return null;
          }
          try {
            return JSON.parse(text);
          } catch (e) {
            console.error(`PA Dates: Error parsing JSON response for SKU ${partNumber}:`, e, "\nResponse text:", text.substring(0, 200));
            throw new Error('Invalid JSON response from API.'); // This will be caught by the main .catch()
          }
        });
      })
      .then(data => {
        this.state.isLoading = false;

        // Handle cases where data is null (e.g., from 404, 204, or empty JSON response)
        if (data === null) { // This handles 404, 204, empty/invalid JSON, or parse error that returned null
            console.log(`PA Dates: No processable arrival data found for SKU ${partNumber}. Displaying 'no data'.`);
            this.showNoData(); // Uses default or configured "no data" message
            return;
        }

        // Process data if API indicates success (e.g., data.status === 'success')
        if (data.status && typeof data.status === 'string' && data.status.toLowerCase() === 'success') {
            if (data.data && data.data.arrivalDates && Array.isArray(data.data.arrivalDates)) {
                // Filter for valid dates: must have an ETA, a parsable date, and quantity > 0
                const validDates = data.data.arrivalDates.filter(item => {
                    const qty = parseInt(item.qty, 10);
                    // Ensure ETA is present and results in a valid date object
                    const etaDate = item.eta ? new Date(item.eta) : null;
                    const isValidDate = etaDate && !isNaN(etaDate.getTime());
                    return isValidDate && !isNaN(qty) && qty > 0;
                });

               if (validDates.length > 0) {
                    // Sort valid dates by ETA, earliest first
                    const sortedValidDates = validDates.sort((a, b) => new Date(a.eta).getTime() - new Date(b.eta).getTime());

                    this.state.arrivalDates = [sortedValidDates[0]]; // Store only the earliest valid arrival date
                    this.state.hasLoaded = true;
                    console.log(`PA Dates: Processed and displaying 1 earliest valid arrival date for SKU ${partNumber}.`);
                    this.renderArrivalDates();
               } else {
                    console.log(`PA Dates: API status 'success', but no valid/future arrival dates found for SKU ${partNumber}.`);
                    this.showNoData(); // No valid dates to display
               }
            } else {
              console.warn(`PA Dates: API status 'success', but 'data.data.arrivalDates' is missing or not an array. SKU: ${partNumber}`, data);
              this.showNoData('Received incomplete data from server.'); // More specific "no data" message
            }
        } else {
            // API response structure is not as expected, or API itself reported an error (e.g. data.status === 'error')
            console.warn(`PA Dates: API status not 'success' or missing. Status: ${data.status || 'N/A'}. SKU: ${partNumber}`, data);

            let errorMessage = 'Failed to retrieve arrival dates.'; // Default message
            if (data.error && data.error.message && typeof data.error.message === 'string' && data.error.message.trim() !== '') {
                errorMessage = data.error.message; // Use API-provided error message if valid
            }

            // Avoid showing a misleading error message like "Success" if the actual status was an error.
            if (typeof errorMessage === 'string' && errorMessage.toLowerCase() === 'success') {
                this.showNoData('Unexpected response from server.');
            } else {
                this.showError(this.sanitizeText(errorMessage)); // Sanitize API message before display
            }
        }
      })
      .catch(error => {
        console.error(`PA Dates: Main .catch() block triggered for SKU ${partNumber}:`, error);
        this.state.isLoading = false; // Ensure loading state is cleared

        if (error.response) { // Errors thrown by us for HTTP statuses like 400, 429
          this.showError(`Could not retrieve data. (Error: ${error.response.status})`);
        } else if (error.message === 'Invalid JSON response from API.') {
          this.showError('Received an invalid response from the server.');
        }
        else { // Network errors, CORS, or other unexpected fetch issues
          this.showError('Network error or could not reach API.');
        }
      });
    },

    // --- Rendering & Utility Functions ---

    /**
     * Formats a date string into a more readable format.
     * Handles various date string inputs and aims for "Month Day, Year" in UTC.
     * @param {string} dateString - The date string to format.
     * @returns {string} The formatted date string or 'Date Unknown'.
     */
    formatDate: function(dateString) {
      if (!dateString) return 'Date Unknown';
      try {
        let dateToParse = dateString;
        // If dateString includes time ('T') but no explicit timezone offset ('Z' or +/-HH:MM), append 'Z' to assume UTC.
        // This helps prevent `new Date()` from interpreting it as local time.
        if (dateToParse.includes('T') && !dateToParse.endsWith('Z') && !dateToParse.match(/([+-]\d{2}:\d{2})$/)) {
          dateToParse += 'Z';
        } else if (!dateToParse.includes('T')) {
          // If no time part, try to parse as YYYY-MM-DD or YYYY/MM/DD by creating a new Date directly.
          // Splitting and reconstructing can be error-prone if format varies.
          // new Date('YYYY-MM-DD') or new Date('YYYY/MM/DD') correctly treats it as UTC midnight.
        }

        const dateObj = new Date(dateToParse);
        if (isNaN(dateObj.getTime())) {
          console.warn(`PA Dates: Invalid date encountered during formatting: "${dateString}"`);
          return dateString; // Return original if invalid
        }
        // Output date in a user-friendly format, explicitly using UTC for consistency.
        return dateObj.toLocaleDateString(undefined, {
          year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC'
        });
      } catch (e) {
        console.error(`PA Dates: Error formatting date "${dateString}":`, e);
        return dateString; // Return original on error
      }
    },

    /**
     * Gets the display label for an ETA type (e.g., 'CARGO', 'PO').
     * Uses configured labels or defaults.
     * @param {string} etaType - The ETA type string from the API.
     * @returns {string} HTML string for the label, or empty string.
     */
    getEtaTypeLabel: function(etaType) {
      if (!etaType || typeof etaType !== 'string') return '';

      const typeUpperCase = etaType.toUpperCase();
      // Sanitize original type for display only if no specific label is found or configured.
      // Labels from config (this.config.labelCargo, this.config.labelPO) are sanitized before output.

      let labelText = this.sanitizeText(etaType); // Default to sanitized original type
      let modifierClass = 'unknown'; // BEM modifier class

      switch (typeUpperCase) {
        case 'CARGO':
          labelText = this.sanitizeText(this.config.labelCargo || 'Confirmed');
          modifierClass = 'confirmed';
          break;
        case 'PO': // Purchase Order
          labelText = this.sanitizeText(this.config.labelPO || 'Estimated');
          modifierClass = 'estimated';
          break;
        // Add more cases here if other etaTypes are expected
      }
      // Consistent BEM-style classes
      return `<span class="product-arrival-dates__type product-arrival-dates__type--${modifierClass}">${labelText}</span>`;
    },

    /**
     * Renders the arrival dates into the content element.
     * Chooses between standard or compact layout based on configuration.
     */
    renderArrivalDates: function() {
      // Theme developers: CSS transitions can be applied for smoother appearance of content.
      console.log('PA Dates: Rendering arrival dates...');
      if (!this.elements.content) {
        console.error('PA Dates: Content element (#arrival-dates-content) missing. Cannot render.');
        this.showError('Internal error: UI component missing.');
        return;
      }

      const datesToDisplay = this.state.arrivalDates;
      if (!datesToDisplay || datesToDisplay.length === 0) {
        console.log('PA Dates: No arrival dates to render.');
        this.showNoData(); // Show 'no data' message if state has no dates
        return;
      }

      this.hideAllElements(); // Clear previous state (loading, error, etc.)

      // Add a modifier class to the main container for compact layout styling
      if (this.config.useCompactLayout) {
        this.elements.container.classList.add('product-arrival-dates--compact');
        this.renderCompactLayout(datesToDisplay);
      } else {
        this.elements.container.classList.remove('product-arrival-dates--compact');
        this.renderStandardLayout(datesToDisplay);
      }

      this.elements.content.style.display = 'block';
      if (this.elements.container) {
        this.elements.container.setAttribute('data-state', 'has-dates');
        this.elements.container.style.display = 'block';
      }
      console.log('PA Dates: Arrival dates render complete.');
    },

    /**
     * Renders the standard layout for arrival dates.
     * Uses BEM-like class names for elements.
     * @param {Array<Object>} datesToRender - Array of arrival date items to render (expected to be just one).
     */
    renderStandardLayout: function(datesToRender) {
      console.log('PA Dates: Rendering standard layout.');
      const title = this.config.titleStandard || 'Estimated Arrival Dates';
      // BEM classes: product-arrival-dates__element
      let htmlContent = `
        <div class="product-arrival-dates__header">
          <h3 class="product-arrival-dates__title">${this.sanitizeText(title)}</h3>
        </div>
        <ul class="product-arrival-dates__list">`;

      datesToRender.forEach(item => {
        htmlContent += `
          <li class="product-arrival-dates__item">
            <span class="product-arrival-dates__date">${this.formatDate(item.eta)}</span>
            <span class="product-arrival-dates__qty">${this.sanitizeText(item.qty)} units</span>
            <span class="product-arrival-dates__status">${this.getEtaTypeLabel(item.etaType)}</span>
          </li>`;
      });
      htmlContent += '</ul>';

      const note = this.config.noteStandard || '<strong>Note:</strong> Dates subject to change.';
      if (note) {
        // Sanitize the note content before rendering, consistent with other configurable strings.
        htmlContent += `<div class="product-arrival-dates__note"><p>${this.sanitizeText(note)}</p></div>`;
      }
      this.elements.content.innerHTML = htmlContent;
    },

    /**
     * Renders the compact layout for arrival dates.
     * Uses BEM-like class names, potentially with modifiers for compact styling.
     * @param {Array<Object>} datesToRender - Array of arrival date items to render (expected to be just one).
     */
    renderCompactLayout: function(datesToRender) {
      console.log('PA Dates: Rendering compact layout.');
      const title = this.config.titleCompact || 'Expected Arrival:';
      const note = this.config.noteCompact || 'Dates subject to change.';
      // BEM classes: product-arrival-dates__element product-arrival-dates__element--compact
      // The main container will have `product-arrival-dates--compact` which can be used for context.
      let htmlContent = `
        <div class="product-arrival-dates__header product-arrival-dates__header--compact">
          <h3 class="product-arrival-dates__title product-arrival-dates__title--compact">${this.sanitizeText(title)}</h3>
        </div>
        <ul class="product-arrival-dates__list product-arrival-dates__list--compact">`;

      datesToRender.forEach(item => {
        htmlContent += `
          <li class="product-arrival-dates__item product-arrival-dates__item--compact">
            <span class="product-arrival-dates__date product-arrival-dates__date--compact">${this.formatDate(item.eta)}</span>
            <span class="product-arrival-dates__qty product-arrival-dates__qty--compact">(${this.sanitizeText(item.qty)})</span>
            <span class="product-arrival-dates__status product-arrival-dates__status--compact">${this.getEtaTypeLabel(item.etaType)}</span>
          </li>`;
      });
      htmlContent += '</ul>';

      if (note) {
        htmlContent += `<div class="product-arrival-dates__note product-arrival-dates__note--compact">${this.sanitizeText(note)}</div>`;
      }
      this.elements.content.innerHTML = htmlContent;
    },

    /**
     * Sanitizes a string by converting it to text content within a temporary DIV element.
     * This helps prevent XSS by escaping HTML special characters.
     * Can be skipped if `this.config.skipSanitization` is true.
     * @param {string} str - The string to sanitize.
     * @returns {string} The sanitized string, or original if sanitization is skipped or input is not a string.
     */
    sanitizeText: function(str) {
      if (this.config.skipSanitization === true) {
        return String(str); // Return as string, but unescaped
      }
      if (str === null || typeof str === 'undefined') {
        return '';
      }
      // Ensure input is a string before assigning to textContent
      const stringValue = String(str);
      const tempDiv = document.createElement('div');
      tempDiv.textContent = stringValue;
      return tempDiv.innerHTML;
    },

    /**
     * Diagnostic function to test API connection and configuration.
     * Uses `alert` for feedback, intended for developer use.
     */
    testApiConnection: function() {
      if (!this.config.enableApiDiagnostics) {
        console.warn('PA Dates (Diagnostics): Disabled via config.');
        return;
      }
      if (!this.config.authToken) {
        console.error('PA Dates (Diagnostics): Auth Token missing in config.');
        alert('Product Arrival Dates Diagnostics:\nAuth Token is missing. Check configuration.');
        return;
      }

      const apiBase = this.config.apiUrl || this.DEFAULT_API_URL;
      const testEndpointAccount = `${apiBase}/account/getShipTos`; // A sample authenticated endpoint
      const testEndpointArrivals = `${apiBase}${this.API_ENDPOINT_ARRIVAL_DATES}?partNumber=${encodeURIComponent(this.config.productSku || 'TESTSKU123')}`;

      console.log('PA Dates (Diagnostics): Starting API connection tests...');
      alert('Product Arrival Dates Diagnostics:\nRunning tests... Check browser console (F12) for details.');

      // Test 1: Fetch from a general authenticated endpoint (e.g., account info)
      console.log(`PA Dates (Diagnostics) - Test 1: Fetching from ${testEndpointAccount}`);
      fetch(testEndpointAccount, {
        method: 'GET',
        headers: {'Authorization': `Bearer ${this.config.authToken}`, 'Accept': 'application/json'}
      })
      .then(response => {
        console.log(`PA Dates (Diagnostics) - Test 1 Result: Status ${response.status} (${response.ok ? 'OK' : 'Error'})`);
        alert(`API Test 1 (Account Endpoint) ${response.ok ? 'Passed' : 'Failed'}:\nStatus: ${response.status}\nCheck console for response details.`);
        return response.ok ? response.json() : response.text(); // Try to parse JSON if OK, else get text
      })
      .then(data => console.log('PA Dates (Diagnostics) - Test 1 Response Data:', data))
      .catch(error => {
        console.error('PA Dates (Diagnostics) - Test 1 Error:', error);
        alert(`API Test 1 (Account Endpoint) Failed:\nError: ${error.message}\nCheck console.`);
      });

      // Test 2: Fetch arrival dates for the current or a test SKU
      if (this.config.productSku) {
        console.log(`PA Dates (Diagnostics) - Test 2: Fetching arrival dates for SKU ${this.config.productSku} from ${testEndpointArrivals}`);
        fetch(testEndpointArrivals, {
          method: 'GET',
          headers: {'Authorization': `Bearer ${this.config.authToken}`, 'Accept': 'application/json'}
        })
        .then(response => {
          console.log(`PA Dates (Diagnostics) - Test 2 Result: Status ${response.status} (${response.ok ? 'OK' : 'Error'})`);
          alert(`API Test 2 (Arrival Dates Endpoint) ${response.ok ? 'Passed' : 'Failed'}:\nStatus: ${response.status}\nCheck console for response details.`);
          return response.ok ? response.json() : response.text();
        })
        .then(data => console.log('PA Dates (Diagnostics) - Test 2 Response Data:', data))
        .catch(error => {
          console.error('PA Dates (Diagnostics) - Test 2 Error:', error);
          alert(`API Test 2 (Arrival Dates Endpoint) Failed:\nError: ${error.message}\nCheck console.`);
        });
      } else {
        console.warn('PA Dates (Diagnostics) - Test 2 Skipped: No productSku configured.');
        alert('API Test 2 (Arrival Dates Endpoint) Skipped: No productSku configured.');
      }
    }
  };

  // --- Component Initialization on DOMContentLoaded ---
  try {
    ProductArrivalDates.init();
    window.ProductArrivalDates = ProductArrivalDates; // Expose to global scope if needed for debugging or external calls
    console.log('PA Dates: Initialization sequence complete.');
  } catch (criticalError) {
    console.error('PA Dates: Critical error during initialization sequence:', criticalError);
    // Fallback error display if ProductArrivalDates.showError itself is broken or not initialized
    const errorElement = document.getElementById('arrival-dates-error');
    if (errorElement) {
      errorElement.textContent = 'A critical error occurred setting up Product Arrival Dates.';
      errorElement.style.display = 'block';
    }
    const containerElement = document.getElementById('product-arrival-dates');
    if (containerElement) {
      containerElement.setAttribute('data-state', 'critical-error'); // Use a distinct state
      containerElement.style.display = 'block';
    }
  }
});
