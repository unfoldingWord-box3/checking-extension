# Checking Tool

A VS Code extension for translation checking workflows, implemented with [React](https://reactjs.org/), [TypeScript](https://www.typescriptlang.org/), and the [VS Code Webview UI Toolkit](https://github.com/microsoft/vscode-webview-ui-toolkit).

This extension provides a custom editor for `.twl_check` and `.tn_check` files, offering an interactive interface for checking translated scripture against gateway languages.

## Features

- Custom editor interface for translation checking
- Support for Translation Words List (TWL) and Translation Notes (TN) checking
- Project initialization wizard
- Multiple language support

## Installation

You can install the extension in one of two ways:

### From VSIX File

- Via Command Line:
  ```bash
  code --install-extension checking-extension.vsix
  ```

- Via VS Code UI:
  1. Open VS Code
  2. Go to Extensions view
  3. Click "..." in the top-right corner
  4. Select "Install from VSIX..."
  5. Navigate to and select the VSIX file

## Development Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/unfoldingWord-box3/checking-extension.git
   cd checking-extension
   ```

2. **Install dependencies:**
   ```bash
   # Using pnpm (recommended)
   pnpm install:all
   
   # Using yarn
   yarn run install:all
   
   # Using npm
   npm run install:all
   ```

3. **Build the extension:**
   ```bash
   # Using pnpm (recommended)
   pnpm run build:all-debug
   
   # Using yarn
   yarn run build:all-debug
   
   # Using npm
   npm run build:all-debug
   ```

4. **Run the extension:**
   - Press `F5` in VS Code to launch a new Extension Development Host window

## Using the Extension

### Initializing a Project

1. **For a new project:**
   - Open VS Code with no project open
   - Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
   - Search for `Translation Checking Tool: Initialize Project`
   - Follow the prompts to create a new checking project

2. **For an existing project with USFM files:**
   - Open the project folder in VS Code
   - Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
   - Search for `Translation Checking Tool: Initialize Project`
   - Follow the prompts to select a gateway language
   - This will create a checking folder and metadata.json

3. **Using the checking tool:**
   - Navigate to `checking/twl` or `checking/tn` folders
   - Open any `.twl_check` or `.tn_check` file to see the checking tool in action

### Adding New Locales

1. Copy locale files from translationWords to `src/data/locales`
2. Run the test to integrate the localization:
   ```bash
   yarn run test:unit
   ```
   This will compile all the JSON locale files into `locales.ts`

## Packaging the Extension
```
bash
# Using pnpm (recommended)
pnpm run pre-package:webview
pnpm run install:extension
pnpm run package:extension

# Using yarn
yarn run pre-package:webview
yarn run install:extension
yarn run package:extension

# Using npm
npm run pre-package:webview
npm run install:extension
npm run package:extension
```
## Project Structure

- **Main Extension Code:**
  - `src/CheckingProvider.ts` - Custom editor provider and backend functionality
  - register - commands are declared here
  - "checking-extension.launchWorkflow" - walks the user through creating a new checking project
  - createGlCheck - create a new checking project to check translation against a gateway language.
  - messageEventHandlers - handles all the messages from the webview
  - resolveCustomTextEditor - Loads and renders a custom text editor for the checking document
    - getCheckingResources - loads checking document and the related checking resources
  - doRepoInitAll - creates new checking project
  - `src/extension.ts` - Extension activation and registration

- **Webview UI:**
  - `webview-ui/src/components/TranslationCheckingView.tsx` - Main component wrapper with authentication
    - handleMessage - Handles incoming message events from backend
        - update - handler for when client side has loaded the checking data.  This is in response to sendFirstLoadMessage() being called when view is opened

  - `webview-ui/src/components/TranslationCheckingPane.tsx` - UI implementation using checking-tool-rcl

- **Utilities:**
  - `src/utilities/resourceUtils.ts` - Business logic for loading checking resources
  - `src/utilities/fileUtils.ts` - File management utilities
  - `src/utilities/gitUtils.ts` - Git interaction utilities

## License

See the [LICENSE](LICENSE) file for details.
```
