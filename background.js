const PARENT_CONTEXT_MENU_ID = "promptInjectParent";

// --- Storage Keys ---
const PROMPTS_KEY = 'prompts';
const CONFIGS_KEY = 'siteConfigs';

// --- Helper Function to Inject Text (Unchanged from your version) ---
// This function will be executed IN THE CONTEXT OF THE WEBPAGE
function injectTextIntoElement(textToInject, xpath) {
    // (Code for injectTextIntoElement)
    try {
        const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null); //
        const targetElement = result.singleNodeValue; //

        if (targetElement) { //
            targetElement.focus(); //

            // Set value based on element type
            if (targetElement.isContentEditable) { //
                 // For contentEditable divs
                targetElement.textContent = textToInject; //
            } else if (targetElement.value !== undefined) { //
                // For input/textarea
                targetElement.value = textToInject; //
            } else { //
                 // Fallback attempt
                 targetElement.innerText = textToInject; //
            }


            // Simulate input to make web frameworks (React, etc.) recognize the change
            targetElement.dispatchEvent(new Event('input', { bubbles: true, cancelable: true })); //
            targetElement.dispatchEvent(new Event('change', { bubbles: true, cancelable: true })); //

            console.log('Prompt Inserted via context menu.'); //
        } else { //
            console.error('Prompt Favorites: Target element not found for XPath:', xpath); //
            // Optional: Alert the user if the target isn't found
            // alert('Prompt Favorites: Target text box could not be found on the page.'); //
        } //
    } catch (error) { //
        console.error("Prompt Favorites: Error inserting text:", error); //
        // alert(`Prompt Favorites Error: ${error.message}`); //
    } //
}

// --- Helper to get URL patterns from configs ---
function getAllUrlPatterns(configs) {
    if (!configs || configs.length === 0) {
        // Return a pattern that likely matches nothing, preventing menu from appearing everywhere
        // Or, return a specific known pattern if you have a default site like Gemini
         // return ["https://gemini.google.com/*"]; // Example fallback
         return ["<all_urls>"]; // Or allow on all if no configs - choose behavior
    }
    // Extract unique URL patterns
    const patterns = new Set(configs.map(config => config.urlPattern).filter(pattern => pattern));
    return Array.from(patterns);
}

// --- Simple Wildcard Matching ---
// Based on chrome match patterns: *, scheme://*, scheme://*/*, scheme://host/*, scheme://*.host/*
function matchesUrl(pattern, url) {
    if (!pattern || !url) return false;
    try {
        // Basic wildcard support: Convert simple wildcard to regex
        // Escape regex chars, then replace * with .*
        const regexPattern = pattern
            .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
            .replace(/\*/g, '.*?'); // Replace * with .*? (non-greedy match)
        const regex = new RegExp(`^${regexPattern}$`);
        return regex.test(url);
    } catch (e) {
        console.error(`Invalid pattern for matching: ${pattern}`, e);
        return false; // Treat invalid patterns as non-matching
    }
}

// --- Get Config for URL ---
function getConfigForUrl(configs, url) {
     if (!configs || !url) return null;
     // Find the first config whose pattern matches the URL
     return configs.find(config => matchesUrl(config.urlPattern, url));
}

// --- Context Menu Setup ---
async function updateContextMenu() {
    await chrome.contextMenus.removeAll(); //

    // Fetch both prompts and configs
    const results = await chrome.storage.local.get([PROMPTS_KEY, CONFIGS_KEY]);
    const prompts = results[PROMPTS_KEY] || []; //
    const configs = results[CONFIGS_KEY] || [];

    // Determine the URL patterns where the menu should appear
    const activeUrlPatterns = getAllUrlPatterns(configs);

     if (activeUrlPatterns.length === 0) {
         console.log("No site configurations found. Context menu will not be created.");
         // Optionally create a disabled menu item directing user to options
          chrome.contextMenus.create({
            id: "noConfigs",
            title: "No sites configured (Go to Options)",
            contexts: ["editable"],
            enabled: false
         });
         return; // Don't create the main menu if no patterns
     }

     console.log("Updating context menu for URL patterns:", activeUrlPatterns);


    // Create the parent menu item, targeting configured sites
    chrome.contextMenus.create({ //
        id: PARENT_CONTEXT_MENU_ID, //
        title: "Insert Prompt", //
        contexts: ["editable"], //
        documentUrlPatterns: activeUrlPatterns // Use dynamic patterns
    }); //

    if (prompts.length === 0) { //
        // Add a placeholder if no prompts are saved
        chrome.contextMenus.create({ //
            id: "noPrompts", //
            parentId: PARENT_CONTEXT_MENU_ID, //
            title: "No prompts saved (Go to Options)", //
            contexts: ["editable"], //
            documentUrlPatterns: activeUrlPatterns, // Match parent patterns
            enabled: false //
        }); //
    } else { //
        // Create a submenu item for each saved prompt
        prompts.forEach((prompt, index) => { //
            const promptId = prompt.id || `prompt-${index}`; //
            const promptTitle = prompt.title || `Prompt ${index + 1}`; //

            chrome.contextMenus.create({ //
                id: promptId, //
                parentId: PARENT_CONTEXT_MENU_ID, //
                title: promptTitle, //
                contexts: ["editable"], //
                documentUrlPatterns: activeUrlPatterns // Match parent patterns
            }); //
        }); //
    } //
     console.log("Context menu update complete."); //
}

// --- Event Listeners ---

chrome.runtime.onInstalled.addListener(reason => {
     console.log("Extension installed or updated:", reason);
     updateContextMenu(); //
});
chrome.runtime.onStartup.addListener(() => {
    console.log("Browser startup detected.");
    updateContextMenu(); //
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (!tab || !tab.url || !tab.id || info.menuItemId === "noPrompts" || info.menuItemId === "noConfigs" || info.parentMenuItemId !== PARENT_CONTEXT_MENU_ID) { //
        return; //
    }

    const promptId = info.menuItemId; //
    const currentUrl = tab.url;

    // Fetch prompts and configs
    const results = await chrome.storage.local.get([PROMPTS_KEY, CONFIGS_KEY]);
    const prompts = results[PROMPTS_KEY] || []; //
    const configs = results[CONFIGS_KEY] || [];

    // Find the selected prompt
    const selectedPrompt = prompts.find(p => p.id === promptId); //

    // Find the matching configuration for the current URL
    const matchingConfig = getConfigForUrl(configs, currentUrl);

    if (!selectedPrompt || !selectedPrompt.content) { //
         console.error("Could not find prompt content for ID:", promptId); //
         return; //
    }

    if (!matchingConfig || !matchingConfig.xpath) {
         console.warn(`No matching site configuration or XPath found for URL: ${currentUrl}`);
         // Optionally alert the user
         // chrome.scripting.executeScript({
         //    target: { tabId: tab.id },
         //    func: () => alert(`Prompt Favorites: No XPath configured for this site (${currentUrl}). Please check extension options.`)
         // });
         return;
    }

    console.log(`Injecting prompt "${selectedPrompt.title}" into site ${matchingConfig.name || matchingConfig.urlPattern} using XPath: ${matchingConfig.xpath}`); //

    // Execute the injection function in the target tab using the matched XPath
    chrome.scripting.executeScript({ //
        target: { tabId: tab.id, frameIds: [info.frameId || 0] }, //
        func: injectTextIntoElement, //
        args: [selectedPrompt.content, matchingConfig.xpath] // Pass content and the DYNAMIC XPath
    }).catch(err => console.error("Error executing script:", err)); //
}); //

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Update context menu if options page requests it (prompts or configs changed)
    if (message.action === "updateContextMenu") { //
        console.log("Received request to update context menu."); //
        updateContextMenu(); //
        sendResponse({ success: true }); //
        return true; // Indicate async response possible if needed later
    }
    return false; // No async response expected for other messages
});

console.log("Prompt Favorites background script loaded (v1.2 - multi-site)."); //