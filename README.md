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

```bash
# Install dependencies for both the extension and webview UI source code
pnpm run install:all

# Build webview UI source code
pnpm run build:webview

# Open sample in VS Code
code .
```

Once the sample is open inside VS Code you can run the extension by doing the following:

1. Press `F5` to open a new Extension Development Host window
2. Inside the host window, open the command palette (`Ctrl+Shift+P` or `Cmd+Shift+P` on Mac) and type `Show Translation Notes`
