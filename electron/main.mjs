import { app, BrowserWindow, shell } from "electron";
import { startDoioServer } from "../scripts/doio-app-server.mjs";

let server = null;

app.setName("DOIO Mapper");

app.whenReady().then(async () => {
  const started = await startDoioServer({ port: 0, host: "127.0.0.1" });
  server = started.server;
  createWindow(started.url);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(started.url);
  });
}).catch((error) => {
  console.error(error);
  app.quit();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (server) server.close();
});

function createWindow(url) {
  const win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 920,
    minHeight: 680,
    title: "DOIO Mapper",
    backgroundColor: "#f3f4f1",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  win.removeMenu();
  win.loadURL(url);
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    shell.openExternal(target);
    return { action: "deny" };
  });
}
