
# `webview-ui` Directory

This directory contains all of the code that is executed within the VS Code webview context (the UI for the extension). It serves as the frontend of the extension's webview interface.

## Structure

The webview UI is built using:
- React 18.2.0
- TypeScript
- Vite for build tooling

### Key Directories

- `/src` - Main source code
  - `/components` - React components
  - `/css` - Stylesheets
  - `/utilities` - Helper functions and utilities
  - `/common` - Shared code and constants
  - `/dcs` - DCS (Door43 Content Service) related code
  - `/fonts` - Custom fonts if needed

### Important Files

- `App.tsx` - Main React application component
- `index.tsx` - Application entry point
- `vite.config.ts` - Vite build configuration
- `tsconfig.json` - TypeScript configuration

## Development

The webview UI is managed using the pnpm package manager. To get started with development:

1. Navigate to the `webview-ui` directory

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Start the development server:
   ```bash
   pnpm dev
   ```

## Building

To build the webview UI for production:# `webview-ui` Directory

    ```bash
    bash pnpm build
    ```

The built files will be output to the `/build` directory.

