console.log('product-finder.js executing...'); // Version indicator - Enhanced

document.addEventListener('DOMContentLoaded', () => {
  console.log('DOMContentLoaded event fired.');

  // --- Constants ---
  const PLACEHOLDERS = { TYPE: '-- Select Type --', CATEGORY: '-- Select Category --', MAKE: '-- Select Make --', YEAR: '-- Select Year --', MODEL: '-- Select Model --' };
  const API_RESPONSE_KEYS = { TYPES: 'types', CATEGORIES: 'fitmentCategories', MAKES: 'makes', YEARS: 'years', MODELS: 'models', PRODUCTS: 'fitmentProducts', PRODUCT_SKU: 'itemNumber', PRODUCT_DESC: 'description', CATEGORY_MAIN: 'category', CATEGORY_SUB: 'subCategory' };
  const CACHE_PREFIX = 'fitmentCache_';
  const CACHE_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes
  const DESKTOP_BREAKPOINT = 769;
  const STORAGE_KEY_PREFIX = 'fitmentToggleState_';
  const LAST_SELECTED_VEHICLE_STORAGE_KEY = 'lastSelectedVehicle';
  const SKELETON_CARD_COUNT = 6; // Number of skeleton cards to show while loading products

  // Check if Choices library is loaded globally
  if (typeof Choices === 'undefined') {
    console.error('Choices.js library not found. Please ensure it is loaded globally before this script.');
  }

  const fitmentSections = document.querySelectorAll('.fitment-selector-section');
  console.log(`Found ${fitmentSections.length} fitment sections.`);

  fitmentSections.forEach((section) => {
    const sectionId = section.dataset.sectionId;
    const storageKey = `${STORAGE_KEY_PREFIX}${sectionId}`;
    console.log(`Processing section: ${sectionId}`);

    // --- Configuration & Element References ---
    const apiBaseUrl = section.dataset.apiBaseUrl;
    const apiToken = section.dataset.apiToken;
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

    const getCache = (key) => {
        const cacheKey = `${CACHE_PREFIX}${sectionId}_${key}`;
        try {
            const itemStr = sessionStorage.getItem(cacheKey);
            if (!itemStr) return null;
            const item = JSON.parse(itemStr);
            if (new Date().getTime() > item.expiry) {
                sessionStorage.removeItem(cacheKey);
                console.log(`Cache expired for key: ${cacheKey}`);
                return null;
            }
            return item.value;
        } catch (e) {
            console.error(`Error reading from cache key ${cacheKey}:`, e);
            try { sessionStorage.removeItem(cacheKey); } catch (removeError) {}
            return null;
        }
    };

    const setCache = (key, value) => {
        const cacheKey = `${CACHE_PREFIX}${sectionId}_${key}`;
        const item = { value: value, expiry: new Date().getTime() + CACHE_EXPIRY_MS };
        try {
            sessionStorage.setItem(cacheKey, JSON.stringify(item));
        } catch (e) {
            console.error(`Error setting cache key ${cacheKey}:`, e);
        }
    };

    const clearCache = () => {
        try {
            Object.keys(sessionStorage).forEach(key => {
                if (key.startsWith(`${CACHE_PREFIX}${sectionId}_`)) {
                    sessionStorage.removeItem(key);
                }
            });
            console.log(`Cleared fitment cache for section ${sectionId}`);
        } catch (e) {
            console.error(`Error clearing cache for section ${sectionId}:`, e);
        }
    };

    const toggleLoading = (loader, show) => {
      if (loader) {
        loader.style.display = show ? 'inline-flex' : 'none';
      }
    };

    /** Displays an error message in the designated container. Provides user-friendly messages. */
    const displayError = (message, currentSectionId, elementToShowNear = null) => {
      const errorContainer = document.querySelector(`#fitment-error-message-${currentSectionId}`);
      let userFriendlyMessage = message;
      // Enhance with more user-friendly messages based on common error types
      if (message.toLowerCase().includes("failed to fetch") || message.toLowerCase().includes("network error")) {
          userFriendlyMessage = "A network error occurred. Please check your internet connection and try again.";
      } else if (message.toLowerCase().includes("timed out")) {
          userFriendlyMessage = "The request took too long to respond. Please try again shortly.";
      } else if (message.toLowerCase().includes("api token")) {
          userFriendlyMessage = message; // Keep specific token messages
      }

      console.error(`Fitment Error (${currentSectionId}): ${message}`);
      if (errorContainer) {
        errorContainer.textContent = `Error: ${userFriendlyMessage}`;
        errorContainer.style.display = 'block';
      }
    };

    const clearError = (currentSectionId) => {
      const errorContainer = document.querySelector(`#fitment-error-message-${currentSectionId}`);
      if (errorContainer) {
        errorContainer.textContent = '';
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
    };

    const resetAllSelectorsAndResults = () => {
      console.log(`Resetting all selectors for section ${sectionId}`);
      clearCache();
      try {
          localStorage.removeItem(LAST_SELECTED_VEHICLE_STORAGE_KEY);
          console.log(`Cleared last selected vehicle from localStorage.`);
      } catch (e) {
          console.warn(`Could not clear last selected vehicle from localStorage:`, e);
      }

      const originalTypeOptions = getCache('types') || [];

      resetSelect(elements.typeSelect, PLACEHOLDERS.TYPE, originalTypeOptions.length === 0);
      if (originalTypeOptions.length > 0) {
          populateSelect(elements.typeSelect, originalTypeOptions);
          elements.typeSelect.selectedIndex = 0;
      } else {
          initialize();
      }

      resetSelect(elements.categorySelect, PLACEHOLDERS.CATEGORY, true);
      resetSelect(elements.makeSelect, PLACEHOLDERS.MAKE, true);
      resetSelect(elements.yearSelect, PLACEHOLDERS.YEAR, true);
      resetSelect(elements.modelSelect, PLACEHOLDERS.MODEL, true);

      if(elements.findPartsButton) elements.findPartsButton.disabled = true;
      if(elements.resultsContainer) elements.resultsContainer.innerHTML = '<p>Please select your vehicle details above to find compatible parts.</p>';
      clearError(sectionId);

      toggleLoading(elements.typeLoading, false);
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

            const selectedVehicle = {
                type: selectedType,
                category: category,
                subCategory: subCategory,
                make: selectedMake,
                year: selectedYear,
                model: selectedModel
            };
            try {
                localStorage.setItem(LAST_SELECTED_VEHICLE_STORAGE_KEY, JSON.stringify(selectedVehicle));
                console.log('Saved selected vehicle to localStorage:', selectedVehicle);
            } catch (e) {
                console.warn('Could not save selected vehicle to localStorage:', e);
            }
        } else {
             try {
                 localStorage.removeItem(LAST_SELECTED_VEHICLE_STORAGE_KEY);
                 console.log('Cleared last selected vehicle from localStorage (incomplete selection).');
             } catch (e) {
                  console.warn('Could not clear last selected vehicle from localStorage:', e);
             }
        }
    };

    // --- API and Shopify Fetching Functions ---

    const fetchAPI = async (url, method = 'GET', body = null) => {
        if (!url || typeof url !== 'string' || !url.startsWith('http')) {
            throw new Error(`Invalid API endpoint URL: ${url}`);
        }
        const headers = { 'Authorization': `Bearer ${apiToken}`, 'Accept': 'application/json' };
        const options = { method: method, headers: headers, signal: AbortSignal.timeout(15000) }; // 15 second timeout
        if (body && (method === 'POST' || method === 'PUT')) {
            options.body = JSON.stringify(body);
            headers['Content-Type'] = 'application/json';
        }
        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                let errorData = null; let errorMessage = `API Error: ${response.status} ${response.statusText}`;
                 try { errorData = await response.json(); } catch (e) {}
                 switch (response.status) {
                      case 401: errorMessage = "Authentication failed. Please check the API Token."; break;
                      case 403: errorMessage = "Permission denied for this request."; break;
                      case 404: errorMessage = "API endpoint not found. Please check configuration."; break;
                      case 429: errorMessage = "Too many requests to the server. Please wait and try again."; break;
                      case 500: case 502: case 503: case 504: errorMessage = "The server encountered an error. Please try again later."; break;
                      default: errorMessage = errorData?.error?.message || errorData?.message || errorMessage;
                 }
                 console.error(`API Error Data for ${url}:`, errorData);
                 throw new Error(errorMessage);
            }
            if (response.status === 204) return null; // No Content
            const data = await response.json();
            if (data.status && data.status !== 'success' && data.status !== 200) { // Handle non-standard success statuses if any
                const appErrorMessage = data.error?.message || data.message || 'API returned a non-success status.';
                throw new Error(appErrorMessage);
            }
            return data.data || data; // Assuming data is nested under 'data' key or is the response itself
        } catch (error) {
            if (error.name === 'AbortError') throw new Error("Request timed out.");
            if (error instanceof TypeError && error.message === 'Failed to fetch') throw new Error("Network error. Failed to connect to the API.");
            console.error(`Fetch API error for ${url}:`, error);
            throw new Error(error.message || "An unexpected error occurred while fetching data.");
        }
    };

    /**
     * Fetches Shopify product/variant data by SKU.
     * PERFORMANCE NOTE: This makes two requests per SKU. If the Shopify API supports
     * batch fetching products by multiple SKUs or handles, that would be more performant.
     * Consider investigating Shopify's GraphQL API for batch operations if performance becomes an issue.
     */
    const fetchShopifyProductBySkuMultiStep = async (sku) => {
        if (!sku) return null;
        const normalizedSku = String(sku).trim().toLowerCase();
        if (!normalizedSku) return null;
        let productHandle = null;
        try {
            const encodedSkuQuery = encodeURIComponent(`variants.sku:"${normalizedSku}"`);
            // Fetching minimal data: only handle
            const suggestUrl = `/search/suggest.json?q=${encodedSkuQuery}&resources[type]=product&resources[limit]=1&resources[options][unavailable_products]=show&resources[fields]=handle`;
            const suggestResponse = await fetch(suggestUrl);
            if (suggestResponse.ok) {
                const suggestions = await suggestResponse.json();
                const products = suggestions?.resources?.results?.products;
                if (products && products.length > 0) productHandle = products[0].handle;
            }
        } catch (error) { console.error(`Shopify suggest fetch error for SKU ${normalizedSku}:`, error); }

        if (productHandle) {
            try {
                const productJsonUrl = `/products/${productHandle}.js`;
                const productResponse = await fetch(productJsonUrl);
                if (productResponse.ok) {
                    const fullProductData = await productResponse.json();
                    if (fullProductData && Array.isArray(fullProductData.variants)) {
                        const matchingVariant = fullProductData.variants.find(v => v.sku && String(v.sku).trim().toLowerCase() === normalizedSku);
                        if (matchingVariant) return { product: fullProductData, variant: matchingVariant };
                    }
                }
            } catch (error) { console.error(`Shopify product JSON fetch error for handle ${productHandle}:`, error); }
        }
        return null;
    };

    /** Creates an HTML product card element. Adds 'card-fade-in' class for animation. */
    const createProductCard = (product, variant) => {
        if (!product || !variant) return null;
        const cardLink = document.createElement('a');
        cardLink.className = 'fitment-product-card card-fade-in'; // Added card-fade-in
        cardLink.href = variant.id ? `/products/${product.handle}?variant=${variant.id}` : `/products/${product.handle}`;

        const imageContainer = document.createElement('div');
        imageContainer.className = 'fitment-product-image-container'; // For better image loading UX

        const imageElement = document.createElement('img');
        imageElement.className = 'fitment-product-image';
        const imageUrl = variant.featured_image?.src || product.featured_image || 'https://placehold.co/180x120/e9ecef/6c757d?text=No+Image';
        imageElement.src = imageUrl;
        imageElement.alt = variant.featured_image?.alt || product.title || 'Product Image';
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
            variantTitleSpan.className = 'fitment-product-variant-title'; // Added class for styling
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
        priceElement.textContent = variant.price ? `$${(variant.price / 100).toFixed(2)}` : 'N/A';
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

        const shopifyDataPromises = fitmentProducts.map(gammaProduct => {
            const sku = gammaProduct ? gammaProduct[API_RESPONSE_KEYS.PRODUCT_SKU] : undefined;
            const description = gammaProduct ? gammaProduct[API_RESPONSE_KEYS.PRODUCT_DESC] : undefined;
            if (!sku) return Promise.reject({ reason: new Error('Missing SKU from API response'), sku: 'MISSING', description });
            return fetchShopifyProductBySkuMultiStep(sku)
                .then(shopifyResult => ({ sku, description, shopifyResult }))
                .catch(error => { throw { reason: error, sku, description }; });
        });

        const shopifyResultsSettled = await Promise.allSettled(shopifyDataPromises);

        // Clear skeletons before adding actual cards
        productGrid.innerHTML = '';
        let foundCount = 0, unmatchedCount = 0;

        // Using a DocumentFragment for potentially better performance with many cards
        const fragment = document.createDocumentFragment();

        shopifyResultsSettled.forEach(result => {
            if (result.status === 'fulfilled') {
                const { sku, description, shopifyResult } = result.value;
                if (shopifyResult?.product && shopifyResult?.variant) {
                    const productCardElement = createProductCard(shopifyResult.product, shopifyResult.variant);
                    if (productCardElement) {
                        foundCount++;
                        fragment.appendChild(productCardElement);
                    }
                } else {
                    unmatchedCount++;
                    fragment.appendChild(createUnmatchedSkuCard(sku, description));
                }
            } else {
                unmatchedCount++;
                const { sku = 'unknown', description = 'unknown', reason = 'Unknown error processing SKU' } = result.reason || {};
                console.error(`Promise rejected for SKU '${sku}'. Reason:`, reason);
                fragment.appendChild(createUnmatchedSkuCard(sku, description));
            }
        });

        productGrid.appendChild(fragment); // Append all cards at once

        if (foundCount === 0 && unmatchedCount === 0) { // Should not happen if fitmentProducts was not empty
             elements.resultsContainer.innerHTML = '<p>No products could be processed or displayed.</p>';
        } else if (foundCount === 0 && unmatchedCount > 0) {
            // Optionally, add a summary message if only unmatched SKUs were found
            const summaryMessage = document.createElement('p');
            summaryMessage.textContent = `Found ${unmatchedCount} part number(s) that are not currently available in this store.`;
            summaryMessage.style.textAlign = 'center';
            summaryMessage.style.marginBottom = 'var(--fitment-spacing-sm)';
            elements.resultsContainer.insertBefore(summaryMessage, productGrid);
        }
         // If productGrid is already appended and populated, no need to clear resultsContainer again
    };

    // --- Event Listeners ---

    elements.typeSelect?.addEventListener('change', async (event) => {
      const selectedType = event.target.value;
      resetSubsequentDropdowns('type');
      saveSelectedVehicle();
      if (!selectedType) return;
      toggleLoading(elements.categoryLoading, true);
      clearError(sectionId);
      const cacheKey = `categories_${selectedType}`;
      const cachedData = getCache(cacheKey);
      try {
          let apiResponse = cachedData ? { [API_RESPONSE_KEYS.CATEGORIES]: cachedData } : null;
          if (!apiResponse) {
              const apiUrl = `${apiEndpoints.categories}?type=${encodeURIComponent(selectedType)}`;
              apiResponse = await fetchAPI(apiUrl);
              const categoriesToCache = apiResponse?.[API_RESPONSE_KEYS.CATEGORIES] || apiResponse || [];
              setCache(cacheKey, Array.isArray(categoriesToCache) ? categoriesToCache : []);
          }
          const categoryData = apiResponse?.[API_RESPONSE_KEYS.CATEGORIES] || apiResponse || [];
          if (!Array.isArray(categoryData)) throw new Error('Invalid category data format received from API.');
          const combinedCategoryOptions = categoryData
              .map(item => {
                  const cat = String(item?.[API_RESPONSE_KEYS.CATEGORY_MAIN] || '').trim();
                  const subCat = String(item?.[API_RESPONSE_KEYS.CATEGORY_SUB] || '').trim();
                  return cat ? (subCat ? `${cat} - ${subCat}` : cat) : null;
              })
              .filter(item => item !== null);
          currentCategoryOptions = [...new Set(combinedCategoryOptions)].sort((a, b) => a.localeCompare(b));
          if (currentCategoryOptions.length === 0) {
              displayError(`No categories found for type '${selectedType}'. Please try a different type.`, sectionId, elements.categorySelect);
              resetSelect(elements.categorySelect, PLACEHOLDERS.CATEGORY);
          } else {
              populateSelect(elements.categorySelect, currentCategoryOptions);
          }
      } catch (error) {
          displayError(`Failed to load categories: ${error.message}`, sectionId, elements.categorySelect);
          resetSelect(elements.categorySelect, PLACEHOLDERS.CATEGORY);
      } finally {
          toggleLoading(elements.categoryLoading, false);
      }
    });

    elements.categorySelect?.addEventListener('change', async (event) => {
        const selectedCombinedCategory = event.target.value;
        const selectedType = elements.typeSelect?.value;
        resetSubsequentDropdowns('category');
        saveSelectedVehicle();
        clearError(sectionId);
        if (!selectedCombinedCategory || !selectedType) return;
        let category = '', subCategory = '';
        if (selectedCombinedCategory) {
            const parts = selectedCombinedCategory.split(' - ');
            category = parts[0].trim();
            if (parts.length > 1) { subCategory = parts.slice(1).join(' - ').trim(); }
        }
        toggleLoading(elements.makeLoading, true);
        const cacheKey = `makes_${selectedType}_${category}_${subCategory}`;
        const cachedData = getCache(cacheKey);
        try {
            let apiResponse = cachedData ? { [API_RESPONSE_KEYS.MAKES]: cachedData } : null;
            if (!apiResponse) {
                const params = new URLSearchParams({ type: selectedType });
                if (category) params.append('category', category);
                if (subCategory) params.append('subCategory', subCategory);
                const apiUrl = `${apiEndpoints.makes}?${params.toString()}`;
                apiResponse = await fetchAPI(apiUrl);
                const makesToCache = apiResponse?.[API_RESPONSE_KEYS.MAKES] || apiResponse || [];
                setCache(cacheKey, Array.isArray(makesToCache) ? makesToCache : []);
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
             displayError(`Failed to load makes: ${error.message}`, sectionId, elements.makeSelect);
             resetSelect(elements.makeSelect, PLACEHOLDERS.MAKE);
        } finally { toggleLoading(elements.makeLoading, false); }
    });

    elements.makeSelect?.addEventListener('change', async (event) => {
        const selectedMake = event.target.value;
        const selectedType = elements.typeSelect?.value;
        const selectedCombinedCategory = elements.categorySelect?.value;
        resetSubsequentDropdowns('make');
        saveSelectedVehicle();
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
        const cachedData = getCache(cacheKey);
        try {
             let apiResponse = cachedData ? { [API_RESPONSE_KEYS.YEARS]: cachedData } : null;
            if (!apiResponse) {
                const params = new URLSearchParams({ type: selectedType, make: selectedMake });
                if (category) params.append('category', category);
                if (subCategory) params.append('subCategory', subCategory);
                const apiUrl = `${apiEndpoints.years}?${params.toString()}`;
                apiResponse = await fetchAPI(apiUrl);
                const yearsToCache = apiResponse?.[API_RESPONSE_KEYS.YEARS] || apiResponse || [];
                setCache(cacheKey, Array.isArray(yearsToCache) ? yearsToCache : []);
            }
            const data = apiResponse?.[API_RESPONSE_KEYS.YEARS] || apiResponse || [];
            if (!Array.isArray(data)) throw new Error('Invalid years data format received from API.');
            const sortedYears = data.map(Number).filter(y => !isNaN(y)).sort((a, b) => b - a);
             if (sortedYears.length === 0) {
                 displayError(`No years found for the selected make. Please try a different make.`, sectionId, elements.yearSelect);
                 resetSelect(elements.yearSelect, PLACEHOLDERS.YEAR);
            } else { populateSelect(elements.yearSelect, sortedYears); }
        } catch (error) {
             displayError(`Failed to load years: ${error.message}`, sectionId, elements.yearSelect);
             resetSelect(elements.yearSelect, PLACEHOLDERS.YEAR);
        } finally { toggleLoading(elements.yearLoading, false); }
    });

    elements.yearSelect?.addEventListener('change', async (event) => {
        const selectedYear = event.target.value;
        const selectedType = elements.typeSelect?.value;
        const selectedCombinedCategory = elements.categorySelect?.value;
        const selectedMake = elements.makeSelect?.value;
        resetSubsequentDropdowns('year');
        saveSelectedVehicle();
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
        const cachedData = getCache(cacheKey);
        try {
             let apiResponse = cachedData ? { [API_RESPONSE_KEYS.MODELS]: cachedData } : null;
            if (!apiResponse) {
                const params = new URLSearchParams({ type: selectedType, make: selectedMake, year: selectedYear });
                if (category) params.append('category', category);
                if (subCategory) params.append('subCategory', subCategory);
                const apiUrl = `${apiEndpoints.models}?${params.toString()}`;
                apiResponse = await fetchAPI(apiUrl);
                const modelsToCache = apiResponse?.[API_RESPONSE_KEYS.MODELS] || apiResponse || [];
                setCache(cacheKey, Array.isArray(modelsToCache) ? modelsToCache : []);
            }
            const data = apiResponse?.[API_RESPONSE_KEYS.MODELS] || apiResponse || [];
            if (!Array.isArray(data)) throw new Error('Invalid models data format received from API.');
            const sortedModels = data.sort((a, b) => a.localeCompare(b));
             if (sortedModels.length === 0) {
                 displayError(`No models found for the selected year. Please try a different year.`, sectionId, elements.modelSelect);
                 resetSelect(elements.modelSelect, PLACEHOLDERS.MODEL);
            } else { populateSelect(elements.modelSelect, sortedModels); }
        } catch (error) {
             displayError(`Failed to load models: ${error.message}`, sectionId, elements.modelSelect);
             resetSelect(elements.modelSelect, PLACEHOLDERS.MODEL);
        } finally { toggleLoading(elements.modelLoading, false); }
    });

    elements.modelSelect?.addEventListener('change', (event) => {
      const selectedModel = event.target.value;
      resetSubsequentDropdowns('model');
      saveSelectedVehicle();
      if (selectedModel && elements.typeSelect?.value && elements.categorySelect?.value && elements.makeSelect?.value && elements.yearSelect?.value) {
        if(elements.findPartsButton) elements.findPartsButton.disabled = false;
      } else {
        if(elements.findPartsButton) elements.findPartsButton.disabled = true;
      }
    });

    elements.findPartsButton?.addEventListener('click', async () => {
        saveSelectedVehicle();
        const type = elements.typeSelect?.value;
        const combinedCategoryValue = elements.categorySelect?.value;
        const make = elements.makeSelect?.value;
        const year = elements.yearSelect?.value;
        const model = elements.modelSelect?.value;
        if (!type || !combinedCategoryValue || !make || !year || !model) {
            displayError('Please ensure Type, Category, Make, Year, and Model are all selected before finding parts.', sectionId); return;
        }
        let category = '', subCategory = '';
        if (combinedCategoryValue) {
             const parts = combinedCategoryValue.split(' - ');
             category = parts[0].trim();
             if (parts.length > 1) { subCategory = parts.slice(1).join(' - ').trim(); }
        }
        console.log(`Searching Parts: Type='${type}', Category='${category}', SubCategory='${subCategory}', Make='${make}', Year='${year}', Model='${model}'`);
        toggleLoading(elements.searchLoading, true);
        if(elements.findPartsButton) elements.findPartsButton.disabled = true; // Disable button during search
        clearError(sectionId);
        // No initial "Searching..." message here, displayResults will handle skeletons
        // if(elements.resultsContainer) elements.resultsContainer.innerHTML = '<p>Searching for compatible parts...</p>';

        try {
            const params = new URLSearchParams({ type, make, year, model });
            if (category) params.append('category', category);
            if (subCategory) params.append('subCategory', subCategory);
            const apiUrl = `${apiEndpoints.products}?${params.toString()}`;
            const gammaData = await fetchAPI(apiUrl);
            const productsData = gammaData?.[API_RESPONSE_KEYS.PRODUCTS] || gammaData || [];
            if (!Array.isArray(productsData)) throw new Error('Invalid product data format received from API.');
            await displayResults(productsData);
        } catch (error) {
            displayError(`Failed to find parts: ${error.message}`, sectionId);
            if(elements.resultsContainer) elements.resultsContainer.innerHTML = '<p>Could not load products due to an error. Please check the selections or try again.</p>';
        } finally {
            toggleLoading(elements.searchLoading, false);
            // Re-enable button only if a model is still selected (meaning not reset)
            if(elements.findPartsButton && elements.modelSelect?.value) {
                elements.findPartsButton.disabled = false;
            }
        }
    });

    elements.resetButton?.addEventListener('click', () => {
      resetAllSelectorsAndResults();
    });

    // --- Toggle Button Logic ---
    const setInitialToggleState = () => {
        if (!isToggleEnabled || !elements.toggleButton) return;
        let isInitiallyCollapsed;
        try {
            const savedState = localStorage.getItem(storageKey);
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
            try { localStorage.setItem(storageKey, String(isNowCollapsed)); }
            catch (error) { console.warn(`Could not save toggle state for ${sectionId} to localStorage:`, error); }
        });
        setInitialToggleState();
    }

    // --- Initialization ---
    const initialize = async () => {
        toggleLoading(elements.typeLoading, true);
        clearError(sectionId);
        resetSelect(elements.categorySelect, PLACEHOLDERS.CATEGORY, true);
        resetSelect(elements.makeSelect, PLACEHOLDERS.MAKE, true);
        resetSelect(elements.yearSelect, PLACEHOLDERS.YEAR, true);
        resetSelect(elements.modelSelect, PLACEHOLDERS.MODEL, true);
        if(elements.findPartsButton) elements.findPartsButton.disabled = true;

        const cacheKey = 'types';
        const cachedData = getCache(cacheKey);
        try {
            let apiResponse = cachedData ? { [API_RESPONSE_KEYS.TYPES]: cachedData } : null;
            if (!apiResponse) {
                if (!apiEndpoints.types) throw new Error("Types API endpoint URL is missing in configuration.");
                apiResponse = await fetchAPI(apiEndpoints.types);
                const typesToCache = apiResponse?.[API_RESPONSE_KEYS.TYPES] || apiResponse || [];
                setCache(cacheKey, Array.isArray(typesToCache) ? typesToCache : []);
            }
            const data = apiResponse?.[API_RESPONSE_KEYS.TYPES] || apiResponse || [];
            if (!Array.isArray(data)) throw new Error('Invalid types data format received from API.');
            const sortedTypes = data.sort((a, b) => a.localeCompare(b));
            populateSelect(elements.typeSelect, sortedTypes);
            if (sortedTypes.length === 0) {
                displayError("No vehicle types are currently available. Please check back later.", sectionId);
                disableAllSelectors();
            }
        } catch (error) {
            console.error(`initialize: Error caught during type fetching for section ${sectionId}:`, error);
            displayError(`Initialization failed: Could not load vehicle types. ${error.message}`, sectionId);
            disableAllSelectors();
        } finally {
            toggleLoading(elements.typeLoading, false);
        }
    };

    initialize();

  }); // End forEach loop

}); // End DOMContentLoaded

/**
 * SCRIPT LOADING NOTE:
 * For optimal performance, ensure this script and any dependencies like Choices.js
 * are loaded with the `defer` attribute in your theme's main layout file (e.g., theme.liquid).
 * Example: <script src="{{ 'product-finder.js' | asset_url }}" defer></script>
 */
