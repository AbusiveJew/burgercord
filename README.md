# 🍔 Burgercord

[![GitHub Release](https://img.shields.io/github/v/release/mrvonderplanitz/burgercord?style=for-the-badge&color=F09C1F&label=Release)](https://github.com/mrvonderplanitz/burgercord/releases)
[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg?style=for-the-badge)](LICENSE)

A high-performance, token-hardened Discord client modification with low-latency call optimization, anti-token-grabber defense, custom burger branding, and automatic boot updates.

---

## ⚡ What makes Burgercord different?

Unlike standard client mods, **Burgercord** comes with built-in performance and security improvements:

### 🛡️ Token Grabber Defense
- **Two-File Encrypted Vault**: Your login token is encrypted on disk across two separate directories using machine-bound PBKDF2-SHA256 and AES-256-GCM. Stealers querying default LevelDB paths or scraping storage cannot read it.
- **Call-Stack Verification**: Injected scripts, malicious userscripts, and console snippets are blocked when trying to invoke `TokenStore.getToken()` or `localStorage.getItem("token")`.
- **Anti-Scraper Guard**: Hooks `webpackChunkdiscord_app.push` to block rogue chunk injections commonly used by grabbers.
- **Integrity Monitor & Auto-Healing**: Watches Discord's `discord_desktop_core/index.js` in real-time and automatically repairs it if malware tries to inject webhooks.

### 🚀 Low-Latency Call & Client Optimizations
- **Dynamic Call QoS Booster**: Automatically disables Chromium background throttling and elevates Discord's OS process priority to **Above Normal** during active calls.
- **Speaking-Ring Transition Throttling**: Pauses high-frequency CSS animations for avatar speaking rings when the window is hidden or unfocused, saving CPU and GPU cycles.
- **Solo Call Disconnect Prevention**: Eliminates Discord's automatic 3-minute disconnect timer when you are alone in a voice channel.
- **Flux Event Coalescing**: Reduces UI re-renders by throttling non-visible events (such as off-screen typing indicators) while Discord is minimized.

### 🔄 Zero-Touch Auto-Updates
- Checks for updates automatically on boot from GitHub Releases.
- Verified with SHA-256 checksums before applying updates atomically—no need to run installers over and over.

### 🍔 Burgercord Identity
- Custom burger app icons, window branding, and settings theme.
- Retains full compatibility with all 130+ Vencord plugins, themes, and CSS tweaks.

---

## 📥 Installation

### Method 1: One-Click Installer (Windows)
1. Download `BurgercordInstaller.bat` from the [Latest Release](https://github.com/mrvonderplanitz/burgercord/releases/latest).
2. Run `BurgercordInstaller.bat`.
3. If Discord is running, the installer will safely close it, patch it with Burgercord, and relaunch it automatically!

### Method 2: From Source
```bash
# Clone the repository
git clone https://github.com/mrvonderplanitz/burgercord.git
cd burgercord

# Install dependencies (Node 20+ and pnpm required)
pnpm install

# Build standalone bundles
pnpm release

# Patch your Discord client
pnpm inject
```

---

## 🛠️ Configuration & Settings

Open Discord User Settings, and you'll find Burgercord's settings section:
- **Burgercord Settings**: Core controls and quick relaunch tools.
- **Security Vault**: Real-time stats on token encryption, blocked grab attempts, and core integrity.
- **Performance Booster**: Toggles for Call QoS, CSS containment, and background event coalescing.
- **Plugins & Themes**: Browse and toggle 130+ built-in plugins, custom themes, and QuickCSS.
- **Updates**: Check update status or trigger an immediate check against GitHub Releases.

---

## 💖 Support & Donations

If you enjoy using Burgercord and want to support its continued development:

👉 **[Donate via PayPal (tommieae@gmail.com)](https://www.paypal.com/donate/?business=tommieae%40gmail.com&no_recurring=0&currency_code=USD)**

Every bit of support helps keep updates fast, optimized, and secure!

---

## 📜 License & Credits

Burgercord is licensed under the [GNU General Public License v3.0](LICENSE).  
Burgercord is built on top of [Vencord](https://github.com/Vendicated/Vencord) (created by Vendicated and contributors).
