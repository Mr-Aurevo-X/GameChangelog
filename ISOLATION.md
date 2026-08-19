# Isolated runtime (Windows)

PC Command hubs are **Windows desktop** apps: Python + UAC Administrator + Edge WebView2 + WinForms chrome. A Linux Docker image cannot run them. Isolation means a **frozen Windows runtime**, not a container OS swap.

## 1. Pinned Python venv (recommended)

Use a dedicated interpreter (3.12.x recommended) next to the hub:

```bat
py -3.12 -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
Lancer.cmd
```

`requirements.txt` uses **exact** `==` pins. Do not float versions if you want the same behavior next year.

## 2. Windows Sandbox

Create a `.wsb` file (example):

```xml
<Configuration>
  <MappedFolders>
    <MappedFolder>
      <HostFolder>C:\path\to\Hub-Systeme</HostFolder>
      <ReadOnly>true</ReadOnly>
    </MappedFolder>
  </MappedFolders>
  <LogonCommand>
    <Command>cmd.exe /c echo Mounted hub is read-only. Copy to a writable folder to run Lancer.cmd</Command>
  </LogonCommand>
</Configuration>
```

Copy the hub to a writable folder inside the sandbox, install Python + WebView2 Runtime, then `Lancer.cmd`.

## 3. No OS-forever promise

The publisher does **not** guarantee future Windows builds. Pinning + sandbox is how the app stays usable without waiting for patches.

## 4. Windows SmartScreen (« potentially unsafe »)

Windows may flag the app as **potentially unsafe** or show « Windows protected your PC »: official `.exe` builds are **not Authenticode-signed** (no paid publisher code-signing certificate) and may lack Microsoft download reputation. That is a **SmartScreen reputation warning**, not an antivirus malware verdict. You can run from source via `Lancer.cmd` / Python if you prefer. See also `CGU.md` / `TERMS.md`.
