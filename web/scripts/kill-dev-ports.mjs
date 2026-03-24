import { execSync } from "node:child_process";

const PORTS = [3000, 3001];

function tryRun(command) {
  try {
    execSync(command, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function killOnWindows() {
  // Try PowerShell 7 first, then Windows PowerShell.
  const command =
    "foreach ($p in 3000,3001) { " +
    "Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | " +
    "ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } " +
    "}";
  return (
    tryRun(`pwsh -NoProfile -Command "${command}"`) ||
    tryRun(`powershell -NoProfile -Command "${command}"`)
  );
}

function killOnUnixLike() {
  const portArgs = PORTS.map((p) => `${p}/tcp`).join(" ");
  // Try common Linux tool.
  if (tryRun(`fuser -k ${portArgs}`)) return true;
  // Fallback for many macOS/Linux systems.
  const pidsExpr = PORTS.map((p) => `$(lsof -t -iTCP:${p} -sTCP:LISTEN)`).join(" ");
  return tryRun(`kill -9 ${pidsExpr}`);
}

if (process.platform === "win32") {
  killOnWindows();
} else {
  killOnUnixLike();
}
