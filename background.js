// --- DEBUG MODE ---
// Set to true to enable detailed console logging for Prompt Favorites
const DEBUGMODE = false;

// --- Constants ---
const PARENT_CONTEXT_MENU_ID = "promptInjectParent";
const NO_PROMPTS_MENU_ID = "noPromptsForSite";
const NO_CONFIG_MENU_ID = "noConfigForSite";

// --- Storage Keys ---
const PROMPTS_KEY = 'prompts';
const CONFIGS_KEY = 'siteConfigs';

// --- Debug Logging Helper ---
function debugLog(message, level = 'log', style = '') {
    if (!DEBUGMODE) return; // Only log if DEBUGMODE is true

    const prefix = "Prompt Favorites: ";
    const fullMessage = prefix + message;

    switch (level) {
        case 'warn':
            console.warn(fullMessage);
            break;
        case 'error':
            console.error(fullMessage);
            break;
        case 'log':
        default:
            if (style) {
                // Assumes message includes %c marker if style is provided
                console.log(fullMessage, style);
            } else {
                console.log(fullMessage);
            }
            break;
    }
}


// --- Helper Function to Inject Text (Updated for Cursor Position) ---
// This function will be executed IN THE CONTEXT OF THE WEBPAGE
function injectTextIntoElement(textToInject, xpath, insertMode = 'replace') {
    // --- Debug Logging Helper (needs to be redefined within page context) ---
    const DEBUGMODE_INJECT = false; // Set this based on how you pass debug state if needed, or hardcode
    function debugLogInjected(message, level = 'log', style = '') {
        if (!DEBUGMODE_INJECT) return; // Check flag
        const prefix = "Prompt Favorites DEBUG (Injected): ";
        const fullMessage = prefix + message;
        switch (level) {
            case 'warn': console.warn(fullMessage); break;
            case 'error': console.error(fullMessage); break;
            case 'log': default: style ? console.log(fullMessage, style) : console.log(fullMessage); break;
        }
    }
    // --- End Debug Helper Redefinition ---

    debugLogInjected(`Entering injectTextIntoElement. Mode: ${insertMode}`, 'log', 'color: blue; font-weight: bold;');
    debugLogInjected(`Raw textToInject: ${JSON.stringify(textToInject)}`);

    const hasTrailingNewlineInInput = textToInject.endsWith('\n');
    debugLogInjected(`Input text ends with newline: ${hasTrailingNewlineInInput}`);

    try {
        const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        const targetElement = result.singleNodeValue;

        if (targetElement) {
            debugLogInjected(`Found targetElement: ${targetElement.tagName}, Type: ${targetElement.type || 'N/A'}, ContentEditable: ${targetElement.isContentEditable}`);
            targetElement.focus();

            let currentValue = '';
            let finalValue = ''; // This will store the string value with \n
            let finalHtml = '';  // This will store the HTML version for contentEditable
            let textLength = 0; // Based on the text content length after potential modification

            // --- Get current value reliably ---
            try {
                if (typeof targetElement.value === 'string') {
                    currentValue = targetElement.value || '';
                    debugLogInjected(`Got currentValue from .value: ${JSON.stringify(currentValue)}`);
                } else if (targetElement.isContentEditable) {
                    currentValue = targetElement.textContent || '';
                    debugLogInjected(`Got currentValue from .textContent: ${JSON.stringify(currentValue)}`);
                } else {
                    currentValue = targetElement.textContent || '';
                    debugLogInjected(`Got currentValue from fallback .textContent: ${JSON.stringify(currentValue)}`);
                }
            } catch (e) {
                debugLogInjected("Error getting currentValue", 'error'); console.error(e); // Keep original console.error for the actual error object
                currentValue = '';
            }

            // Determine final *string* value based on insert mode
            debugLogInjected(`Determining finalValue (string). Mode: ${insertMode}`);
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
            debugLogInjected(`Calculated finalValue (string): ${JSON.stringify(finalValue)}`);

            const finalValueEndsWithNewline = finalValue.endsWith('\n');
            debugLogInjected(`Final combined string ends with newline: ${finalValueEndsWithNewline}`);

            // --- Set the final value reliably ---
            let valueJustSetText = ''; // Capture textContent after setting
            try {
                if (typeof targetElement.value === 'string') {
                    debugLogInjected(`%cSetting targetElement.value to: ${JSON.stringify(finalValue)}`, 'log', 'color: green;');
                    targetElement.value = finalValue;
                    valueJustSetText = targetElement.value;
                    textLength = targetElement.value.length;

                } else if (targetElement.isContentEditable) {
                    let escapedValue = finalValue;
                    finalHtml = escapedValue.replace(/\n/g, '<br>');

                    if (hasTrailingNewlineInInput && finalValueEndsWithNewline) {
                        debugLogInjected(`Applying special trailing <br><br> logic.`);
                        if (!finalHtml.endsWith('<br><br>')) {
                            if (finalHtml.endsWith('<br>')) {
                                finalHtml += '<br>';
                                debugLogInjected(`Appended extra <br> to make trailing <br><br>.`);
                            } else {
                                finalHtml += '<br><br>';
                                debugLogInjected(`Appended trailing <br><br> (fallback case).`);
                            }
                        } else {
                             debugLogInjected(`HTML already ends with <br><br> (no change needed).`);
                        }
                    } else {
                         debugLogInjected(`Special trailing <br><br> logic not applied (conditions not met).`);
                    }

                    debugLogInjected(`%cSetting targetElement.innerHTML to: ${JSON.stringify(finalHtml)}`, 'log', 'color: purple;');
                    targetElement.innerHTML = finalHtml;

                    valueJustSetText = targetElement.textContent;
                    textLength = valueJustSetText.length;

                } else {
                    debugLogInjected(`Cannot reliably set value for non-input/non-contenteditable element (XPath: ${xpath}). Value not set.`, 'warn');
                    return; // Exit if target is not suitable
                }

                 debugLogInjected(`%cValue read back (textContent) immediately after setting: ${JSON.stringify(valueJustSetText)}`, 'log', 'color: orange;');
                 debugLogInjected(`Calculated textLength (from textContent) after setting: ${textLength}`);

            } catch (e) {
                debugLogInjected("Error setting value or reading it back", 'error'); console.error(e); // Keep original console.error
            }

            // --- Set cursor position --- (Using collapse to end logic)
            debugLogInjected(`Attempting to set cursor position.`);
            let cursorTarget = targetElement;
            if (cursorTarget.setSelectionRange && typeof cursorTarget.value === 'string') {
                try {
                    cursorTarget.setSelectionRange(textLength, textLength);
                    debugLogInjected(`Used setSelectionRange(${textLength}, ${textLength})`);
                } catch (e) { debugLogInjected("Could not set selection range.", 'warn'); console.warn(e); } // Keep original console.warn
            } else if (cursorTarget.isContentEditable || cursorTarget.contentEditable === 'true') {
                try {
                    const selection = window.getSelection();
                    const range = document.createRange();
                    range.selectNodeContents(cursorTarget);
                    range.collapse(false);
                    selection.removeAllRanges();
                    selection.addRange(range);
                    debugLogInjected(`Used Selection API for contentEditable (collapsed to end) after setting innerHTML.`);
                    // cursorTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                } catch (e) { debugLogInjected("Could not set cursor in contentEditable after innerHTML.", 'warn'); console.warn(e); } // Keep original console.warn
            }

            // --- Dispatch input/change events ---
            try {
                debugLogInjected(`Dispatching events (input, change) on target element.`);
                targetElement.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                targetElement.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
            } catch(e) {
                 debugLogInjected("Error dispatching events.", 'error'); console.error(e); // Keep original console.error
            }

            // Final check of textContent value after events
            let valueAfterEventsText = '';
            try {
                if (typeof targetElement.value === 'string') {
                    valueAfterEventsText = targetElement.value;
                } else if (targetElement.isContentEditable) {
                    valueAfterEventsText = targetElement.textContent;
                }
                 debugLogInjected(`Value (textContent) after dispatching events: ${JSON.stringify(valueAfterEventsText)}`);
            } catch (e) {
                 debugLogInjected("Error reading value after events", 'error'); console.error(e); // Keep original console.error
            }
             debugLogInjected(`%cInsertion complete (Mode: ${insertMode}). Final state logged above.`, 'log', 'color: blue; font-weight: bold;');

        } else {
             debugLog('Target element not found for XPath: ' + xpath, 'error'); // Use background script logger
        }
    } catch (error) {
         debugLog("Error inserting text:", 'error'); console.error(error); // Use background script logger, keep original console.error
    }
}

// --- Simple Wildcard Matching (Unchanged) ---
function matchesUrl(pattern, url) {
    if (!pattern || !url) return false;
    try {
        let processedPattern = pattern;
        if (!pattern.includes('://')) {
            if (!pattern.startsWith('*.')) {
                processedPattern = `*://` + pattern;
            } else {
                processedPattern = `*://` + pattern;
            }
        }
        const regexPattern = processedPattern
            .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
            .replace(/^(\*):/, '(?:http|https):')
            .replace(/\*/g, '.*?');
        const regex = new RegExp(`^${regexPattern}$`);
        return regex.test(url);
    } catch (e) {
         debugLog(`Invalid pattern for matching: ${pattern}`, 'error'); console.error(e); // Keep original console.error
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
async function updateContextMenuForTab(tabId, currentConfig) {
    await chrome.contextMenus.removeAll();

    if (!currentConfig || !currentConfig.id) {
         debugLog(`No matching config for tab ${tabId}. Clearing menu.`);
         chrome.contextMenus.create({
             id: NO_CONFIG_MENU_ID,
             title: "Prompt Favorites (No config for this site)",
             contexts: ["editable"],
             enabled: false
         });
         return;
    }

    const result = await chrome.storage.local.get(PROMPTS_KEY);
    const prompts = result[PROMPTS_KEY] || [];

    const enabledPrompts = prompts.filter(prompt => {
        return prompt.enabledSites ? (prompt.enabledSites[currentConfig.id] !== false) : true;
    });

    chrome.contextMenus.create({
        id: PARENT_CONTEXT_MENU_ID,
        title: "Insert Prompt",
        contexts: ["editable"]
    });

    if (enabledPrompts.length === 0) {
        chrome.contextMenus.create({
            id: NO_PROMPTS_MENU_ID,
            parentId: PARENT_CONTEXT_MENU_ID,
            title: "No prompts enabled for this site",
            contexts: ["editable"],
            enabled: false
        });
    } else {
        enabledPrompts.forEach((prompt, index) => {
            const promptId = prompt.id || `prompt-${index}`;
            const promptTitle = prompt.title || `Prompt ${index + 1}`;
            chrome.contextMenus.create({
                id: promptId,
                parentId: PARENT_CONTEXT_MENU_ID,
                title: promptTitle,
                contexts: ["editable"]
            });
        });
    }
     debugLog(`Context menu updated for tab ${tabId} (Site: ${currentConfig.name || currentConfig.urlPattern}), showing ${enabledPrompts.length} prompts.`);
}

// --- Event Listeners ---

chrome.tabs.onActivated.addListener(async (activeInfo) => {
    debugLog("Tab activated: " + activeInfo.tabId);
    try {
        const tab = await chrome.tabs.get(activeInfo.tabId);
        if (tab && tab.url) {
            const configsResult = await chrome.storage.local.get(CONFIGS_KEY);
            const configs = configsResult[CONFIGS_KEY] || [];
            const matchingConfig = getConfigForUrl(configs, tab.url);
            await updateContextMenuForTab(activeInfo.tabId, matchingConfig);
        } else {
            await chrome.contextMenus.removeAll();
        }
    } catch (error) {
         debugLog("Error in onActivated listener:", 'error'); console.error(error); // Keep original console.error
         await chrome.contextMenus.removeAll();
    }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
     if (changeInfo.status === 'complete' && tab.active && tab.url) {
         debugLog(`Tab updated (complete): ${tabId}, URL: ${tab.url}`);
         try {
             const configsResult = await chrome.storage.local.get(CONFIGS_KEY);
             const configs = configsResult[CONFIGS_KEY] || [];
             const matchingConfig = getConfigForUrl(configs, tab.url);
             await updateContextMenuForTab(tabId, matchingConfig);
         } catch (error) {
             debugLog("Error in onUpdated listener:", 'error'); console.error(error); // Keep original console.error
             await chrome.contextMenus.removeAll();
         }
     }
});


chrome.contextMenus.onClicked.addListener(async (info, tab) => {
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

    if (!selectedPrompt || !selectedPrompt.content) {
         debugLog("Clicked prompt data not found: " + promptId, 'error'); return;
    }
    if (!matchingConfig || !matchingConfig.xpath) {
         debugLog(`Clicked context menu but matching config/xpath not found for URL: ${currentUrl}`, 'error'); return;
    }

    const isEnabled = selectedPrompt.enabledSites ? (selectedPrompt.enabledSites[matchingConfig.id] !== false) : true;
    if (!isEnabled) {
         debugLog(`Clicked disabled prompt "${selectedPrompt.title}" for site "${matchingConfig.name}". Should not have been visible.`, 'warn'); return;
    }

    const insertMode = selectedPrompt.insertMode || 'replace';

    debugLog(`Injecting prompt "${selectedPrompt.title}" into site ${matchingConfig.name || matchingConfig.urlPattern} using XPath: ${matchingConfig.xpath} with mode: ${insertMode}`);

    // *** IMPORTANT ***
    // The injected function `injectTextIntoElement` has its *own* copy of `debugLogInjected`.
    // It doesn't use the background script's `DEBUGMODE` or `debugLog` directly.
    // If you need the injected logs to also be conditional, you'd need to pass the DEBUGMODE
    // state as an argument or modify the injected function source dynamically.
    // For now, the injected logs (`debugLogInjected`) run unconditionally based on `DEBUGMODE_INJECT`.
    chrome.scripting.executeScript({
        target: { tabId: tab.id, frameIds: [info.frameId || 0] },
        func: injectTextIntoElement, // This function is stringified and executed in the page
        args: [selectedPrompt.content, matchingConfig.xpath, insertMode]
    }).catch(err => {
        debugLog("Error executing script:", 'error'); console.error(err); // Keep original console.error
    });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "updateContextMenu") {
        debugLog("Received request to update context menu from options page.");
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
            if (tabs && tabs.length > 0 && tabs[0].id && tabs[0].url) {
                const activeTab = tabs[0];
                try {
                    const configsResult = await chrome.storage.local.get(CONFIGS_KEY);
                    const configs = configsResult[CONFIGS_KEY] || [];
                    const matchingConfig = getConfigForUrl(configs, activeTab.url);
                    await updateContextMenuForTab(activeTab.id, matchingConfig);
                } catch (error) {
                    debugLog("Error updating context menu from options message:", 'error'); console.error(error); // Keep original console.error
                }
            } else {
                await chrome.contextMenus.removeAll();
            }
        });
        sendResponse({ success: true });
        return true; // Indicate async response possible
    }
    return false;
});

chrome.runtime.onInstalled.addListener(async (details) => {
     debugLog("Extension installed or updated: " + details.reason);
     await chrome.contextMenus.removeAll();
});


debugLog("Background script loaded (v1.4 - dynamic menu filtering, conditional logging).");