// DOM Elements
const promptList = document.getElementById('prompt-list');
const newPromptTitleInput = document.getElementById('new-prompt-title');
const newPromptContentInput = document.getElementById('new-prompt-content');
const savePromptButton = document.getElementById('save-new-prompt');
const statusPromptDiv = document.getElementById('status-prompt');
const loadingPromptsLi = document.getElementById('loading-prompts');

const configList = document.getElementById('config-list');
const newConfigNameInput = document.getElementById('new-config-name');
const newConfigUrlInput = document.getElementById('new-config-url');
const newConfigXpathInput = document.getElementById('new-config-xpath');
const saveConfigButton = document.getElementById('save-new-config');
const statusConfigDiv = document.getElementById('status-config');
const loadingConfigsLi = document.getElementById('loading-configs');

// Storage Keys
const PROMPTS_KEY = 'prompts';
const CONFIGS_KEY = 'siteConfigs';


// --- Utility Functions ---

function displayStatus(element, message, isError = false) {
    element.textContent = message;
    element.style.color = isError ? 'red' : 'green';
    setTimeout(() => { element.textContent = ''; }, 3000);
}

function generateId(prefix = 'item') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function escapeHtml(unsafe) {
    // [cite: 86] (Code for escapeHtml)
    if (typeof unsafe !== 'string') return unsafe;
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

function notifyBackgroundPage() {
    // [cite: 54, 55] (Code for notifyBackgroundPage)
    chrome.runtime.sendMessage({ action: "updateContextMenu" }, response => {
        if (chrome.runtime.lastError) {
            console.error("Error notifying background page:", chrome.runtime.lastError.message);
        } else if (response?.success) {
            console.log("Background page acknowledged context menu update.");
        } else {
             console.warn("Background page did not acknowledge context menu update.");
        }
    });
}


// --- Data Handling Functions (Generic) ---

async function loadItems(key, listElement, loadingElement, renderFunction) {
    listElement.innerHTML = ''; // Clear list
     if (loadingElement) listElement.appendChild(loadingElement); // Show loading indicator temporarily

    try {
        const result = await chrome.storage.local.get(key);
        const items = result[key] || [];

        if (loadingElement) loadingElement.remove(); // Remove loading indicator

        if (items.length === 0) {
            listElement.innerHTML = '<li>No items saved yet.</li>';
            return items; // Return empty array
        }

        items.forEach((item, index) => {
            const li = renderFunction(item, index);
             if (li instanceof Node) { // Ensure renderFunction returned a valid element
                 listElement.appendChild(li);
             } else {
                 console.warn("Render function did not return a valid DOM element for item:", item);
             }
        });
        return items; // Return loaded items

    } catch (error) {
        console.error(`Error loading items for key "${key}":`, error);
        if (loadingElement) loadingElement.remove();
        listElement.innerHTML = `<li>Error loading items. Details: ${error.message}</li>`;
        throw error; // Re-throw error for upstream handling if needed
    }
}

async function saveItems(key, items) {
    try {
        await chrome.storage.local.set({ [key]: items });
        console.log(`Items saved to storage for key "${key}".`);
        notifyBackgroundPage(); // Update context menu after saving
    } catch (error) {
        console.error(`Error saving items for key "${key}":`, error);
        throw error; // Re-throw
    }
}


// --- Prompt Specific Functions ---

function renderPrompt(prompt, index) {
    // [cite: 59, 60, 61, 62, 63] (Code structure for rendering prompt item)
    const li = document.createElement('li');
    li.className = 'list-item prompt-item'; // Use generic and specific classes
    li.dataset.id = prompt.id;

    li.innerHTML = `
        <h3 class="prompt-title">${escapeHtml(prompt.title || `Prompt ${index + 1}`)}</h3>
        <pre class="prompt-content">${escapeHtml(prompt.content || '')}</pre>
        <button class="btn-edit">Edit</button>
        <button class="btn-delete">Delete</button>
        <div class="edit-area">
            <label>Edit Title:</label>
            <input type="text" class="edit-title" value="${escapeHtml(prompt.title || '')}">
            <label>Edit Content:</label>
            <textarea class="edit-content">${escapeHtml(prompt.content || '')}</textarea>
            <button class="btn-save-edit">Save Changes</button>
            <button class="btn-cancel-edit">Cancel</button>
        </div>
    `;
    return li;
}

async function addNewPrompt() {
    // [cite: 66, 67, 68, 69, 70, 71, 72] (Logic for addNewPrompt)
    const title = newPromptTitleInput.value.trim();
    const content = newPromptContentInput.value.trim();

    if (!title || !content) {
        displayStatus(statusPromptDiv, "Both title and content are required.", true);
        return;
    }

    try {
        const result = await chrome.storage.local.get(PROMPTS_KEY);
        const prompts = result[PROMPTS_KEY] || [];

        const newPrompt = { id: generateId('prompt'), title: title, content: content };
        prompts.push(newPrompt);

        await saveItems(PROMPTS_KEY, prompts);

        newPromptTitleInput.value = '';
        newPromptContentInput.value = '';
        displayStatus(statusPromptDiv, "Prompt saved successfully!");
        loadItems(PROMPTS_KEY, promptList, loadingPromptsLi, renderPrompt); // Refresh list
    } catch (error) {
        displayStatus(statusPromptDiv, "Error saving new prompt.", true);
    }
}

async function deletePrompt(id) {
    // [cite: 72, 73, 74, 75, 76, 77] (Logic for deletePrompt)
    if (!confirm("Are you sure you want to delete this prompt?")) return;

    try {
        const result = await chrome.storage.local.get(PROMPTS_KEY);
        let prompts = result[PROMPTS_KEY] || [];
        prompts = prompts.filter(p => p.id !== id);
        await saveItems(PROMPTS_KEY, prompts);
        displayStatus(statusPromptDiv, "Prompt deleted.");
        loadItems(PROMPTS_KEY, promptList, loadingPromptsLi, renderPrompt); // Refresh list
    } catch (error) {
        displayStatus(statusPromptDiv, "Error deleting prompt.", true);
    }
}

async function saveEditedPrompt(id, liElement) {
    // [cite: 77, 78, 79, 80, 81, 82, 83, 84, 85] (Logic for saveEditedPrompt)
    const editTitleInput = liElement.querySelector('.edit-title');
    const editContentInput = liElement.querySelector('.edit-content');
    const newTitle = editTitleInput.value.trim();
    const newContent = editContentInput.value.trim();

    if (!newTitle || !newContent) {
        alert("Both title and content are required.");
        return;
    }

    try {
        const result = await chrome.storage.local.get(PROMPTS_KEY);
        let prompts = result[PROMPTS_KEY] || [];
        const promptIndex = prompts.findIndex(p => p.id === id);

        if (promptIndex > -1) {
            prompts[promptIndex].title = newTitle;
            prompts[promptIndex].content = newContent;
            await saveItems(PROMPTS_KEY, prompts);
            displayStatus(statusPromptDiv, "Prompt updated successfully!");
            loadItems(PROMPTS_KEY, promptList, loadingPromptsLi, renderPrompt); // Refresh list
        } else {
            alert("Error: Could not find prompt to update.");
        }
    } catch (error) {
         alert("Error updating prompt.");
    }
}


// --- Site Configuration Specific Functions ---

function renderConfig(config, index) {
    const li = document.createElement('li');
    li.className = 'list-item config-item';
    li.dataset.id = config.id;

    li.innerHTML = `
        <h3>${escapeHtml(config.name || `Configuration ${index + 1}`)}</h3>
        <label>URL Pattern:</label>
        <code>${escapeHtml(config.urlPattern || '')}</code>
        <label>XPath:</label>
        <code>${escapeHtml(config.xpath || '')}</code>
        <button class="btn-edit">Edit</button>
        <button class="btn-delete">Delete</button>
        <div class="edit-area">
            <label>Edit Name:</label>
            <input type="text" class="edit-name" value="${escapeHtml(config.name || '')}">
            <label>Edit URL Pattern:</label>
            <input type="text" class="edit-url" value="${escapeHtml(config.urlPattern || '')}">
            <label>Edit XPath:</label>
            <input type="text" class="edit-xpath" value="${escapeHtml(config.xpath || '')}">
            <button class="btn-save-edit">Save Changes</button>
            <button class="btn-cancel-edit">Cancel</button>
        </div>
    `;
    return li;
}

async function addNewConfig() {
    const name = newConfigNameInput.value.trim(); // Optional
    const urlPattern = newConfigUrlInput.value.trim();
    const xpath = newConfigXpathInput.value.trim();

    if (!urlPattern || !xpath) {
        displayStatus(statusConfigDiv, "URL Pattern and XPath are required.", true);
        return;
    }

     // Basic validation for URL pattern (should contain *)
    if (!urlPattern.includes('*') && !urlPattern.startsWith('http://') && !urlPattern.startsWith('https://')) {
         if (!confirm(`The URL pattern "${urlPattern}" doesn't look like a standard match pattern (e.g., https://*.example.com/*). Save anyway?`)) {
             return;
         }
    }


    try {
        const result = await chrome.storage.local.get(CONFIGS_KEY);
        const configs = result[CONFIGS_KEY] || [];

        const newConfig = { id: generateId('config'), name: name, urlPattern: urlPattern, xpath: xpath };
        configs.push(newConfig);

        await saveItems(CONFIGS_KEY, configs);

        newConfigNameInput.value = '';
        newConfigUrlInput.value = '';
        newConfigXpathInput.value = '';
        displayStatus(statusConfigDiv, "Site configuration saved successfully!");
        loadItems(CONFIGS_KEY, configList, loadingConfigsLi, renderConfig); // Refresh list
    } catch (error) {
        displayStatus(statusConfigDiv, "Error saving new configuration.", true);
    }
}

async function deleteConfig(id) {
    if (!confirm("Are you sure you want to delete this site configuration?")) return;

    try {
        const result = await chrome.storage.local.get(CONFIGS_KEY);
        let configs = result[CONFIGS_KEY] || [];
        configs = configs.filter(c => c.id !== id);
        await saveItems(CONFIGS_KEY, configs);
        displayStatus(statusConfigDiv, "Configuration deleted.");
        loadItems(CONFIGS_KEY, configList, loadingConfigsLi, renderConfig); // Refresh list
    } catch (error) {
        displayStatus(statusConfigDiv, "Error deleting configuration.", true);
    }
}

async function saveEditedConfig(id, liElement) {
    const editNameInput = liElement.querySelector('.edit-name');
    const editUrlInput = liElement.querySelector('.edit-url');
    const editXpathInput = liElement.querySelector('.edit-xpath');
    const newName = editNameInput.value.trim();
    const newUrl = editUrlInput.value.trim();
    const newXpath = editXpathInput.value.trim();

    if (!newUrl || !newXpath) {
        alert("URL Pattern and XPath are required.");
        return;
    }

    try {
        const result = await chrome.storage.local.get(CONFIGS_KEY);
        let configs = result[CONFIGS_KEY] || [];
        const configIndex = configs.findIndex(c => c.id === id);

        if (configIndex > -1) {
            configs[configIndex].name = newName;
            configs[configIndex].urlPattern = newUrl;
            configs[configIndex].xpath = newXpath;
            await saveItems(CONFIGS_KEY, configs);
            displayStatus(statusConfigDiv, "Configuration updated successfully!");
            loadItems(CONFIGS_KEY, configList, loadingConfigsLi, renderConfig); // Refresh list
        } else {
            alert("Error: Could not find configuration to update.");
        }
    } catch (error) {
         alert("Error updating configuration.");
    }
}


// --- Event Listeners Setup ---

// Add New buttons
savePromptButton.addEventListener('click', addNewPrompt);
saveConfigButton.addEventListener('click', addNewConfig);

// Generic handler for list interactions (Edit, Delete, Save Edit, Cancel Edit)
function setupListEventListeners(listElement, deleteFunction, saveEditFunction) {
    listElement.addEventListener('click', (event) => {
        const target = event.target;
        const li = target.closest('.list-item');
        if (!li) return;

        const itemId = li.dataset.id;
        const editArea = li.querySelector('.edit-area');
        // Select all direct children that are NOT the edit area
        const viewAreaElements = Array.from(li.children).filter(el => !el.classList.contains('edit-area'));


        if (target.classList.contains('btn-delete')) {
            deleteFunction(itemId);
        } else if (target.classList.contains('btn-edit')) {
            // Hide view elements, show edit area
            viewAreaElements.forEach(el => el.style.display = 'none');
            if(editArea) editArea.style.display = 'block';
        } else if (target.classList.contains('btn-cancel-edit')) {
             // Hide edit area, show view elements
            if(editArea) editArea.style.display = 'none';
            viewAreaElements.forEach(el => el.style.display = 'block');
        } else if (target.classList.contains('btn-save-edit')) {
            saveEditFunction(itemId, li);
        }
    });
}

// Setup listeners for both lists
setupListEventListeners(promptList, deletePrompt, saveEditedPrompt);
setupListEventListeners(configList, deleteConfig, saveEditedConfig);


// --- Initial Load ---
document.addEventListener('DOMContentLoaded', () => {
    // Load both prompts and configs when the page loads
    loadItems(PROMPTS_KEY, promptList, loadingPromptsLi, renderPrompt);
    loadItems(CONFIGS_KEY, configList, loadingConfigsLi, renderConfig);
});