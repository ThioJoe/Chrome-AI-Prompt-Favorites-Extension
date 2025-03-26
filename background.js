const PARENT_CONTEXT_MENU_ID = "promptInjectParent";
const NO_PROMPTS_MENU_ID = "noPromptsForSite";
const NO_CONFIG_MENU_ID = "noConfigForSite";

// --- Storage Keys ---
const PROMPTS_KEY = 'prompts';
const CONFIGS_KEY = 'siteConfigs';

// --- Helper Function to Inject Text (Updated for Cursor Position) ---
// This function will be executed IN THE CONTEXT OF THE WEBPAGE
function injectTextIntoElement(textToInject, xpath, insertMode = 'replace') {
    console.log(`%cPrompt Favorites DEBUG: Entering injectTextIntoElement. Mode: ${insertMode}`, 'color: blue; font-weight: bold;');
    console.log(`Prompt Favorites DEBUG: Raw textToInject: ${JSON.stringify(textToInject)}`);

    // Determine if the input text itself ends with a newline
    const hasTrailingNewlineInInput = textToInject.endsWith('\n');
    console.log(`Prompt Favorites DEBUG: Input text ends with newline: ${hasTrailingNewlineInInput}`);

    try {
        const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        const targetElement = result.singleNodeValue;

        if (targetElement) {
            console.log(`Prompt Favorites DEBUG: Found targetElement: ${targetElement.tagName}, Type: ${targetElement.type || 'N/A'}, ContentEditable: ${targetElement.isContentEditable}`);
            targetElement.focus();

            let currentValue = '';
            let finalValue = ''; // This will store the string value with \n
            let finalHtml = '';  // This will store the HTML version for contentEditable
            let textLength = 0; // Based on the text content length after potential modification

            // --- Get current value reliably ---
            try {
                if (typeof targetElement.value === 'string') {
                    currentValue = targetElement.value || '';
                    console.log(`Prompt Favorites DEBUG: Got currentValue from .value: ${JSON.stringify(currentValue)}`);
                } else if (targetElement.isContentEditable) {
                    // Getting textContent is usually best for representing raw text
                    currentValue = targetElement.textContent || '';
                    console.log(`Prompt Favorites DEBUG: Got currentValue from .textContent: ${JSON.stringify(currentValue)}`);
                } else {
                    currentValue = targetElement.textContent || '';
                    console.log(`Prompt Favorites DEBUG: Got currentValue from fallback .textContent: ${JSON.stringify(currentValue)}`);
                }
            } catch (e) {
                console.error("Prompt Favorites DEBUG: Error getting currentValue", e);
                currentValue = '';
            }

            // Determine final *string* value based on insert mode
            console.log(`Prompt Favorites DEBUG: Determining finalValue (string). Mode: ${insertMode}`);
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
            console.log(`Prompt Favorites DEBUG: Calculated finalValue (string): ${JSON.stringify(finalValue)}`);

            // Determine if the final combined string ends with a newline
            const finalValueEndsWithNewline = finalValue.endsWith('\n');
            console.log(`Prompt Favorites DEBUG: Final combined string ends with newline: ${finalValueEndsWithNewline}`);

            // --- Set the final value reliably ---
            let valueJustSetText = ''; // Capture textContent after setting
            try {
                if (typeof targetElement.value === 'string') {
                    // Use .value for input/textarea - newlines are preserved inherently
                    console.log(`%cPrompt Favorites DEBUG: Setting targetElement.value to: ${JSON.stringify(finalValue)}`, 'color: green;');
                    targetElement.value = finalValue;
                    valueJustSetText = targetElement.value;
                    textLength = targetElement.value.length; // Use length of actual value

                } else if (targetElement.isContentEditable) {
                    // *** MODIFICATION FOR contentEditable using refined <br><br> logic ***

                    // Assuming plain text input; escape HTML chars in finalValue if it could contain them
                    // let escapedValue = finalValue.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                    let escapedValue = finalValue; // Using raw value for now

                    // Basic conversion: all \n become <br>
                    finalHtml = escapedValue.replace(/\n/g, '<br>');

                    // Apply special trailing <br><br> logic ONLY if the INPUT had a trailing \n
                    // AND that newline is also the END of the FINAL combined string.
                    if (hasTrailingNewlineInInput && finalValueEndsWithNewline) {
                         console.log(`Prompt Favorites DEBUG: Applying special trailing <br><br> logic.`);
                         // Ensure the finalHtml ends with <br><br>
                         if (!finalHtml.endsWith('<br><br>')) {
                              // If it ends with just <br> (most common case for single trailing \n)
                              if (finalHtml.endsWith('<br>')) {
                                   finalHtml += '<br>'; // Append the second <br>
                                   console.log(`Prompt Favorites DEBUG: Appended extra <br> to make trailing <br><br>.`);
                              } else {
                                  // If finalValue was just "\n", finalHtml is "<br>". Add another.
                                  // Or if finalValue ended \n but somehow conversion didn't end <br>? (Unlikely)
                                  finalHtml += '<br><br>'; // Add <br><br> just in case
                                  console.log(`Prompt Favorites DEBUG: Appended trailing <br><br> (fallback case).`);
                              }
                         } else {
                              console.log(`Prompt Favorites DEBUG: HTML already ends with <br><br> (no change needed).`);
                         }
                    } else {
                         console.log(`Prompt Favorites DEBUG: Special trailing <br><br> logic not applied (conditions not met).`);
                    }

                    console.log(`%cPrompt Favorites DEBUG: Setting targetElement.innerHTML to: ${JSON.stringify(finalHtml)}`, 'color: purple;');
                    targetElement.innerHTML = finalHtml;

                    // Read back textContent AFTER setting innerHTML.
                    valueJustSetText = targetElement.textContent;
                    // Calculate textLength based on the resulting textContent (won't include <br> effect)
                    textLength = valueJustSetText.length;
                    // *** END MODIFICATION ***

                } else {
                    console.warn(`Prompt Favorites: Cannot reliably set value for non-input/non-contenteditable element (XPath: ${xpath}). Value not set.`);
                    return; // Exit if target is not suitable
                }

                console.log(`%cPrompt Favorites DEBUG: Value read back (textContent) immediately after setting: ${JSON.stringify(valueJustSetText)}`, 'color: orange;');
                console.log(`Prompt Favorites DEBUG: Calculated textLength (from textContent) after setting: ${textLength}`);

            } catch (e) {
                 console.error("Prompt Favorites DEBUG: Error setting value or reading it back", e);
            }

            // --- Set cursor position --- (Using collapse to end logic)
             console.log(`Prompt Favorites DEBUG: Attempting to set cursor position.`);
             let cursorTarget = targetElement; // Position cursor within the element we modified
             if (cursorTarget.setSelectionRange && typeof cursorTarget.value === 'string') {
                try {
                    // Use textLength from the actual value set
                    cursorTarget.setSelectionRange(textLength, textLength);
                    console.log(`Prompt Favorites DEBUG: Used setSelectionRange(${textLength}, ${textLength})`);
                } catch (e) { console.warn("Prompt Favorites: Could not set selection range.", e); }
            } else if (cursorTarget.isContentEditable || cursorTarget.contentEditable === 'true') {
                try {
                    const selection = window.getSelection();
                    const range = document.createRange();
                    // Place cursor at the very end of the element's content
                    range.selectNodeContents(cursorTarget);
                    range.collapse(false); // Collapse range to the end point
                    selection.removeAllRanges();
                    selection.addRange(range);
                    console.log(`Prompt Favorites DEBUG: Used Selection API for contentEditable (collapsed to end) after setting innerHTML.`);
                     // Optional: Scroll into view
                     // cursorTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                } catch (e) { console.warn("Prompt Favorites: Could not set cursor in contentEditable after innerHTML.", e); }
            }


            // --- Dispatch input/change events ---
            try {
                console.log(`Prompt Favorites DEBUG: Dispatching events (input, change) on target element.`);
                targetElement.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                targetElement.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
            } catch(e) {
                console.error("Prompt Favorites: Error dispatching events.", e);
            }

            // Final check of textContent value after events
             let valueAfterEventsText = '';
             try {
                 if (typeof targetElement.value === 'string') {
                     valueAfterEventsText = targetElement.value;
                 } else if (targetElement.isContentEditable) {
                     valueAfterEventsText = targetElement.textContent;
                 }
                 console.log(`Prompt Favorites DEBUG: Value (textContent) after dispatching events: ${JSON.stringify(valueAfterEventsText)}`);
             } catch (e) {
                  console.error("Prompt Favorites DEBUG: Error reading value after events", e);
             }
            console.log(`%cPrompt Favorites: Insertion complete (Mode: ${insertMode}). Final state logged above.`, 'color: blue; font-weight: bold;');

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