// DOM Elements (Unchanged from previous)
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

const exportButton = document.getElementById('export-button');
const importFileInput = document.getElementById('import-file');
const importButton = document.getElementById('import-button');
const statusIoDiv = document.getElementById('status-io');

// Storage Keys (Unchanged)
const PROMPTS_KEY = 'prompts';
const CONFIGS_KEY = 'siteConfigs';

// Global Cache & State (Unchanged)
let cachedConfigs = [];
let selectedImportFile = null;

// --- Utility Functions (Unchanged) ---
function displayStatus(element, message, isError = false, duration = 3000) { element.textContent = message; element.style.color = isError ? 'red' : 'green'; if (duration > 0) {setTimeout(() => { element.textContent = ''; }, duration);} }
function generateId(prefix = 'item') { return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`; }
function escapeHtml(unsafe) { if (typeof unsafe !== 'string') return unsafe; return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
function notifyBackgroundPage() { chrome.runtime.sendMessage({ action: "updateContextMenu" }, response => { if (chrome.runtime.lastError) { console.error("Error notifying background page:", chrome.runtime.lastError.message); } else if (response?.success) { console.log("Background page acknowledged context menu update."); } else { console.warn("Background page did not acknowledge context menu update."); } }); }


// --- Data Handling Functions (Unchanged) ---
async function loadItems(key, listElement, loadingElement, renderFunction, postLoadCallback = null) { /* ... */ listElement.innerHTML = ''; if (loadingElement) listElement.appendChild(loadingElement); try { const result = await chrome.storage.local.get(key); const items = result[key] || []; if (loadingElement) loadingElement.remove(); if (items.length === 0) { listElement.innerHTML = '<li>No items saved yet.</li>'; } else { items.forEach((item, index) => { const li = renderFunction(item, index); if (li instanceof Node) { listElement.appendChild(li); } else { console.warn("Render function did not return a valid DOM element for item:", item); } }); } if (postLoadCallback) { postLoadCallback(items); } return items; } catch (error) { console.error(`Error loading items for key "${key}":`, error); if (loadingElement) loadingElement.remove(); listElement.innerHTML = `<li>Error loading items. Details: ${error.message}</li>`; throw error; } }
async function saveItems(key, items, shouldNotify = true) { /* ... */ try { await chrome.storage.local.set({ [key]: items }); console.log(`Items saved to storage for key "${key}".`); if (shouldNotify) { notifyBackgroundPage(); } } catch (error) { console.error(`Error saving items for key "${key}":`, error); throw error; } }


// --- Prompt Specific Functions  ---

// Helper to create insert mode radio buttons
function createInsertModeRadios(promptId, selectedMode = 'replace', isEditArea = false) {
    const container = document.createElement('div');
    container.className = 'insert-mode-options';
    const radioName = isEditArea ? `edit_insert_mode_${promptId}` : `insert_mode_${promptId}`; // Unique name per prompt/context
    const modes = [
        { value: 'replace', label: 'Replace' },
        { value: 'insertBefore', label: 'Insert Before' },
        { value: 'insertAfter', label: 'Insert After' }
    ];

    const labelSpan = document.createElement('span');
    labelSpan.className = 'insert-mode-label';
    labelSpan.textContent = 'Insertion Mode:';
    container.appendChild(labelSpan);

    modes.forEach(mode => {
        const label = document.createElement('label');
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = radioName;
        radio.value = mode.value;
        radio.checked = (mode.value === selectedMode);
        // Add listener ONLY if it's NOT the edit area (edit area save handles it)
        // if (!isEditArea) {
        //     radio.addEventListener('change', handleInsertModeChange); // Direct change saving
        // }
        label.appendChild(radio);
        label.appendChild(document.createTextNode(` ${mode.label}`));
        container.appendChild(label);
    });
    return container;
}

function renderPrompt(prompt, index) {
    const li = document.createElement('li');
    li.className = 'list-item prompt-item';
    li.dataset.id = prompt.id;
    const currentInsertMode = prompt.insertMode || 'replace'; // Default to replace

    // --- NEW: Truncate content for preview ---
    const maxPreviewLength = 150; // Max characters for preview
    let previewContent = prompt.content || '';
    if (previewContent.length > maxPreviewLength) {
        previewContent = previewContent.substring(0, maxPreviewLength) + '...';
    }
    // --- End NEW ---

    // Basic prompt info - uses previewContent for the <pre> tag
    li.innerHTML = `
        <h3 class="prompt-title">${escapeHtml(prompt.title || `Prompt ${index + 1}`)}</h3>
        <pre class="prompt-content">${escapeHtml(previewContent)}</pre>
        <div class="insert-mode-display"></div>
        <div class="enabled-sites-container"></div>
        <button class="btn-edit">Edit</button>
        <button class="btn-delete">Delete</button>
        <div class="edit-area">
            <label>Edit Title:</label>
            <input type="text" class="edit-title" value="${escapeHtml(prompt.title || '')}">
            <label>Edit Content:</label>
            {/* Use the FULL, non-truncated content in the edit textarea */}
            <textarea class="edit-content">${escapeHtml(prompt.content || '')}</textarea>
            {/* Insertion mode radios for EDIT AREA added here */}
            <div class="insert-mode-edit"></div>
            <button class="btn-save-edit">Save Changes</button>
            <button class="btn-cancel-edit">Cancel</button>
        </div>
    `;

    // Render and Insert Insertion Mode Radios (View Mode)
    const insertModeDisplayContainer = li.querySelector('.insert-mode-display');
    const viewRadios = createInsertModeRadios(prompt.id, currentInsertMode, false);
    viewRadios.querySelectorAll('input[type="radio"]').forEach(radio => {
        radio.addEventListener('change', handleInsertModeChange);
    });
    insertModeDisplayContainer.appendChild(viewRadios);

    // Render and Insert Insertion Mode Radios (Edit Mode)
    const insertModeEditContainer = li.querySelector('.insert-mode-edit');
    const editRadios = createInsertModeRadios(prompt.id, currentInsertMode, true);
    insertModeEditContainer.appendChild(editRadios);


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
            checkbox.dataset.configId = config.id;
            checkbox.checked = prompt.enabledSites ? (prompt.enabledSites[config.id] !== false) : true;
            checkbox.addEventListener('change', handleEnabledSiteChange);
            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(` ${escapeHtml(config.name || config.urlPattern)}`));
            siteLi.appendChild(label);
            list.appendChild(siteLi);
        });
        sitesContainer.appendChild(list);
    } else {
         sitesContainer.innerHTML = '<span class="help-text">No sites configured yet.</span>';
    }

    return li;
}

async function handleEnabledSiteChange(event) { /* (Unchanged logic) */ const checkbox = event.target; const configId = checkbox.dataset.configId; const isEnabled = checkbox.checked; const promptLi = checkbox.closest('.prompt-item'); const promptId = promptLi.dataset.id; console.log(`Toggling prompt ${promptId} for config ${configId} to ${isEnabled}`); try { const result = await chrome.storage.local.get(PROMPTS_KEY); let prompts = result[PROMPTS_KEY] || []; const promptIndex = prompts.findIndex(p => p.id === promptId); if (promptIndex > -1) { if (!prompts[promptIndex].enabledSites) { prompts[promptIndex].enabledSites = {}; } prompts[promptIndex].enabledSites[configId] = isEnabled; await saveItems(PROMPTS_KEY, prompts, false); displayStatus(statusPromptDiv, "Enablement status updated."); notifyBackgroundPage(); } else { console.error("Could not find prompt to update enablement status."); } } catch (error) { displayStatus(statusPromptDiv, "Error updating enablement status.", true); } }

async function handleInsertModeChange(event) {
    const radio = event.target;
    const newMode = radio.value;
    const promptLi = radio.closest('.prompt-item');
    const promptId = promptLi.dataset.id;

    console.log(`Changing insert mode for prompt ${promptId} to ${newMode}`);

    try {
        const result = await chrome.storage.local.get(PROMPTS_KEY);
        let prompts = result[PROMPTS_KEY] || [];
        const promptIndex = prompts.findIndex(p => p.id === promptId);

        if (promptIndex > -1) {
            prompts[promptIndex].insertMode = newMode;
            await saveItems(PROMPTS_KEY, prompts); // Save and notify background
            displayStatus(statusPromptDiv, "Insertion mode updated.");
        } else {
             console.error("Could not find prompt to update insertion mode.");
             displayStatus(statusPromptDiv, "Error finding prompt to update mode.", true);
        }
    } catch (error) {
         displayStatus(statusPromptDiv, "Error saving insertion mode.", true);
    }
}

async function addNewPrompt() {
    const title = newPromptTitleInput.value.trim(); // Keep trim for title
    // const content = newPromptContentInput.value.trim(); // REMOVED .trim() for content
    const content = newPromptContentInput.value; // Get raw value including trailing whitespace/newlines
    const insertMode = document.querySelector('input[name="new_insert_mode"]:checked')?.value || 'replace';

    // Still check if title is empty, but allow content that is only whitespace/newlines
    if (!title) {
        displayStatus(statusPromptDiv, "Prompt Title is required.", true);
        return;
    }
     // Check if content is completely empty (useful to prevent saving truly blank prompts)
     // Allow saving if it contains only whitespace/newlines as requested
     if (content === '') {
          displayStatus(statusPromptDiv, "Prompt Text cannot be completely empty.", true);
          return;
     }


    try {
        const result = await chrome.storage.local.get(PROMPTS_KEY);
        const prompts = result[PROMPTS_KEY] || [];
        const initialEnabledSites = {};
        cachedConfigs.forEach(config => { initialEnabledSites[config.id] = true; });

        const newPrompt = {
            id: generateId('prompt'),
            title: title, // Trimmed title
            content: content, // Raw content (preserving trailing newlines)
            insertMode: insertMode,
            enabledSites: initialEnabledSites
        };

        prompts.push(newPrompt);
        await saveItems(PROMPTS_KEY, prompts);

        // Clear form
        newPromptTitleInput.value = '';
        newPromptContentInput.value = '';
        document.querySelector('input[name="new_insert_mode"][value="replace"]').checked = true;
        displayStatus(statusPromptDiv, "Prompt saved successfully!");
        await loadItems(PROMPTS_KEY, promptList, loadingPromptsLi, renderPrompt); // Refresh list
    } catch (error) {
        displayStatus(statusPromptDiv, "Error saving new prompt.", true);
    }
}

async function deletePrompt(id) { /* (Unchanged logic) */ if (!confirm("Are you sure you want to delete this prompt?")) return; try { const result = await chrome.storage.local.get(PROMPTS_KEY); let prompts = result[PROMPTS_KEY] || []; prompts = prompts.filter(p => p.id !== id); await saveItems(PROMPTS_KEY, prompts); displayStatus(statusPromptDiv, "Prompt deleted."); await loadItems(PROMPTS_KEY, promptList, loadingPromptsLi, renderPrompt); } catch (error) { displayStatus(statusPromptDiv, "Error deleting prompt.", true); } }

async function saveEditedPrompt(id, liElement) {
    const editTitleInput = liElement.querySelector('.edit-title');
    const editContentInput = liElement.querySelector('.edit-content');
    const editInsertMode = liElement.querySelector(`input[name="edit_insert_mode_${id}"]:checked`)?.value || 'replace';

    const newTitle = editTitleInput.value.trim(); // Keep trim for title
    // const newContent = editContentInput.value.trim(); // REMOVED .trim() for content
    const newContent = editContentInput.value; // Get raw value

    // Validation
    if (!newTitle) {
        alert("Prompt Title is required.");
        return;
    }
     if (newContent === '') {
        alert("Prompt Text cannot be completely empty.");
        return;
    }

    try {
        const result = await chrome.storage.local.get(PROMPTS_KEY);
        let prompts = result[PROMPTS_KEY] || [];
        const promptIndex = prompts.findIndex(p => p.id === id);

        if (promptIndex > -1) {
            prompts[promptIndex].title = newTitle; // Trimmed title
            prompts[promptIndex].content = newContent; // Raw content
            prompts[promptIndex].insertMode = editInsertMode;
            await saveItems(PROMPTS_KEY, prompts);
            displayStatus(statusPromptDiv, "Prompt updated successfully!");
            await loadItems(PROMPTS_KEY, promptList, loadingPromptsLi, renderPrompt); // Refresh list
        } else {
            alert("Error: Could not find prompt to update.");
        }
    } catch (error) {
         alert("Error updating prompt.");
    }
}


// --- Site Configuration Specific Functions (Unchanged) ---
function renderConfig(config, index) { /* (Unchanged logic) */ const li = document.createElement('li'); li.className = 'list-item config-item'; li.dataset.id = config.id; li.innerHTML = `<h3>${escapeHtml(config.name || `Configuration ${index + 1}`)}</h3><label>URL Pattern:</label><code>${escapeHtml(config.urlPattern || '')}</code><label>XPath:</label><code>${escapeHtml(config.xpath || '')}</code><button class="btn-edit">Edit</button><button class="btn-delete">Delete</button><div class="edit-area"><label>Edit Name:</label><input type="text" class="edit-name" value="${escapeHtml(config.name || '')}"><label>Edit URL Pattern:</label><input type="text" class="edit-url" value="${escapeHtml(config.urlPattern || '')}"><label>Edit XPath:</label><input type="text" class="edit-xpath" value="${escapeHtml(config.xpath || '')}"><button class="btn-save-edit">Save Changes</button><button class="btn-cancel-edit">Cancel</button></div>`; return li; }
async function addNewConfig() { /* (Unchanged logic - already updates prompts) */ const name = newConfigNameInput.value.trim(); const urlPattern = newConfigUrlInput.value.trim(); const xpath = newConfigXpathInput.value.trim(); if (!urlPattern || !xpath) { displayStatus(statusConfigDiv, "URL Pattern and XPath are required.", true); return; } if (!urlPattern.includes('*') && !urlPattern.startsWith('http://') && !urlPattern.startsWith('https://')) { if (!confirm(`The URL pattern "${urlPattern}" doesn't look like a standard match pattern (e.g., https://*.example.com/*). Save anyway?`)) { return; } } try { const configResult = await chrome.storage.local.get(CONFIGS_KEY); const configs = configResult[CONFIGS_KEY] || []; const newConfig = { id: generateId('config'), name: name, urlPattern: urlPattern, xpath: xpath }; configs.push(newConfig); await saveItems(CONFIGS_KEY, configs, false); const promptResult = await chrome.storage.local.get(PROMPTS_KEY); let prompts = promptResult[PROMPTS_KEY] || []; prompts = prompts.map(prompt => { if (!prompt.enabledSites) { prompt.enabledSites = {}; } prompt.enabledSites[newConfig.id] = true; return prompt; }); await saveItems(PROMPTS_KEY, prompts, false); newConfigNameInput.value = ''; newConfigUrlInput.value = ''; newConfigXpathInput.value = ''; displayStatus(statusConfigDiv, "Site configuration saved!"); await loadAllDataAndRender(); notifyBackgroundPage(); } catch (error) { displayStatus(statusConfigDiv, "Error saving new configuration.", true); } }
async function deleteConfig(id) { /* (Unchanged logic - already updates prompts) */ if (!confirm("Are you sure you want to delete this site configuration? This will also remove its enablement status from all prompts.")) return; try { const configResult = await chrome.storage.local.get(CONFIGS_KEY); let configs = configResult[CONFIGS_KEY] || []; configs = configs.filter(c => c.id !== id); await saveItems(CONFIGS_KEY, configs, false); const promptResult = await chrome.storage.local.get(PROMPTS_KEY); let prompts = promptResult[PROMPTS_KEY] || []; prompts = prompts.map(prompt => { if (prompt.enabledSites && prompt.enabledSites.hasOwnProperty(id)) { delete prompt.enabledSites[id]; } return prompt; }); await saveItems(PROMPTS_KEY, prompts, false); displayStatus(statusConfigDiv, "Configuration deleted."); await loadAllDataAndRender(); notifyBackgroundPage(); } catch (error) { displayStatus(statusConfigDiv, "Error deleting configuration.", true); } }
async function saveEditedConfig(id, liElement) { /* (Unchanged logic) */ const editNameInput = liElement.querySelector('.edit-name'); const editUrlInput = liElement.querySelector('.edit-url'); const editXpathInput = liElement.querySelector('.edit-xpath'); const newName = editNameInput.value.trim(); const newUrl = editUrlInput.value.trim(); const newXpath = editXpathInput.value.trim(); if (!newUrl || !newXpath) { alert("URL Pattern and XPath are required."); return; } try { const result = await chrome.storage.local.get(CONFIGS_KEY); let configs = result[CONFIGS_KEY] || []; const configIndex = configs.findIndex(c => c.id === id); if (configIndex > -1) { configs[configIndex].name = newName; configs[configIndex].urlPattern = newUrl; configs[configIndex].xpath = newXpath; await saveItems(CONFIGS_KEY, configs); displayStatus(statusConfigDiv, "Configuration updated successfully!"); await loadItems(CONFIGS_KEY, configList, loadingConfigsLi, renderConfig); await loadItems(PROMPTS_KEY, promptList, loadingPromptsLi, renderPrompt); /* Reload prompts too in case name changed */ } else { alert("Error: Could not find configuration to update."); } } catch (error) { alert("Error updating configuration."); } }


// --- Import/Export Functions (Unchanged) ---
async function handleExport() { /* ... */ console.log("Exporting settings..."); displayStatus(statusIoDiv, "Exporting...", false, 0); try { const results = await chrome.storage.local.get([PROMPTS_KEY, CONFIGS_KEY]); const promptsToExport = results[PROMPTS_KEY] || []; const configsToExport = results[CONFIGS_KEY] || []; const settingsObject = { version: 1, createdAt: new Date().toISOString(), prompts: promptsToExport, siteConfigs: configsToExport }; const jsonString = JSON.stringify(settingsObject, null, 2); const blob = new Blob([jsonString], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `prompt-favorites-settings_${new Date().toISOString().split('T')[0]}.json`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); console.log("Settings exported successfully."); displayStatus(statusIoDiv, "Settings exported successfully!"); } catch (error) { console.error("Error exporting settings:", error); displayStatus(statusIoDiv, `Error exporting settings: ${error.message}`, true); } }
function handleFileSelect(event) { /* ... */ selectedImportFile = event.target.files[0]; if (selectedImportFile) { console.log("File selected for import:", selectedImportFile.name); displayStatus(statusIoDiv, `File selected: ${selectedImportFile.name}`, false); } else { displayStatus(statusIoDiv, "File selection cancelled.", true); } }
async function handleImport() { /* ... */ if (!selectedImportFile) { displayStatus(statusIoDiv, "Please select a file to import first.", true); return; } if (!confirm("Are you sure you want to import settings?\nThis will OVERWRITE all your current prompts and site configurations.")) { displayStatus(statusIoDiv, "Import cancelled.", true); return; } console.log("Starting import process..."); displayStatus(statusIoDiv, "Importing...", false, 0); const reader = new FileReader(); reader.onload = async (event) => { try { const jsonString = event.target.result; const importedSettings = JSON.parse(jsonString); if (typeof importedSettings !== 'object' || importedSettings === null) { throw new Error("Imported file is not a valid JSON object."); } if (!Array.isArray(importedSettings.prompts) || !Array.isArray(importedSettings.siteConfigs)) { if (Array.isArray(importedSettings[PROMPTS_KEY]) && Array.isArray(importedSettings[CONFIGS_KEY])) { console.warn("Imported file might be an older format (missing version/top-level keys), attempting to import structure directly."); importedSettings.prompts = importedSettings[PROMPTS_KEY]; importedSettings.siteConfigs = importedSettings[CONFIGS_KEY]; } else { throw new Error("Imported JSON is missing required 'prompts' or 'siteConfigs' arrays."); } } await saveItems(PROMPTS_KEY, importedSettings.prompts, false); await saveItems(CONFIGS_KEY, importedSettings.siteConfigs, false); console.log("Settings imported successfully. Reloading UI..."); displayStatus(statusIoDiv, "Settings imported successfully! Reloading..."); await loadAllDataAndRender(); notifyBackgroundPage(); selectedImportFile = null; importFileInput.value = ''; displayStatus(statusIoDiv, "Import complete!"); } catch (error) { console.error("Error during import:", error); displayStatus(statusIoDiv, `Import failed: ${error.message}`, true); selectedImportFile = null; importFileInput.value = ''; } }; reader.onerror = (event) => { console.error("Error reading file:", event.target.error); displayStatus(statusIoDiv, `Error reading file: ${event.target.error}`, true); selectedImportFile = null; importFileInput.value = ''; }; reader.readAsText(selectedImportFile); }


// --- Event Listeners Setup (Unchanged) ---
savePromptButton.addEventListener('click', addNewPrompt);
saveConfigButton.addEventListener('click', addNewConfig);
exportButton.addEventListener('click', handleExport);
importButton.addEventListener('click', handleImport);
importFileInput.addEventListener('change', handleFileSelect);
function setupListEventListeners(listElement, deleteFunction, saveEditFunction) { listElement.addEventListener('click', (event) => { const target = event.target; const li = target.closest('.list-item'); if (!li) return; const itemId = li.dataset.id; const editArea = li.querySelector('.edit-area'); const viewAreaElements = Array.from(li.children).filter(el => !el.classList.contains('edit-area')); if (target.classList.contains('btn-delete')) { deleteFunction(itemId); } else if (target.classList.contains('btn-edit')) { viewAreaElements.forEach(el => el.style.display = 'none'); if(editArea) editArea.style.display = 'block'; } else if (target.classList.contains('btn-cancel-edit')) { if(editArea) editArea.style.display = 'none'; viewAreaElements.forEach(el => el.style.display = 'block'); } else if (target.classList.contains('btn-save-edit')) { saveEditFunction(itemId, li); } }); }
setupListEventListeners(promptList, deletePrompt, saveEditedPrompt);
setupListEventListeners(configList, deleteConfig, saveEditedConfig);


// --- Initial Load Function (Unchanged) ---
async function loadAllDataAndRender() { console.log("Loading all data and rendering..."); try { cachedConfigs = await loadItems(CONFIGS_KEY, configList, loadingConfigsLi, renderConfig); await loadItems(PROMPTS_KEY, promptList, loadingPromptsLi, renderPrompt); console.log("Data loaded and rendered."); } catch(error) { console.error("Failed during initial data load and render:", error); } }

// --- Initial Load ---
document.addEventListener('DOMContentLoaded', loadAllDataAndRender);