/*
 * Windows app: opens the staff portal in its own window. Offline selling works exactly as in
 * the browser (the page keeps its price list, customers and waiting sales on this PC and sends
 * them when the connection is back). The site address can be changed in
 * %APPDATA%/Store Portal/config.json → {"url": "https://…"}.
 */
const { app, BrowserWindow, Menu, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_URL = "https://athletichorse.vercel.app";

function siteUrl() {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(app.getPath("userData"), "config.json"), "utf8"));
    if (typeof cfg.url === "string" && /^https:\/\//.test(cfg.url)) return cfg.url.replace(/\/$/, "");
  } catch { /* no config: default */ }
  return DEFAULT_URL;
}

if (!app.requestSingleInstanceLock()) app.quit();

function createWindow() {
  const base = siteUrl();
  const origin = new URL(base).origin;
  const win = new BrowserWindow({
    width: 1366, height: 860, autoHideMenuBar: true, icon: path.join(__dirname, "icon.png"),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, partition: "persist:portal" },
  });
  // Links to other sites open in the normal browser; receipts/print windows stay inside.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url === "about:blank" || url.startsWith(origin)) return { action: "allow", overrideBrowserWindowOptions: { autoHideMenuBar: true } };
    void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith(origin)) { e.preventDefault(); void shell.openExternal(url); } });
  // If the first load fails (no internet at start), the saved cashier page opens from the service worker on retry.
  win.webContents.on("did-fail-load", () => setTimeout(() => win.loadURL(`${base}/pos`).catch(() => {}), 3000));
  void win.loadURL(`${base}/pos`);
}

app.on("second-instance", () => { const w = BrowserWindow.getAllWindows()[0]; if (w) { if (w.isMinimized()) w.restore(); w.focus(); } });
app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "View", submenu: [{ role: "reload" }, { role: "togglefullscreen" }, { role: "zoomIn" }, { role: "zoomOut" }, { role: "resetZoom" }] },
  ]));
  createWindow();
});
app.on("window-all-closed", () => app.quit());
