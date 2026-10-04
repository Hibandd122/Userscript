# ⚡ Userscript for Safari (iOS / iPadOS)

> A blazing-fast, pure, open-source **Userscript Manager** for Safari on iOS 15+.
> Built with SwiftUI & Safari Web Extension. Completely free of ads, tracking, bloatware, and paywalls.

[![Build Userscript IPA](https://github.com/USER/Userscript/actions/workflows/build.yml/badge.svg)](https://github.com/USER/Userscript/actions/workflows/build.yml)
[![Platform](https://img.shields.io/badge/platform-iOS%2015.0%2B-blue.svg)](https://apple.com)
[![Swift](https://img.shields.io/badge/Swift-5.0-orange.svg)](https://swift.org)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

---

## ✨ Features

- **🚀 Pure & Lightweight:** Clean binary (~2-4 MB), no third-party ads (ByteDance/CSJ), no video transcoding bloat, and zero telemetry (`Umeng`, `Bugsnag` stripped out).
- **🛡️ 100% Privacy Focused:** Operates completely offline. Your scripts and browsing data never leave your device.
- **⚡ Full Greasemonkey & Tampermonkey Compatibility:**
  - `GM_setValue`, `GM_getValue`, `GM_deleteValue`, `GM_listValues`
  - `GM_addStyle`, `GM_addElement`
  - `GM_xmlhttpRequest` (via background extension bridge for CORS bypass)
  - `GM_notification`, `GM_setClipboard`, `GM_openInTab`, `GM_registerMenuCommand`
  - Modern promise-based `GM.*` API support
- **🌐 1-Click Install:** Directly install scripts from GreasyFork, GitHub, or any raw `.user.js` URL with metadata preview (`@name`, `@match`, `@run-at`, `@grant`).
- **🧩 Safari Web Extension Integration:**
  - Live badge indicator showing active scripts on current tab
  - Popup menu to quickly toggle scripts per site
  - Support for `document-start`, `document-end`, and `document-idle` execution
- **🔓 Sideloading & Free Certificate Resilient:**
  - Built-in App Sandbox fallback: Will **never crash** on personal/free certificates or ESign where `group.com.*` App Groups are unavailable.

---

## 📱 How to Install

### Method 1: GitHub Actions Pre-built IPA (Recommended)
1. Go to the **Actions** tab or **Releases** page of this repository.
2. Download the latest `Userscript.ipa` artifact.
3. Install via:
   - **TrollStore** (iOS 14.0 - 17.0)
   - **ESign / Scarlet / GBox**
   - **AltStore / Sideloadly**

### Method 2: Build from Source with Xcode
```bash
git clone https://github.com/YOUR_USERNAME/Userscript.git
cd Userscript
open Userscript.xcodeproj
```
Select your connected iPhone/iPad and press **Run (Cmd + R)**.

---

## 🛠️ Safari Extension Activation

After installing the app on your device:
1. Open iOS **Settings** app.
2. Navigate to **Safari** → **Extensions**.
3. Enable **Userscript**.
4. Set permission to **Allow on All Websites**.

---

## 🏗️ Repository Architecture

```
Userscript/
├── .github/workflows/
│   └── build.yml               # Automated CI to build .ipa on macOS runner
├── Userscript/                 # Main iOS App (SwiftUI)
│   ├── App/                    # App lifecycle & entry
│   ├── Models/                 # UserScript & Metadata models
│   ├── Services/               # ScriptManager, Downloader, Parser
│   ├── Views/                  # List, Detail, Editor, Install, Settings
│   └── Resources/              # Assets, Info.plist, Entitlements
├── UserscriptExtension/        # Safari Web Extension (App Extension)
│   ├── SafariWebExtensionHandler.swift
│   └── Resources/              # manifest.json, gm-api.js, content.js, popup
└── Userscript.xcodeproj/       # Complete Xcode project configuration
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
