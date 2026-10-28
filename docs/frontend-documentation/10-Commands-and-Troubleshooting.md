# Document 10: Commands and Troubleshooting Manual (Windows & PowerShell)

This guide documents every official command in the **PMS Frontend** workspace, how to execute them in Windows PowerShell, and how to resolve common development issues.

---

## 1. Official Scripts in `package.json`

The project defines the following npm scripts:

```json
"scripts": {
  "dev": "vite",
  "build": "tsc -b && vite build",
  "lint": "oxlint",
  "preview": "vite preview"
}
```

---

## 2. Step-by-Step Command Guide

### 1. Opening the Project in PowerShell
Launch **PowerShell** or **Windows Terminal** and change directory into the workspace root:
```powershell
cd "C:\Users\j\Music\PMS frontend"
```

---

### 2. Installing Dependencies (`npm install`)
If setting up the project on a new computer or after clearing `node_modules`:
```powershell
npm install
```
- **What it does**: Reads `package.json` and `package-lock.json` and downloads required packages (React, Lucide, Tailwind, Vite) into the `node_modules/` folder.
- **Expected Output**:
  ```text
  added 245 packages in 12s
  ```

---

### 3. Starting the Local Development Server (`npm run dev`)
To run the application with live hot-reloading:
```powershell
npm run dev
```
- **Expected Output**:
  ```text
    VITE v8.3.4  ready in 260 ms

    ➜  Local:   http://localhost:5173/
    ➜  Network: use --host to expose
    ➜  press h + enter to show help
  ```
- **How to view the app**: Open your browser and navigate to `http://localhost:5173/`.
- **How to stop the server**: Press `Ctrl + C` in the PowerShell terminal, then type `Y` and press `Enter`.

---

### 4. Running the TypeScript Type Check (`npx tsc --noEmit`)
To verify that all types, props, imports, and interfaces are valid:
```powershell
npx tsc --noEmit
```
- **What `--noEmit` means**: Tells the TypeScript compiler to perform strict type checking without writing compiled `.js` files to disk.
- **Expected Output**: **Silence (no output)**. In Unix and Windows command lines, an exit code of `0` with no error messages indicates 100% type safety pass.

---

### 5. Running the Production Build (`npm run build`)
To compile and bundle the application for production deployment:
```powershell
npm run build
```
- **What it executes**:
  1. `tsc -b`: Type checks all project references.
  2. `vite build`: Transforms, bundles, and minifies the code into the `dist/` directory.
- **Real Output from this project**:
  ```text
  > pms-frontend@0.0.0 build
  > tsc -b && vite build

  vite v8.3.5 building client environment for production...
  transforming...
  ✓ 1943 modules transformed.
  rendering chunks...
  computing gzip size...
  dist/index.html                   0.49 kB │ gzip:   0.32 kB
  dist/assets/index-CRsMmobA.css   48.56 kB │ gzip:   8.80 kB
  dist/assets/index-BhJSv4gL.js   460.59 kB │ gzip: 112.18 kB
  ✓ built in 4.12s
  ```
- **Result**: Creates optimized, minified files in `C:\Users\j\Music\PMS frontend\dist\`.

---

### 6. Previewing the Production Build (`npm run preview`)
To test the generated production bundle locally before deploying:
```powershell
npm run preview
```
- **Expected Output**:
  ```text
    ➜  Local:   http://localhost:4173/
  ```

---

### 7. Running the High-Speed Linter (`npm run lint`)
To analyze the codebase for syntax problems or unused variables:
```powershell
npm run lint
```
- **Tool used**: `oxlint` (`^1.88.0`), a high-performance Rust-based linter.

---

## 3. Common Problems and How to Solve Them

### Problem 1: Port 5173 Is Already in Use
- **Symptom**: You run `npm run dev` and Vite displays `http://localhost:5174/` or throws `EADDRINUSE`.
- **Cause**: An earlier Vite dev server process is still running in the background.
- **Solution**:
  - Vite automatically selects the next available port (`5174`, `5175`). Simply open that URL in your browser.
  - Or terminate running Node processes in PowerShell:
    ```powershell
    Get-Process node | Stop-Process -Force
    ```

---

### Problem 2: PowerShell Script Execution Policy Error
- **Symptom**: Running `npm` or `npx` throws:
  `File ... cannot be loaded because running scripts is disabled on this system.`
- **Cause**: Windows PowerShell restricts execution of unsigned scripts by default.
- **Solution**: Temporarily bypass the policy for the current terminal session:
  ```powershell
  Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
  ```

---

### Problem 3: Blank White Screen in Browser
- **Symptom**: Browser opens `http://localhost:5173/`, but displays an empty white page.
- **How to Diagnose**:
  1. Press `F12` (or right-click anywhere and select **Inspect**).
  2. Click on the **Console** tab.
  3. Look for red error messages.
- **Common Causes**:
  - A runtime JavaScript error (such as reading a property of `undefined`).
  - An incorrect file path in an import statement.

---

### Problem 4: Git Push Fails with "Could not resolve host: github.com"
- **Symptom**: `fatal: unable to access 'https://github.com/...': Could not resolve host: github.com`
- **Cause**: The computer is currently offline, DNS resolution failed, or a corporate proxy is blocking network access.
- **Solution**: Check your internet connection. Once reconnected, retry:
  ```powershell
  git push origin main
  ```
