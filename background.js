const PARENT_CONTEXT_MENU_ID = "promptInjectParent";
const NO_PROMPTS_MENU_ID = "noPromptsForSite";
const NO_CONFIG_MENU_ID = "noConfigForSite";

// --- Storage Keys ---
const PROMPTS_KEY = 'prompts';
const CONFIGS_KEY = 'siteConfigs';

// --- Helper Function to Inject Text (Updated for Cursor Position) ---
// This function will be executed IN THE CONTEXT OF THE WEBPAGE
// --- Helper Function to Inject Text (UPDATED Attempt 2 for Trailing Newlines & Event Order) ---
// This function will be executed IN THE CONTEXT OF THE WEBPAGE
function injectTextIntoElement(textToInject, xpath, insertMode = 'replace') {
    try {
        const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        const targetElement = result.singleNodeValue;

        if (targetElement) {
            targetElement.focus(); // Focus the element first

            let currentValue = '';
            let finalValue = '';
            let textLength = 0;

            // --- Get current value reliably ---
            // Prefer .value if it exists (common for input/textarea)
            if (typeof targetElement.value === 'string') {
                 currentValue = targetElement.value || '';
            } else if (targetElement.isContentEditable) {
                 currentValue = targetElement.textContent || '';
            } else {
                 // Fallback for other elements (less likely for text injection targets)
                 currentValue = targetElement.innerText || '';
            }

            // Determine final value based on insert mode (direct concatenation)
            switch (insertMode) {
                case 'insertBefore':
                    finalValue = textToInject + currentValue;
                    break;
                case 'insertAfter':
                    finalValue = currentValue + textToInject;
                    break;
                case 'replace':
                default:
                    finalValue = textToInject;
                    break;
            }
            textLength = finalValue.length;

            // --- Set the final value reliably ---
            // Prefer setting .value if it exists
            if (typeof targetElement.value === 'string') {
                 targetElement.value = finalValue;
                 // Ensure length is accurate after setting .value
                 textLength = targetElement.value.length;
            } else if (targetElement.isContentEditable) {
                targetElement.textContent = finalValue;
                // Ensure length is accurate after setting .textContent (browser might normalize)
                textLength = targetElement.textContent.length;
            } else {
                 // Fallback - might not preserve whitespace well
                 targetElement.innerText = finalValue;
                 textLength = targetElement.innerText.length;
            }

            // --- Set cursor position to the end BEFORE dispatching events ---
            // Move cursor first, then notify frameworks about the final state.
            if (targetElement.setSelectionRange) {
                try {
                    // Use textLength calculated *after* setting the value
                    targetElement.setSelectionRange(textLength, textLength);
                } catch (e) { console.warn("Prompt Favorites: Could not set selection range.", e); }
            } else if (targetElement.isContentEditable) {
                try {
                    const selection = window.getSelection();
                    const range = document.createRange();
                    // Make sure element has children before selecting contents, or use endpoint
                     if (targetElement.firstChild) {
                         range.selectNodeContents(targetElement);
                         range.collapse(false); // Collapse to the end
                     } else {
                         // If element is empty, just set cursor at the start (which is also the end)
                         range.setStart(targetElement, 0);
                         range.collapse(true);
                     }
                    selection.removeAllRanges();
                    selection.addRange(range);
                    // Force scroll into view in case element is large
                    targetElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

                } catch (e) { console.warn("Prompt Favorites: Could not set cursor in contentEditable.", e); }
            }

            // --- Dispatch input/change events AFTER setting value and cursor ---
            try {
                targetElement.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                targetElement.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
            } catch(e) {
                console.error("Prompt Favorites: Error dispatching events.", e);
            }


            console.log(`Prompt Inserted via context menu (Mode: ${insertMode}, Cursor positioned, Events dispatched).`);
        } else {
            console.error('Prompt Favorites: Target element not found for XPath:', xpath);
        }
    } catch (error) {
        console.error("Prompt Favorites: Error inserting text:", error);
    }
}

// --- Simple Wildcard Matching (Unchanged) ---
function matchesUrl(pattern, url) {
    if (!pattern || !url) return false;
    try {
        // Basic wildcard support, requires proper scheme handling if not present
        let processedPattern = pattern;
        if (!pattern.includes('://')) {
            // Assume https or allow http? Let's default to allowing both for simplicity
             if (!pattern.startsWith('*.')) { // Avoid things like *.com becoming scheme://*.com
                 processedPattern = `*://` + pattern; // Allow any scheme if none provided
             } else {
                 processedPattern = `*://` + pattern; // Handle *.domain.com/*
             }
        }
         // Escape regex chars, then replace * with .*?, handle scheme wildcard
        const regexPattern = processedPattern
            .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
            .replace(/^(\*):/, '(?:http|https):') // Handle scheme wildcard specifically
            .replace(/\*/g, '.*?'); // Replace other * with .*?
        const regex = new RegExp(`^${regexPattern}$`);
        return regex.test(url);
    } catch (e) {
        console.error(`Invalid pattern for matching: ${pattern}`, e);
        return false;
    }
}


// --- Get Config for URL (Unchanged) ---
function getConfigForUrl(configs, url) {
     if (!configs || !url) return null;
     // Find the first config whose pattern matches the URL
     return configs.find(config => matchesUrl(config.urlPattern, url));
}

// --- Dynamic Context Menu Setup ---
// This now takes optional config context to filter prompts
async function updateContextMenuForTab(tabId, currentConfig) {
    // Remove existing menu items first to avoid duplicates
    // This is crucial when rebuilding dynamically
    await chrome.contextMenus.removeAll();

    // If no config matches this tab's URL, create a disabled placeholder or nothing
    if (!currentConfig || !currentConfig.id) {
         console.log(`No matching config for tab ${tabId}. Clearing menu.`);
         // Optionally, create a disabled top-level item
         chrome.contextMenus.create({
             id: NO_CONFIG_MENU_ID,
             title: "Prompt Favorites (No config for this site)",
             contexts: ["editable"],
             enabled: false
             // No documentUrlPatterns needed if we manage creation/removal per tab
         });
         return;
    }

    // Fetch prompts (configs should already be available if currentConfig exists)
    const result = await chrome.storage.local.get(PROMPTS_KEY);
    const prompts = result[PROMPTS_KEY] || [];

    // Filter prompts: Keep only those enabled for the current site config
    const enabledPrompts = prompts.filter(prompt => {
        // Default to enabled if structure is missing or explicitly true
        return prompt.enabledSites ? (prompt.enabledSites[currentConfig.id] !== false) : true;
    });

    // Create the parent menu item, targeting only the *current* tab might be too restrictive
    // It's better to create it without documentUrlPatterns and rely on the listeners
    // to create/remove it based on the active tab's URL match.
    chrome.contextMenus.create({
        id: PARENT_CONTEXT_MENU_ID,
        title: "Insert Prompt", // Title for the parent
        contexts: ["editable"]
        // documentUrlPatterns: [currentConfig.urlPattern] // Restrict to current pattern? Or rely on tab listeners? Let's rely on listeners.
    });

    if (enabledPrompts.length === 0) {
        // Add a placeholder if no prompts are enabled for this site
        chrome.contextMenus.create({
            id: NO_PROMPTS_MENU_ID,
            parentId: PARENT_CONTEXT_MENU_ID,
            title: "No prompts enabled for this site",
            contexts: ["editable"],
            enabled: false
        });
    } else {
        // Create a submenu item for each ENABLED prompt
        enabledPrompts.forEach((prompt, index) => {
            const promptId = prompt.id || `prompt-${index}`;
            const promptTitle = prompt.title || `Prompt ${index + 1}`;
            chrome.contextMenus.create({
                id: promptId, // Use the prompt's unique ID
                parentId: PARENT_CONTEXT_MENU_ID,
                title: promptTitle,
                contexts: ["editable"]
            });
        });
    }
     console.log(`Context menu updated for tab ${tabId} (Site: ${currentConfig.name || currentConfig.urlPattern}), showing ${enabledPrompts.length} prompts.`);
}

// --- Event Listeners ---

// Listener for when the active tab changes
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    console.log("Tab activated:", activeInfo.tabId);
    try {
        const tab = await chrome.tabs.get(activeInfo.tabId);
        if (tab && tab.url) {
            const configsResult = await chrome.storage.local.get(CONFIGS_KEY);
            const configs = configsResult[CONFIGS_KEY] || [];
            const matchingConfig = getConfigForUrl(configs, tab.url);
            await updateContextMenuForTab(activeInfo.tabId, matchingConfig); // Pass matching config (or null)
        } else {
             await chrome.contextMenus.removeAll(); // Clear menu if no URL (e.g., new tab page)
        }
    } catch (error) {
        console.error("Error in onActivated listener:", error);
         await chrome.contextMenus.removeAll(); // Clear menu on error
    }
});

// Listener for when a tab is updated (e.g., URL changes, page finishes loading)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    // Check if the URL changed or the page finished loading in the active tab
    // Only rebuild if status is complete to avoid multiple updates during loading
     if (changeInfo.status === 'complete' && tab.active && tab.url) {
        console.log(`Tab updated (complete): ${tabId}, URL: ${tab.url}`);
        try {
            const configsResult = await chrome.storage.local.get(CONFIGS_KEY);
            const configs = configsResult[CONFIGS_KEY] || [];
            const matchingConfig = getConfigForUrl(configs, tab.url);
            await updateContextMenuForTab(tabId, matchingConfig);
        } catch (error) {
            console.error("Error in onUpdated listener:", error);
            await chrome.contextMenus.removeAll();
        }
     } else if (changeInfo.status === 'loading' && tab.active) {
         // Optional: Clear the menu while the active tab is loading a new page
         // await chrome.contextMenus.removeAll();
     }
});


// Listener for clicks on our context menu items
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    // Basic validation and ignore placeholders
    if (!tab || !tab.id || !tab.url || info.menuItemId === NO_PROMPTS_MENU_ID || info.menuItemId === NO_CONFIG_MENU_ID || info.parentMenuItemId !== PARENT_CONTEXT_MENU_ID) {
        return;
    }

    const promptId = info.menuItemId;
    const currentUrl = tab.url;

    const results = await chrome.storage.local.get([PROMPTS_KEY, CONFIGS_KEY]);
    const prompts = results[PROMPTS_KEY] || [];
    const configs = results[CONFIGS_KEY] || [];

    const selectedPrompt = prompts.find(p => p.id === promptId);
    const matchingConfig = getConfigForUrl(configs, currentUrl);

    // Validation
    if (!selectedPrompt || !selectedPrompt.content) {
         console.error("Clicked prompt data not found:", promptId); return;
    }
    if (!matchingConfig || !matchingConfig.xpath) {
         console.error(`Clicked context menu but matching config/xpath not found for URL: ${currentUrl}`); return;
    }

    // Check if enabled (safeguard)
    const isEnabled = selectedPrompt.enabledSites ? (selectedPrompt.enabledSites[matchingConfig.id] !== false) : true;
    if (!isEnabled) {
         console.warn(`Clicked disabled prompt "${selectedPrompt.title}" for site "${matchingConfig.name}". Should not have been visible.`); return;
    }

    // Get the insertion mode for this prompt (default to 'replace')
    const insertMode = selectedPrompt.insertMode || 'replace'; // << NEW

    // Proceed with injection, passing the insertMode
    console.log(`Injecting prompt "${selectedPrompt.title}" into site ${matchingConfig.name || matchingConfig.urlPattern} using XPath: ${matchingConfig.xpath} with mode: ${insertMode}`);
    chrome.scripting.executeScript({
        target: { tabId: tab.id, frameIds: [info.frameId || 0] },
        func: injectTextIntoElement,
        args: [selectedPrompt.content, matchingConfig.xpath, insertMode] // << Pass insertMode
    }).catch(err => console.error("Error executing script:", err));
});

// Listener for messages from options page (crucial to update menu *immediately* after changes)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "updateContextMenu") {
        console.log("Received request to update context menu from options page.");
        // We need to update based on the CURRENTLY active tab after options change
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
            if (tabs && tabs.length > 0 && tabs[0].id && tabs[0].url) {
                 const activeTab = tabs[0];
                 try {
                    const configsResult = await chrome.storage.local.get(CONFIGS_KEY);
                    const configs = configsResult[CONFIGS_KEY] || [];
                    const matchingConfig = getConfigForUrl(configs, activeTab.url);
                    await updateContextMenuForTab(activeTab.id, matchingConfig); // Update for current tab
                 } catch (error) {
                     console.error("Error updating context menu from options message:", error);
                 }
            } else {
                await chrome.contextMenus.removeAll(); // Clear if no active tab found
            }
        });
        sendResponse({ success: true });
        return true; // Indicate async response possible
    }
    return false;
});

// Initial setup on install - clear any previous menus
chrome.runtime.onInstalled.addListener(async (details) => {
     console.log("Extension installed or updated:", details.reason);
     await chrome.contextMenus.removeAll();
     // We don't build the menu here, it will be built by the tab listeners
});


console.log("Prompt Favorites background script loaded (v1.4 - dynamic menu filtering).");