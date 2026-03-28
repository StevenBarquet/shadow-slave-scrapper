import puppeteer from "puppeteer";
import fs from "fs/promises";
import path from "path";

const URLS_FILE = "urls.txt";
const LAST_URL_FILE = "last_url.txt";
const OUTPUT_DIR = path.join(process.cwd(), "scrapped-txts");

function extractCapNumberFromUrl(url: string): number | null {
  const match = url.match(/chapter-(\d+)(?:-[^/]+)?\//i);
  if (!match) return null;
  return Number(match[1]);
}

function capFileName(capNumber: number): string {
  const padded = String(capNumber).padStart(4, "0");
  return `CAP_${padded}.txt`;
}

async function ensureDir(dirPath: string) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function readUrls(filePath: string): Promise<string[]> {
  const raw = await fs.readFile(filePath, "utf-8").catch(() => "");
  return raw
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean);
}

export async function scrap_urls() {
  const urls = await readUrls(URLS_FILE);
  if (urls.length === 0) {
    console.log("No hay URLs en urls.txt. Nada que scrapear.");
    return;
  }

  await ensureDir(OUTPUT_DIR);

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);

  let lastScrapedUrl = "";

  for (const url of urls) {
    await page.goto(url, { waitUntil: "domcontentloaded" });

    await page.waitForSelector("div.entry-content.clear");

    const { titleAndParagraphs, pageTitle } = await page.evaluate(() => {
      const root = document.querySelector("div.entry-content.clear");
      if (!root) {
        return { titleAndParagraphs: "", pageTitle: document.title || "" };
      }

      const nodes = Array.from(root.querySelectorAll("h1, p"));

      const lastPIndexFromEnd = [...nodes].reverse().findIndex(n => n.tagName.toLowerCase() === "p");
      if (lastPIndexFromEnd !== -1) {
        const lastPIndex = nodes.length - 1 - lastPIndexFromEnd;
        nodes.splice(lastPIndex, 1);
      }

      const lines = nodes
        .map(n => (n.textContent || "").trim())
        .filter(Boolean);

      return {
        titleAndParagraphs: lines.join("\n\n"),
        pageTitle: document.title || ""
      };
    });

    if (!titleAndParagraphs.trim()) {
      console.warn(`Contenido vacío (h1/p) para: ${url}`);
    }

    const capNumber = extractCapNumberFromUrl(url);
    if (capNumber === null || Number.isNaN(capNumber)) {
      throw new Error(
        `No pude extraer el número de capítulo desde la URL: ${url}\n` +
          `Asegúrate de que contenga un patrón tipo "chapter-247-2/".`
      );
    }

    const fileName = capFileName(capNumber);
    const outPath = path.join(OUTPUT_DIR, fileName);

    const header = `SOURCE: ${url}\nTITLE: ${pageTitle}\n\n`;
    await fs.writeFile(outPath, header + titleAndParagraphs, { encoding: "utf-8" });

    lastScrapedUrl = url;
    console.log(`Guardado: ${outPath}`);
  }

  await browser.close();

  await fs.writeFile(URLS_FILE, "", { encoding: "utf-8" });
  await fs.writeFile(LAST_URL_FILE, lastScrapedUrl, { encoding: "utf-8" });

  console.log(`Terminado. last_url.txt = ${lastScrapedUrl}`);
}
