const PARENT_CONTEXT_MENU_ID = "promptInjectParent";

// --- Storage Keys ---
const PROMPTS_KEY = 'prompts';
const CONFIGS_KEY = 'siteConfigs';

// --- Helper Function to Inject Text (Unchanged) ---
function injectTextIntoElement(textToInject, xpath) {
    try {
        const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        const targetElement = result.singleNodeValue;

        if (targetElement) {
            targetElement.focus();

            if (targetElement.isContentEditable) {
                targetElement.textContent = textToInject;
            } else if (targetElement.value !== undefined) {
                targetElement.value = textToInject;
            } else {
                 targetElement.innerText = textToInject;
            }

            targetElement.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            targetElement.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

            console.log('Prompt Inserted via context menu.');
        } else {
            console.error('Prompt Favorites: Target element not found for XPath:', xpath);
        }
    } catch (error) {
        console.error("Prompt Favorites: Error inserting text:", error);
    }
}

// --- Helper to get URL patterns from configs (Unchanged) ---
function getAllUrlPatterns(configs) {
    if (!configs || configs.length === 0) {
         return ["<all_urls>"]; // Allow on all if no configs - adjust if needed
    }
    const patterns = new Set(configs.map(config => config.urlPattern).filter(pattern => pattern));
    return Array.from(patterns);
}

// --- Simple Wildcard Matching (Unchanged) ---
function matchesUrl(pattern, url) {
    if (!pattern || !url) return false;
    try {
        const regexPattern = pattern
            .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '.*?');
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
     return configs.find(config => matchesUrl(config.urlPattern, url));
}

// --- Context Menu Setup (Unchanged Logic, Refreshed on updates) ---
async function updateContextMenu() {
    await chrome.contextMenus.removeAll();

    const results = await chrome.storage.local.get([PROMPTS_KEY, CONFIGS_KEY]);
    const prompts = results[PROMPTS_KEY] || [];
    const configs = results[CONFIGS_KEY] || [];
    const activeUrlPatterns = getAllUrlPatterns(configs);

     if (activeUrlPatterns.length === 0) {
         console.log("No site configurations found. Context menu will not be created.");
          chrome.contextMenus.create({
            id: "noConfigs", title: "No sites configured (Go to Options)", contexts: ["editable"], enabled: false
         });
         return;
     }

     console.log("Updating context menu for URL patterns:", activeUrlPatterns);

    chrome.contextMenus.create({
        id: PARENT_CONTEXT_MENU_ID, title: "Insert Prompt", contexts: ["editable"], documentUrlPatterns: activeUrlPatterns
    });

    if (prompts.length === 0) {
        chrome.contextMenus.create({
            id: "noPrompts", parentId: PARENT_CONTEXT_MENU_ID, title: "No prompts saved (Go to Options)", contexts: ["editable"], documentUrlPatterns: activeUrlPatterns, enabled: false
        });
    } else {
        // Display ALL prompts in the menu initially. Filtering happens on click.
        prompts.forEach((prompt, index) => {
            const promptId = prompt.id || `prompt-${index}`;
            const promptTitle = prompt.title || `Prompt ${index + 1}`;
            chrome.contextMenus.create({
                id: promptId, parentId: PARENT_CONTEXT_MENU_ID, title: promptTitle, contexts: ["editable"], documentUrlPatterns: activeUrlPatterns
            });
        });
    }
     console.log("Context menu update complete.");
}

// --- Event Listeners ---

chrome.runtime.onInstalled.addListener(reason => {
     console.log("Extension installed or updated:", reason);
     updateContextMenu();
});
chrome.runtime.onStartup.addListener(() => {
    console.log("Browser startup detected.");
    updateContextMenu();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (!tab || !tab.url || !tab.id || info.menuItemId === "noPrompts" || info.menuItemId === "noConfigs" || info.parentMenuItemId !== PARENT_CONTEXT_MENU_ID) {
        return;
    }

    const promptId = info.menuItemId;
    const currentUrl = tab.url;

    const results = await chrome.storage.local.get([PROMPTS_KEY, CONFIGS_KEY]);
    const prompts = results[PROMPTS_KEY] || [];
    const configs = results[CONFIGS_KEY] || [];

    const selectedPrompt = prompts.find(p => p.id === promptId);
    const matchingConfig = getConfigForUrl(configs, currentUrl);

    if (!selectedPrompt || !selectedPrompt.content) {
         console.error("Could not find prompt content for ID:", promptId);
         return;
    }

    if (!matchingConfig || !matchingConfig.id || !matchingConfig.xpath) { // Ensure config has ID and xpath
         console.warn(`No matching site configuration or XPath found for URL: ${currentUrl}`);
         return;
    }

    // ***** NEW CHECK: Is this prompt enabled for this site configuration? *****
    // Default to enabled if the structure doesn't exist (for backward compatibility during transition)
    const isEnabled = selectedPrompt.enabledSites ? (selectedPrompt.enabledSites[matchingConfig.id] !== false) : true; // Treat undefined or true as enabled

    if (!isEnabled) {
        console.log(`Prompt "${selectedPrompt.title}" is disabled for site "${matchingConfig.name || matchingConfig.urlPattern}". Injection skipped.`);
        // Optionally notify user, maybe subtly
        // chrome.scripting.executeScript({
        //    target: { tabId: tab.id },
        //    func: (title) => { console.log(`Prompt Favorites: Prompt "${title}" is disabled for this site.`); },
        //    args: [selectedPrompt.title]
        // });
        return; // Stop processing if not enabled
    }
    // ***** END NEW CHECK *****


    console.log(`Injecting prompt "${selectedPrompt.title}" into site ${matchingConfig.name || matchingConfig.urlPattern} using XPath: ${matchingConfig.xpath}`);

    chrome.scripting.executeScript({
        target: { tabId: tab.id, frameIds: [info.frameId || 0] },
        func: injectTextIntoElement,
        args: [selectedPrompt.content, matchingConfig.xpath]
    }).catch(err => console.error("Error executing script:", err));
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "updateContextMenu") {
        console.log("Received request to update context menu.");
        updateContextMenu(); // Refresh menu if prompts or configs change
        sendResponse({ success: true });
        return true;
    }
    return false;
});

console.log("Prompt Favorites background script loaded (v1.3 - site enablement).");