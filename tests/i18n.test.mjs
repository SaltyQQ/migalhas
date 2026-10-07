// Tests the translations: in Chrome set to English and to Portuguese (Portugal), every text of the
// settings page matches _locales/<language>/messages.json, and both files have the same keys.
// Run from the project folder with: node tests/i18n.test.mjs

import { readFileSync } from "node:fs";
import path from "node:path";
import { createReport, launchBrowser, PROJECT_DIR, waitFor } from "./harness.mjs";

const LANGUAGES = [
  { chromeLang: "en-US", folder: "en" },
  { chromeLang: "pt-PT", folder: "pt_PT" },
];

const report = createReport();
const { check } = report;
let browser;

const loadMessages = (folder) => JSON.parse(readFileSync(path.join(PROJECT_DIR, "_locales", folder, "messages.json"), "utf8"));
const fill = (message, value) => message.replace(/\$[A-Z]+\$/g, value);

const [english, portuguese] = LANGUAGES.map(({ folder }) => loadMessages(folder));
const missing = Object.keys(english).filter((key) => !(key in portuguese));
const extra = Object.keys(portuguese).filter((key) => !(key in english));
check("Portuguese has every English key, and no others", missing.length === 0 && extra.length === 0, `missing: ${missing} / extra: ${extra}`);

for (const { chromeLang, folder } of LANGUAGES) {
  const messages = loadMessages(folder);
  const text = (key) => messages[key].message;
  try {
    browser = await launchBrowser({ lang: chromeLang });
    await browser.setCookies(["example.com"]);
    const extensionId = await browser.loadExtension();
    // Wait for the service worker to create the clean-up alarm, so the page shows the next clean-up.
    const worker = await browser.attachServiceWorker(extensionId);
    await waitFor(() => browser.evaluate(worker, `chrome.alarms.get("cookie-cleanup")`), "the clean-up alarm");
    const page = await browser.openPage(`chrome-extension://${extensionId}/options/options.html`, "settings page");
    await waitFor(() => browser.evaluate(page, `document.querySelectorAll("#site-list li").length === 1`), "the site list");

    const shown = await browser.evaluate(
      page,
      `({
        title: document.title,
        lang: document.documentElement.lang,
        texts: [...document.querySelectorAll("[data-i18n]")].map((el) => [el.dataset.i18n, el.textContent]),
        placeholder: document.getElementById("search").placeholder,
        nextCleanup: document.getElementById("next-cleanup").textContent,
        cookieCount: document.querySelector("#site-list .site-meta").textContent,
        lockLabel: document.querySelector("#site-list .lock").getAttribute("aria-label"),
        keepLabel: document.querySelector("#site-list .switch").getAttribute("aria-label"),
      })`,
    );
    const wrong = shown.texts.filter(([key, value]) => value !== text(key)).map(([key]) => key);
    check(`${chromeLang}: every static text is translated`, wrong.length === 0, `wrong: ${wrong.join(", ")}`);
    check(`${chromeLang}: page title and language`, shown.title === text("pageTitle") && shown.lang === text("htmlLang"), `${shown.title} / ${shown.lang}`);
    check(`${chromeLang}: search placeholder`, shown.placeholder === text("searchPlaceholder"), shown.placeholder);
    check(`${chromeLang}: next clean-up line`, shown.nextCleanup.startsWith(text("nextCleanup").split("$")[0]), shown.nextCleanup);
    check(`${chromeLang}: cookie count and labels of a site`,
      shown.cookieCount === text("cookieCountOne") &&
        shown.lockLabel === fill(text("lockSite"), "example.com") &&
        shown.keepLabel === fill(text("keepSite"), "example.com"),
      JSON.stringify(shown));
    const description = await browser.evaluate(page, `chrome.i18n.getMessage("extDescription")`);
    check(`${chromeLang}: extension description`, description === text("extDescription"), description);
    await browser.screenshot(page, `settings-${folder}.png`, "light");
  } catch (error) {
    check(`${chromeLang}: test run completed`, false, error.stack);
  } finally {
    if (browser) {
      check(`${chromeLang}: no errors on the settings page`, browser.errors.length === 0, browser.errors.join("\n"));
      await browser.close();
    }
  }
}

report.finish(browser);
