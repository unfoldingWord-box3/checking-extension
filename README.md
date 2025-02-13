# Checking Tool

This is an implementation of a [React](https://reactjs.org/) + [Vite](https://vitejs.dev/) + [Webview UI Toolkit](https://github.com/microsoft/vscode-webview-ui-toolkit) vs-code webview extension.

This extension will use a custom editor to open files with the `twl_check` or `tn_check` extension and display a UI to do checking for book 

## Documentation

TODO

## Test the Extension
Follow the following steps to see the checking extension in action.

1. Install Extension from .vsix file:

   - You can install the .vsix file directly from the command line using:
         `code --install-extension my-extension-0.0.1.vsix`
   - Alternatively, you can install it from within VSCode by opening the Extensions view, clicking on the ... at the top-right, and selecting Install from VSIX.... Then navigate to your .vsix file and select it.

2. Build and test the extension. _Replace the `npm` with any package manager of your choice. The extension was developed with the `pnpm` package manager, so scripts in the `package.json` file will favor pnpm._

  a. Clone the checking-extension repository to test the extension in:

```bash
git clone https://github.com/unfoldingWord-box3/checking-extension.git
```

  b. After you have cloned checking-extension, to get the latest code for checking-extension stash any local changes and get latest by doing:
       ```bash
       git stash
       git pull
       ```

  c. Install dependencies for both the extension and webview (Use the package manager of your choice. If you use pnpm, you can just run `pnpm install:all` in the root directory).

```bash
yarn run install:all
```

  d. Build the extension and webview so that it renders on extension run

```bash
yarn run build:all-debug
```

  e. Open vscode editor (using `code .` in the current directory or using the UI)

  f. Press `F5` to open a new Extension Development Host window.  If you get error that the module could not be installed, try the following which should show the errors:

```bash
pnpm run build:all-debug
```

  g. Initialize a project:

      - Create a new project.  In vscode with no project open, press Command-Shift-P button on Mac or Control-Shift-P on Windows. and search for `Translation Checking Tool: Initialize Project`, then click on it and answer the prompts to create a new checking project.
      - Add checking to an existing project (a folder that already has usfm files and manifest).  With vscode open to project folder, press Command-Shift-P button on Mac or ? on Windows. and search for `Translation Checking Tool: Initialize Project`, then click on it and answer the prompts to select gateway language.  It will create a checking folder and metadata.json.

  h. In the checking/twl or checking/tn folders, click on any twl_check or tn_check file to see the checking tool in action!

  i. Adding New Locales - copy locales file from translationWords to `src\data\locales`. Then do `yarn run test:unit` which will run `locales.test.ts` to integrate current localization files into extension.  `locales.test.ts` compiles all the `.json` locale files into `locales.ts` which is used by the application.

