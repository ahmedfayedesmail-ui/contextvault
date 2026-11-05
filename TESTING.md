# ContextVault — Comprehensive Testing Guide

**Target:** PR #1 / ContextVault v1.2.0 work  
**Scope:** Windows 10 22H2 or Windows 11, followed by one MCP indexing/search run and an embedding-latency measurement.  
**Status:** This is a test plan. The checks below have **not** been run against a clean Windows machine yet.

Run the sections in order in one planned test session. Use a disposable Windows VM or spare test computer. Do not uninstall Node.js or Ollama from a daily-use computer just to create a clean test. Project indexing in this branch sends up to 16 chunks per Ollama embedding request. Chunks are pooled across file boundaries where possible, and each file is still persisted atomically after all its chunks are embedded.

## 1. Before starting

1. Use a disposable Windows 10 22H2 or Windows 11 machine/VM. Take a VM snapshot first if available.
2. Make sure the computer has an internet connection. The first installation may prepare Node.js, install Ollama through winget (or direct the user to Ollama's official download page if winget is unavailable or fails), download the `nomic-embed-text` model, and install npm packages. The model download may take time and disk space.
3. Sign in using the Windows account that will own the ContextVault installation. The installer is designed to prepare a per-user Node.js runtime and create a shortcut for that user.
4. Open PowerShell and check whether Node.js and Ollama are already installed:

   ```powershell
   Get-Command node -ErrorAction SilentlyContinue
   Get-Command npm -ErrorAction SilentlyContinue
   Get-Command ollama -ErrorAction SilentlyContinue
   ```

   For a genuine fresh-install test, these commands should return no command information. If any command is found, use a clean VM instead of removing software from your normal computer.

5. Download the PR branch ZIP (not the default `main` branch) so the test includes the changes under review:

   [Download the PR #1 branch ZIP](https://github.com/ahmedfayedesmail-ui/contextvault/archive/refs/heads/fix/contextvault-performance-installer-onboarding-2026-11-05.zip)

6. Extract the ZIP. Open the extracted project root — the folder containing `package.json`, `install-contextvault.ps1`, and `start-contextvault.ps1`.

## 2. Test A — Fresh Windows installation

1. In File Explorer, open the extracted project root.
2. Open a PowerShell window in that folder. On Windows 11, use **Open in Terminal**. On Windows 10, use **Open PowerShell window here** if available.
3. Run:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\install-contextvault.ps1"
   ```

4. Let the installer complete. It should show numbered stages for:
   - Checking the extracted project.
   - Finding or preparing Node.js 22.13 or newer.
   - Checking for Ollama, then either skipping installation, installing with winget, or opening the official manual-install page and stopping cleanly.
   - Starting Ollama and checking the local service.
   - Checking or downloading `nomic-embed-text`.
   - Installing and verifying ContextVault npm dependencies.
   - Creating the ContextVault desktop shortcut and launching the app.

### Ollama installation scenarios to verify

Exercise both supported paths. Use a disposable VM snapshot or separate disposable environment for each path; do not uninstall Ollama from a daily-use computer.

**Scenario A — Ollama is not installed**
1. Confirm Ollama is not present in the standard install locations and that `Get-Command ollama -ErrorAction SilentlyContinue` returns no command.
2. Run the installer.
3. If winget is available, the installer should display **Installing Ollama via winget...**, run:
   ```powershell
   winget install --id Ollama.Ollama -e --accept-package-agreements --accept-source-agreements
   ```
   and then display **Ollama installed successfully.**
4. If winget is missing or returns a failure, the installer should open `https://ollama.com/download/windows`, print the manual-install instructions, ask for Enter only to close the visible installer window, then exit with code `0` without continuing to model download or npm installation.
5. In the fallback case, install Ollama from the opened official page, return to the installer window and press Enter, then run `install-contextvault.ps1` again. The already-prepared ContextVault-managed Node.js runtime should be reused.

**Scenario B — Ollama is already installed**
1. Install Ollama in the disposable test environment before running the ContextVault installer.
2. Run `install-contextvault.ps1`.
3. Confirm the installer displays **Ollama found, skipping download.** and does not invoke winget or open the manual download page.

Record which path ran in the final report. A successful fallback handoff is a pass for fallback behavior, but the complete fresh-install test remains pending until Ollama is installed and the installer is rerun to completion.

5. Accept normal Windows or package-manager installation prompts when they appear. Do not disable Windows security protections. If Windows blocks the script, stop and record the exact message rather than changing system-wide execution policy.
6. Wait for the browser to open the local dashboard. The expected address is:

   [http://localhost:3737](http://localhost:3737)

7. In a new PowerShell window, verify the local app health endpoint:

   ```powershell
   Invoke-RestMethod "http://localhost:3737/health" | ConvertTo-Json
   ```

   Expected response includes `"status": "ok"`.

8. Verify that Ollama responds:

   ```powershell
   Invoke-RestMethod "http://localhost:11434/api/tags" | ConvertTo-Json -Depth 5
   ```

   Confirm the model list contains `nomic-embed-text`.

9. Confirm a **ContextVault** shortcut was created on the current Windows user's Desktop. Close the browser and use the shortcut once to check that the app can be started again.
10. With ContextVault already running, double-click `start-contextvault.bat` in the extracted project root. It should reuse the healthy local dashboard rather than start a duplicate server, then open the dashboard in the browser.
11. Confirm the local database was created under the extracted project folder at `data\contextvault.db`. Do not put real customer or confidential source code into this test database.

### Fresh-install pass conditions

- The installer finishes without a PowerShell error.
- Node.js 22.13+ is available to ContextVault. On a machine without Node.js, the managed runtime should be under `%LOCALAPPDATA%\ContextVault\runtime`.
- Ollama is running and `nomic-embed-text` appears in `/api/tags`.
- The applicable Ollama path (preinstalled, winget, or manual fallback followed by rerun) is recorded and behaves as specified.
- npm dependencies are installed and the dashboard responds with `status: ok`.
- The Desktop shortcut starts ContextVault again.
- The installer log is present under `%LOCALAPPDATA%\ContextVault\logs`.

**Important:** This is an install-from-source/repository ZIP flow, not a signed MSI or a single self-contained offline installer. The user downloads and extracts the repository, starts the PowerShell installer, and must allow the required downloads and installer prompts. Ollama itself is not downloaded by `Invoke-WebRequest`; winget is the primary installation route, with an official-browser fallback and a clean installer stop if winget is missing or fails.

## Known Installation Issues & Solutions

### Ollama installer download could stall

**Observed issue:** The previous Windows installer downloaded the large `OllamaSetup.exe` directly with PowerShell `Invoke-WebRequest`. That download did not expose useful progress or provide a reliable resume path in the tested environment; the network receive rate reached 0 Kbps while the installer remained on the first download attempt.

**Change made in this PR:** The direct Ollama executable download has been removed. The installer now:
- Detects an existing Ollama installation and skips installation.
- Uses `winget install --id Ollama.Ollama -e --accept-package-agreements --accept-source-agreements` as the primary installation path, with package-manager output visible in the console.
- If winget is unavailable or fails, opens the official Ollama Windows download page, prints the exact manual-install/re-run instruction, waits only for the user to acknowledge the visible message, exits with code `0`, and does not wait on a hidden download.

**Validation status:** This is an implementation change, not a verified resolution yet. Re-run Scenario A and Scenario B in a clean disposable environment and keep PR #1 in Draft until both paths and the full installation flow have passed.

## 3. Test B — MCP Inspector connection and tool discovery

Keep the ContextVault dashboard and Ollama running.

1. Open PowerShell in the same extracted ContextVault project root.
2. The Windows installer may have placed Node.js in a private runtime folder instead of adding it to the global PATH. Add that runtime to this PowerShell session:

   ```powershell
   $nodeDir = Get-ChildItem "$env:LOCALAPPDATA\ContextVault\runtime" -Directory -Filter "node-v22*-win-*" |
     Sort-Object Name -Descending |
     Select-Object -First 1

   if (-not $nodeDir) {
     throw "ContextVault-managed Node.js runtime was not found."
   }

   $env:Path = "$($nodeDir.FullName);$env:Path"
   ```

3. Start MCP Inspector with the ContextVault MCP command:

   ```powershell
   npx -y @modelcontextprotocol/inspector npm run mcp
   ```

4. Wait for MCP Inspector to open in the browser. Connect to the `npm` server entry.
5. Open the **Tools** tab. Confirm these two tools are listed:
   - `index_project`
   - `search_context`

6. Confirm the connection indicator is green and the server is connected before executing either tool.

### MCP connection pass conditions

- Inspector connects without a transport error.
- Tool discovery returns exactly the two current ContextVault tools.
- The tools expose the expected input fields: `rootPath` for `index_project`; `query` and optional `limit` for `search_context`.

## 4. Test C — Run index_project through MCP Inspector

Use a disposable sample project so the test does not re-index or overwrite a real project.

1. In File Explorer, create this folder:

   ```text
   C:\ContextVault-MCP-SmokeTest\src
   ```

2. Inside the `src` folder, create a text file named `billing.ts`.
3. Paste the following code and save the file:

   ```typescript
   export function calculateMonthlyRevenue(payments: number[]): number {
     return payments.reduce((total, payment) => total + payment, 0);
   }
   ```

4. Return to MCP Inspector → **Tools** → **Index a project** (`index_project`).
5. In the `rootPath` field, enter this exact absolute path:

   ```text
   C:\ContextVault-MCP-SmokeTest
   ```

6. Select **Execute Tool** and wait for the indexing call to finish.
7. Inspect the result. It should report `success: true`, the submitted root path, and non-zero file and chunk counts. For this one-file fixture, expect at least one file and at least one chunk.

### index_project pass conditions

- The tool call completes without `isError` or an indexing error.
- The response contains `success: true`.
- `filesCount` and `chunksCount` are greater than zero.

## 5. Test D — Run search_context against the indexed sample

1. In MCP Inspector → **Tools**, select **Search project context** (`search_context`).
2. Enter this query:

   ```text
   Where is calculateMonthlyRevenue implemented, and how does it calculate the monthly revenue?
   ```

3. Set `limit` to `5`.
4. Select **Execute Tool**.
5. Inspect the returned JSON. Confirm that at least one result references `src/billing.ts` and includes the `calculateMonthlyRevenue` implementation or its relevant code.

### Search pass conditions

- The tool returns `success: true`.
- At least one relevant result is returned.
- The returned file path points to the smoke-test project's `src/billing.ts`.
- The returned snippet describes or contains the function the query asked about.

**Index scope note:** the current MCP `search_context` tool does not provide project-scoped filtering. It searches the local SQLite index as a whole. This is why this test uses a fresh database and a unique function name. Always inspect returned file paths; do not assume search results are isolated to one project.

## 6. Test E — Verify warm-up and measure embedding latency

The purpose of this section is to determine whether the original 15.6-second Inspector call was mainly model loading, embedding execution, or time outside the embedding request. Do not assume the cause before reading the measurements.

1. Make sure the app or MCP server has just started. Both startup paths issue a background embedding warm-up.
2. Wait until the warm-up log entry appears before running the timed searches. A warm-up request is identified by a line containing:

   ```text
   Ollama embedding model warm-up completed
   ```

3. Open the Windows embedding diagnostic log:

   ```powershell
   notepad "$env:LOCALAPPDATA\ContextVault\logs\embedding.log"
   ```

   Or print the latest entries:

   ```powershell
   Get-Content "$env:LOCALAPPDATA\ContextVault\logs\embedding.log" -Tail 40
   ```

4. Run the same `search_context` query three times in MCP Inspector after the warm-up has completed. Record the duration shown for each MCP tool call.
5. Refresh `embedding.log` after each call. Successful single-text embedding requests (such as warm-up or search) should contain a line similar to:

   ```text
   [ContextVault] Embedding completed in 420.0ms (model=nomic-embed-text, model_load=0.0ms, ollama_total=380.0ms, keep_alive=30m).
   ```

   The numbers above are **illustrative only**, not a promised or measured ContextVault result. Ollama may omit timing fields in some responses.

For project indexing, batched requests should contain a line similar to:

   ```text
   [ContextVault] Embedding batch completed (items=16) in 1,250.0ms (model=nomic-embed-text, model_load=0.0ms, ollama_total=1,200.0ms, keep_alive=30m).
   ```

   The final batch for a file may contain fewer than 16 items. Batch size is currently 16 chunks per request. The numbers above are illustrative only.


6. Record these values for the warm-up and each of the three searches:
   - Embedder wall-clock duration: the number after `Embedding completed in` for a single-text request, or `Embedding batch completed (items=N) in` for an indexing batch.
   - Ollama model load: the number after `model_load=`, when returned.
   - Ollama total duration: the number after `ollama_total=`, when returned.
   - Local vector-search duration: the `vector_search=` value in the MCP or HTTP search profiling console line.
   - Total search-handler duration: the `total=` value in that same profiling line.
   - MCP Inspector tool-call duration: the duration displayed for the complete tool call.
7. Keep the original log file. Do not delete diagnostics before the Architect has reviewed the results.

### Where the log files are stored

- **Windows installer log:** `%LOCALAPPDATA%\ContextVault\logs\installer-YYYYMMDD-HHMMSS.log`
- **Windows embedding log:** `%LOCALAPPDATA%\ContextVault\logs\embedding.log`
- **macOS embedding log:** `~/Library/Logs/ContextVault/embedding.log`
- **Linux embedding log:** `~/.local/state/contextvault/logs/embedding.log`

Set `CONTEXTVAULT_LOG_DIR` to use a different embedding-log directory.

### How to interpret the latency measurements

- **High `model_load` on the warm-up, then low/near-zero `model_load` on later searches:** cold model loading is likely a significant part of the first-call delay.
- **Low `model_load`, but high `ollama_total` and high embedder wall-clock time:** the model is loaded, but the embedding computation itself is taking time. Check CPU/GPU availability, memory pressure, model runtime, and input size.
- **Low embedder wall-clock time, but high MCP Inspector duration:** most of the delay is outside the embedding request. Investigate SQLite result retrieval, vector decoding/cosine scoring, MCP transport, and Inspector overhead.
- **Embedder wall-clock time much higher than `ollama_total`:** investigate request/response overhead, local service scheduling, or other client-side delays.
- **Timeout or connection errors:** the log should contain an elapsed-time diagnostic and a clear error. Save the full log and installer log.

The Ollama timing values are server-reported durations; the `Embedding completed in` value is ContextVault's wall-clock time around the HTTP request and response. The Inspector duration is the complete MCP call, so it includes work beyond embedding. Compare all three instead of treating one number as the entire search time.

### Performance acceptance

Do not declare the speed issue fixed because warm-up exists or because one call is fast. Record the warm-up and all three warm-query measurements, then compare the median warm-query duration and the MCP Inspector durations with the original approximately 15.6-second observation. Agree on a numeric target after the test hardware and baseline are recorded. The current code does not enforce a universal latency SLA.

## 7. What to save for the review

At the end of the single planned test session, save:

1. A screenshot or note showing the fresh installation completed and the dashboard health endpoint response.
2. The latest installer log from `%LOCALAPPDATA%\ContextVault\logs`.
3. MCP Inspector's connected state and the two discovered tools.
4. The `index_project` success response and returned file/chunk counts.
5. The `search_context` response showing `src/billing.ts`.
6. The relevant lines from `embedding.log`, including warm-up and the three timed searches.
7. The three MCP Inspector durations and basic test-machine details (Windows version, CPU, RAM).

Do not include source files from a real private project, credentials, tokens, or other sensitive data in screenshots or logs.

## 8. Final test report template

Copy this section into the review when all checks have been run:

- Fresh install: PASS / FAIL — notes:
- Dashboard health: PASS / FAIL — notes:
- Ollama installation path (preinstalled / winget / manual fallback):
- Winget available and exit code:
- Existing Ollama skip message: PASS / FAIL / N/A
- Manual fallback browser + clean exit: PASS / FAIL / N/A
- Ollama model present: PASS / FAIL — notes:
- MCP connection: PASS / FAIL — notes:
- Tool discovery: PASS / FAIL — notes:
- `index_project`: PASS / FAIL — files: ; chunks: ; notes:
- `search_context`: PASS / FAIL — relevant path returned:
- Warm-up log present: YES / NO
- Warm-up embedder time:
- Warm-up model-load time:
- Warm-query 1 (Inspector / embedder):
- Warm-query 2 (Inspector / embedder):
- Warm-query 3 (Inspector / embedder):
- Median warm-query duration:
- Timeout or errors:
- Test machine (Windows / CPU / RAM):
- Overall decision: GO / NO-GO — rationale:

---

**Current status:** no fresh-install, MCP Inspector indexing, or post-warm-up latency test is claimed as completed by this guide. Keep PR #1 in Draft until the full test session has been reviewed.
