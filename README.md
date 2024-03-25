# Translation Note Viewer

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

1. Clone the repository:
    ```bash
    git clone https://github.com/kintsoogi/translation-notes-extension.git
    ```

2. Clone the translation-project repository to test the extension in:
    ```bash
    git clone https://github.com/ryderwishart/translation-project
    ```

3. Change the `launch.json` file under the `.vscode` extension so that it opens this project on debugging:
  a. Under the `configurations` property, change the `args` property to open to the path where you downloaded translation-project:
      ```json
      "args": [
        "--extensionDevelopmentPath=${workspaceFolder}",
        "--folder-uri",
        "file:///[INSERT PATH TO TRANSLATION-PROJECT HERE]"
      ],
      ```
      For example:
      ```json
      "args": [
        "--extensionDevelopmentPath=${workspaceFolder}",
        "--folder-uri",
        "file:///home/john-doe/code/translation-project"
      ],
      ```

4. Install dependencies for both the extension and webview (Use the package manager of your choice. If you use pnpm, you can just run `pnpm install:all` in the root directory).

    a. Install root directory dependencies
    ```bash
    npm install
    ```
    b. Move to the `webview-ui` directory and install dependencies
    ```bash
    npm install
    ```

5. Build the webview so that it renders on extension run

    a. If in the root directory, run:
    ```bash
    npm build:webview
    ```
    
    b. If in the `webview-ui` directory, run:
    ```bash
    npm run build
    ```

6. Open vscode editor (using `code .` in the current directory or using the UI)

7. Press `F5` to open a new Extension Development Host window

8. In the translation-project file directory, navigate to `.project/resources/en_tn`

9. Click on any TSV file to see the translation notes viewer in action!


