# Checking Tool

This is an implementation of the a [React](https://reactjs.org/) + [Vite](https://vitejs.dev/) + [Webview UI Toolkit](https://github.com/microsoft/vscode-webview-ui-toolkit) webview extension.

This extension will use a custom editor to open and display files with the `.tsv` extension and look at translation notes at the current
book, chapter, and verse.

<!-- ![A screenshot of the sample extension.](TODO: Screenshot) -->

## Documentation

For a deeper dive into how this sample works, read the guides below.

- [Extension structure](./docs/extension-structure.md)
- [Extension commands](./docs/extension-commands.md)
- [Extension development cycle](./docs/extension-development-cycle.md)

## Run The Sample
Follow the following steps to see the translation notes extension in action. Replace the `npm` with any package manager of your choice. The extension was developed with the `pnpm` package manager, so scripts in the `package.json` file will favor pnpm. 

1. Clone the checking-extension repository to test the extension in:
    ```bash
    git clone https://github.com/unfoldingWord-box3/checking-extension.git
    ```

2. After you have cloned checking-extension, to get the latest code for checking-extension stash any local changes and get latest by doing:
    ```bash
    git stash
    git pull
    ```
   

3. Install dependencies for both the extension and webview (Use the package manager of your choice. If you use pnpm, you can just run `pnpm install:all` in the root directory).

    - Install dependencies in root directory (if pnpm is not found, do `sudo npm install --global pnpm` to install)
    ```bash
    pnpm run install:all
    ```

4. Build the webview so that it renders on extension run

    a. If in the root directory, run:
    ```bash
    pnpm run build:webview
    ```
    
    b. If in the `webview-ui` directory, run:
    ```bash
    pnpm run build
    ```

5. Open vscode editor (using `code .` in the current directory or using the UI)

6. Press `F5` to open a new Extension Development Host window

7. Initialize a project
   a. Create a new project.  In vscode with no project open, press Command-Shift-P button on Mac or ? on Windows. and search for `Translation Checking Tool: Initialize Project`, then click on it and answer the prompts to create a new checking project.
   b. Add checking to an existing project (a folder that already has usfm files and manifest).  With vscode open to project folder, press Command-Shift-P button on Mac or ? on Windows. and search for `Translation Checking Tool: Initialize Project`, then click on it and answer the prompts to select gateway language.  It will create a checking folder and metadata.json.

8. In the checking/twl or checking/tn folders, click on any twl_check or tn_check file to see the checking tool in action!


