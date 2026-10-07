# Migalhas

A browser extension for Chrome and other Chromium-based browsers that says "no" to cookie consent banners and clears cookies on a schedule. *Migalhas* is Portuguese for "crumbs".

> **Status:** early development. Automatic cookie clean-up, the settings page and banner rejection for Cookiebot, OneTrust and InMobi Choice work; more consent platforms are coming.

## What it does

- **Rejects cookie and ad consent banners.** Detects the banner and refuses everything except strictly necessary cookies. It never clicks "Accept all", even when that is the only button: if there is no reject option, it opens the banner's settings and switches off every optional category; if there are no settings either, it leaves the banner alone. Afterwards it checks what the site saved, writes the result to the page console (F12) and shows it on the toolbar icon: ✓ rejected, ! left alone, ✗ the site saved more than necessary cookies (hover the icon for details; click it to open the settings). Supported so far: Cookiebot, OneTrust and InMobi Choice. More consent platforms are coming. With IAB TCF banners such as InMobi Choice, some sites keep processing data on the basis of "legitimate interest" even after everything is rejected, and don't offer a working way to object; Migalhas reports this in the console instead of hiding it.
- **Clears cookies automatically**, every 60 minutes by default (15 minutes, 1 hour or 24 hours in the settings).
- **Lets you choose which sites to keep.** The settings page lists every site that has cookies, with a switch to keep or clear it. On first run, every site that already has cookies is kept, so installing Migalhas does not log you out. Sites that appear later are cleared unless you switch them on. A padlock next to each switch locks it, so it can't be changed by accident, not even by the "Switch all" buttons.
- **Never logs you out mid-use.** Sites open in a tab are skipped and cleared on a later run, once their tabs are closed.
- **Runs entirely on your device.** No data is sent to any server, and your settings are stored only in this browser.

Along with the cookies of a site being cleared, Migalhas also clears its other site data (localStorage, IndexedDB, caches and service workers), where some sites keep logins. Chrome removes this data per exact address, so Migalhas clears it for the addresses that had cookies, and to stay on the safe side it never touches the data of a domain that is kept or open in a tab (for example, keeping `mail.google.com` also protects `drive.google.com`).

## Permissions

| Permission | Why it is needed |
| --- | --- |
| `alarms` | Runs the clean-up on schedule, even after Chrome stops the extension's background worker. |
| `browsingData` | Deletes cookies and other site data, except those of kept sites and of sites open in a tab. |
| `cookies` | Lists the sites that have cookies, for the settings page. |
| `storage` | Saves your settings in this browser only. |
| Access to all sites | Finds and rejects consent banners on the pages you visit, reads the cookies of every site and sees which sites are open in tabs. Chrome shows this as "Read and change all your data on all websites". Without it, Migalhas skips the clean-up rather than risk logging you out. |

## Languages

The settings page and the toolbar tooltip are in English and Portuguese (Portugal), following the browser's language. Translations live in `_locales/<language>/messages.json`; new languages are welcome.

## Supported browsers

Chrome, Edge, Brave, Opera and other Chromium-based browsers (Manifest V3).

## Install from source

There is nothing to build: no npm, no build step.

1. Download this repository (**Code → Download ZIP**, then unzip it) or clone it:
   ```
   git clone https://github.com/SaltyQQ/migalhas.git
   ```
2. Open `chrome://extensions` (`edge://extensions` in Edge, `brave://extensions` in Brave, `opera://extensions` in Opera).
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select the project folder.
5. To open the settings, click **Details** on the Migalhas card, then **Extension options**.

## Contributing

Issues and pull requests are welcome. For larger changes, please open an issue first so we can agree on the approach.

- Plain JavaScript only: no external libraries and no build step.
- Each consent management platform (CMP) gets its own rule file in `rules/`.
- Request the minimum permissions in `manifest.json`, and explain any new permission in your pull request.
- Run the automated tests (needs Node.js 22+ and Chrome; no npm). They use a temporary Chrome profile and save screenshots in `tests/output/`:
  - `node tests/settings.test.mjs`, `node tests/banners.test.mjs` and `node tests/i18n.test.mjs` work offline, on local copies of the banners.
  - `node tests/real-sites.test.mjs` checks the real test sites and needs internet.
- Test by hand in a separate Chrome profile: the clean-up deletes cookies and ends sessions.
- To test a change, reload the extension in `chrome://extensions` and refresh the test page. Content script errors appear in the page console (F12); service worker errors appear under the extension's **service worker** link.
- Code or rules copied from other projects must use a GPL-3.0-compatible license. Keep the original copyright notice and credit the source in this README.
- Never commit personal data, keys or files containing real cookies.
- Write commit messages in English, short and descriptive.

## License

[GPL-3.0](LICENSE). You may use, study, change and share this extension. If you distribute a modified version, it must stay open source under the same license.
