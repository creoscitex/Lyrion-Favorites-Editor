# Lyrion Favorites Editor

Interactive editor for a Lyrion favorites OPML file.

This project gives you a small local web app for managing radio stations and categories in `favorites.opml`.

## What It Does

- Loads the current `favorites.opml` from the project folder.
- Lets you add, edit, and delete categories.
- Lets you add, edit, and delete stations.
- Lets you sort categories and stations by name.
- Lets you drag stations between categories by dragging a row onto a category.
- Lets you reorder stations inside a category with `up` and `down` buttons.
- Lets you check stream availability for one station or for the visible list.
- Saves changes back to the local `favorites.opml`.
- Creates a timestamped backup before every local save in `backups/`.

## Project Files

- `run-editor.ps1` - local HTTP server and save/check API.
- `web-editor/` - browser UI for editing the OPML.
- `favorites.opml` - the actual favorites data used by the editor.
- `backups/` - automatic backup copies created on save.

## Run

From the project folder:

```powershell
.\run-editor.ps1
```

Then open:

- http://localhost:8765

Optional launch modes:

```powershell
.\run-editor.ps1 -Port 9000
.\run-editor.ps1 -NoOpenBrowser
```

## How To Use

### Categories

- Click a category to view its stations.
- Use the Add box to create a new category.
- Use `rename` to change a category name.
- Use `del` to remove a category.
- Use `Sort A-Z` or `Sort Z-A` to sort categories by name.

### Stations

- Use the form at the bottom of the Stations panel to add a station.
- Click `edit` to modify a station.
- Click `del` to remove a station.
- Use `up` and `down` to move a station inside the current category.
- Use `Sort A-Z` or `Sort Z-A` to sort stations by name.
- Drag a station row onto a category to move it there.

### Saving

- `Save to OPML` writes the edited data back to the local `favorites.opml`.
- Before each save, the editor writes a backup copy into `backups/`.
- `Reload` reloads the file from disk and keeps the current selected category, search text, and active sort mode when possible.

### Stream Checking

- `check` probes one stream.
- `Check visible` probes all visible stations in the current list.
- Statuses can be:
	- `alive` - a direct probe returned a normal HTTP success/redirect.
	- `maybe` - the server blocked the probe, but the stream may still work in Lyrion.
	- `dead` - the stream did not respond in a useful way.

The check is intentionally conservative. Some streams work in Lyrion even when a direct HTTP probe gets `403`, `405`, or similar.

## Keyboard / Terminal Notes

- The server runs in the terminal started by `run-editor.ps1`.
- Press `Ctrl+C` in that terminal to stop the server.

## Using It With Lyrion

If you want to copy the edited OPML to your Lyrion server, do it manually after saving locally.

Typical flow:

1. Edit the list in the browser.
2. Click `Save to OPML`.
3. Copy the resulting `favorites.opml` to your Lyrion `prefs` folder over SFTP or with WinSCP.

If your server exposes a path like `/usr/local/slimserver/prefs/`, that is the destination you want on the Lyrion side.

## Notes

- The editor keeps the data in the order you see in the UI when you save.
- Station status badges are only a hint. A `dead` result does not always mean the station will fail in Lyrion.
- If you change the OPML outside the editor, use `Reload` to pick up the latest file.
