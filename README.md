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

1. Clone the translation-project repository to test the extension in:
    ```bash
    git clone https://github.com/unfoldingWord-box3/checking-extension.git
    ```

2. Install dependencies for both the extension and webview (Use the package manager of your choice. If you use pnpm, you can just run `pnpm install:all` in the root directory).

    a. Install dependencies in root directory (if pnpm is not found, do `sudo npm install --global pnpm` to install)
    ```bash
    pnpm run install:all
    ```

3. Build the webview so that it renders on extension run

    a. If in the root directory, run:
    ```bash
    pnpm run build:webview
    ```
    
    b. If in the `webview-ui` directory, run:
    ```bash
    pnpm run build
    ```

4. Open vscode editor (using `code .` in the current directory or using the UI)

5. Press `F5` to open a new Extension Development Host window

6. Create a new project.  First press Command-Shift-P button on Mac or ? on Windows. and search for `Translation Checking Tool: Initialize Project`, then click on it and answer the prompts to create a new checking project.

7. Click on any twl_check or tn_check file to see the checking tool in action!


