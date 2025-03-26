const TARGET_SITE_PATTERNS = ["https://gemini.google.com/*"]; // Match URLs
const TARGET_XPATH = "/html/body/chat-app/main/side-navigation-v2/bard-sidenav-container/bard-sidenav-content/div[2]/div/div[2]/chat-window/div/input-container/div/input-area-v2/div/div/div[1]/div/div/rich-textarea/div[1]/p";
const PARENT_CONTEXT_MENU_ID = "promptInjectParent";

// --- Helper Function to Inject Text ---
// This function will be executed IN THE CONTEXT OF THE WEBPAGE
function injectTextIntoElement(textToInject, xpath) {
    try {
        const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        const targetElement = result.singleNodeValue;

        if (targetElement) {
            targetElement.focus(); // Focus the element first

            // Set value based on element type
            if (targetElement.isContentEditable) {
                 // For contentEditable divs
                targetElement.textContent = textToInject;
            } else if (targetElement.value !== undefined) {
                // For input/textarea
                targetElement.value = textToInject;
            } else {
                 // Fallback attempt
                 targetElement.innerText = textToInject;
            }


            // Simulate input to make web frameworks (React, etc.) recognize the change
            targetElement.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            targetElement.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

            console.log('Prompt Inserted via context menu.');
        } else {
            console.error('Prompt Favorites: Target element not found for XPath:', xpath);
            // Optional: Alert the user if the target isn't found
            // alert('Prompt Favorites: Target text box could not be found on the page.');
        }
    } catch (error) {
        console.error("Prompt Favorites: Error inserting text:", error);
        // alert(`Prompt Favorites Error: ${error.message}`);
    }
}


// --- Context Menu Setup ---
async function updateContextMenu() {
    // Remove existing menu items first to avoid duplicates
    await chrome.contextMenus.removeAll();

    // Create the parent menu item
    chrome.contextMenus.create({
        id: PARENT_CONTEXT_MENU_ID,
        title: "Insert Prompt",
        contexts: ["editable"], // Show only when right-clicking an editable field
        documentUrlPatterns: TARGET_SITE_PATTERNS // Only on specified sites
    });

    // Retrieve saved prompts from storage
    const result = await chrome.storage.local.get('prompts');
    const prompts = result.prompts || []; // Default to empty array if nothing stored

    if (prompts.length === 0) {
        // Add a placeholder if no prompts are saved
        chrome.contextMenus.create({
            id: "noPrompts",
            parentId: PARENT_CONTEXT_MENU_ID,
            title: "No prompts saved (Go to Options)",
            contexts: ["editable"],
            documentUrlPatterns: TARGET_SITE_PATTERNS,
            enabled: false // Make it unclickable
        });
    } else {
        // Create a submenu item for each saved prompt
        prompts.forEach((prompt, index) => {
            // Ensure prompt has an ID and title
            const promptId = prompt.id || `prompt-${index}`; // Use saved ID or generate one
            const promptTitle = prompt.title || `Prompt ${index + 1}`;

            chrome.contextMenus.create({
                id: promptId, // Use the prompt's unique ID
                parentId: PARENT_CONTEXT_MENU_ID,
                title: promptTitle, // Show the prompt's title
                contexts: ["editable"],
                documentUrlPatterns: TARGET_SITE_PATTERNS
            });
        });
    }
     console.log("Context menu updated.");
}

// --- Event Listeners ---

// Update context menu when the extension is installed or updated, or Chrome starts
chrome.runtime.onInstalled.addListener(updateContextMenu);
chrome.runtime.onStartup.addListener(updateContextMenu); // Needed if Chrome closes fully

// Listen for clicks on our context menu items
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    // Ignore clicks on the parent or the 'no prompts' item
    if (info.parentMenuItemId !== PARENT_CONTEXT_MENU_ID || info.menuItemId === "noPrompts") {
        return;
    }

    const promptId = info.menuItemId; // This is the unique ID of the clicked prompt

    // Retrieve the specific prompt content from storage
    const result = await chrome.storage.local.get('prompts');
    const prompts = result.prompts || [];
    const selectedPrompt = prompts.find(p => p.id === promptId);

    if (selectedPrompt && selectedPrompt.content && tab?.id) {
         console.log(`Inserting prompt: ${selectedPrompt.title}`);
        // Execute the injection function in the target tab
        chrome.scripting.executeScript({
            target: { tabId: tab.id, frameIds: [info.frameId || 0] }, // Use frameId if available
            func: injectTextIntoElement,
            args: [selectedPrompt.content, TARGET_XPATH] // Pass content and XPath
        }).catch(err => console.error("Error executing script:", err));
    } else {
        console.error("Could not find prompt content for ID:", promptId, "or tab ID missing.");
    }
});

// Listen for messages from the options page to update the menu when prompts change
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "updateContextMenu") {
        console.log("Received request to update context menu from options page.");
        updateContextMenu();
        sendResponse({ success: true }); // Acknowledge receipt
    }
    // Keep the message channel open for asynchronous response if needed elsewhere
    // return true;
});

console.log("Prompt Favorites background script loaded (context menu version).");