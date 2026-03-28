import fs from "fs/promises";
import { fileURLToPath } from 'node:url';
import path from "path";
import puppeteer, { Page } from "puppeteer";

const LAST_URL_FILE = "last_url.txt";
const OUTPUT_DIR = path.join(process.cwd(), "scrapped-txts");
const MAX_CHAPTERS = 1000; // Safety limit to prevent infinite loops
const DELAY_BETWEEN_CHAPTERS = 2000; // 2 seconds delay between chapters

function extractCapNumberFromUrl(url: string): number | null {
  const match_A = url.match(/chapter-(\d+)(?:-[^/]+)?\//i);
  const match_B = url.match(/capitulo-(\d+)(?:-[^/]+)?\//i);
  if (!match_A && !match_B) return null;
  return Number(match_A ? match_A[1] : match_B[1]);
}

function capFileName(capNumber: number): string {
  const padded = String(capNumber).padStart(4, "0");
  return `ORIGINAL_CAP_${padded}.txt`;
}

async function ensureDir(dirPath: string) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function readLastUrl(): Promise<string> {
  const content = await fs.readFile(LAST_URL_FILE, "utf-8").catch(() => "");
  return content.trim();
}

async function saveLastUrl(url: string): Promise<void> {
  await fs.writeFile(LAST_URL_FILE, url, { encoding: "utf-8" });
}

async function scrapeChapterContent(page: Page, url: string): Promise<{
  titleAndParagraphs: string;
  pageTitle: string;
}> {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  
  // Wait for the content to load
  await page.waitForSelector("div.entry-content.clear");

  const result = await page.evaluate(() => {
    const root = document.querySelector("div.entry-content.clear");
    if (!root) {
      return { titleAndParagraphs: "", pageTitle: document.title || "" };
    }

    const nodes = Array.from(root.querySelectorAll("h1, p"));

    // Remove the last paragraph (usually contains ads or navigation)
    const lastPIndexFromEnd = [...nodes]
      .reverse()
      .findIndex((n) => n.tagName.toLowerCase() === "p");
    if (lastPIndexFromEnd !== -1) {
      const lastPIndex = nodes.length - 1 - lastPIndexFromEnd;
      nodes.splice(lastPIndex, 1);
    }

    const lines = nodes
      .map((n) => (n.textContent || "").trim())
      .filter(Boolean);

    return {
      titleAndParagraphs: lines.join("\n\n"),
      pageTitle: document.title || "",
    };
  });

  return result;
}

async function findNextChapterUrl(page: Page): Promise<string | null> {
  try {
    // Wait for navigation element to be present
    await page.waitForSelector("div.wp-post-navigation-next a", { timeout: 5000 });

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
      console.warn("No se encontró enlace 'Capitulo Siguiente'");
      return null;
    }

    // Convert relative URL to absolute URL
    const absoluteNextUrl = new URL(nextHref, page.url()).toString();
    return absoluteNextUrl;

  } catch (error) {
    console.warn("Error buscando el siguiente capítulo:", error);
    return null;
  }
}

async function saveChapterContent(
  url: string,
  titleAndParagraphs: string,
  pageTitle: string
): Promise<void> {
  if (!titleAndParagraphs.trim()) {
    console.warn(`Contenido vacío para: ${url}`);
    return;
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
  const content = header + titleAndParagraphs;

  await fs.writeFile(outPath, content, { encoding: "utf-8" });
  console.log(`✅ Guardado: ${outPath}`);
}

export async function continuousScraper() {
  console.log("🚀 Iniciando scraper continuo de novelas...");

  // Read the starting URL from last_url.txt
  const startUrl = await readLastUrl();
  if (!startUrl) {
    throw new Error("No se encontró URL en last_url.txt. Por favor, agrega una URL inicial.");
  }

  console.log(`📍 URL inicial: ${startUrl}`);

  await ensureDir(OUTPUT_DIR);

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);

  let currentUrl = startUrl;
  let chaptersScraped = 0;

  while (chaptersScraped < MAX_CHAPTERS) {
    try {
      console.log(`\n📖 Procesando capítulo ${chaptersScraped + 1}: ${currentUrl}`);

      // Scrape the current chapter content
      const { titleAndParagraphs, pageTitle } = await scrapeChapterContent(page, currentUrl);
      
      // Save the scraped content
      await saveChapterContent(currentUrl, titleAndParagraphs, pageTitle);

      // Find the next chapter URL
      const nextUrl = await findNextChapterUrl(page);
      
      if (!nextUrl) {
        console.log("🏁 No se encontró más capítulos. Finalizando.");
        break;
      }

      // Check if we're in a loop (same URL as before)
      if (nextUrl === currentUrl) {
        console.log("⚠️  Detected loop - next URL is the same as current. Stopping.");
        break;
      }

      // Update last_url.txt with the next URL
      await saveLastUrl(nextUrl);
      console.log(`🔄 Siguiente capítulo: ${nextUrl}`);

      // Move to next chapter
      currentUrl = nextUrl;
      chaptersScraped++;

      // Add delay between requests to be respectful to the server
      if (chaptersScraped < MAX_CHAPTERS) {
        console.log(`⏳ Esperando ${DELAY_BETWEEN_CHAPTERS / 1000} segundos...`);
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_CHAPTERS));
      }

    } catch (error) {
      console.error(`❌ Error procesando capítulo ${currentUrl}:`, error);
      
      // Save the current URL so we can resume from here
      await saveLastUrl(currentUrl);
      throw error;
    }
  }

  await browser.close();
  
  if (chaptersScraped >= MAX_CHAPTERS) {
    console.log(`⚠️  Alcanzado el límite máximo de ${MAX_CHAPTERS} capítulos.`);
  }

  console.log(`\n✨ Scraping completado. Se procesaron ${chaptersScraped} capítulos.`);
  console.log(`📍 Última URL guardada en ${LAST_URL_FILE}: ${currentUrl}`);
}


// Lógica equivalente a require.main === module en ESM
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
  continuousScraper()
    .then(() => {
      console.log("✅ Proceso finalizado exitosamente");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Error en el proceso:", error);
      process.exit(1);
    });
}