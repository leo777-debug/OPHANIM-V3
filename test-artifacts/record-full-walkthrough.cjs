const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");
const {
  chromium,
} = require("C:/Users/Leonard/AppData/Local/Temp/ophanim-browser-runtime/node_modules/playwright-core");

const root = "C:/Users/Leonard/OneDrive/Documents/OPHANIM-V3 2";
const rawVideoDir = path.join(root, "test-artifacts", "full-walkthrough-raw");
const finalWebm = path.join(
  root,
  "test-artifacts",
  "ophanim-full-product-walkthrough.webm",
);
const csvPath = path.join(root, "test-artifacts", "walkthrough-import.csv");
const xlsxPath = path.join(
  root,
  "outputs",
  "01a041bc-1122-7ec2-af1d-90f72c883b41",
  "ophanim-shipment-import.xlsx",
);

const json = (value) => JSON.stringify(value);
const now = "2026-08-27T17:00:00.000Z";
let activeContext;

function importRecord(id, fileName, encoding, total, valid, invalid) {
  return {
    id,
    importType: "shipment",
    fileName,
    fileSizeBytes: encoding === "xlsx" ? 4064 : 70,
    fileEncoding: encoding,
    columnMapping: {},
    status: "previewed",
    totalRows: total,
    validRows: valid,
    invalidRows: invalid,
    duplicateRows: 0,
    processedRows: 0,
    importedRows: 0,
    failedRows: 0,
    summary: {},
    confirmedAt: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

const csvMapping = {
  shipmentReference: "Shipment reference",
  carrier: "Carrier",
  plannedArrivalAt: "ETA",
};

const xlsxMapping = {
  shipmentReference: "Shipment reference",
  carrier: "Carrier",
  plannedArrivalAt: "ETA",
  vesselName: "Vessel",
  originPortCode: "Origin port code",
  destinationPortCode: "Destination port code",
  imoNumber: "IMO number",
};

const csvPreview = {
  import: {
    ...importRecord(
      "demo-csv",
      "walkthrough-import.csv",
      "utf-8",
      2,
      1,
      1,
    ),
    columnMapping: csvMapping,
  },
  preview: {
    checksum: "demo-csv-checksum",
    bytes: 70,
    encoding: "utf-8",
    headers: ["Shipment reference", "Carrier", "ETA"],
    suggestedMapping: csvMapping,
    mapping: csvMapping,
    rows: [
      {
        rowNumber: 2,
        raw: {
          "Shipment reference": "DXB-291",
          Carrier: "MSC",
          ETA: "2026-09-01",
        },
        normalized: {
          shipmentReference: "DXB-291",
          carrier: "MSC",
          plannedArrivalAt: "2026-09-01",
        },
        status: "valid",
        errors: [],
      },
      {
        rowNumber: 3,
        raw: {
          "Shipment reference": "",
          Carrier: "MSC",
          ETA: "not-a-date",
        },
        status: "invalid",
        errors: [
          "Shipment reference is required.",
          "ETA must be a valid date.",
        ],
      },
    ],
    totalRows: 2,
    validRows: 1,
    invalidRows: 1,
    duplicateRows: 0,
  },
};

const xlsxHeaders = [
  "Shipment reference",
  "Carrier",
  "ETA",
  "Vessel",
  "Origin port code",
  "Destination port code",
  "IMO number",
];
const xlsxRows = [
  [
    "DXB-292",
    "Maersk",
    "2026-09-03",
    "Maersk Sentosa",
    "AEDXB",
    "NLRTM",
    "9785304",
  ],
  [
    "DXB-293",
    "CMA CGM",
    "2026-09-05",
    "CMA CGM Palais Royal",
    "SGSIN",
    "DEHAM",
    "9839208",
  ],
  [
    "DXB-294",
    "MSC",
    "2026-09-08",
    "MSC Irina",
    "CNSHA",
    "AEJEA",
    "9929429",
  ],
];
const xlsxPreview = {
  import: {
    ...importRecord(
      "demo-xlsx",
      "ophanim-shipment-import.xlsx",
      "xlsx",
      3,
      3,
      0,
    ),
    columnMapping: xlsxMapping,
  },
  preview: {
    checksum: "demo-xlsx-checksum",
    bytes: 4064,
    encoding: "xlsx",
    sourceSheet: "Shipments",
    headers: xlsxHeaders,
    suggestedMapping: xlsxMapping,
    mapping: xlsxMapping,
    rows: xlsxRows.map((values, index) => ({
      rowNumber: index + 2,
      raw: Object.fromEntries(
        xlsxHeaders.map((header, valueIndex) => [
          header,
          values[valueIndex],
        ]),
      ),
      status: "valid",
      errors: [],
    })),
    totalRows: 3,
    validRows: 3,
    invalidRows: 0,
    duplicateRows: 0,
  },
};

const shipments = [
  {
    id: "sh-292",
    organizationId: "demo-logistics",
    shipmentReference: "DXB-292",
    carrier: "Maersk",
    vesselName: "Maersk Sentosa",
    imoNumber: "9785304",
    originPortName: "Dubai",
    originPortCode: "AEDXB",
    destinationPortName: "Rotterdam",
    destinationPortCode: "NLRTM",
    transshipmentPorts: [],
    operationalTimezone: "Asia/Dubai",
    priority: 3,
    currentStatus: "in_transit",
    createdAt: now,
    updatedAt: now,
    plannedDepartureAt: "2026-08-28T08:00:00Z",
    plannedArrivalAt: "2026-09-03T14:00:00Z",
  },
  {
    id: "sh-293",
    organizationId: "demo-logistics",
    shipmentReference: "DXB-293",
    carrier: "CMA CGM",
    vesselName: "CMA CGM Palais Royal",
    imoNumber: "9839208",
    originPortName: "Singapore",
    originPortCode: "SGSIN",
    destinationPortName: "Hamburg",
    destinationPortCode: "DEHAM",
    transshipmentPorts: ["EGSUZ"],
    operationalTimezone: "UTC",
    priority: 4,
    currentStatus: "at_risk",
    createdAt: now,
    updatedAt: now,
    plannedDepartureAt: "2026-08-29T08:00:00Z",
    plannedArrivalAt: "2026-09-05T09:00:00Z",
  },
  {
    id: "sh-294",
    organizationId: "demo-logistics",
    shipmentReference: "DXB-294",
    carrier: "MSC",
    vesselName: "MSC Irina",
    imoNumber: "9929429",
    originPortName: "Shanghai",
    originPortCode: "CNSHA",
    destinationPortName: "Jebel Ali",
    destinationPortCode: "AEJEA",
    transshipmentPorts: [],
    operationalTimezone: "Asia/Dubai",
    priority: 2,
    currentStatus: "planned",
    createdAt: now,
    updatedAt: now,
    plannedDepartureAt: "2026-08-31T08:00:00Z",
    plannedArrivalAt: "2026-09-08T12:00:00Z",
  },
];

const events = [
  {
    id: "ev-1",
    organizationId: null,
    visibility: "global",
    title: "Strait of Hormuz navigation advisory",
    summary:
      "Authority notice reports controlled vessel routing through the eastern lane.",
    eventType: "maritime_advisory",
    category: "maritime_port",
    status: "active",
    severity: 4,
    confidence: 94,
    verificationState: "confirmed",
    primaryProviderId: "ukmto",
    sourceCount: 3,
    updatedAt: "2026-08-27T16:40:00Z",
  },
  {
    id: "ev-2",
    organizationId: "demo-logistics",
    visibility: "organization_private",
    title: "Jebel Ali berth congestion",
    summary: "Customer connector reports extended berth waiting time.",
    eventType: "port_congestion",
    category: "maritime_port",
    status: "active",
    severity: 3,
    confidence: 78,
    verificationState: "likely",
    primaryProviderId: "customer-port-feed",
    sourceCount: 2,
    updatedAt: "2026-08-27T16:22:00Z",
  },
  {
    id: "ev-3",
    organizationId: null,
    visibility: "global",
    title: "North Sea severe weather warning",
    summary:
      "High winds and wave conditions are affecting scheduled port calls.",
    eventType: "severe_weather",
    category: "weather_disaster",
    status: "active",
    severity: 4,
    confidence: 91,
    verificationState: "confirmed",
    primaryProviderId: "gdacs",
    sourceCount: 2,
    updatedAt: "2026-08-27T15:55:00Z",
  },
];

const intelligenceProviders = [
  {
    id: "gdacs",
    name: "GDACS",
    pack: "weather_disaster",
    mode: "FREE",
    costType: "free",
    configured: true,
    supportedEventTypes: ["severe_weather"],
  },
  {
    id: "ukmto",
    name: "UKMTO advisories",
    pack: "maritime_port",
    mode: "FREE",
    costType: "free",
    configured: true,
    supportedEventTypes: ["maritime_advisory"],
  },
  {
    id: "customer-port-feed",
    name: "Customer port feed",
    pack: "maritime_port",
    mode: "CUSTOMER_KEY",
    costType: "customer",
    configured: true,
    supportedEventTypes: ["port_congestion"],
  },
  {
    id: "opensanctions",
    name: "OpenSanctions",
    pack: "sanctions",
    mode: "FREE",
    costType: "free",
    configured: true,
    supportedEventTypes: ["sanctions"],
  },
  {
    id: "threatfox",
    name: "ThreatFox",
    pack: "cyber_threat",
    mode: "CUSTOMER_KEY",
    costType: "customer",
    configured: false,
    supportedEventTypes: ["cyber_threat"],
  },
];

async function main() {
  await fs.mkdir(rawVideoDir, { recursive: true });

  const context = await chromium.launchPersistentContext(
    `C:/Users/Leonard/AppData/Local/Temp/ophanim-full-demo-profile-${Date.now()}`,
    {
      headless: true,
      executablePath:
        "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
      viewport: { width: 1440, height: 900 },
      recordVideo: {
        dir: rawVideoDir,
        size: { width: 1440, height: 900 },
      },
    },
  );
  activeContext = context;
  const warmupPage = context.pages()[0] || (await context.newPage());
  const worldMonitorUrl =
    "https://www.worldmonitor.app/embed?layers=conflicts%2Cprotests%2CtradeRoutes%2Cwaterways%2Ccables%2Cpipelines%2Cearthquakes%2Cweather%2Ceconomic%2CstockExchanges%2CfinancialCenters%2CcentralBanks%2CcommodityHubs%2CgulfInvestments&center=20%2C0&zoom=1.35&theme=dark&variant=full";
  const canvasVariance = async (canvas) => {
    const screenshot = await canvas.screenshot({ type: "png" });
    const stats = await sharp(screenshot).resize(96, 60).stats();
    return (
      stats.channels.reduce(
        (total, channel) => total + channel.stdev,
        0,
      ) / stats.channels.length
    );
  };
  const waitForRenderedCanvas = async (canvasLocator, timeout = 45_000) => {
    const startedAt = Date.now();
    let variance = 0;
    while (Date.now() - startedAt < timeout) {
      if ((await canvasLocator.count()) > 0) {
        variance = await canvasVariance(canvasLocator.first()).catch(() => 0);
        if (variance > 10) return variance;
      }
      await warmupPage.waitForTimeout(1_000);
    }
    throw new Error(`WorldMonitor canvas remained blank (variance ${variance})`);
  };

  console.log("WARMUP: WorldMonitor canvas");
  await warmupPage.goto(worldMonitorUrl, { waitUntil: "domcontentloaded" });
  const warmVariance = await waitForRenderedCanvas(
    warmupPage.locator("canvas"),
    60_000,
  );
  await warmupPage.close();

  const page = await context.newPage();
  const video = page.video();
  const issues = [];
  let previewCount = 0;

  page.on("pageerror", (error) => issues.push(`page: ${error.message}`));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.text().includes("cloudflareinsights") &&
      !message.text().includes("401 (Unauthorized)")
    ) {
      issues.push(`console: ${message.text()}`);
    }
  });

  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const ok = (body) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: json(body),
      });

    if (pathname === "/api/auth/me") {
      return ok({
        actor: {
          userId: "demo-user",
          organizationId: "demo-logistics",
          role: "operations_manager",
        },
      });
    }
    if (pathname === "/api/providers") {
      return ok({ available: 14, total: 15, providers: [] });
    }
    if (pathname === "/api/intelligence/dashboard") {
      return ok({
        dashboard: {
          open_alerts: 3,
          triage: 2,
          open_tasks: 4,
          rescue_cases: 1,
          logistics_alerts: 2,
          cyber_alerts: 1,
          roll_calls: 1,
        },
      });
    }
    if (pathname === "/api/intelligence/queue") return ok({ items: [] });
    if (pathname === "/api/intelligence/alerts") return ok({ alerts: [] });
    if (pathname === "/api/intelligence/tasks") return ok({ tasks: [] });
    if (pathname === "/api/intelligence/settings") {
      return ok({
        settings: {
          email: "ops@demo.invalid",
          enabled: true,
          mode: "digest",
          digestMinutes: 30,
          minimumConfidence: 70,
        },
      });
    }
    if (pathname === "/api/intelligence/deliveries") {
      return ok({ deliveries: [] });
    }
    if (pathname === "/api/imports/preview") {
      previewCount += 1;
      return ok(previewCount === 1 ? csvPreview : xlsxPreview);
    }
    if (pathname === "/api/imports/demo-csv/confirm") {
      return ok({
        import: {
          ...csvPreview.import,
          status: "completed",
          processedRows: 2,
          importedRows: 1,
          failedRows: 1,
          confirmedAt: "2026-08-27T17:02:00Z",
          completedAt: "2026-08-27T17:02:01Z",
        },
      });
    }
    if (pathname === "/api/imports/demo-xlsx/confirm") {
      return ok({
        import: {
          ...xlsxPreview.import,
          status: "completed",
          processedRows: 3,
          importedRows: 3,
          failedRows: 0,
          confirmedAt: "2026-08-27T17:03:00Z",
          completedAt: "2026-08-27T17:03:01Z",
        },
      });
    }
    if (
      pathname === "/api/logistics/shipments" &&
      request.method() === "GET"
    ) {
      return ok({ shipments });
    }
    if (pathname === "/api/platform/events") return ok({ events });
    if (
      pathname === "/api/intelligence/providers" &&
      request.method() === "GET"
    ) {
      return ok({ providers: intelligenceProviders });
    }
    if (
      pathname === "/api/intelligence/providers" &&
      request.method() === "POST"
    ) {
      return ok({
        diagnostics: intelligenceProviders.map((provider) => ({
          providerId: provider.id,
          status: provider.configured ? "success" : "skipped",
        })),
        eventsProcessed: 3,
      });
    }
    return route.continue();
  });

  const pause = (milliseconds) => page.waitForTimeout(milliseconds);
  const banner = async (title, detail = "") => {
    await page.evaluate(
      ({ title, detail }) => {
        document.getElementById("codex-demo-step")?.remove();
        const element = document.createElement("div");
        element.id = "codex-demo-step";
        element.style.cssText =
          "position:fixed;left:50%;top:78px;transform:translateX(-50%);z-index:2147483647;min-width:360px;max-width:720px;padding:13px 18px;border:1px solid rgba(121,190,166,.8);border-radius:5px;color:#f3faf6;background:rgba(10,22,18,.96);box-shadow:0 14px 38px rgba(0,0,0,.34);font:600 14px Segoe UI,Arial;text-align:center;pointer-events:none";
        const heading = document.createElement("strong");
        heading.textContent = title;
        element.appendChild(heading);
        if (detail) {
          const copy = document.createElement("div");
          copy.style.cssText =
            "margin-top:4px;color:#a9bdb5;font-size:11px;font-weight:400";
          copy.textContent = detail;
          element.appendChild(copy);
        }
        document.body.appendChild(element);
      },
      { title, detail },
    );
    await pause(1800);
    await page.evaluate(() =>
      document.getElementById("codex-demo-step")?.remove(),
    );
  };
  const section = async (locator) => {
    await locator.scrollIntoViewIfNeeded();
    await pause(800);
  };
  const waitForWorldMonitorEmbed = async (timeout = 45_000) => {
    const startedAt = Date.now();
    let variance = 0;
    while (Date.now() - startedAt < timeout) {
      const frame = page
        .frames()
        .find((candidate) =>
          candidate.url().startsWith("https://www.worldmonitor.app/embed"),
        );
      if (frame && (await frame.locator("canvas").count()) > 0) {
        variance = await canvasVariance(frame.locator("canvas").first()).catch(
          () => 0,
        );
        if (variance > 10) return variance;
      }
      await pause(1_000);
    }
    throw new Error(`Embedded WorldMonitor canvas remained blank (${variance})`);
  };

  console.log("STEP 1: operational map");
  await page.goto("http://localhost:3000/logistics/map", {
    waitUntil: "domcontentloaded",
  });
  await banner(
    "1 · Global operational map",
    "Official WorldMonitor public layers, followed by Ophanim live feeds",
  );
  const openingVariance = await waitForWorldMonitorEmbed();
  await pause(2600);
  await page.locator(".world-map-actions select").selectOption("mena");
  await banner(
    "Regional focus · MENA",
    "The live map reframes without leaving the operations workspace",
  );
  await pause(5500);
  const layerSearch = page.getByPlaceholder("Search layers");
  await layerSearch.fill("pipelines");
  await pause(900);
  await page.locator(".world-map-layer").click();
  await banner(
    "Layer provenance is explicit",
    "API-only feeds are catalogued and clearly marked instead of simulated",
  );
  await pause(1600);
  await layerSearch.fill("");
  await page.getByRole("button", { name: "Ophanim live" }).click();
  await banner(
    "Ophanim live mode",
    "Open feeds load independently, so one unavailable source cannot blank the map",
  );
  await pause(17000);
  const liveBadge = await page.locator(".world-map-source-badge").innerText();
  if (!/feeds responding/.test(liveBadge)) {
    issues.push(`Live feed badge did not settle: ${liveBadge}`);
  }

  console.log("STEP 2: operations overview");
  await page.locator('a[href="/operations"]').first().click();
  await page.waitForURL("**/operations");
  await page.getByRole("heading", { name: "Operations workspace" }).waitFor();
  await banner(
    "2 · Operations overview",
    "Daily workload stays separate from the high-density monitoring map",
  );
  await pause(2600);

  console.log("STEP 3: CSV import");
  await page.locator('a[href="/imports"]').first().click();
  await page.waitForURL("**/imports");
  await page.getByRole("heading", { name: "Import records" }).waitFor();
  await banner(
    "3 · CSV shipment import",
    "Upload, automatic mapping, row validation, and partial success",
  );
  await page.locator('input[type="file"]').setInputFiles(csvPath);
  await pause(1100);
  await page.getByRole("button", { name: "Preview import" }).click();
  await page.getByRole("heading", { name: "2. Confirm column mapping" }).waitFor();
  await section(
    page.getByRole("heading", { name: "2. Confirm column mapping" }),
  );
  await banner(
    "Columns detected and mapped",
    "Shipment reference, carrier, and ETA are mapped before confirmation",
  );
  await section(page.getByRole("heading", { name: "3. Review and import" }));
  await banner(
    "Invalid rows do not cancel the file",
    "Row 3 is held back while the valid shipment remains importable",
  );
  await page.getByRole("button", { name: "Confirm import" }).click();
  await page.getByText("1 imported, 1 not imported").waitFor();
  await pause(2500);

  console.log("STEP 4: Excel import");
  await page.goto("http://localhost:3000/imports", {
    waitUntil: "domcontentloaded",
  });
  await page.getByRole("heading", { name: "Import records" }).waitFor();
  await banner(
    "4 · Excel workbook import",
    "The same review gate supports a populated .xlsx worksheet",
  );
  await page.locator('input[type="file"]').setInputFiles(xlsxPath);
  await pause(1100);
  await page.getByRole("button", { name: "Preview import" }).click();
  await page.getByRole("heading", { name: "2. Confirm column mapping" }).waitFor();
  await section(
    page.getByRole("heading", { name: "2. Confirm column mapping" }),
  );
  await banner(
    "Excel mapping preview",
    "Seven shipment fields detected · three valid rows · zero invalid rows",
  );
  await section(page.getByRole("heading", { name: "3. Review and import" }));
  await page.getByRole("button", { name: "Confirm import" }).click();
  await page.getByText("3 imported, 0 not imported").waitFor();
  await banner(
    "Excel import confirmed",
    "All three validated rows complete without bypassing the approval gate",
  );

  console.log("STEP 5: shipment list");
  await page.locator('a[href="/logistics"]').first().click();
  await page.waitForURL("**/logistics");
  await page.getByRole("heading", { name: "Shipments" }).waitFor();
  await banner(
    "5 · Organization-scoped shipment list",
    "Imported records become searchable operational data",
  );
  const shipmentSearch = page.getByLabel("Search shipments", { exact: true });
  await shipmentSearch.fill("DXB-293");
  await pause(2300);
  await shipmentSearch.fill("");
  await pause(1200);

  console.log("STEP 6: intelligence ledger");
  await page.locator('a[href="/events"]').first().click();
  await page.waitForURL("**/events");
  await page.getByRole("heading", { name: "Provider-fed events" }).waitFor();
  await banner(
    "6 · Provider-fed intelligence",
    "Public authority feeds and private customer connectors retain provenance",
  );
  await page
    .getByLabel("Filter by intelligence pack")
    .selectOption("maritime_port");
  await pause(2200);
  await page.getByRole("button", { name: "Refresh feeds" }).click();
  await page.getByText(/Refresh completed/).waitFor();
  await pause(2200);

  console.log("STEP 7: final map verification");
  await page.locator('a[href="/logistics/map"]').first().click();
  await page.waitForURL("**/logistics/map");
  await page.getByRole("heading", { name: "Global situation monitor" }).waitFor();
  const closingVariance = await waitForWorldMonitorEmbed();
  await pause(2200);
  await banner(
    "7 · Verification complete",
    "CSV, Excel, tenant-scoped records, intelligence feeds, and both map modes tested",
  );
  await page.screenshot({
    path: path.join(root, "test-artifacts", "ophanim-full-walkthrough-poster.png"),
    type: "png",
  });
  await pause(3200);

  const layout = await page.evaluate(() => ({
    overflowX: document.documentElement.scrollWidth > window.innerWidth,
    viewport: [window.innerWidth, window.innerHeight],
    documentWidth: document.documentElement.scrollWidth,
  }));
  if (layout.overflowX) issues.push("Horizontal overflow detected on final map");

  const rawPath = await video.path();
  await context.close();
  activeContext = undefined;
  await fs.copyFile(rawPath, finalWebm);

  console.log(
    json({
      finalWebm,
      rawPath,
      issues: [...new Set(issues)],
      layout,
      liveBadge,
      canvasVariance: {
        warmup: warmVariance,
        opening: openingVariance,
        closing: closingVariance,
      },
    }),
  );
}

main().catch(async (error) => {
  console.error(error);
  await activeContext?.close().catch(() => undefined);
  process.exitCode = 1;
});
