
import puppeteer from "puppeteer";
import fs from "fs/promises";

const URL_REFERENCE= 'https://devilnovels.com/esclavo-de-las-sombras/shadow-slave-chapter-246-2/116881/'
const OUTPUT_FILE = "urls.txt";
const TOTAL_URLS = 10;

export async function getTenUrls() {
  const browser = await puppeteer.launch({
    headless: true
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(30000);

  const collectedUrls: string[] = [];

  let currentUrl = URL_REFERENCE;
  await page.goto(currentUrl, { waitUntil: "domcontentloaded" });

  for (let i = 0; i < TOTAL_URLS; i++) {
    await page.waitForSelector("div.wp-post-navigation-next a");

    const nextHref = await page.evaluate(() => {
      const container = document.querySelector("div.wp-post-navigation-next");
      if (!container) return null;

      const anchors = Array.from(container.querySelectorAll("a"));
      const target = anchors.find(a =>
        (a.textContent || "").toLowerCase().includes("capitulo siguiente")
      );

      return target ? (target.getAttribute("href") || target.href) : null;
    });

    if (!nextHref) {
      throw new Error(
        'No se encontró un enlace con texto "Capitulo Siguiente" dentro de div.wp-post-navigation-next'
      );
    }

    const absoluteNextUrl = new URL(nextHref, page.url()).toString();
    collectedUrls.push(absoluteNextUrl);

    await page.goto(absoluteNextUrl, { waitUntil: "domcontentloaded" });
  }

  await fs.writeFile(OUTPUT_FILE, collectedUrls.join("\n"), { encoding: "utf-8" });

  await browser.close();

  console.log(`Listo. Guardadas ${collectedUrls.length} URLs en ${OUTPUT_FILE}`);
}
