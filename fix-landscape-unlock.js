const fs = require("fs");

let content = fs.readFileSync("frontend/index.html", "utf8");

const landscapeForceUnlock = `
<style id="landscape-force-unlock">
  /* Force vertical scrolling and flex stacking in short screen heights (Landscape) */
  @media screen and (max-height: 600px) {
    html, body, #app, .app-container, main, div[class*="flex"], div[class*="min-h"] {
      height: auto !important;
      min-height: 100% !important;
      max-height: none !important;
      overflow-y: auto !important;
      overflow-x: hidden !important;
    }

    /* Prevent fixed elements from locking the viewport */
    .sidebar, aside, nav, header {
      position: relative !important;
      width: 100% !important;
      height: auto !important;
      max-height: none !important;
    }

    /* Stack multi-column grids horizontally to vertical flow */
    .grid, [class*="grid-cols-"], .forecast-grid, .card-grid {
      display: flex !important;
      flex-direction: column !important;
      width: 100% !important;
    }
  }
</style>
`;

if (!content.includes("landscape-force-unlock")) {
  content = content.replace("</head>", `${landscapeForceUnlock}\n</head>`);
  fs.writeFileSync("frontend/index.html", content, "utf8");
  console.log("✓ Successfully added landscape force-unlock CSS!");
} else {
  // Update existing patch
  content = content.replace(/<style id="landscape-force-unlock">[\s\S]*?<\/style>/, landscapeForceUnlock);
  fs.writeFileSync("frontend/index.html", content, "utf8");
  console.log("✓ Updated landscape force-unlock CSS!");
}
