import { getTenUrls } from "./getUrls";

const script = {
  getTenUrls,
};

function main() {
  try {
    script.getTenUrls();
  } catch (error) {
    console.error("Error:", error);
  }
}

main();
