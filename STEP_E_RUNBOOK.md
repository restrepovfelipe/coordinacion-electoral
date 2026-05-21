# Step E — Create the three secrets in Secret Manager

> Target project: `coordinacion-electoral`. All commands run via **PowerShell** (gcloud is broken under Git Bash on this host — exit 49 / bundled-Python lookup). Each secret value is written to a temp file with **no BOM and no trailing newline** (critical — a stray `\n` or BOM would corrupt the secret), uploaded, then the temp file is removed.
>
> Why `[System.IO.File]::WriteAllText` + `UTF8Encoding($false)` instead of `Set-Content` / `Out-File`: in PowerShell 5.1 (Windows default) both inject a UTF-8 BOM and a trailing newline. `WriteAllText` with `UTF8Encoding($false)` writes pure UTF-8 with no BOM and no trailing newline — exactly what we want for a secret value.

---

## E.1 — BOOTSTRAP_SUPER_ADMINS_JSON

Two super admins with temp credentials. `mustChangePassword=true` is set later in Phase 2 by the bootstrap script (T14) when these are inserted into CIP + Postgres.

```powershell
$tmp = "$env:TEMP\bootstrap.json"
$payload = '[{"username":"1040572640","password":"20060419","displayName":"Super Admin 1"},{"username":"1001370773","password":"1001370773","displayName":"Super Admin 2"}]'
[System.IO.File]::WriteAllText($tmp, $payload, [System.Text.UTF8Encoding]::new($false))
gcloud secrets create BOOTSTRAP_SUPER_ADMINS_JSON --data-file=$tmp --project=coordinacion-electoral
Remove-Item $tmp -Force
```

**Verification:**

```powershell
gcloud secrets versions access latest --secret=BOOTSTRAP_SUPER_ADMINS_JSON --project=coordinacion-electoral
```

Expected: the exact JSON array on one line, no trailing newline visible. If you see a BOM (`ï»¿` prefix) or a trailing blank line, **stop** — the secret is corrupted, delete it (`gcloud secrets delete BOOTSTRAP_SUPER_ADMINS_JSON --project=coordinacion-electoral`) and rerun E.1.

---

## E.2 — DB_APP_USER_PASSWORD (strong random, 32 bytes → base64)

Cryptographically secure random bytes; never printed, never logged.

```powershell
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$password = [Convert]::ToBase64String($bytes)
$tmp = "$env:TEMP\dbpass.txt"
[System.IO.File]::WriteAllText($tmp, $password, [System.Text.UTF8Encoding]::new($false))
gcloud secrets create DB_APP_USER_PASSWORD --data-file=$tmp --project=coordinacion-electoral
Remove-Item $tmp -Force
Clear-Variable password
[Array]::Clear($bytes, 0, $bytes.Length)
```

The password now exists **only** in Secret Manager. **Do NOT** print it to the chat under any circumstance. If you must log something for verification, only show the secret's metadata (name, version, state), never `gcloud secrets versions access`.

**Verification (metadata only):**

```powershell
gcloud secrets versions list DB_APP_USER_PASSWORD --project=coordinacion-electoral
```

Expected: one row, version `1`, state `ENABLED`.

---

## E.3 — CIP_WEB_API_KEY

You're holding `AIzaSyBmZtgzH8EFepEqUoOcNVWbajRCMD7CU_Y` in session memory from Step B. Write it:

```powershell
$tmp = "$env:TEMP\apikey.txt"
[System.IO.File]::WriteAllText($tmp, 'AIzaSyBmZtgzH8EFepEqUoOcNVWbajRCMD7CU_Y', [System.Text.UTF8Encoding]::new($false))
gcloud secrets create CIP_WEB_API_KEY --data-file=$tmp --project=coordinacion-electoral
Remove-Item $tmp -Force
```

**Verification:**

```powershell
gcloud secrets versions access latest --secret=CIP_WEB_API_KEY --project=coordinacion-electoral
```

Expected exact output: `AIzaSyBmZtgzH8EFepEqUoOcNVWbajRCMD7CU_Y` (no trailing newline, no BOM). This value is not a secret in the security sense — it will live in the frontend bundle — so it's safe to display.

---

## Final check

List all three secrets:

```powershell
gcloud secrets list --project=coordinacion-electoral
```

Expected: three entries — `BOOTSTRAP_SUPER_ADMINS_JSON`, `CIP_WEB_API_KEY`, `DB_APP_USER_PASSWORD`. All with at least one enabled version.

Confirm the `app-backend` service account inherits read access (the project-level `roles/secretmanager.secretAccessor` grant from Step C should cover this — Secret Manager IAM is inherited by default unless explicitly overridden at the secret level):

```powershell
gcloud projects get-iam-policy coordinacion-electoral --flatten="bindings[].members" --filter="bindings.members:app-backend@coordinacion-electoral.iam.gserviceaccount.com AND bindings.role:roles/secretmanager.secretAccessor" --format="value(bindings.role)"
```

Expected: prints `roles/secretmanager.secretAccessor`. If empty, the grant is missing — stop and flag it.

---

## STOP

After all three secrets exist and pass verification, report to the user:

1. Full output of `gcloud secrets list --project=coordinacion-electoral`.
2. Verification output for `BOOTSTRAP_SUPER_ADMINS_JSON` (paste the JSON) and `CIP_WEB_API_KEY` (paste the key). Do **NOT** show `DB_APP_USER_PASSWORD`.
3. Confirmation that the `secretAccessor` role grant check passed.

Then STOP. Wait for explicit "go" before Step F (local prereqs verification — `gcloud auth list`, `docker ps`, `node -v`, `pnpm -v`).

After Step F passes, the §10 pre-flight gate is fully cleared and you may proceed to Phase 1 / T05 (NestJS scaffold).
