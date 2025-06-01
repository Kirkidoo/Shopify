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
            console.error(`Error reading from sessionStorage key ${cacheKey}:`, e);
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
            console.error(`Error setting sessionStorage key ${cacheKey}:`, e);
        }
    };

    const getLocalStorageCache = (key, currentSectionId) => {
        const cacheKey = `${CACHE_PREFIX}${currentSectionId}_${key}`;
        try {
            const itemStr = localStorage.getItem(cacheKey);
            if (!itemStr) return null;
            const item = JSON.parse(itemStr);
            if (new Date().getTime() > item.expiry) {
                localStorage.removeItem(cacheKey);
                console.log(`localStorage cache expired for key: ${cacheKey}`);
                return null;
            }
            return item.value;
        } catch (e) {
            console.error(`Error reading from localStorage key ${cacheKey}:`, e);
            try { localStorage.removeItem(cacheKey); } catch (removeError) {}
            return null;
        }
    };

    const setLocalStorageCache = (key, value, currentSectionId) => {
        const cacheKey = `${CACHE_PREFIX}${currentSectionId}_${key}`;
        const item = { value: value, expiry: new Date().getTime() + CACHE_EXPIRY_MS };
        try {
            localStorage.setItem(cacheKey, JSON.stringify(item));
        } catch (e) {
            console.error(`Error setting localStorage key ${cacheKey}:`, e);
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
      clearCache(); // Clears section-specific sessionStorage

      // Explicitly clear the 'types' data from localStorage for this section
      try {
          const typesCacheKey = `${CACHE_PREFIX}${sectionId}_types`;
          localStorage.removeItem(typesCacheKey);
          console.log(`Cleared types from localStorage for section ${sectionId}`);
      } catch (e) {
          console.warn(`Could not clear types from localStorage for section ${sectionId}:`, e);
      }

      try {
          localStorage.removeItem(LAST_SELECTED_VEHICLE_STORAGE_KEY);
          console.log(`Cleared last selected vehicle from localStorage.`);
      } catch (e) {
          console.warn(`Could not clear last selected vehicle from localStorage:`, e);
      }

      // Attempt to load types from localStorage first for repopulation after reset,
      // otherwise, it will be fetched in initialize()
      const originalTypeOptions = getLocalStorageCache('types', sectionId) || [];

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

    const fetchShopifyProductsBySkuAJAX = async (skus) => {
        if (!Array.isArray(skus) || skus.length === 0) {
            return new Map();
        }

        const uniqueNormalizedSkus = [...new Set(skus.map(sku => String(sku).trim().toLowerCase()).filter(sku => sku))];

        if (uniqueNormalizedSkus.length === 0) {
            return new Map();
        }

        // Stage 1: Fetch Product Handles in Parallel
        const skuToHandleMap = new Map(); // Stores { sku => handle }
        const handlePromises = uniqueNormalizedSkus.map(sku => {
            const encodedSkuQuery = encodeURIComponent(`variants.sku:"${sku}"`);
            const suggestUrl = `/search/suggest.json?q=${encodedSkuQuery}&resources[type]=product&resources[limit]=1&resources[options][unavailable_products]=show&resources[fields]=handle`;
            return fetch(suggestUrl)
                .then(response => {
                    if (!response.ok) throw new Error(`Suggest API failed for SKU ${sku} with status ${response.status}`);
                    return response.json();
                })
                .then(suggestions => {
                    const products = suggestions?.resources?.results?.products;
                    if (products && products.length > 0 && products[0].handle) {
                        skuToHandleMap.set(sku, products[0].handle);
                    } else {
                        skuToHandleMap.set(sku, null); // No handle found
                    }
                })
                .catch(error => {
                    console.error(`Fetch handle error for SKU ${sku}:`, error);
                    skuToHandleMap.set(sku, null); // Mark as error or not found
                });
        });

        await Promise.allSettled(handlePromises);

        // Stage 2: Fetch Product Data by Unique Handles in Parallel
        const uniqueHandles = [...new Set(Array.from(skuToHandleMap.values()).filter(handle => handle))];
        const productDataMap = new Map(); // Stores { handle => productJson }

        if (uniqueHandles.length > 0) {
            const productPromises = uniqueHandles.map(handle => {
                const productJsonUrl = `/products/${handle}.js`;
                return fetch(productJsonUrl)
                    .then(response => {
                        if (!response.ok) throw new Error(`Product API failed for handle ${handle} with status ${response.status}`);
                        return response.json();
                    })
                    .then(productJson => {
                        productDataMap.set(handle, productJson);
                    })
                    .catch(error => {
                        console.error(`Fetch product JSON error for handle ${handle}:`, error);
                        // productDataMap will not have an entry for this handle if fetch fails
                    });
            });
            await Promise.allSettled(productPromises);
        }

        // Stage 3: Process Results and Map Back to Original SKUs
        const resultsMap = new Map();

        for (const sku of uniqueNormalizedSkus) {
            const handle = skuToHandleMap.get(sku);
            if (!handle) {
                resultsMap.set(sku, { error: `Product handle not found for SKU: ${sku}` });
                continue;
            }

            const productJson = productDataMap.get(handle);
            if (!productJson) {
                resultsMap.set(sku, { error: `Product data not found for handle: ${handle} (SKU: ${sku})` });
                continue;
            }

            if (productJson && Array.isArray(productJson.variants)) {
                const matchingVariant = productJson.variants.find(v => v.sku && String(v.sku).trim().toLowerCase() === sku);
                if (matchingVariant) {
                    // Adapt data for createProductCard
                    // product.featured_image (URL string)
                    // variant.featured_image (object {src, alt} or null)
                    // variant.price (number in cents)
                    // variant.id (number or string)
                    const adaptedProduct = {
                        handle: productJson.handle,
                        title: productJson.title,
                        featured_image: productJson.featured_image, // This is typically a URL string
                    };
                    const adaptedVariant = {
                        id: matchingVariant.id,
                        title: matchingVariant.title,
                        sku: matchingVariant.sku,
                        available: matchingVariant.available,
                        price: matchingVariant.price, // Already in cents from product.js
                        featured_image: matchingVariant.featured_image || null, // featured_image is an object { src, alt, ... } or null
                    };
                    resultsMap.set(sku, { product: adaptedProduct, variant: adaptedVariant });
                } else {
                    resultsMap.set(sku, { error: `Variant with SKU ${sku} not found in product ${productJson.handle}` });
                }
            } else {
                resultsMap.set(sku, { error: `Invalid product data or no variants for SKU ${sku} (handle: ${handle})` });
            }
        }
        return resultsMap;
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
        elements.resultsContainer.innerHTML = ''; // Clear previous results

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

        const allSkus = fitmentProducts.map(gammaProduct => gammaProduct ? gammaProduct[API_RESPONSE_KEYS.PRODUCT_SKU] : null).filter(sku => sku);

        if (allSkus.length === 0) {
            productGrid.innerHTML = ''; // Clear skeletons
            elements.resultsContainer.innerHTML = '<p>No valid SKUs found in the product list to search.</p>';
            return;
        }

        // Fetch all Shopify product data in one go
        const shopifyProductsMap = await fetchShopifyProductsBySkuAJAX(allSkus);

        // Clear skeletons before adding actual cards
        productGrid.innerHTML = '';
        let foundCount = 0, unmatchedCount = 0;
        const fragment = document.createDocumentFragment();

        fitmentProducts.forEach(gammaProduct => {
            const sku = gammaProduct ? gammaProduct[API_RESPONSE_KEYS.PRODUCT_SKU] : undefined;
            const description = gammaProduct ? gammaProduct[API_RESPONSE_KEYS.PRODUCT_DESC] : undefined;

            if (!sku) {
                console.warn('Gamma product entry missing SKU, skipping:', gammaProduct);
                // Potentially create an "error" card for this case if desired
                // fragment.appendChild(createUnmatchedSkuCard('MISSING_SKU', description || 'Product data incomplete'));
                // unmatchedCount++;
                return;
            }

            const shopifyResult = shopifyProductsMap.get(String(sku).trim());

            if (shopifyResult && shopifyResult.product && shopifyResult.variant) {
                const productCardElement = createProductCard(shopifyResult.product, shopifyResult.variant);
                if (productCardElement) {
                    foundCount++;
                    fragment.appendChild(productCardElement);
                } else { // Should not happen if shopifyResult.product and .variant are valid
                    unmatchedCount++;
                    fragment.appendChild(createUnmatchedSkuCard(sku, description));
                }
            } else {
                unmatchedCount++;
                if (shopifyResult && shopifyResult.error) {
                     console.error(`Error fetching Shopify data for SKU ${sku}: ${shopifyResult.error}`);
                }
                fragment.appendChild(createUnmatchedSkuCard(sku, description));
            }
        });

        productGrid.appendChild(fragment); // Append all cards at once

        // Do not overwrite the critical token error if it was just displayed.
        const errorContainer = document.querySelector(`#fitment-error-message-${sectionId}`);
        const isTokenErrorDisplayed = errorContainer && errorContainer.textContent.includes('Shopify Storefront Access Token is missing');

        if (!isTokenErrorDisplayed) {
            if (foundCount === 0 && unmatchedCount === 0 && fitmentProducts.length > 0) {
                 elements.resultsContainer.innerHTML = '<p>No products could be processed or displayed.</p>';
            } else if (foundCount === 0 && unmatchedCount > 0) {
                const summaryMessage = document.createElement('p');
                summaryMessage.textContent = `Found ${unmatchedCount} part number(s) that are not currently available in this store or could not be retrieved.`;
                summaryMessage.style.textAlign = 'center';
                summaryMessage.style.marginBottom = 'var(--fitment-spacing-sm)';
                elements.resultsContainer.insertBefore(summaryMessage, productGrid);
            }
        } else if (productGrid.children.length === 0 && foundCount === 0 && unmatchedCount > 0) {
            // If token error IS displayed, and no product cards were added (only unmatched),
            // ensure the grid itself is cleared or hidden to prevent empty space or only unmatched cards showing confusingly.
            // The error message itself is the primary feedback in this case.
            productGrid.innerHTML = ''; // Clear any unmatched cards if the token error is the main issue.
            // Optionally, add a small note that no products could be checked.
            const note = document.createElement('p');
            note.textContent = "Product details could not be checked due to the missing token.";
            note.style.textAlign = 'center';
            elements.resultsContainer.appendChild(note);

        } else if (isTokenErrorDisplayed && foundCount === 0 && unmatchedCount > 0) {
             // If token error is displayed, and we only have unmatched cards, we might want to suppress the generic "Found X part numbers not available"
             // because the primary error is the token.
             // We can clear the productGrid if it only contains unmatched cards.
             let onlyUnmatched = true;
             for(const child of productGrid.childNodes) {
                 if (!child.classList || !child.classList.contains('fitment-product-not-found')) {
                     onlyUnmatched = false;
                     break;
                 }
             }
             if(onlyUnmatched) {
                 productGrid.innerHTML = '';
                 const summaryMessage = document.createElement('p');
                 summaryMessage.textContent = `Additionally, ${unmatchedCount} other part(s) were processed but could not be matched or found in the store.`;
                 summaryMessage.style.textAlign = 'center';
                 summaryMessage.style.marginTop = '10px'; // Add some space from the main error
                 elements.resultsContainer.appendChild(summaryMessage);
             }
        } else if (foundCount === 0 && unmatchedCount > 0) { // This condition might be redundant due to above, but kept for safety.
            const summaryMessage = document.createElement('p');
            summaryMessage.textContent = `Found ${unmatchedCount} part number(s) that are not currently available in this store or could not be retrieved.`;
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
        let initializationError = false;
        try {
            toggleLoading(elements.typeLoading, true);
            clearError(sectionId);
            resetSelect(elements.categorySelect, PLACEHOLDERS.CATEGORY, true);
            resetSelect(elements.makeSelect, PLACEHOLDERS.MAKE, true);
            resetSelect(elements.yearSelect, PLACEHOLDERS.YEAR, true);
            resetSelect(elements.modelSelect, PLACEHOLDERS.MODEL, true);
            if(elements.findPartsButton) elements.findPartsButton.disabled = true;

            const cacheKey = 'types';
            let typesData = getLocalStorageCache(cacheKey, sectionId);
            let apiResponse; // Declare apiResponse here to be accessible after the if/else

            if (typesData) {
                apiResponse = { [API_RESPONSE_KEYS.TYPES]: typesData };
                console.log(`Loaded types from localStorage for section ${sectionId}`);
            } else {
                console.log(`Types not found in localStorage for section ${sectionId}, fetching from API.`);
                try {
                    if (!apiEndpoints.types) throw new Error("Types API endpoint URL is missing in configuration.");
                    const fetchedApiResponse = await fetchAPI(apiEndpoints.types);
                    typesData = fetchedApiResponse?.[API_RESPONSE_KEYS.TYPES] || fetchedApiResponse || [];
                    if (!Array.isArray(typesData)) throw new Error('Invalid types data format received from API after fetch.');
                    setLocalStorageCache(cacheKey, typesData, sectionId);
                    apiResponse = { [API_RESPONSE_KEYS.TYPES]: typesData };
                } catch (error) {
                    console.error(`initialize: Error caught during type fetching for section ${sectionId}:`, error);
                    displayError(`Initialization failed: Could not load vehicle types. ${error.message}`, sectionId);
                    initializationError = true;
                }
            }

            if (initializationError) {
                 disableAllSelectors();
                 // No return here, let finally handle the loader. The rest of the function will be skipped effectively.
            }

            // Proceed only if no critical initialization error occurred
            if (!initializationError) {
                const data = apiResponse?.[API_RESPONSE_KEYS.TYPES] || [];
                if (!Array.isArray(data)) { // This check is important
                     console.error(`initialize: Types data is not an array for section ${sectionId}. Data:`, data);
                     displayError(`Initialization failed: Invalid types data structure.`, sectionId);
                     disableAllSelectors();
                     initializationError = true; // Mark as error to prevent further processing
                }

                if (!initializationError) {
                    const sortedTypes = data.sort((a, b) => a.localeCompare(b));
                    populateSelect(elements.typeSelect, sortedTypes);

                    if (sortedTypes.length === 0) { // Only show "No vehicle types" if data array was valid but empty
                        displayError("No vehicle types are currently available. Please check back later.", sectionId);
                        disableAllSelectors();
                    }
                }
            }
        } catch (mainError) {
            console.error(`Critical error during fitment selector initialization (${sectionId}):`, mainError);
            displayError(`An unexpected error occurred during initialization. Please try refreshing the page.`, sectionId);
            disableAllSelectors(); // Ensure selectors are disabled on any unexpected error
        } finally {
            toggleLoading(elements.typeLoading, false);
        }
    };

    initialize();

  }); // End forEach loop

}); // End DOMContentLoaded
