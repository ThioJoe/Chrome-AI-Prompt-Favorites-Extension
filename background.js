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
function injectTextIntoElement(textToInject, xpath, insertMode = 'replace', currentUrl = '') { // Added currentUrl parameter
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

    debugLogInjected(`Entering injectTextIntoElement. Mode: ${insertMode}, URL: ${currentUrl}`, 'log', 'color: blue; font-weight: bold;');
    debugLogInjected(`Raw textToInject: ${JSON.stringify(textToInject)}`);

    try {
        const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        const targetElement = result.singleNodeValue;

        if (targetElement) {
            debugLogInjected(`Found targetElement: ${targetElement.tagName}, Type: ${targetElement.type || 'N/A'}, ContentEditable: ${targetElement.isContentEditable}`);
            targetElement.focus(); // Focus the original target first

            let currentValue = '';
            let finalValue = '';
            let finalHtml = '';
            let textLength = 0;
            let elementToModify = targetElement; // This will be the element whose innerHTML is set
            let elementForEventsAndCursor = targetElement; // This will be the element for events/cursor logic

            // --- Get current value reliably ---
            try {
                if (typeof targetElement.value === 'string') {
                    currentValue = targetElement.value || '';
                } else if (targetElement.isContentEditable) {
                    if (insertMode === 'replace') {
                        currentValue = targetElement.innerHTML || '';
                    } else {
                        currentValue = targetElement.textContent || '';
                    }
                } else {
                    currentValue = targetElement.textContent || '';
                }
            } catch (e) {
                debugLogInjected("Error getting currentValue", 'error'); console.error(e);
                currentValue = '';
            }

            // Determine final *string* value based on insert mode
            switch (insertMode) {
                case 'insertBefore': finalValue = textToInject + currentValue; break;
                case 'insertAfter': finalValue = currentValue + textToInject; break;
                case 'replace': default: finalValue = textToInject; break;
            }
            debugLogInjected(`Calculated finalValue (string): ${JSON.stringify(finalValue)}`);

            // --- Set the final value reliably ---
            let valueJustSetText = '';
            try {
                if (typeof targetElement.value === 'string' && !targetElement.isContentEditable) { // Standard input/textarea
                    targetElement.value = finalValue;
                    valueJustSetText = targetElement.value;
                    textLength = targetElement.value.length;
                } else if (targetElement.isContentEditable) {
                    const isGemini = currentUrl.includes('gemini.google.com');
                    debugLogInjected(`Is Gemini site: ${isGemini}`);

                    if (isGemini) {
                        const lines = finalValue.split('\n');
                        let htmlContent = '';
                        for (let i = 0; i < lines.length; i++) {
                            const line = lines[i];
                            // Ensure blank lines become <p><br></p> and non-empty lines <p>text</p>
                            if (line === '' && (i < lines.length -1 || lines.length === 1) ) { // Handle single blank line or blank lines between text
                                htmlContent += '<p><br></p>';
                            } else if (line !== '') {
                                htmlContent += `<p>${line.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`;
                            } else if (line === '' && i === lines.length -1 && lines.length > 1 && !finalValue.endsWith('\n\n')) {
                                // if the very last character was a single \n that resulted in a trailing empty string from split,
                                // and it wasn't meant to be a paragraph break, don't add <p><br></p>
                                // This case means finalValue was "text\n", not "text\n\n"
                            }
                        }
                        finalHtml = htmlContent;

                        if (targetElement.tagName === 'P' &&
                            targetElement.parentElement &&
                            targetElement.parentElement.classList.contains('ql-editor')) {
                            debugLogInjected('%cGemini: Target is P in ql-editor. Setting innerHTML of parent.', 'log', 'color: magenta;');
                            elementToModify = targetElement.parentElement;
                            elementForEventsAndCursor = targetElement.parentElement;
                        } else {
                             debugLogInjected('%cGemini: Target is ql-editor or other. Setting innerHTML of target.', 'log', 'color: magenta;');
                            // elementToModify and elementForEventsAndCursor remain targetElement
                        }
                        elementToModify.innerHTML = finalHtml;
                        debugLogInjected(`%cSet Gemini HTML: ${JSON.stringify(finalHtml)} to ${elementToModify.tagName}`, 'log', 'color: purple;');
                    } else { // Non-Gemini contentEditable
                        let escapedValue = finalValue;
                        finalHtml = escapedValue.replace(/\n/g, '<br>');
                        const _hasTrailingNewline = finalValue.endsWith('\n');
                        if (_hasTrailingNewline && finalValue !== '') {
                            if (finalHtml.endsWith('<br><br>')) { /* already good */ }
                            else if (finalHtml.endsWith('<br>')) { finalHtml += '<br>'; }
                            else { finalHtml += '<br><br>';}
                        }
                        targetElement.innerHTML = finalHtml; // elementToModify and elementForEventsAndCursor are targetElement
                        debugLogInjected(`%cSet non-Gemini contentEditable HTML: ${JSON.stringify(finalHtml)}`, 'log', 'color: purple;');
                    }
                    valueJustSetText = elementForEventsAndCursor.textContent || "";
                    textLength = valueJustSetText.length; // Note: for rich text, textContent length can differ from perceived chars
                } else {
                    debugLogInjected(`Cannot reliably set value for this element type (XPath: ${xpath}). Value not set.`, 'warn');
                    return;
                }
                debugLogInjected(`%cValue read back (textContent of ${elementForEventsAndCursor.tagName}) after setting: ${JSON.stringify(valueJustSetText)}`, 'log', 'color: orange;');
            } catch (e) {
                debugLogInjected("Error setting value or reading it back", 'error'); console.error(e);
            }

            // --- Set cursor position ---
            debugLogInjected(`Attempting to set cursor position on element: ${elementForEventsAndCursor.tagName}`);
            elementForEventsAndCursor.focus(); // Ensure the element that got content is focused

            try {
                if (elementForEventsAndCursor.classList && elementForEventsAndCursor.classList.contains('ql-editor')) {
                    const selection = window.getSelection();
                    const range = document.createRange();
                    if (elementForEventsAndCursor.childNodes.length > 0) {
                        range.selectNodeContents(elementForEventsAndCursor);
                        range.collapse(false); // false for end
                    } else {
                        range.setStart(elementForEventsAndCursor, 0);
                        range.collapse(true); // true if already at start
                    }
                    selection.removeAllRanges();
                    selection.addRange(range);
                    debugLogInjected(`Used Selection API for Quill editor (collapsed to end).`);
                } else if (typeof elementForEventsAndCursor.setSelectionRange === 'function' && typeof elementForEventsAndCursor.value === 'string') {
                    const len = elementForEventsAndCursor.value.length;
                    elementForEventsAndCursor.setSelectionRange(len, len);
                    debugLogInjected(`Used setSelectionRange(${len}, ${len})`);
                } else if (elementForEventsAndCursor.isContentEditable) { // Generic contentEditable
                    const selection = window.getSelection();
                    const range = document.createRange();
                    range.selectNodeContents(elementForEventsAndCursor);
                    range.collapse(false);
                    selection.removeAllRanges();
                    selection.addRange(range);
                    debugLogInjected(`Used Selection API for generic contentEditable (collapsed to end).`);
                }
            } catch (e) { debugLogInjected("Could not set cursor.", 'warn'); console.warn(e); }

            // --- Dispatch input/change events ---
            try {
                debugLogInjected(`Dispatching events (input, change) on ${elementForEventsAndCursor.tagName}`);
                elementForEventsAndCursor.dispatchEvent(new Event('input', { bubbles: true, cancelable: true, composed: true }));
                elementForEventsAndCursor.dispatchEvent(new Event('change', { bubbles: true, cancelable: true, composed: true }));

                if (currentUrl.includes('gemini.google.com')) { // isGemini check
                    debugLogInjected('Applying Gemini post-injection focus/blur cycle.');
                    elementForEventsAndCursor.blur();
                    elementForEventsAndCursor.focus();
                    // Attempt to set cursor again after blur/focus cycle, as focus can reset it
                    if (elementForEventsAndCursor.classList && elementForEventsAndCursor.classList.contains('ql-editor')) {
                         const selection = window.getSelection();
                         const range = document.createRange();
                         if (elementForEventsAndCursor.childNodes.length > 0) { range.selectNodeContents(elementForEventsAndCursor); range.collapse(false); }
                         else { range.setStart(elementForEventsAndCursor, 0); range.collapse(true); }
                         selection.removeAllRanges(); selection.addRange(range);
                         debugLogInjected('Cursor reset for Gemini after blur/focus.');
                    }
                }
            } catch(e) {
                 debugLogInjected("Error dispatching events.", 'error'); console.error(e);
            }
             debugLogInjected(`%cInsertion complete (Mode: ${insertMode}). Final state logged above.`, 'log', 'color: blue; font-weight: bold;');
        } else {
             debugLog('Target element not found for XPath: ' + xpath, 'error');
        }
    } catch (error) {
         debugLog("Error inserting text:", 'error'); console.error(error);
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
         debugLog(`Invalid pattern for matching: ${pattern}`, 'error'); console.error(e);
        return false;
    }
}


// --- Get Config for URL (Unchanged) ---
function getConfigForUrl(configs, url) {
     if (!configs || !url) return null;
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
         debugLog("Error in onActivated listener:", 'error'); console.error(error);
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
             debugLog("Error in onUpdated listener:", 'error'); console.error(error);
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

    debugLog(`Injecting prompt "${selectedPrompt.title}" into site ${matchingConfig.name || matchingConfig.urlPattern} (URL: ${currentUrl}) using XPath: ${matchingConfig.xpath} with mode: ${insertMode}`);

    chrome.scripting.executeScript({
        target: { tabId: tab.id, frameIds: [info.frameId || 0] },
        func: injectTextIntoElement,
        args: [selectedPrompt.content, matchingConfig.xpath, insertMode, currentUrl] 
    }).catch(err => {
        debugLog("Error executing script:", 'error'); console.error(err);
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
                    debugLog("Error updating context menu from options message:", 'error'); console.error(error);
                }
            } else {
                await chrome.contextMenus.removeAll();
            }
        });
        sendResponse({ success: true });
        return true; 
    }
    return false;
});

chrome.runtime.onInstalled.addListener(async (details) => {
     debugLog("Extension installed or updated: " + details.reason);
     await chrome.contextMenus.removeAll();
});


debugLog("Background script loaded (v1.6 - Gemini contentEditable parent targeting).");
