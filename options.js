// DOM Elements (Unchanged)
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

// Storage Keys (Unchanged)
const PROMPTS_KEY = 'prompts';
const CONFIGS_KEY = 'siteConfigs';

// --- Global Cache for Configs (to avoid repeated loading) ---
let cachedConfigs = [];

// --- Utility Functions (Unchanged) ---
function displayStatus(element, message, isError = false) { element.textContent = message; element.style.color = isError ? 'red' : 'green'; setTimeout(() => { element.textContent = ''; }, 3000); }
function generateId(prefix = 'item') { return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`; }
function escapeHtml(unsafe) { if (typeof unsafe !== 'string') return unsafe; return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
function notifyBackgroundPage() { chrome.runtime.sendMessage({ action: "updateContextMenu" }, response => { if (chrome.runtime.lastError) { console.error("Error notifying background page:", chrome.runtime.lastError.message); } else if (response?.success) { console.log("Background page acknowledged context menu update."); } else { console.warn("Background page did not acknowledge context menu update."); } }); }


// --- Data Handling Functions (Modified saveItems to allow optional notify) ---

async function loadItems(key, listElement, loadingElement, renderFunction, postLoadCallback = null) {
    listElement.innerHTML = ''; // Clear list
    if (loadingElement) listElement.appendChild(loadingElement);

    try {
        const result = await chrome.storage.local.get(key);
        const items = result[key] || [];

        if (loadingElement) loadingElement.remove();

        if (items.length === 0) {
            listElement.innerHTML = '<li>No items saved yet.</li>';
        } else {
            items.forEach((item, index) => {
                const li = renderFunction(item, index); // Pass index if needed by render
                if (li instanceof Node) {
                    listElement.appendChild(li);
                } else {
                    console.warn("Render function did not return a valid DOM element for item:", item);
                }
            });
        }

        if (postLoadCallback) {
            postLoadCallback(items); // Call callback with loaded items
        }
        return items; // Return loaded items

    } catch (error) {
        console.error(`Error loading items for key "${key}":`, error);
        if (loadingElement) loadingElement.remove();
        listElement.innerHTML = `<li>Error loading items. Details: ${error.message}</li>`;
        throw error;
    }
}

// Modified to optionally skip notification (useful for bulk updates)
async function saveItems(key, items, shouldNotify = true) {
    try {
        await chrome.storage.local.set({ [key]: items });
        console.log(`Items saved to storage for key "${key}".`);
        if (shouldNotify) {
            notifyBackgroundPage(); // Update context menu after saving
        }
    } catch (error) {
        console.error(`Error saving items for key "${key}":`, error);
        throw error;
    }
}


// --- Prompt Specific Functions (Modified) ---

function renderPrompt(prompt, index) {
    const li = document.createElement('li');
    li.className = 'list-item prompt-item';
    li.dataset.id = prompt.id;

    // Basic prompt info
    li.innerHTML = `
        <h3 class="prompt-title">${escapeHtml(prompt.title || `Prompt ${index + 1}`)}</h3>
        <pre class="prompt-content">${escapeHtml(prompt.content || '')}</pre>
        <div class="enabled-sites-container"></div>
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

    // Render checkboxes for enabled sites
    const sitesContainer = li.querySelector('.enabled-sites-container');
    if (cachedConfigs.length > 0) {
        const list = document.createElement('ul');
        list.className = 'enabled-sites-list';
        const labelSpan = document.createElement('span');
        labelSpan.className = 'enabled-sites-label';
        labelSpan.textContent = 'Enabled for:';
        sitesContainer.appendChild(labelSpan);

        cachedConfigs.forEach(config => {
            const siteLi = document.createElement('li');
            const label = document.createElement('label');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.dataset.configId = config.id; // Store config ID
            // Default to checked if enabledSites is missing or the site ID is true/undefined
            checkbox.checked = prompt.enabledSites ? (prompt.enabledSites[config.id] !== false) : true;

            checkbox.addEventListener('change', handleEnabledSiteChange); // Add listener

            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(` ${escapeHtml(config.name || config.urlPattern)}`)); // Use name or pattern
            siteLi.appendChild(label);
            list.appendChild(siteLi);
        });
        sitesContainer.appendChild(list);
    } else {
         sitesContainer.innerHTML = '<span class="help-text">No sites configured yet.</span>';
    }


    return li;
}

async function handleEnabledSiteChange(event) {
    const checkbox = event.target;
    const configId = checkbox.dataset.configId;
    const isEnabled = checkbox.checked;
    const promptLi = checkbox.closest('.prompt-item');
    const promptId = promptLi.dataset.id;

    console.log(`Toggling prompt ${promptId} for config ${configId} to ${isEnabled}`);

    try {
        const result = await chrome.storage.local.get(PROMPTS_KEY);
        let prompts = result[PROMPTS_KEY] || [];
        const promptIndex = prompts.findIndex(p => p.id === promptId);

        if (promptIndex > -1) {
            // Initialize enabledSites if it doesn't exist
            if (!prompts[promptIndex].enabledSites) {
                prompts[promptIndex].enabledSites = {};
            }
            prompts[promptIndex].enabledSites[configId] = isEnabled;

            // Save changes, but don't notify background yet if part of larger operation
            // Let the main save/delete functions handle notification
            await saveItems(PROMPTS_KEY, prompts, false); // Save without notifying immediately
            displayStatus(statusPromptDiv, "Enablement status updated.");

            // **Important**: Ensure context menu is updated eventually.
            // It's often better to call notifyBackgroundPage() after the *entire* operation (like add/delete config)
            // For a simple toggle like this, notifying immediately is okay.
            notifyBackgroundPage();

        } else {
            console.error("Could not find prompt to update enablement status.");
        }
    } catch (error) {
        displayStatus(statusPromptDiv, "Error updating enablement status.", true);
    }
}


async function addNewPrompt() {
    const title = newPromptTitleInput.value.trim();
    const content = newPromptContentInput.value.trim();

    if (!title || !content) {
        displayStatus(statusPromptDiv, "Both title and content are required.", true);
        return;
    }

    try {
        const result = await chrome.storage.local.get(PROMPTS_KEY);
        const prompts = result[PROMPTS_KEY] || [];

        // Initialize enabledSites for the new prompt with all current config IDs set to true
        const initialEnabledSites = {};
        cachedConfigs.forEach(config => {
            initialEnabledSites[config.id] = true; // Enable by default for all existing sites
        });

        const newPrompt = {
            id: generateId('prompt'),
            title: title,
            content: content,
            enabledSites: initialEnabledSites // Add the new property
        };

        prompts.push(newPrompt);
        await saveItems(PROMPTS_KEY, prompts); // Notifies background

        newPromptTitleInput.value = '';
        newPromptContentInput.value = '';
        displayStatus(statusPromptDiv, "Prompt saved successfully!");
        // Re-render prompt list (will include checkboxes based on cachedConfigs)
        await loadItems(PROMPTS_KEY, promptList, loadingPromptsLi, renderPrompt);
    } catch (error) {
        displayStatus(statusPromptDiv, "Error saving new prompt.", true);
    }
}

// deletePrompt and saveEditedPrompt remain largely the same,
// as they primarily deal with the prompt item itself or title/content.
// The enablement data is automatically kept unless the prompt is deleted.
async function deletePrompt(id) { /* (Unchanged logic from previous version) */ if (!confirm("Are you sure you want to delete this prompt?")) return; try { const result = await chrome.storage.local.get(PROMPTS_KEY); let prompts = result[PROMPTS_KEY] || []; prompts = prompts.filter(p => p.id !== id); await saveItems(PROMPTS_KEY, prompts); displayStatus(statusPromptDiv, "Prompt deleted."); await loadItems(PROMPTS_KEY, promptList, loadingPromptsLi, renderPrompt); } catch (error) { displayStatus(statusPromptDiv, "Error deleting prompt.", true); } }
async function saveEditedPrompt(id, liElement) { /* (Unchanged logic from previous version) */ const editTitleInput = liElement.querySelector('.edit-title'); const editContentInput = liElement.querySelector('.edit-content'); const newTitle = editTitleInput.value.trim(); const newContent = editContentInput.value.trim(); if (!newTitle || !newContent) { alert("Both title and content are required."); return; } try { const result = await chrome.storage.local.get(PROMPTS_KEY); let prompts = result[PROMPTS_KEY] || []; const promptIndex = prompts.findIndex(p => p.id === id); if (promptIndex > -1) { prompts[promptIndex].title = newTitle; prompts[promptIndex].content = newContent; await saveItems(PROMPTS_KEY, prompts); displayStatus(statusPromptDiv, "Prompt updated successfully!"); await loadItems(PROMPTS_KEY, promptList, loadingPromptsLi, renderPrompt); } else { alert("Error: Could not find prompt to update."); } } catch (error) { alert("Error updating prompt."); } }


// --- Site Configuration Specific Functions (Modified) ---

function renderConfig(config, index) { /* (Unchanged logic from previous version) */ const li = document.createElement('li'); li.className = 'list-item config-item'; li.dataset.id = config.id; li.innerHTML = `<h3>${escapeHtml(config.name || `Configuration ${index + 1}`)}</h3><label>URL Pattern:</label><code>${escapeHtml(config.urlPattern || '')}</code><label>XPath:</label><code>${escapeHtml(config.xpath || '')}</code><button class="btn-edit">Edit</button><button class="btn-delete">Delete</button><div class="edit-area"><label>Edit Name:</label><input type="text" class="edit-name" value="${escapeHtml(config.name || '')}"><label>Edit URL Pattern:</label><input type="text" class="edit-url" value="${escapeHtml(config.urlPattern || '')}"><label>Edit XPath:</label><input type="text" class="edit-xpath" value="${escapeHtml(config.xpath || '')}"><button class="btn-save-edit">Save Changes</button><button class="btn-cancel-edit">Cancel</button></div>`; return li; }

async function addNewConfig() {
    const name = newConfigNameInput.value.trim();
    const urlPattern = newConfigUrlInput.value.trim();
    const xpath = newConfigXpathInput.value.trim();

    if (!urlPattern || !xpath) {
        displayStatus(statusConfigDiv, "URL Pattern and XPath are required.", true);
        return;
    }
    if (!urlPattern.includes('*') && !urlPattern.startsWith('http://') && !urlPattern.startsWith('https://')) {
         if (!confirm(`The URL pattern "${urlPattern}" doesn't look like a standard match pattern (e.g., https://*.example.com/*). Save anyway?`)) {
             return;
         }
    }

    try {
        // 1. Save the new config
        const configResult = await chrome.storage.local.get(CONFIGS_KEY);
        const configs = configResult[CONFIGS_KEY] || [];
        const newConfig = { id: generateId('config'), name: name, urlPattern: urlPattern, xpath: xpath };
        configs.push(newConfig);
        await saveItems(CONFIGS_KEY, configs, false); // Save configs, don't notify yet

        // 2. Update all existing prompts to enable this new config by default
        const promptResult = await chrome.storage.local.get(PROMPTS_KEY);
        let prompts = promptResult[PROMPTS_KEY] || [];
        prompts = prompts.map(prompt => {
            if (!prompt.enabledSites) {
                prompt.enabledSites = {};
            }
            prompt.enabledSites[newConfig.id] = true; // Enable new site by default
            return prompt;
        });
        await saveItems(PROMPTS_KEY, prompts, false); // Save prompts, don't notify yet

        // 3. Clear form, display status, reload UI, and notify background ONCE
        newConfigNameInput.value = ''; newConfigUrlInput.value = ''; newConfigXpathInput.value = '';
        displayStatus(statusConfigDiv, "Site configuration saved!");
        await loadAllDataAndRender(); // Reload both lists
        notifyBackgroundPage(); // Now notify background about the changes


    } catch (error) {
        displayStatus(statusConfigDiv, "Error saving new configuration.", true);
    }
}

async function deleteConfig(id) {
    if (!confirm("Are you sure you want to delete this site configuration? This will also remove its enablement status from all prompts.")) return;

    try {
        // 1. Delete the config
        const configResult = await chrome.storage.local.get(CONFIGS_KEY);
        let configs = configResult[CONFIGS_KEY] || [];
        configs = configs.filter(c => c.id !== id);
        await saveItems(CONFIGS_KEY, configs, false); // Save configs, don't notify yet

        // 2. Update all existing prompts to remove this config ID from their enabledSites
        const promptResult = await chrome.storage.local.get(PROMPTS_KEY);
        let prompts = promptResult[PROMPTS_KEY] || [];
        prompts = prompts.map(prompt => {
            if (prompt.enabledSites && prompt.enabledSites.hasOwnProperty(id)) {
                delete prompt.enabledSites[id]; // Remove the property
            }
            return prompt;
        });
        await saveItems(PROMPTS_KEY, prompts, false); // Save prompts, don't notify yet

        // 3. Display status, reload UI, and notify background ONCE
        displayStatus(statusConfigDiv, "Configuration deleted.");
        await loadAllDataAndRender(); // Reload both lists
        notifyBackgroundPage(); // Now notify background about the changes

    } catch (error) {
        displayStatus(statusConfigDiv, "Error deleting configuration.", true);
    }
}

// saveEditedConfig doesn't need to modify prompts, only the config itself
async function saveEditedConfig(id, liElement) { /* (Unchanged logic from previous version) */ const editNameInput = liElement.querySelector('.edit-name'); const editUrlInput = liElement.querySelector('.edit-url'); const editXpathInput = liElement.querySelector('.edit-xpath'); const newName = editNameInput.value.trim(); const newUrl = editUrlInput.value.trim(); const newXpath = editXpathInput.value.trim(); if (!newUrl || !newXpath) { alert("URL Pattern and XPath are required."); return; } try { const result = await chrome.storage.local.get(CONFIGS_KEY); let configs = result[CONFIGS_KEY] || []; const configIndex = configs.findIndex(c => c.id === id); if (configIndex > -1) { configs[configIndex].name = newName; configs[configIndex].urlPattern = newUrl; configs[configIndex].xpath = newXpath; await saveItems(CONFIGS_KEY, configs); displayStatus(statusConfigDiv, "Configuration updated successfully!"); await loadItems(CONFIGS_KEY, configList, loadingConfigsLi, renderConfig); await loadItems(PROMPTS_KEY, promptList, loadingPromptsLi, renderPrompt); /* Reload prompts too in case name changed */ } else { alert("Error: Could not find configuration to update."); } } catch (error) { alert("Error updating configuration."); } }


// --- Event Listeners Setup (Unchanged) ---
savePromptButton.addEventListener('click', addNewPrompt);
saveConfigButton.addEventListener('click', addNewConfig);

function setupListEventListeners(listElement, deleteFunction, saveEditFunction) { listElement.addEventListener('click', (event) => { const target = event.target; const li = target.closest('.list-item'); if (!li) return; const itemId = li.dataset.id; const editArea = li.querySelector('.edit-area'); const viewAreaElements = Array.from(li.children).filter(el => !el.classList.contains('edit-area')); if (target.classList.contains('btn-delete')) { deleteFunction(itemId); } else if (target.classList.contains('btn-edit')) { viewAreaElements.forEach(el => el.style.display = 'none'); if(editArea) editArea.style.display = 'block'; } else if (target.classList.contains('btn-cancel-edit')) { if(editArea) editArea.style.display = 'none'; viewAreaElements.forEach(el => el.style.display = 'block'); } else if (target.classList.contains('btn-save-edit')) { saveEditFunction(itemId, li); } }); }

setupListEventListeners(promptList, deletePrompt, saveEditedPrompt);
setupListEventListeners(configList, deleteConfig, saveEditedConfig);


// --- Initial Load Function ---
// Loads configs first, then prompts (so checkboxes can be rendered)
async function loadAllDataAndRender() {
     console.log("Loading all data and rendering...");
     try {
        // Load configs and cache them globally
         cachedConfigs = await loadItems(CONFIGS_KEY, configList, loadingConfigsLi, renderConfig);
         // Load prompts, using the cached configs in renderPrompt
         await loadItems(PROMPTS_KEY, promptList, loadingPromptsLi, renderPrompt);
         console.log("Data loaded and rendered.");
     } catch(error) {
         console.error("Failed during initial data load and render:", error);
         // Display error message to user?
     }
}

// --- Initial Load ---
document.addEventListener('DOMContentLoaded', loadAllDataAndRender);