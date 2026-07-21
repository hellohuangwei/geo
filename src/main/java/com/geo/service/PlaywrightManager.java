package com.geo.service;

import com.microsoft.playwright.*;
import com.microsoft.playwright.options.LoadState;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.nio.file.Path;
import java.net.HttpURLConnection;
import java.net.URI;
import java.util.List;
import java.util.Random;

/**
 * Playwright browser manager.
 * Connects to the user's existing Edge browser via CDP (Chrome DevTools Protocol).
 * If no Edge is running with debugging enabled, it kills all Edge processes and
 * relaunches with the user's real profile + --remote-debugging-port, so all
 * logins/cookies are preserved after restart.
 */
@Service
public class PlaywrightManager {

    private static final Logger log = LoggerFactory.getLogger(PlaywrightManager.class);

    private static final int CDP_PORT = 9222;
    private static final String CDP_URL = "http://127.0.0.1:" + CDP_PORT;

    private volatile Playwright playwright;
    private volatile Browser browser;
    private volatile boolean browserReady = false;
    private volatile String browserError = null;
    private volatile boolean isExistingBrowser = false;
    private Process edgeProcess;
    private final Random random = new Random();

    @Value("${acquisition.playwright.channel:msedge}")
    private String browserChannel;

    @Value("${acquisition.playwright.anti-detection.enabled:true}")
    private boolean antiDetectionEnabled;

    @Value("${acquisition.playwright.human-delay-min-ms:300}")
    private int humanDelayMinMs;

    @Value("${acquisition.playwright.human-delay-max-ms:2000}")
    private int humanDelayMaxMs;

    public synchronized Playwright getPlaywright() {
        if (playwright == null) {
            playwright = Playwright.create();
            log.info("Playwright instance ready");
        }
        return playwright;
    }

    /**
     * Get browser: first try connecting to existing Edge, otherwise launch Edge with CDP.
     */
    public synchronized Browser getBrowser() {
        if (browser != null) {
            if (isCdpReachable()) {
                browserReady = true;
                return browser;
            }
            log.warn("Existing browser handle is stale because CDP {} is not reachable; reconnecting...", CDP_URL);
            try { browser.close(); } catch (Exception ignored) {}
            browser = null;
            browserReady = false;
            browserError = null;
            isExistingBrowser = false;
        }

        if (browser == null) {
            try {
                Playwright pw = getPlaywright();

                // Step 1: Try connecting to an already-running Edge with CDP
                log.info("Trying CDP connection at {}...", CDP_URL);
                try {
                    browser = pw.chromium().connectOverCDP(CDP_URL);
                    isExistingBrowser = true;
                    browserReady = true;
                    log.info("Connected to EXISTING Edge! {} context(s) open", browser.contexts().size());
                    return browser;
                } catch (Exception e) {
                    log.info("No Edge with CDP running ({})", e.getMessage().split("\n")[0]);
                }

                // Step 2: Edge not running with CDP.
                // Kill all Edge processes, then relaunch with user's real profile + CDP.
                // This preserves all cookies/logins after restart.
                String edgePath = findEdgePath();
                if (edgePath == null) {
                    throw new RuntimeException("Cannot find Microsoft Edge. Install Edge or set acquisition.playwright.channel=chromium");
                }
                String userDataDir = getEdgeUserDataDir();

                log.info("Killing existing Edge processes to enable CDP...");
                killEdgeProcesses();

                log.info("Launching Edge with CDP (real profile, cookies preserved, MINIMIZED)...");
                log.info("  Edge: {}", edgePath);
                log.info("  Profile: {}", userDataDir);
                // 使用 cmd /c start /MIN 最小化启动，不抢用户焦点
                // 初始打开 about:blank（干净页），采集会在另外的标签页静默执行
                ProcessBuilder pb = new ProcessBuilder(
                        "cmd", "/c", "start", "/MIN", "",
                        edgePath,
                        "--remote-debugging-port=" + CDP_PORT,
                        "--user-data-dir=" + userDataDir,
                        "--profile-directory=Default",
                        "--no-first-run",
                        "--no-default-browser-check",
                        "about:blank"
                );
                pb.redirectErrorStream(true);
                edgeProcess = pb.start();

                boolean cdpReady = false;
                for (int i = 0; i < 30; i++) {
                    Thread.sleep(1500);
                    try {
                        browser = pw.chromium().connectOverCDP(CDP_URL);
                        browserReady = true;
                        cdpReady = true;
                        log.info("Edge relaunched and connected via CDP! {} context(s)", browser.contexts().size());
                        return browser;
                    } catch (Exception retryErr) {
                        if (i % 5 == 0) log.info("  Waiting for CDP... (attempt {}/{})", i, 30);
                    }
                }
                if (!cdpReady) {
                    throw new RuntimeException("Edge launched but CDP not available after 45s. "
                            + "Is Edge already running? Close all Edge windows and retry.");
                }

            } catch (Exception e) {
                browserError = e.getMessage();
                log.error("Browser connection FAILED", e);
                throw new RuntimeException("Browser connection failed: " + e.getMessage(), e);
            }
        }
        return browser;
    }

    public boolean isCdpReachable() {
        try {
            HttpURLConnection connection = (HttpURLConnection) URI.create(CDP_URL + "/json/version").toURL().openConnection();
            connection.setConnectTimeout(800);
            connection.setReadTimeout(800);
            connection.setRequestMethod("GET");
            int status = connection.getResponseCode();
            return status >= 200 && status < 300;
        } catch (Exception ignored) {
            return false;
        }
    }

    /**
     * Get a browser context: uses the existing browser's default context
     * (preserves user's cookies, logins, extensions).
     */
    public BrowserContext createContext() {
        Browser b = getBrowser();
        List<BrowserContext> contexts = b.contexts();

        if (!contexts.isEmpty()) {
            BrowserContext ctx = contexts.get(0);
            log.info("Using existing browser context: {} page(s)", ctx.pages().size());
            return ctx;
        }

        // Shouldn't happen with existing Edge, but fallback
        return b.newContext();
    }

    /** Open a new tab in the user's browser */
    public Page newPage(BrowserContext ctx) {
        Page page = ctx.newPage();
        page.setViewportSize(1920, 1080);
        return page;
    }

    /** Human-like random delay */
    public void humanDelay() {
        try {
            int delay = humanDelayMinMs + random.nextInt(humanDelayMaxMs - humanDelayMinMs + 1);
            Thread.sleep(delay);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    /** Human-like scrolling */
    public void humanScroll(Page page, int pixels) {
        int step = 50 + random.nextInt(100);
        int scrolled = 0;
        while (scrolled < pixels) {
            page.mouse().wheel(0, Math.min(step, pixels - scrolled));
            scrolled += Math.min(step, pixels - scrolled);
            try { Thread.sleep(20 + random.nextInt(50)); } catch (InterruptedException e) { break; }
        }
    }

    /** Wait for page to stabilize */
    public void waitStable(Page page) {
        humanDelay();
        try {
            page.waitForLoadState(LoadState.NETWORKIDLE,
                    new Page.WaitForLoadStateOptions().setTimeout(15000));
        } catch (Exception e) {
            log.debug("Page idle timeout: {}", e.getMessage());
        }
        humanDelay();
    }

    // --- Process helpers ---

    /** Kill all Edge processes so we can launch a fresh one with CDP. */
    private void killEdgeProcesses() {
        try {
            ProcessBuilder killer = new ProcessBuilder(
                    "taskkill", "/F", "/IM", "msedge.exe"
            );
            killer.redirectErrorStream(true);
            Process p = killer.start();
            p.waitFor();
            // Give processes time to fully exit and release the profile lock
            Thread.sleep(2000);
            log.info("Edge processes terminated");
        } catch (Exception e) {
            log.warn("Failed to kill Edge processes: {}", e.getMessage());
        }
    }

    /** Delete a file (used to clean lock files from copied profile). */
    private void deleteFile(String path) {
        try {
            java.nio.file.Files.deleteIfExists(Path.of(path));
        } catch (Exception ignored) {
        }
    }

    // --- Path helpers ---

    private String findEdgePath() {
        String[] candidates = {
                "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
                "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
        };
        String localAppData = System.getenv("LOCALAPPDATA");
        if (localAppData != null) {
            String local = localAppData + "\\Microsoft\\Edge\\Application\\msedge.exe";
            if (java.nio.file.Files.exists(Path.of(local))) return local;
        }
        for (String p : candidates) {
            if (java.nio.file.Files.exists(Path.of(p))) return p;
        }
        return null;
    }

    private String getEdgeUserDataDir() {
        String localAppData = System.getenv("LOCALAPPDATA");
        if (localAppData != null) return localAppData + "\\Microsoft\\Edge\\User Data";
        return System.getProperty("user.home") + "\\AppData\\Local\\Microsoft\\Edge\\User Data";
    }

    public boolean isBrowserReady() { return browserReady; }
    public String getBrowserError() { return browserError; }

    @PreDestroy
    public void destroy() {
        if (browser != null) {
            try {
                if (!isExistingBrowser) {
                    // Close pages we opened, but don't kill the user's browser
                }
                browser.close();
            } catch (Exception ignored) {}
            log.info("Disconnected from browser");
        }
        if (playwright != null) {
            try { playwright.close(); } catch (Exception ignored) {}
        }
        // Don't kill edgeProcess — it's the user's browser
    }
}
