const promptList = document.getElementById('prompt-list');
const newTitleInput = document.getElementById('new-prompt-title');
const newContentInput = document.getElementById('new-prompt-content');
const saveButton = document.getElementById('save-new-prompt');
const statusDiv = document.getElementById('status');
const loadingLi = document.getElementById('loading-prompts');

// --- Functions ---

function displayStatus(message, isError = false) {
    statusDiv.textContent = message;
    statusDiv.style.color = isError ? 'red' : 'green';
    setTimeout(() => { statusDiv.textContent = ''; }, 3000); // Clear after 3 seconds
}

// Generate a simple unique ID (for demo purposes)
function generateId() {
    return `prompt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Tell background script to update context menu
function notifyBackgroundPage() {
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

async function loadPrompts() {
    promptList.innerHTML = ''; // Clear existing list
    try {
        const result = await chrome.storage.local.get('prompts');
        const prompts = result.prompts || [];

        if (loadingLi) loadingLi.remove(); // Remove loading indicator

        if (prompts.length === 0) {
            promptList.innerHTML = '<li>No prompts saved yet.</li>';
            return;
        }

        prompts.forEach((prompt, index) => {
            const li = document.createElement('li');
            li.className = 'prompt-item';
            li.dataset.id = prompt.id; // Store ID on the element

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
            promptList.appendChild(li);
        });

    } catch (error) {
        console.error("Error loading prompts:", error);
        promptList.innerHTML = '<li>Error loading prompts.</li>';
        displayStatus("Error loading prompts.", true);
    }
}

async function savePrompts(prompts) {
    try {
        await chrome.storage.local.set({ prompts: prompts });
        console.log("Prompts saved to storage.");
        notifyBackgroundPage(); // Update context menu after saving
    } catch (error) {
        console.error("Error saving prompts:", error);
        displayStatus("Error saving prompts.", true);
    }
}

async function addNewPrompt() {
    const title = newTitleInput.value.trim();
    const content = newContentInput.value.trim();

    if (!title || !content) {
        displayStatus("Both title and content are required.", true);
        return;
    }

    try {
        const result = await chrome.storage.local.get('prompts');
        const prompts = result.prompts || [];

        const newPrompt = {
            id: generateId(), // Assign a unique ID
            title: title,
            content: content
        };

        prompts.push(newPrompt);
        await savePrompts(prompts);

        // Clear form and reload list
        newTitleInput.value = '';
        newContentInput.value = '';
        displayStatus("Prompt saved successfully!");
        loadPrompts(); // Refresh the displayed list

    } catch (error) {
        console.error("Error adding prompt:", error);
        displayStatus("Error saving new prompt.", true);
    }
}

async function deletePrompt(id) {
    if (!confirm("Are you sure you want to delete this prompt?")) {
        return;
    }

    try {
        const result = await chrome.storage.local.get('prompts');
        let prompts = result.prompts || [];
        prompts = prompts.filter(p => p.id !== id); // Keep prompts that DON'T match the ID
        await savePrompts(prompts);
        displayStatus("Prompt deleted.");
        loadPrompts(); // Refresh list
    } catch (error) {
        console.error("Error deleting prompt:", error);
        displayStatus("Error deleting prompt.", true);
    }
}

async function saveEditedPrompt(id, liElement) {
    const editTitleInput = liElement.querySelector('.edit-title');
    const editContentInput = liElement.querySelector('.edit-content');
    const newTitle = editTitleInput.value.trim();
    const newContent = editContentInput.value.trim();

     if (!newTitle || !newContent) {
        alert("Both title and content are required."); // Use alert in edit context
        return;
    }

    try {
        const result = await chrome.storage.local.get('prompts');
        let prompts = result.prompts || [];
        const promptIndex = prompts.findIndex(p => p.id === id);

        if (promptIndex > -1) {
            prompts[promptIndex].title = newTitle;
            prompts[promptIndex].content = newContent;
            await savePrompts(prompts);
            displayStatus("Prompt updated successfully!");
            loadPrompts(); // Refresh list (this will also hide edit area)
        } else {
            alert("Error: Could not find prompt to update.");
        }
    } catch (error) {
         console.error("Error updating prompt:", error);
         alert("Error updating prompt.");
    }

}

// Simple HTML escaping
function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return unsafe;
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}


// --- Event Listeners ---
saveButton.addEventListener('click', addNewPrompt);

// Use event delegation for edit/delete/save-edit/cancel-edit buttons
promptList.addEventListener('click', (event) => {
    const target = event.target;
    const li = target.closest('.prompt-item'); // Find parent list item
    if (!li) return; // Click wasn't inside a prompt item

    const promptId = li.dataset.id;
    const editArea = li.querySelector('.edit-area');
    const viewArea = li.querySelectorAll(':scope > *:not(.edit-area)'); // Select direct children except edit-area


    if (target.classList.contains('btn-delete')) {
        deletePrompt(promptId);
    } else if (target.classList.contains('btn-edit')) {
        // Show edit area, hide view area
        viewArea.forEach(el => el.style.display = 'none');
        if(editArea) editArea.style.display = 'block';
    } else if (target.classList.contains('btn-cancel-edit')) {
         // Hide edit area, show view area
        if(editArea) editArea.style.display = 'none';
        viewArea.forEach(el => el.style.display = 'block'); // Or maybe just reloadPrompts()
    } else if (target.classList.contains('btn-save-edit')) {
        saveEditedPrompt(promptId, li);
    }
});


// --- Initial Load ---
document.addEventListener('DOMContentLoaded', loadPrompts);