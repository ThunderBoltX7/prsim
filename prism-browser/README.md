# Prism Browser

<p align="center">
  <strong>A fast, ambient, and AI-powered web browser engineered for focus, fluidity, and privacy.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.35.8-blue.svg" alt="Version 1.35.8" />
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg" alt="Platform" />
  <img src="https://img.shields.io/badge/electron-45.3.2-47848F.svg" alt="Electron" />
  <img src="https://img.shields.io/badge/license-Apache--2.0-green.svg" alt="License" />
</p>

---

##  Overview

**Prism** (evolved from the Drift interface) is a lightweight, modern web browser built on top of Electron. Designed from the ground up to minimize digital noise, Prism replaces bloated browser chrome with a clean, glassmorphic vertical tab sidebar, built-in AI copilot sidekick, dynamic ambient new tab, and native tracker protection.

Whether you're doing in-depth research, coding, or everyday browsing, Prism gets out of your way and provides native intelligence right at your fingertips.

---

##  Key Features

###  Built-in AI Sidekick (Multi-Provider Copilot)
- **Universal LLM Support**: Connect to **OpenAI** (`gpt-4o-mini`, `gpt-4o`), **Groq** (lightning-fast Llama 3.1), **OpenRouter**, or local **Ollama** (`llama3`, `mistral`) for 100% private, offline AI.
- **Webpage Context Awareness**: Prism can pass the contents of your active tab directly to the AI, allowing instant summarization, code explanation, translation, or Q&A.
- **Dual Omnibox Mode**: Switch the omnibox between traditional **Web** browsing and **Ask AI** with a single click.
- **Streaming & Code Highlighting**: Enjoy real-time streamed responses formatted in rich Markdown with syntax-highlighted code snippets and copy buttons.

###  Modern Vertical Tab Sidebar
- **Ergonomic Vertical Tabs**: Read full page titles effortlessly with vertical tabs that make optimal use of widescreen displays.
- **Collapsible Sidebar (`Alt+B`)**: Collapse the tab bar into an ultra-slim icon rail or hide it completely for full immersion.
- **Task Groups & Workspaces**: Organize tabs into distinct contexts (e.g., Work, Research, Personal) without cluttering your view.

###  Personalized Ambient New Tab
- **Time-Aware Dynamic Greetings**: Personalized greeting adapted to the time of day ("*Rise and shine*", "*Coffee time?*", "*Working late?*").
- **Customizable Shortcuts Grid**: Chrome-style visual bookmark grid with automatic high-resolution favicons, color-coded initials, and full edit/delete controls.
- **Distraction-Free Search**: Instant search bar with DuckDuckGo, Google, Bing, or your preferred search engine.

###  Ambient Design & Customization
- **Glassmorphic UI**: Frosted glass surfaces with adjustable background blur.
- **Custom Accent Colors**: Pick your favorite accent color to personalize highlights, borders, and buttons.
- **Dark & Light Mode**: Seamless one-click switching between dark and light themes (`Alt+T` or toggle button).
- **Calm Mode**: Soften animations and contrast for relaxed evening browsing.

###  Privacy & Speed by Default
- **Ad & Tracker Blocking**: Built-in filter lists (EasyList, EasyPrivacy) block ads and tracking scripts automatically before they load.
- **Automatic Reader View**: Strip away page clutter, ads, and formatting to read articles in clean typography.
- **No Telemetry**: Your browsing history, AI keys, and preferences stay strictly on your local machine.

---

## ⌨ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Alt + B` | Toggle / Collapse vertical tab sidebar |
| `Alt + T` / `Ctrl + T` | Open a new tab |
| `Ctrl + W` | Close the current tab |
| `Ctrl + Tab` / `Ctrl + Shift + Tab` | Cycle forward / backward through tabs |
| `Alt + D` | Toggle Downloads drawer |
| `Alt + ,` | Open Prism Settings modal |
| `Alt + Left` / `Alt + Right` | Back / Forward in history |
| `Ctrl + R` / `F5` | Reload active webview |
| `Ctrl + Alt + R` *(Dev Mode)* | Hot-reload browser interface |

---

##  Quick Start (Development Mode)

### Prerequisites
- [Node.js](https://nodejs.org/) (version 18, 20, or 22 recommended)
- `npm` (bundled with Node.js)
- Git

### Installation & Launch
```bash
# 1. Navigate to the project directory
cd min-master

# 2. Install all dependencies
npm install

# 3. Compile the frontend bundles
npm run build

# 4. Start Prism in development mode
npm run start
```

> **Tip**: While running in development mode, pressing `Ctrl + Alt + R` (`Opt + Cmd + R` on macOS) instantly refreshes the browser UI without restarting Electron.

---

##  How to Build a Windows `.exe` File & Installer

Prism includes automated packaging scripts that generate two types of Windows deliverables:
1. **Standalone Portable `.exe` (`Prism.exe`)**: Ready to run immediately from a folder without running any installer.
2. **Windows Setup Installer (`prism-1.35.8-setup.exe`)**: A complete Squirrel installer that installs Prism onto the system, creates Start Menu shortcuts, Desktop shortcuts, and registers Prism as a Windows web browser.
3. **Compressed Archive (`Prism-v1.35.8-windows.zip`)**: A portable zip package for distribution.

---

### Step-by-Step Build Instructions

#### Step 1: Ensure Dependencies are Installed
Open PowerShell or your preferred terminal in the `min-master` directory:
```powershell
npm install
```

#### Step 2: Compile the Project Bundles
Before packaging, compile the main process, browser scripts, CSS styles, and preload scripts:
```powershell
npm run build
```
*(This bundles `main.build.js`, `dist/bundle.js`, `dist/bundle.css`, and `dist/preload.js`)*.

---

#### Step 3: Run the Windows Build Script

You have two build options depending on your target architecture:

##### Option A: Build 64-bit Windows `.exe` & Installer (Recommended)
To build specifically for standard 64-bit Windows (`x64`):
```powershell
npm run buildWindows:x64
```
*Alternatively, you can run directly:*
```powershell
node ./scripts/buildWindows.js --arch=x64
```

##### Option B: Build Both x64 and ARM64
To package both architectures sequentially:
```powershell
npm run buildWindows
```

---

###  Where to Find the Output Files

Once the build finishes, all outputs are located in the `dist/app/` folder:

```text
min-master/
└── dist/
    └── app/
        ├── win-unpacked/                       <-- Standalone Unpacked Directory
        │   ├── Prism.exe                       <-- Standalone Portable Executable!
        │   ├── resources/
        │   ├── chrome-100-percent.pak
        │   └── ...
        │
        ├── prism-1.35.8-setup.exe              <-- Full Windows Setup Installer!
        │
        └── Prism-v1.35.8-windows.zip           <-- Portable Distributable Zip Archive
```

- **Run standalone directly**: Double-click `dist/app/win-unpacked/Prism.exe`.
- **Install on any Windows PC**: Run `dist/app/prism-1.35.8-setup.exe`.

---

###  Build System Details & Customization

- **Packaging Tool**: Uses `electron-builder` (configured in `scripts/createPackage.js`) to produce unpacked binaries.
- **Installer Tool**: Uses `electron-installer-windows` (configured in `scripts/buildWindows.js`) to generate Windows Squirrel setup packages.
- **Application Icons**: Located at `icons/icon256.ico`. To change the application icon, replace this file with your own `.ico`.
- **App Metadata**: Configured in `package.json`:
  ```json
  {
    "name": "prism",
    "productName": "Prism",
    "version": "1.35.8"
  }
  ```

---

### 🔧 Troubleshooting Windows Builds

- **Native Module Rebuild Errors**:
  `scripts/createPackage.js` has `npmRebuild: false` enabled by default to prevent issues with native canvas modules under modern Electron versions. Do not remove this flag unless you have full Visual Studio C++ Build Tools configured.
- **Missing Build Tools**:
  If building native dependencies on Windows, ensure you have Visual Studio C++ Build Tools installed:
  ```powershell
  npm install --global --production windows-build-tools
  ```
- **Permission Errors**:
  If an existing `Prism.exe` is currently running, the build script will not be able to overwrite the files. Make sure to close any running instances of Prism before rebuilding.

---

##  AI Configuration Guide

To configure the AI Sidekick:
1. Open Prism and click the **Settings** icon in the sidebar (or press `Alt + ,`).
2. Scroll to the **AI Copilot** section.
3. Choose your AI provider:
   - **OpenAI**: Enter your OpenAI API key (`sk-...`) and select your model (`gpt-4o-mini`, `gpt-4o`).
   - **Groq**: Enter your Groq API key and select `llama-3.1-8b-instant` or `llama-3.1-70b-versatile` for ultra-fast replies.
   - **OpenRouter**: Enter your OpenRouter key to access Claude, Mistral, Gemini, or Llama models.
   - **Ollama (Local & Private)**: Start Ollama on your machine (`ollama run llama3`). Keep the base URL as `http://localhost:11434/v1`. No API key required!
4. Customize your prompt length (concise vs. detailed) and context memory settings.

---

##  Project Architecture

```text
min-master/
├── css/                     # User interface styling & themes
│   ├── drift.css            # Prism ambient styles (glass, AI drawer, shortcuts)
│   ├── tokens.css           # Design tokens, variables & colors
│   └── ...
├── js/                      # Renderer process scripts
│   ├── driftUI.js           # Prism UI engine (AI copilot, greetings, shortcuts, themes)
│   ├── browserUI.js         # Core browser controls & tab views
│   └── default.js           # Browser renderer initialization
├── main/                    # Electron main process
│   ├── main.js              # Window creation, protocols & lifecycle
│   ├── registryConfig.js    # Windows default browser registry integration
│   └── viewManager.js       # WebContents and tab management
├── scripts/                 # Build and packaging automation
│   ├── buildMain.js         # Bundles main process
│   ├── buildBrowser.js      # Bundles renderer process
│   ├── buildWindows.js      # Windows installer & standalone packaging
│   └── createPackage.js     # Electron-builder configuration
├── index.html               # Main browser window HTML shell
└── package.json             # Project manifest & build scripts
```

---

##  License

Prism is open-source software licensed under the [Apache 2.0 License](LICENSE.txt).

Built with appreciation upon the [Min](https://github.com/minbrowser/min) browser foundation.
