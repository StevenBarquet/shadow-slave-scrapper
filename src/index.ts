import { continuousScraper } from "./scrapper";

async function main() {
  try {
    await continuousScraper();
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
