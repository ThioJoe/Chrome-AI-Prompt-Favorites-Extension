# Prompt Favorites Chrome Extension

Quickly insert pre-saved text prompts into websites using the right-click menu. Configure target sites and input fields easily.

## Key Features

* **Save & Manage Prompts:** Create, edit, and delete your frequently used text snippets through the options page.
* **Site Configuration:** Define target websites using URL patterns (e.g., `https://*.example.com/*`) and specify the exact input field with XPath.
* **Context Menu Insertion:** Right-click within a configured text field on a target site to access and instantly insert your saved prompts.
* **Flexible Insertion Modes:** Choose for each prompt whether to **Replace** existing text, **Insert Before** it, or **Insert After** it.
* **Site-Specific Prompt Availability:** Easily select which prompts should appear in the context menu for each configured website via checkboxes in the options.
* **Import & Export:** Backup your complete list of prompts and site configurations to a JSON file, and restore them whenever needed.

## Screenshots
<p align="center"> <img width="749" src="https://github.com/user-attachments/assets/7b460765-6079-4826-b2c1-e2806576b299"> </p>
<p align="center"> <img width="749" alt="image" src="https://github.com/user-attachments/assets/0ed8870f-0e64-4adc-95a7-b8fa34d762f3" /> </p>


## Installation

1.  Download the extension files (ensure you have the directory containing `manifest.json`, `background.js`, `options.html`, and `options.js`).
2.  Open Google Chrome and navigate to `chrome://extensions/`.
3.  Enable **Developer mode** using the toggle switch, usually found in the top-right corner.
4.  Click the **Load unpacked** button.
5.  In the file selection dialog, navigate to and select the directory containing the extension's files.
6.  The "Prompt Favorites (Context Menu)" extension should now appear in your list of extensions.

## How to Access the Options
- If you have the extension pinned, you can right click its icon and click `Options`
- If it's not pinned, click the puzzle-piece icon at the top right of chrome, find the extension in the list, click the three dots, and click `Options`

## Finding the XPath for a Text Box

To tell the extension exactly where to insert text on a webpage, you need to provide its "XPath". Here's how to find it:

1.  Go to the website containing the text box you want to target.
2.  Click inside the text box (like a comment field, search bar, or AI prompt input) to make sure it's active or focused.
3.  Right-click directly on that text box element.
4.  Select **Inspect** or **Inspect Element** from the context menu that appears. This will open your browser's Developer Tools, usually highlighting the HTML code for that text box.
5.  In the Developer Tools panel, right-click on the highlighted line of HTML code.
6.  Go to the **Copy** sub-menu.
7.  Select **Copy full XPath** (Sometimes it might just say **Copy XPath** - either usually works, but "full XPath" is often more reliable).
8.  Paste this copied value into the **Target Element XPath** field when setting up a Site Configuration in the extension's options page.
