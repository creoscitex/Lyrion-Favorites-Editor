# Lyrion Favorites Editor

Interactive editor for `favorites.opml`.

## Run

From project folder:

```powershell
.\run-editor.ps1
```

Then open:

- http://localhost:8765

## What it does

- Loads `favorites.opml`
- Lets you add/edit/delete categories and stations
- Lets you sort categories and stations by name (A-Z / Z-A)
- Lets you drag stations between categories (drag row and drop on category)
- Lets you reorder stations with `up` / `down` buttons
- Checks stream availability per station (`check`) or for visible rows (`Check visible`)
- Saves changes back to `favorites.opml`
- Creates a backup before every save in `backups/`

## Optional

```powershell
.\run-editor.ps1 -Port 9000
.\run-editor.ps1 -NoOpenBrowser
```
