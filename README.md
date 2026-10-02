# Migalhas

A browser extension for Chrome and other Chromium-based browsers that says "no" to cookie consent banners and clears cookies on a schedule. *Migalhas* is Portuguese for "crumbs".

> **Status:** early development. Automatic cookie clean-up works; banner rejection, the whitelist and the interval setting are not implemented yet.
>
> **Warning:** until the whitelist exists, every clean-up deletes the cookies of all sites that are not open in a tab, which logs you out of them. Try the extension in a separate Chrome profile.

## What it does

- **Rejects cookie and ad consent banners** *(planned)*. Detects the banner and refuses everything except strictly necessary cookies. It never clicks "Accept all", even when that is the only button: if there is no reject option, it opens the banner's settings and switches off every optional category; if there are no settings either, it leaves the banner alone.
- **Clears cookies automatically** every 60 minutes. Choosing 15 minutes, 1 hour or 24 hours in the settings is *planned*.
- **Never logs you out mid-use.** Sites open in a tab are skipped and cleared on a later run, once their tabs are closed. A whitelist of sites that are never cleared is *planned*.
- **Runs entirely on your device.** No data is sent to any server.

## Permissions

| Permission | Why it is needed |
| --- | --- |
| `alarms` | Runs the clean-up on schedule, even after Chrome stops the extension's background worker. |
| `browsingData` | Deletes cookies, except those of the sites open in a tab. |
| `tabs` | Reads the addresses of open tabs, so those sites are skipped. Chrome shows this as "Read your browsing history"; nothing leaves your device. |

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

## Contributing

Issues and pull requests are welcome. For larger changes, please open an issue first so we can agree on the approach.

- Plain JavaScript only: no external libraries and no build step.
- Each consent management platform (CMP) gets its own rule file in `rules/`.
- Request the minimum permissions in `manifest.json`, and explain any new permission in your pull request.
- To test a change, reload the extension in `chrome://extensions` and refresh the test page. Content script errors appear in the page console (F12); service worker errors appear under the extension's **service worker** link.
- Code or rules copied from other projects must use a GPL-3.0-compatible license. Keep the original copyright notice and credit the source in this README.
- Never commit personal data, keys or files containing real cookies.
- Write commit messages in English, short and descriptive.

## License

[GPL-3.0](LICENSE). You may use, study, change and share this extension. If you distribute a modified version, it must stay open source under the same license.
