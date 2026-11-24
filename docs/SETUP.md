# GitHub setup — `@devstreamby/document-preview`

Public repo: [devstreamby/document-preview](https://github.com/devstreamby/document-preview).  
CI: GitHub Actions. Registry: GitHub Packages (`npm.pkg.github.com`).

Scope `@devstreamby` matches the GitHub owner `devstreamby` (required by GitHub Packages).

## Steps

### 1. Push (first time)

```powershell
cd D:\Projects\BuildingBlocks\document-preview
git add .
git commit -m "Initial @devstreamby/document-preview 0.1.0"
git remote add origin https://github.com/devstreamby/document-preview.git
git branch -M master
git push -u origin master
```

### 2. CI

Push/PR → workflow **CI** (typecheck + build).

### 3. First publish

1. Confirm `"version": "0.1.0"` in `package.json`.
2. GitHub → Releases → Draft → tag `v0.1.0` → Publish release.
3. Actions → **Publish** should succeed.
4. Repo → Packages → `@devstreamby/document-preview` → set visibility **Public** (first publish is private by default).

### 4. Consume in SportPortal

`.npmrc`:

```ini
@devstreamby:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

`package.json`:

```json
"@devstreamby/document-preview": "0.1.0"
```

Remove `file:` dependency and the temporary Vite `@vivliostyle/core` alias.

```powershell
cd D:\Projects\SportPortal\source\SportPortal.WEB\App
$env:GITHUB_TOKEN = "<PAT with read:packages>"
npm install
```

### 5. Later versions

Bump `version` → merge to `master` → GitHub Release `vX.Y.Z` → bump consumer dependency.
