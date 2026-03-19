import { chromium, devices, BrowserContextOptions, Browser } from "playwright";
import { SearchResponse, SearchResult, CommandOptions, HtmlResponse, WebSearchResult, WebPageContent, HeadingStructure } from "./types.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import logger from "./logger.js";
import { url } from "inspector";
import { JSDOM } from "jsdom";

// Fingerprint configuration interface
interface FingerprintConfig {
  deviceName: string;
  locale: string;
  timezoneId: string;
  colorScheme: "dark" | "light";
  reducedMotion: "reduce" | "no-preference";
  forcedColors: "active" | "none";
}

// Saved state file interface
interface SavedState {
  fingerprint?: FingerprintConfig;
  googleDomain?: string;
}

/**
 * Get actual config of host machine
 * @param userLocale User specified locale (if any)
 * @returns Fingerprint config based on host machine
 */
function getHostMachineConfig(userLocale?: string): FingerprintConfig {
  // Get system locale setting
  const systemLocale = userLocale || process.env.LANG || "zh-CN";

  // Get system timezone
  // Node.js does not directly provide timezone info, but can infer from timezone offset
  const timezoneOffset = new Date().getTimezoneOffset();
  let timezoneId = "Asia/Shanghai"; // Default timezone is Shanghai

  // Infer timezone roughly based on timezone offset
  // Timezone offset is in minutes, negative means east of UTC
  if (timezoneOffset <= -480 && timezoneOffset > -600) {
    // UTC+8 (China, Singapore, Hong Kong, etc)
    timezoneId = "Asia/Shanghai";
  } else if (timezoneOffset <= -540) {
    // UTC+9 (Japan, Korea, etc)
    timezoneId = "Asia/Tokyo";
  } else if (timezoneOffset <= -420 && timezoneOffset > -480) {
    // UTC+7 (Thailand, Vietnam, etc)
    timezoneId = "Asia/Bangkok";
  } else if (timezoneOffset <= 0 && timezoneOffset > -60) {
    // UTC+0 (UK, etc)
    timezoneId = "Europe/London";
  } else if (timezoneOffset <= 60 && timezoneOffset > 0) {
    // UTC-1 (Parts of Europe)
    timezoneId = "Europe/Berlin";
  } else if (timezoneOffset <= 300 && timezoneOffset > 240) {
    // UTC-5 (US Eastern)
    timezoneId = "America/New_York";
  }

  // Detect system color scheme
  // Node.js cannot get system color scheme directly, use reasonable default
  // Can infer from time: dark mode at night, light mode during day
  const hour = new Date().getHours();
  const colorScheme =
    hour >= 19 || hour < 7 ? ("dark" as const) : ("light" as const);

  // Other settings use reasonable defaults
  const reducedMotion = "no-preference" as const; // Most users wont enable reduced motion
  const forcedColors = "none" as const; // Most users wont enable forced colors

  // Choose appropriate device name
  // Choose appropriate browser based on OS
  const platform = os.platform();
  let deviceName = "Desktop Chrome"; // Default to Chrome

  if (platform === "darwin") {
    // macOS
    deviceName = "Desktop Safari";
  } else if (platform === "win32") {
    // Windows
    deviceName = "Desktop Edge";
  } else if (platform === "linux") {
    // Linux
    deviceName = "Desktop Firefox";
  }

  // Chrome we use
  deviceName = "Desktop Chrome";

  return {
    deviceName,
    locale: systemLocale,
    timezoneId,
    colorScheme,
    reducedMotion,
    forcedColors,
  };
}

/**
 * Execute Google search and return results
 * @param query Search keyword
 * @param options Search options
 * @returns Search results
 */
export async function googleSearch(
  query: string,
  options: CommandOptions = {},
  existingBrowser?: Browser
): Promise<SearchResponse> {
  // Set default options
  const {
    limit = 10,
    timeout = 60000,
    stateFile = "./browser-state.json",
    noSaveState = false,
    locale = "zh-CN", // Default to Chinese
  } = options;

  // Use user specified headless option if provided; otherwise default to headless mode
  let useHeadless = options.headless !== undefined ? options.headless : true;

  logger.info({ options }, "Initializing browser...");

  // Check if state file exists
  let storageState: string | undefined = undefined;
  let savedState: SavedState = {};

  // Fingerprint config file path
  const fingerprintFile = stateFile.replace(".json", "-fingerprint.json");

  if (fs.existsSync(stateFile)) {
    logger.info(
      { stateFile },
      "Browser state file found, using saved state to avoid bot detection"
    );
    storageState = stateFile;

    // Try to load saved fingerprint config
    if (fs.existsSync(fingerprintFile)) {
      try {
        const fingerprintData = fs.readFileSync(fingerprintFile, "utf8");
        savedState = JSON.parse(fingerprintData);
        logger.info("Loaded saved browser fingerprint config");
      } catch (e) {
        logger.warn({ error: e }, "Cannot load fingerprint config, creating new one");
      }
    }
  } else {
    logger.info(
      { stateFile },
      "No browser state file found, creating new browser session and fingerprint"
    );
  }

  // Only use desktop device list
  const deviceList = [
    "Desktop Chrome",
    "Desktop Edge",
    "Desktop Firefox",
    "Desktop Safari",
  ];

  // Timezone list
  const timezoneList = [
    "America/New_York",
    "Europe/London",
    "Asia/Shanghai",
    "Europe/Berlin",
    "Asia/Tokyo",
  ];

  // Google domain list
  const googleDomains = [
    "https://www.google.com",
    "https://www.google.co.uk",
    "https://www.google.ca",
    "https://www.google.com.au",
  ];

  // Get random device config or use saved config
  const getDeviceConfig = (): [string, any] => {
    if (
      savedState.fingerprint?.deviceName &&
      devices[savedState.fingerprint.deviceName]
    ) {
      // Use saved device config
      return [
        savedState.fingerprint.deviceName,
        devices[savedState.fingerprint.deviceName],
      ];
    } else {
      // Randomly select a device
      const randomDevice =
        deviceList[Math.floor(Math.random() * deviceList.length)];
      return [randomDevice, devices[randomDevice]];
    }
  };

  // Get random delay time
  const getRandomDelay = (min: number, max: number) => {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  };

  // Define a function to perform search, reusable for headless and headed mode
  async function performSearch(headless: boolean): Promise<SearchResponse> {
    let browser: Browser;
    let browserWasProvided = false;

    if (existingBrowser) {
      browser = existingBrowser;
      browserWasProvided = true;
      logger.info("Using existing browser instance");
    } else {
      logger.info(
        { headless },
        `Preparing to launch browser in ${headless ? "headless" : "headed"} mode...`
      );

      // Initialize browser with more parameters to avoid detection
      browser = await chromium.launch({
        headless,
        timeout: timeout * 2, // Increase browser startup timeout
        args: [
          "--disable-blink-features=AutomationControlled",
          "--disable-features=IsolateOrigins,site-per-process",
          "--disable-site-isolation-trials",
          "--disable-web-security",
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
          "--disable-gpu",
          "--hide-scrollbars",
          "--mute-audio",
          "--disable-background-networking",
          "--disable-background-timer-throttling",
          "--disable-backgrounding-occluded-windows",
          "--disable-breakpad",
          "--disable-component-extensions-with-background-pages",
          "--disable-extensions",
          "--disable-features=TranslateUI",
          "--disable-ipc-flooding-protection",
          "--disable-renderer-backgrounding",
          "--enable-features=NetworkService,NetworkServiceInProcess",
          "--force-color-profile=srgb",
          "--metrics-recording-only",
        ],
        ignoreDefaultArgs: ["--enable-automation"],
      });

      logger.info("Browser launched successfully!");
    }

    // Get device config - use saved or randomly generate
    const [deviceName, deviceConfig] = getDeviceConfig();

    // Create browser context options
    let contextOptions: BrowserContextOptions = {
      ...deviceConfig,
    };

    // Use saved fingerprint config if available; otherwise use host machine settings
    if (savedState.fingerprint) {
      contextOptions = {
        ...contextOptions,
        locale: savedState.fingerprint.locale,
        timezoneId: savedState.fingerprint.timezoneId,
        colorScheme: savedState.fingerprint.colorScheme,
        reducedMotion: savedState.fingerprint.reducedMotion,
        forcedColors: savedState.fingerprint.forcedColors,
      };
      logger.info("Using saved browser fingerprint config");
    } else {
      // Get host machine actual settings
      const hostConfig = getHostMachineConfig(locale);

      // If different device type needed, get device config again
      if (hostConfig.deviceName !== deviceName) {
        logger.info(
          { deviceType: hostConfig.deviceName },
          "Using device type based on host machine settings"
        );
        // Use new device config
        contextOptions = { ...devices[hostConfig.deviceName] };
      }

      contextOptions = {
        ...contextOptions,
        locale: hostConfig.locale,
        timezoneId: hostConfig.timezoneId,
        colorScheme: hostConfig.colorScheme,
        reducedMotion: hostConfig.reducedMotion,
        forcedColors: hostConfig.forcedColors,
      };

      // Save newly generated fingerprint config
      savedState.fingerprint = hostConfig;
      logger.info(
        {
          locale: hostConfig.locale,
          timezone: hostConfig.timezoneId,
          colorScheme: hostConfig.colorScheme,
          deviceType: hostConfig.deviceName,
        },
        "Generated new browser fingerprint based on host machine"
      );
    }

    // Add common options - ensure desktop config
    contextOptions = {
      ...contextOptions,
      permissions: ["geolocation", "notifications"],
      acceptDownloads: true,
      isMobile: false, // Force desktop mode
      hasTouch: false, // Disable touch
      javaScriptEnabled: true,
    };

    if (storageState) {
      logger.info("Loading saved browser state...");
    }

    const context = await browser.newContext(
      storageState ? { ...contextOptions, storageState } : contextOptions
    );

    // Set extra browser properties to avoid detection
    await context.addInitScript(() => {
      // Override navigator properties
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      Object.defineProperty(navigator, "plugins", {
        get: () => [1, 2, 3, 4, 5],
      });
      Object.defineProperty(navigator, "languages", {
        get: () => ["en-US", "en", "zh-CN"],
      });

      // Override window properties
      // @ts-ignore - Ignore chrome property not found error
      window.chrome = {
        runtime: {},
        loadTimes: function () {},
        csi: function () {},
        app: {},
      };

      // Add WebGL fingerprint randomization
      if (typeof WebGLRenderingContext !== "undefined") {
        const getParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function (
          parameter: number
        ) {
          // Randomize UNMASKED_VENDOR_WEBGL and UNMASKED_RENDERER_WEBGL
          if (parameter === 37445) {
            return "Intel Inc.";
          }
          if (parameter === 37446) {
            return "Intel Iris OpenGL Engine";
          }
          return getParameter.call(this, parameter);
        };
      }
    });

    const page = await context.newPage();

    // Set extra page properties
    await page.addInitScript(() => {
      // Simulate real screen size and color depth
      Object.defineProperty(window.screen, "width", { get: () => 1920 });
      Object.defineProperty(window.screen, "height", { get: () => 1080 });
      Object.defineProperty(window.screen, "colorDepth", { get: () => 24 });
      Object.defineProperty(window.screen, "pixelDepth", { get: () => 24 });
    });

    try {
      // Use saved Google domain or randomly select one
      let selectedDomain: string;
      if (savedState.googleDomain) {
        selectedDomain = savedState.googleDomain;
        logger.info({ domain: selectedDomain }, "Using saved Google domain");
      } else {
        selectedDomain =
          googleDomains[Math.floor(Math.random() * googleDomains.length)];
        // Save selected domain
        savedState.googleDomain = selectedDomain;
        logger.info({ domain: selectedDomain }, "Randomly selected Google domain");
      }

      logger.info("Visiting Google search page...");

      // Visit Google search page
      const response = await page.goto(selectedDomain, {
        timeout,
        waitUntil: "networkidle",
      });

      // Check if redirected to CAPTCHA page
      const currentUrl = page.url();
      const sorryPatterns = [
        "google.com/sorry/index",
        "google.com/sorry",
        "recaptcha",
        "captcha",
        "unusual traffic",
      ];

      const isBlockedPage = sorryPatterns.some(
        (pattern) =>
          currentUrl.includes(pattern) ||
          (response && response.url().toString().includes(pattern))
      );

      if (isBlockedPage) {
        if (headless) {
          logger.warn("CAPTCHA detected, restarting browser in headed mode...");

          // Close current page and context
          await page.close();
          await context.close();

          // If external browser provided, dont close it but create new instance
          if (browserWasProvided) {
            logger.info(
              "CAPTCHA detected with external browser, creating new browser instance..."
            );
            // Create new browser instance, stop using external one
            const newBrowser = await chromium.launch({
              headless: false, // Use headed mode
              timeout: timeout * 2,
              args: [
                "--disable-blink-features=AutomationControlled",
                // Other params same as before
                "--disable-features=IsolateOrigins,site-per-process",
                "--disable-site-isolation-trials",
                "--disable-web-security",
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-accelerated-2d-canvas",
                "--no-first-run",
                "--no-zygote",
                "--disable-gpu",
                "--hide-scrollbars",
                "--mute-audio",
                "--disable-background-networking",
                "--disable-background-timer-throttling",
                "--disable-backgrounding-occluded-windows",
                "--disable-breakpad",
                "--disable-component-extensions-with-background-pages",
                "--disable-extensions",
                "--disable-features=TranslateUI",
                "--disable-ipc-flooding-protection",
                "--disable-renderer-backgrounding",
                "--enable-features=NetworkService,NetworkServiceInProcess",
                "--force-color-profile=srgb",
                "--metrics-recording-only",
              ],
              ignoreDefaultArgs: ["--enable-automation"],
            });

            // Use new browser instance to perform search
            try {
              const tempContext = await newBrowser.newContext(contextOptions);
              const tempPage = await tempContext.newPage();

              // Here can add CAPTCHA handling code
              // ...

              // Close temp browser after completion
              await newBrowser.close();

              // Re-execute search
              return performSearch(false);
            } catch (error) {
              await newBrowser.close();
              throw error;
            }
          } else {
            // If not external browser, close and re-execute search
            await browser.close();
            return performSearch(false); // Re-execute search in headed mode
          }
        } else {
          logger.warn("CAPTCHA detected, please complete verification in browser...");
          // Wait for user to complete verification and redirect back to search page
          await page.waitForNavigation({
            timeout: timeout * 2,
            url: (url) => {
              const urlStr = url.toString();
              return sorryPatterns.every(
                (pattern) => !urlStr.includes(pattern)
              );
            },
          });
          logger.info("CAPTCHA completed, continuing search...");
        }
      }

      logger.info({ query }, "Entering search query");

      // Wait for search box - try multiple possible selectors
      const searchInputSelectors = [
        "textarea[name='q']",
        "input[name='q']",
        "textarea[title='Search']",
        "input[title='Search']",
        "textarea[aria-label='Search']",
        "input[aria-label='Search']",
        "textarea",
      ];

      let searchInput = null;
      for (const selector of searchInputSelectors) {
        searchInput = await page.$(selector);
        if (searchInput) {
          logger.info({ selector }, "Found search box");
          break;
        }
      }

      if (!searchInput) {
        logger.error("Cannot find search box");
        throw new Error("Cannot find search box");
      }

      // Click search box directly, reduce delay
      await searchInput.click();

      // Input entire query string at once instead of character by character
      await page.keyboard.type(query, { delay: getRandomDelay(10, 30) });

      // Reduce delay before pressing enter
      await page.waitForTimeout(getRandomDelay(100, 300));
      await page.keyboard.press("Enter");

      logger.info("Waiting for page to load...");

      // Wait for page to load
      await page.waitForLoadState("networkidle", { timeout });

      // Check if URL after search redirected to CAPTCHA
      const searchUrl = page.url();
      const isBlockedAfterSearch = sorryPatterns.some((pattern) =>
        searchUrl.includes(pattern)
      );

      if (isBlockedAfterSearch) {
        if (headless) {
          logger.warn(
            "CAPTCHA detected after search, will restart browser in headed mode..."
          );

          // Close current page and context
          await page.close();
          await context.close();

          // If external browser provided, dont close it but create new instance
          if (browserWasProvided) {
            logger.info(
              "CAPTCHA after using external browser instance, creating new browser..."
            );
            // Create new browser instance, stop using external one
            const newBrowser = await chromium.launch({
              headless: false, // Use headed mode
              timeout: timeout * 2,
              args: [
                "--disable-blink-features=AutomationControlled",
                // Other params same as before
                "--disable-features=IsolateOrigins,site-per-process",
                "--disable-site-isolation-trials",
                "--disable-web-security",
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-accelerated-2d-canvas",
                "--no-first-run",
                "--no-zygote",
                "--disable-gpu",
                "--hide-scrollbars",
                "--mute-audio",
                "--disable-background-networking",
                "--disable-background-timer-throttling",
                "--disable-backgrounding-occluded-windows",
                "--disable-breakpad",
                "--disable-component-extensions-with-background-pages",
                "--disable-extensions",
                "--disable-features=TranslateUI",
                "--disable-ipc-flooding-protection",
                "--disable-renderer-backgrounding",
                "--enable-features=NetworkService,NetworkServiceInProcess",
                "--force-color-profile=srgb",
                "--metrics-recording-only",
              ],
              ignoreDefaultArgs: ["--enable-automation"],
            });

            // Use new browser instance to perform search
            try {
              const tempContext = await newBrowser.newContext(contextOptions);
              const tempPage = await tempContext.newPage();

              // Here can add CAPTCHA handling code
              // ...

              // Close temp browser after completion
              await newBrowser.close();

              // Re-execute search
              return performSearch(false);
            } catch (error) {
              await newBrowser.close();
              throw error;
            }
          } else {
            // If not external browser, close and re-execute search
            await browser.close();
            return performSearch(false); // Re-execute search in headed mode
          }
        } else {
          logger.warn("CAPTCHA detected after search, please complete verification in browser...");
          // Wait for user to complete verification and redirect back to search page
          await page.waitForNavigation({
            timeout: timeout * 2,
            url: (url) => {
              const urlStr = url.toString();
              return sorryPatterns.every(
                (pattern) => !urlStr.includes(pattern)
              );
            },
          });
          logger.info("CAPTCHA completed, continuing search...");

          // Wait for page to reload
          await page.waitForLoadState("networkidle", { timeout });
        }
      }

      logger.info({ url: page.url() }, "Waiting for search results to load...");

      // Try multiple possible search result selectors
      const searchResultSelectors = [
        "#search",
        "#rso",
        ".g",
        "[data-sokoban-container]",
        "div[role='main']",
      ];

      let resultsFound = false;
      for (const selector of searchResultSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: timeout / 2 });
          logger.info({ selector }, "Found search results");
          resultsFound = true;
          break;
        } catch (e) {
          // Continue trying next selector
        }
      }

      if (!resultsFound) {
        // If cannot find search results, check if redirected to CAPTCHA page
        const currentUrl = page.url();
        const isBlockedDuringResults = sorryPatterns.some((pattern) =>
          currentUrl.includes(pattern)
        );

        if (isBlockedDuringResults) {
          if (headless) {
            logger.warn(
              "CAPTCHA detected while waiting for search results, will restart browser in headed mode..."
            );

            // Close current page and context
            await page.close();
            await context.close();

            // If external browser provided, dont close it but create new instance
            if (browserWasProvided) {
              logger.info(
                "CAPTCHA while waiting for search results with external browser, creating new browser instance..."
              );
              // Create new browser instance, stop using external one
              const newBrowser = await chromium.launch({
                headless: false, // Use headed mode
                timeout: timeout * 2,
                args: [
                  "--disable-blink-features=AutomationControlled",
                  // Other params same as before
                  "--disable-features=IsolateOrigins,site-per-process",
                  "--disable-site-isolation-trials",
                  "--disable-web-security",
                  "--no-sandbox",
                  "--disable-setuid-sandbox",
                  "--disable-dev-shm-usage",
                  "--disable-accelerated-2d-canvas",
                  "--no-first-run",
                  "--no-zygote",
                  "--disable-gpu",
                  "--hide-scrollbars",
                  "--mute-audio",
                  "--disable-background-networking",
                  "--disable-background-timer-throttling",
                  "--disable-backgrounding-occluded-windows",
                  "--disable-breakpad",
                  "--disable-component-extensions-with-background-pages",
                  "--disable-extensions",
                  "--disable-features=TranslateUI",
                  "--disable-ipc-flooding-protection",
                  "--disable-renderer-backgrounding",
                  "--enable-features=NetworkService,NetworkServiceInProcess",
                  "--force-color-profile=srgb",
                  "--metrics-recording-only",
                ],
                ignoreDefaultArgs: ["--enable-automation"],
              });

              // Use new browser instance to perform search
              try {
                const tempContext = await newBrowser.newContext(contextOptions);
                const tempPage = await tempContext.newPage();

                // Here can add CAPTCHA handling code
                // ...

                // Close temp browser after completion
                await newBrowser.close();

                // Re-execute search
                return performSearch(false);
              } catch (error) {
                await newBrowser.close();
                throw error;
              }
            } else {
              // If not external browser, close and re-execute search
              await browser.close();
              return performSearch(false); // Re-execute search in headed mode
            }
          } else {
            logger.warn(
              "CAPTCHA detected while waiting for search results, please complete verification in browser..."
            );
            // Wait for user to complete verification and redirect back to search page
            await page.waitForNavigation({
              timeout: timeout * 2,
              url: (url) => {
                const urlStr = url.toString();
                return sorryPatterns.every(
                  (pattern) => !urlStr.includes(pattern)
                );
              },
            });
            logger.info("CAPTCHA completed, continuing search...");

            // Try waiting for search results again
            for (const selector of searchResultSelectors) {
              try {
                await page.waitForSelector(selector, { timeout: timeout / 2 });
                logger.info({ selector }, "Found search results after verification");
                resultsFound = true;
                break;
              } catch (e) {
                // Continue trying next selector
              }
            }

            if (!resultsFound) {
              logger.error("Cannot find search result elements");
              throw new Error("Cannot find search result elements");
            }
          }
        } else {
          // If not CAPTCHA issue, throw error
          logger.error("Cannot find search result elements");
          throw new Error("Cannot find search result elements");
        }
      }

      // Reduce wait time
      await page.waitForTimeout(getRandomDelay(200, 500));

      logger.info("Extracting search results...");

      let results: SearchResult[] = []; // Declare results before evaluate call

      // Extract search results - using logic from google-search-extractor.cjs
      results = await page.evaluate((maxResults: number): SearchResult[] => { // Add return type
        const results: { title: string; link: string; snippet: string }[] = [];
        const seenUrls = new Set<string>(); // For deduplication

        // Define multiple selector groups, sorted by priority
        const selectorSets = [
          { container: '#search div[data-hveid]', title: 'h3', snippet: '.VwiC3b' },
          { container: '#rso div[data-hveid]', title: 'h3', snippet: '[data-sncf="1"]' },
          { container: '.g', title: 'h3', snippet: 'div[style*="webkit-line-clamp"]' },
          { container: 'div[jscontroller][data-hveid]', title: 'h3', snippet: 'div[role="text"]' }
        ];

        // Backup snippet selectors
        const alternativeSnippetSelectors = [
          '.VwiC3b',
          '[data-sncf="1"]',
          'div[style*="webkit-line-clamp"]',
          'div[role="text"]'
        ];

        // Try each selector group
        for (const selectors of selectorSets) {
          if (results.length >= maxResults) break; // Stop if limit reached

          const containers = document.querySelectorAll(selectors.container);

          for (const container of containers) {
            if (results.length >= maxResults) break;

            const titleElement = container.querySelector(selectors.title);
            if (!titleElement) continue;

            const title = (titleElement.textContent || "").trim();

            // Find links
            let link = '';
            const linkInTitle = titleElement.querySelector('a');
            if (linkInTitle) {
              link = linkInTitle.href;
            } else {
              let current: Element | null = titleElement;
              while (current && current.tagName !== 'A') {
                current = current.parentElement;
              }
              if (current && current instanceof HTMLAnchorElement) {
                link = current.href;
              } else {
                const containerLink = container.querySelector('a');
                if (containerLink) {
                  link = containerLink.href;
                }
              }
            }

            // Filter invalid or duplicate links
            if (!link || !link.startsWith('http') || seenUrls.has(link)) continue;

            // Find snippet
            let snippet = '';
            const snippetElement = container.querySelector(selectors.snippet);
            if (snippetElement) {
              snippet = (snippetElement.textContent || "").trim();
            } else {
              // Try other snippet selectors
              for (const altSelector of alternativeSnippetSelectors) {
                const element = container.querySelector(altSelector);
                if (element) {
                  snippet = (element.textContent || "").trim();
                  break;
                }
              }

              // If still no snippet, try general method
              if (!snippet) {
                const textNodes = Array.from(container.querySelectorAll('div')).filter(el =>
                  !el.querySelector('h3') &&
                  (el.textContent || "").trim().length > 20
                );
                if (textNodes.length > 0) {
                  snippet = (textNodes[0].textContent || "").trim();
                }
              }
            }

            // Only add results with title and link
            if (title && link) {
              results.push({ title, link, snippet });
              seenUrls.add(link); // Record processed URL
            }
          }
        }
        
        // If main selectors dont find enough results, try more general methods
        if (results.length < maxResults) {
            const anchorElements = Array.from(document.querySelectorAll("a[href^='http']"));
            for (const el of anchorElements) {
                if (results.length >= maxResults) break;

                // Check if el is HTMLAnchorElement
                if (!(el instanceof HTMLAnchorElement)) {
                    continue;
                }
                const link = el.href;
                // Filter out nav links, image links, existing links etc
                if (!link || seenUrls.has(link) || link.includes("google.com/") || link.includes("accounts.google") || link.includes("support.google")) {
                    continue;
                }

                const title = (el.textContent || "").trim();
                if (!title) continue; // Skip links without text content

                // Try to get surrounding text as snippet
                let snippet = "";
                let parent = el.parentElement;
                for (let i = 0; i < 3 && parent; i++) {
                  const text = (parent.textContent || "").trim();
                  // Ensure snippet differs from title and has some length
                  if (text.length > 20 && text !== title) {
                    snippet = text;
                    break; // Stop searching upward when suitable snippet found
                  }
                  parent = parent.parentElement;
                }

                results.push({ title, link, snippet });
                seenUrls.add(link);
            }
        }

        return results.slice(0, maxResults); // Ensure not exceeding limit
      }, limit); // Pass limit to evaluate function

      logger.info({ count: results.length }, "Successfully retrieved search results");

      try {
        // Save browser state (unless user specifies not to save)
        if (!noSaveState) {
          logger.info({ stateFile }, "Saving browser state...");

          // Ensure directory exists
          const stateDir = path.dirname(stateFile);
          if (!fs.existsSync(stateDir)) {
            fs.mkdirSync(stateDir, { recursive: true });
          }

          // Save state
          await context.storageState({ path: stateFile });
          logger.info("Browser state saved successfully!");

          // Save fingerprint config
          try {
            fs.writeFileSync(
              fingerprintFile,
              JSON.stringify(savedState, null, 2),
              "utf8"
            );
            logger.info({ fingerprintFile }, "Fingerprint config saved");
          } catch (fingerprintError) {
            logger.error({ error: fingerprintError }, "Error saving fingerprint config");
          }
        } else {
          logger.info("Not saving browser state per user settings");
        }
      } catch (error) {
        logger.error({ error }, "Error saving browser state");
      }

      // Only close browser if not externally provided
      if (!browserWasProvided) {
        logger.info("Closing browser...");
        await browser.close();
      } else {
        logger.info("Keeping browser instance open");
      }

      // Return search results
      return {
        query,
        results, // Now results is accessible in this scope
      };
    } catch (error) {
      logger.error({ error }, "Error during search");

      try {
        // Try to save browser state even if error
        if (!noSaveState) {
          logger.info({ stateFile }, "Saving browser state...");
          const stateDir = path.dirname(stateFile);
          if (!fs.existsSync(stateDir)) {
            fs.mkdirSync(stateDir, { recursive: true });
          }
          await context.storageState({ path: stateFile });

          // Save fingerprint config
          try {
            fs.writeFileSync(
              fingerprintFile,
              JSON.stringify(savedState, null, 2),
              "utf8"
            );
            logger.info({ fingerprintFile }, "Fingerprint config saved");
          } catch (fingerprintError) {
            logger.error({ error: fingerprintError }, "Error saving fingerprint config");
          }
        }
      } catch (stateError) {
        logger.error({ error: stateError }, "Error saving browser state");
      }

      // Only close browser if not externally provided
      if (!browserWasProvided) {
        logger.info("Closing browser...");
        await browser.close();
      } else {
        logger.info("Keeping browser instance open");
      }

      // Return error info or empty results
      // logger.error already logged error, return mock result with error info
       return {
         query,
         results: [
           {
             title: "Search failed",
             link: "",
             snippet: `Cannot complete search, error message: ${
               error instanceof Error ? error.message : String(error)
             }`,
           },
         ],
       };
    }
    // Remove finally block since resource cleanup already handled in try and catch
  }

  // First try to execute search in headless mode
  return performSearch(useHeadless);
}

/**
 * Get raw HTML of Google search results page
 * @param query Search keyword
 * @param options Search options
 * @param saveToFile Whether to save HTML to file (optional)
 * @param outputPath HTML output file path (optional, default'./google-search-html/[query]-[timestamp].html'）
 * @returns Response object containing HTML content
 */
export async function getGoogleSearchPageHtml(
  query: string,
  options: CommandOptions = {},
  saveToFile: boolean = false,
  outputPath?: string
): Promise<HtmlResponse> {
  // Set default options, consistent with googleSearch
  const {
    timeout = 60000,
    stateFile = "./browser-state.json",
    noSaveState = false,
    locale = "zh-CN", // Default to Chinese
  } = options;

  // Use user specified headless option if provided; otherwise default to headless mode
  let useHeadless = options.headless !== undefined ? options.headless : true;

  logger.info({ options }, "Initializing browser to get search page HTML...");

  // Reuse browser initialization code from googleSearch
  // Check if state file exists
  let storageState: string | undefined = undefined;
  let savedState: SavedState = {};

  // Fingerprint config file path
  const fingerprintFile = stateFile.replace(".json", "-fingerprint.json");

  if (fs.existsSync(stateFile)) {
    logger.info(
      { stateFile },
      "Browser state file found, using saved state to avoid bot detection"
    );
    storageState = stateFile;

    // Try to load saved fingerprint config
    if (fs.existsSync(fingerprintFile)) {
      try {
        const fingerprintData = fs.readFileSync(fingerprintFile, "utf8");
        savedState = JSON.parse(fingerprintData);
        logger.info("Loaded saved browser fingerprint config");
      } catch (e) {
        logger.warn({ error: e }, "Cannot load fingerprint config, creating new one");
      }
    }
  } else {
    logger.info(
      { stateFile },
      "No browser state file found, creating new browser session and fingerprint"
    );
  }

  // Only use desktop device list
  const deviceList = [
    "Desktop Chrome",
    "Desktop Edge",
    "Desktop Firefox",
    "Desktop Safari",
  ];

  // Google domain list
  const googleDomains = [
    "https://www.google.com",
    "https://www.google.co.uk",
    "https://www.google.ca",
    "https://www.google.com.au",
  ];

  // Get random device config or use saved config
  const getDeviceConfig = (): [string, any] => {
    if (
      savedState.fingerprint?.deviceName &&
      devices[savedState.fingerprint.deviceName]
    ) {
      // Use saved device config
      return [
        savedState.fingerprint.deviceName,
        devices[savedState.fingerprint.deviceName],
      ];
    } else {
      // Randomly select a device
      const randomDevice =
        deviceList[Math.floor(Math.random() * deviceList.length)];
      return [randomDevice, devices[randomDevice]];
    }
  };

  // Get random delay time
  const getRandomDelay = (min: number, max: number) => {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  };

  // Define a dedicated function to get HTML
  async function performSearchAndGetHtml(headless: boolean): Promise<HtmlResponse> {
    let browser: Browser;
    
    // Initialize browser with more parameters to avoid detection
    browser = await chromium.launch({
      headless,
      timeout: timeout * 2, // Increase browser startup timeout
      args: [
        "--disable-blink-features=AutomationControlled",
        "--disable-features=IsolateOrigins,site-per-process",
        "--disable-site-isolation-trials",
        "--disable-web-security",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu",
        "--hide-scrollbars",
        "--mute-audio",
        "--disable-background-networking",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-breakpad",
        "--disable-component-extensions-with-background-pages",
        "--disable-extensions",
        "--disable-features=TranslateUI",
        "--disable-ipc-flooding-protection",
        "--disable-renderer-backgrounding",
        "--enable-features=NetworkService,NetworkServiceInProcess",
        "--force-color-profile=srgb",
        "--metrics-recording-only",
      ],
      ignoreDefaultArgs: ["--enable-automation"],
    });

    logger.info("Browser launched successfully!");

    // Get device config - use saved or randomly generate
    const [deviceName, deviceConfig] = getDeviceConfig();

    // Create browser context options
    let contextOptions: BrowserContextOptions = {
      ...deviceConfig,
    };

    // Use saved fingerprint config if available; otherwise use host machine settings
    if (savedState.fingerprint) {
      contextOptions = {
        ...contextOptions,
        locale: savedState.fingerprint.locale,
        timezoneId: savedState.fingerprint.timezoneId,
        colorScheme: savedState.fingerprint.colorScheme,
        reducedMotion: savedState.fingerprint.reducedMotion,
        forcedColors: savedState.fingerprint.forcedColors,
      };
      logger.info("Using saved browser fingerprint config");
    } else {
      // Get host machine actual settings
      const hostConfig = getHostMachineConfig(locale);

      // If different device type needed, get device config again
      if (hostConfig.deviceName !== deviceName) {
        logger.info(
          { deviceType: hostConfig.deviceName },
          "Using device type based on host machine settings"
        );
        // Use new device config
        contextOptions = { ...devices[hostConfig.deviceName] };
      }

      contextOptions = {
        ...contextOptions,
        locale: hostConfig.locale,
        timezoneId: hostConfig.timezoneId,
        colorScheme: hostConfig.colorScheme,
        reducedMotion: hostConfig.reducedMotion,
        forcedColors: hostConfig.forcedColors,
      };

      // Save newly generated fingerprint config
      savedState.fingerprint = hostConfig;
      logger.info(
        {
          locale: hostConfig.locale,
          timezone: hostConfig.timezoneId,
          colorScheme: hostConfig.colorScheme,
          deviceType: hostConfig.deviceName,
        },
        "Generated new browser fingerprint based on host machine"
      );
    }

    // Add common options - ensure desktop config
    contextOptions = {
      ...contextOptions,
      permissions: ["geolocation", "notifications"],
      acceptDownloads: true,
      isMobile: false, // Force desktop mode
      hasTouch: false, // Disable touch
      javaScriptEnabled: true,
    };

    if (storageState) {
      logger.info("Loading saved browser state...");
    }

    const context = await browser.newContext(
      storageState ? { ...contextOptions, storageState } : contextOptions
    );

    // Set extra browser properties to avoid detection
    await context.addInitScript(() => {
      // Override navigator properties
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      Object.defineProperty(navigator, "plugins", {
        get: () => [1, 2, 3, 4, 5],
      });
      Object.defineProperty(navigator, "languages", {
        get: () => ["en-US", "en", "zh-CN"],
      });

      // Override window properties
      // @ts-ignore - Ignore chrome property not found error
      window.chrome = {
        runtime: {},
        loadTimes: function () {},
        csi: function () {},
        app: {},
      };

      // Add WebGL fingerprint randomization
      if (typeof WebGLRenderingContext !== "undefined") {
        const getParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function (
          parameter: number
        ) {
          // Randomize UNMASKED_VENDOR_WEBGL and UNMASKED_RENDERER_WEBGL
          if (parameter === 37445) {
            return "Intel Inc.";
          }
          if (parameter === 37446) {
            return "Intel Iris OpenGL Engine";
          }
          return getParameter.call(this, parameter);
        };
      }
    });

    const page = await context.newPage();

    // Set extra page properties
    await page.addInitScript(() => {
      // Simulate real screen size and color depth
      Object.defineProperty(window.screen, "width", { get: () => 1920 });
      Object.defineProperty(window.screen, "height", { get: () => 1080 });
      Object.defineProperty(window.screen, "colorDepth", { get: () => 24 });
      Object.defineProperty(window.screen, "pixelDepth", { get: () => 24 });
    });

    try {
      // Use saved Google domain or randomly select one
      let selectedDomain: string;
      if (savedState.googleDomain) {
        selectedDomain = savedState.googleDomain;
        logger.info({ domain: selectedDomain }, "Using saved Google domain");
      } else {
        selectedDomain =
          googleDomains[Math.floor(Math.random() * googleDomains.length)];
        // Save selected domain
        savedState.googleDomain = selectedDomain;
        logger.info({ domain: selectedDomain }, "Randomly selected Google domain");
      }

      logger.info("Visiting Google search page...");

      // Visit Google search page
      const response = await page.goto(selectedDomain, {
        timeout,
        waitUntil: "networkidle",
      });

      // Check if redirected to CAPTCHA page
      const currentUrl = page.url();
      const sorryPatterns = [
        "google.com/sorry/index",
        "google.com/sorry",
        "recaptcha",
        "captcha",
        "unusual traffic",
      ];

      const isBlockedPage = sorryPatterns.some(
        (pattern) =>
          currentUrl.includes(pattern) ||
          (response && response.url().toString().includes(pattern))
      );

      if (isBlockedPage) {
        if (headless) {
          logger.warn("CAPTCHA detected, restarting browser in headed mode...");

          // Close current page and context
          await page.close();
          await context.close();
          await browser.close();
          
          // Re-execute in headed mode
          return performSearchAndGetHtml(false);
        } else {
          logger.warn("CAPTCHA detected, please complete verification in browser...");
          // Wait for user to complete verification and redirect back to search page
          await page.waitForNavigation({
            timeout: timeout * 2,
            url: (url) => {
              const urlStr = url.toString();
              return sorryPatterns.every(
                (pattern) => !urlStr.includes(pattern)
              );
            },
          });
          logger.info("CAPTCHA completed, continuing search...");
        }
      }

      logger.info({ query }, "Entering search query");

      // Wait for search box - try multiple possible selectors
      const searchInputSelectors = [
        "textarea[name='q']",
        "input[name='q']",
        "textarea[title='Search']",
        "input[title='Search']",
        "textarea[aria-label='Search']",
        "input[aria-label='Search']",
        "textarea",
      ];

      let searchInput = null;
      for (const selector of searchInputSelectors) {
        searchInput = await page.$(selector);
        if (searchInput) {
          logger.info({ selector }, "Found search box");
          break;
        }
      }

      if (!searchInput) {
        logger.error("Cannot find search box");
        throw new Error("Cannot find search box");
      }

      // Click search box directly, reduce delay
      await searchInput.click();

      // Input entire query string at once instead of character by character
      await page.keyboard.type(query, { delay: getRandomDelay(10, 30) });

      // Reduce delay before pressing enter
      await page.waitForTimeout(getRandomDelay(100, 300));
      await page.keyboard.press("Enter");

      logger.info("Waiting for search result page to load...");

      // Wait for page to load
      await page.waitForLoadState("networkidle", { timeout });

      // Check if URL after search redirected to CAPTCHA
      const searchUrl = page.url();
      const isBlockedAfterSearch = sorryPatterns.some((pattern) =>
        searchUrl.includes(pattern)
      );

      if (isBlockedAfterSearch) {
        if (headless) {
          logger.warn("CAPTCHA detected after search, restarting browser in headed mode...");

          // Close current page and context
          await page.close();
          await context.close();
          await browser.close();
          
          // Re-execute in headed mode
          return performSearchAndGetHtml(false);
        } else {
          logger.warn("CAPTCHA detected after search, please complete verification in browser...");
          // Wait for user to complete verification and redirect back to search page
          await page.waitForNavigation({
            timeout: timeout * 2,
            url: (url) => {
              const urlStr = url.toString();
              return sorryPatterns.every(
                (pattern) => !urlStr.includes(pattern)
              );
            },
          });
          logger.info("CAPTCHA completed, continuing search...");

          // Wait for page to reload
          await page.waitForLoadState("networkidle", { timeout });
        }
      }

      // Get current page URL
      const finalUrl = page.url();
      logger.info({ url: finalUrl }, "Search result page loaded, preparing to extract HTML...");

      // Add extra wait time to ensure page fully loaded and stable
      logger.info("Waiting for page to stabilize...");
      await page.waitForTimeout(1000); // Wait 1 second for page to stabilize
      
      // Wait again for network idle to ensure all async operations complete
      await page.waitForLoadState("networkidle", { timeout });
      
      // Get page HTML content
      const fullHtml = await page.content();
      
      // Remove CSS and JavaScript content, keep pure HTML
      // Remove all <style> tags and their content
      let html = fullHtml.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
      // Remove all <link rel="stylesheet"> tags
      html = html.replace(/<link\s+[^>]*rel=["']stylesheet["'][^>]*>/gi, '');
      // Remove all <script> tags and their content
      html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      
      logger.info({
        originalLength: fullHtml.length,
        cleanedLength: html.length
      }, "Successfully fetched and cleaned page HTML content");

      // If needed, save HTML to file and take screenshot
      let savedFilePath: string | undefined = undefined;
      let screenshotPath: string | undefined = undefined;
      
      if (saveToFile) {
        // Generate default filename if not provided
        if (!outputPath) {
          // Ensure directory exists
          const outputDir = "./google-search-html";
          if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
          }
          
          // Generate filename: query-timestamp.html
          const timestamp = new Date().toISOString().replace(/:/g, "-").replace(/\./g, "-");
          const sanitizedQuery = query.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 50);
          outputPath = `${outputDir}/${sanitizedQuery}-${timestamp}.html`;
        }

        // Ensure file directory exists
        const fileDir = path.dirname(outputPath);
        if (!fs.existsSync(fileDir)) {
          fs.mkdirSync(fileDir, { recursive: true });
        }

        // Write HTML file
        fs.writeFileSync(outputPath, html, "utf8");
        savedFilePath = outputPath;
        logger.info({ path: outputPath }, "Cleaned HTML content saved to file");
        
        // Save webpage screenshot
        // Generate screenshot filename based on HTML filename but with .png
        const screenshotFilePath = outputPath.replace(/\.html$/, '.png');
        
        // Take screenshot of entire page
        logger.info("Taking webpage screenshot...");
        await page.screenshot({
          path: screenshotFilePath,
          fullPage: true
        });
        
        screenshotPath = screenshotFilePath;
        logger.info({ path: screenshotFilePath }, "Screenshot saved");
      }

      try {
        // Save browser state (unless user specifies not to save)
        if (!noSaveState) {
          logger.info({ stateFile }, "Saving browser state...");

          // Ensure directory exists
          const stateDir = path.dirname(stateFile);
          if (!fs.existsSync(stateDir)) {
            fs.mkdirSync(stateDir, { recursive: true });
          }

          // Save state
          await context.storageState({ path: stateFile });
          logger.info("Browser state saved successfully!");

          // Save fingerprint config
          try {
            fs.writeFileSync(
              fingerprintFile,
              JSON.stringify(savedState, null, 2),
              "utf8"
            );
            logger.info({ fingerprintFile }, "Fingerprint config saved");
          } catch (fingerprintError) {
            logger.error({ error: fingerprintError }, "Error saving fingerprint config");
          }
        } else {
          logger.info("Not saving browser state per user settings");
        }
      } catch (error) {
        logger.error({ error }, "Error saving browser state");
      }

      // Close browser
      logger.info("Closing browser...");
      await browser.close();

      // Return HTML response
      return {
        query,
        html,
        url: finalUrl,
        savedPath: savedFilePath,
        screenshotPath: screenshotPath,
        originalHtmlLength: fullHtml.length
      };
    } catch (error) {
      logger.error({ error }, "Error getting page HTML");

      try {
        // Try to save browser state even if error
        if (!noSaveState) {
          logger.info({ stateFile }, "Saving browser state...");
          const stateDir = path.dirname(stateFile);
          if (!fs.existsSync(stateDir)) {
            fs.mkdirSync(stateDir, { recursive: true });
          }
          await context.storageState({ path: stateFile });

          // Save fingerprint config
          try {
            fs.writeFileSync(
              fingerprintFile,
              JSON.stringify(savedState, null, 2),
              "utf8"
            );
            logger.info({ fingerprintFile }, "Fingerprint config saved");
          } catch (fingerprintError) {
            logger.error({ error: fingerprintError }, "Error saving fingerprint config");
          }
        }
      } catch (stateError) {
        logger.error({ error: stateError }, "Error saving browser state");
      }

      // Close browser
      logger.info("Closing browser...");
      await browser.close();

      // Return error info
      throw new Error(`Failed to get Google search page HTML: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // First try to execute in headless mode
  return performSearchAndGetHtml(useHeadless);
}

/**
 * Extract heading structure from HTML (H1, H2, H3)
 * @param html Page HTML content
 * @returns Heading structure object
 */
export function extractHeadings(html: string): HeadingStructure {
  const headings: HeadingStructure = {
    H1: [],
    H2: [],
    H3: []
  };

  // Extract H1 tags
  const h1Regex = /<h1[^>]*>([^<]*)<\/h1>/gi;
  let match;
  while ((match = h1Regex.exec(html)) !== null) {
    const text = match[1].replace(/<[^>]+>/g, '').trim();
    if (text && !headings.H1.includes(text)) {
      headings.H1.push(text);
    }
  }

  // Extract H2 tags
  const h2Regex = /<h2[^>]*>([^<]*)<\/h2>/gi;
  while ((match = h2Regex.exec(html)) !== null) {
    const text = match[1].replace(/<[^>]+>/g, '').trim();
    if (text && !headings.H2.includes(text)) {
      headings.H2.push(text);
    }
  }

  // Extract H3 tags
  const h3Regex = /<h3[^>]*>([^<]*)<\/h3>/gi;
  while ((match = h3Regex.exec(html)) !== null) {
    const text = match[1].replace(/<[^>]+>/g, '').trim();
    if (text && !headings.H3.includes(text)) {
      headings.H3.push(text);
    }
  }

  return headings;
}

/**
 * Clean HTML content, remove unwanted elements
 * @param html Raw HTML content
 * @returns Cleaned plain text content
 */
function cleanHtmlContent(html: string): string {
  // Create temporary DOM to parse HTML
  const dom = new JSDOM(html);
  const document = dom.window.document;

  // Elements to remove
  const removeSelectors = [
    'script', 'style', 'noscript', 'iframe', 'nav', 'header', 'footer',
    'aside', 'advertisement', 'ad', '.ad', '.ads', '.advertisement',
    '.sidebar', '.navigation', '.nav', '.menu', '.footer', '.header',
    '.cookie', '.popup', '.modal', '.banner', '[role="banner"]',
    '[role="navigation"]', '[role="complementary"]', '.social-share',
    '.comments', '.related-posts', '.breadcrumb', '.pagination'
  ];

  removeSelectors.forEach(selector => {
    try {
      const elements = document.querySelectorAll(selector);
      elements.forEach((el: Element) => el.remove());
    } catch (e) {
      // Ignore invalid selectors
    }
  });

  // Get body content, if not exist use entire document
  const body = document.body || document.documentElement;

  // Get plain text content
  let text = body.textContent || body.innerText || '';

  // Clean extra whitespace
  text = text.replace(/\s+/g, ' ').trim();

  return text;
}

/**
 * Get webpage content and heading structure
 * @param url Webpage URL
 * @param browser Optional Playwright browser instance
 * @returns Object containing page title, heading structure and content
 */
export async function fetchWebpage(
  url: string,
  browser?: Browser
): Promise<WebPageContent> {
  let browserInstance = browser;
  let shouldCloseBrowser = false;

  // List of user agents to rotate
  const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
  ];

  // Random viewport sizes
  const viewports = [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1536, height: 864 },
  ];

  try {
    logger.info({ url }, "Fetching webpage content...");

    // If no browser provided, create a new one with optimized settings
    if (!browserInstance) {
      const randomViewport = viewports[Math.floor(Math.random() * viewports.length)];
      browserInstance = await chromium.launch({
        headless: true,
        args: [
          "--disable-blink-features=AutomationControlled",
          "--disable-features=IsolateOrigins,site-per-process",
          "--disable-site-isolation-trials",
          "--disable-web-security",
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
          "--disable-setuid-sandbox",
          "--hide-scrollbars",
          "--disable-background-networking",
          "--disable-background-timer-throttling",
          "--disable-backgrounding-occluded-windows",
          "--disable-breakpad",
          "--disable-component-extensions-with-background-pages",
          "--disable-default-apps",
          "--disable-extensions",
          "--disable-features=TranslateUI",
          "--disable-ipc-flooding-protection",
          "--disable-renderer-backgrounding",
          "--enable-features=NetworkService,NetworkServiceInProcess",
          "--force-color-profile=srgb",
          "--metrics-recording-only",
          "--disable-translate",
          "--disable-extensions",
          "--disable-plugins",
          "--disable-popup-blocking",
        ],
      });
      shouldCloseBrowser = true;

      // Create page with random viewport
      const page = await browserInstance.newPage();

      // Set viewport
      await page.setViewportSize(randomViewport);

      // Set random user agent
      const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];
      await page.setExtraHTTPHeaders({
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Connection": "keep-alive",
        "User-Agent": randomUA,
      });

      // Add JavaScript to hide webdriver
      await page.addInitScript(() => {
        Object.defineProperty(navigator, "webdriver", { get: () => undefined });
        Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
        Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
        (window as any).chrome = { runtime: {} };
      });

      // Try multiple wait strategies
      try {
        await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });
      } catch {
        // Fallback to domcontentloaded
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
      }

      // Random delay to appear more human
      await page.waitForTimeout(Math.random() * 2000 + 1000);

      // Get page title
      const pageTitle = await page.title();

      // Check for common block messages
      const blockMessages = await page.evaluate(() => {
        const body = document.body;
        const text = body ? body.innerText.toLowerCase() : "";
        return {
          hasAccessDenied: text.includes("access denied") || text.includes("forbidden") || text.includes("403"),
          hasCaptcha: text.includes("captcha") || text.includes("verify you are human"),
          hasRateLimit: text.includes("too many requests") || text.includes("rate limit"),
        };
      });

      if (blockMessages.hasAccessDenied || blockMessages.hasCaptcha || blockMessages.hasRateLimit) {
        logger.warn({ url, blockMessages }, "Website may be blocking requests");
      }

      // Get HTML content
      const html = await page.content();

      // Extract headings
      const headings = extractHeadings(html);

      // Clean and get text content
      const content = cleanHtmlContent(html);

      // Close page
      await page.close();

      logger.info({ url, titleLength: pageTitle.length, headingCount: headings.H1.length + headings.H2.length + headings.H3.length }, "Webpage content fetched successfully");

      return {
        page_title: pageTitle,
        url,
        headings,
        content
      };
    }

    // If browser provided, use existing browser with optimized page
    const page = await browserInstance.newPage();

    // Set viewport
    const randomViewport = viewports[Math.floor(Math.random() * viewports.length)];
    await page.setViewportSize(randomViewport);

    // Set random user agent
    const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Connection": "keep-alive",
      "User-Agent": randomUA,
    });

    // Add JavaScript to hide webdriver
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
      (window as any).chrome = { runtime: {} };
    });

    // Try multiple wait strategies
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });
    } catch {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    }

    // Random delay
    await page.waitForTimeout(Math.random() * 2000 + 1000);

    // Get page title
    const pageTitle = await page.title();

    // Get HTML content
    const html = await page.content();

    // Extract headings
    const headings = extractHeadings(html);

    // Clean and get text content
    const content = cleanHtmlContent(html);

    // Close page
    await page.close();

    logger.info({ url, titleLength: pageTitle.length, headingCount: headings.H1.length + headings.H2.length + headings.H3.length }, "Webpage content fetched successfully");

    return {
      page_title: pageTitle,
      url,
      headings,
      content
    };
  } catch (error) {
    logger.error({ error, url }, "Failed to fetch webpage content");

    // Cleanup browser if we created it
    if (shouldCloseBrowser && browserInstance) {
      await browserInstance.close();
    }

    throw new Error(`Unable to retrieve webpage: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    // Close browser if we created it and no error
    if (shouldCloseBrowser && browserInstance) {
      await browserInstance.close();
    }
  }
}

/**
 * Convert search results to WebSearchResult format (with ranking)
 * @param results Raw search results
 * @param limit Result count limit
 * @returns Search results with ranking
 */
export function formatWebSearchResults(results: SearchResult[], limit: number = 10): WebSearchResult[] {
  return results.slice(0, limit).map((result, index) => ({
    rank: index + 1,
    title: result.title,
    url: result.link,
    snippet: result.snippet
  }));
}
