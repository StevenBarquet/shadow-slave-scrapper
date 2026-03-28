import { getTenUrls } from "./getUrls";
import { scrap_urls } from "./scrapper";

const script = {
  getTenUrls,
  scrap_urls,
};

function main() {
  try {
    script.getTenUrls();
  } catch (error) {
    console.error("Error:", error);
  }
}

main();
