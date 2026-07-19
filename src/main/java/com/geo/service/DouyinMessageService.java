package com.geo.service;

import com.geo.entity.AcquisitionLead;
import com.microsoft.playwright.BrowserContext;
import com.microsoft.playwright.Locator;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.options.WaitForSelectorState;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.util.*;

@Service
public class DouyinMessageService {

    private static final Logger log = LoggerFactory.getLogger(DouyinMessageService.class);

    private final PlaywrightManager playwrightManager;

    // ---- 可配置参数 ----
    @Value("${acquisition.douyin.message.delay-ms:350}")
    private int delayMs;

    @Value("${acquisition.douyin.message.navigation-timeout-ms:9000}")
    private int navigationTimeoutMs;

    /** 搜索结果显示超时 */
    @Value("${acquisition.douyin.message.search-result-timeout-ms:3000}")
    private int searchResultTimeoutMs;

    /** 用户主页加载超时 */
    @Value("${acquisition.douyin.message.profile-timeout-ms:3000}")
    private int profileTimeoutMs;

    /** 聊天对话框打开超时 */
    @Value("${acquisition.douyin.message.chat-dialog-timeout-ms:3000}")
    private int chatDialogTimeoutMs;

    /** 输入框填充后到发送前的等待(ms) */
    @Value("${acquisition.douyin.message.pre-send-delay-ms:150}")
    private int preSendDelayMs;

    /** 发送后到下一个用户之间的冷却(ms) */
    @Value("${acquisition.douyin.message.inter-user-delay-ms:500}")
    private int interUserDelayMs;

    public DouyinMessageService(PlaywrightManager playwrightManager) {
        this.playwrightManager = playwrightManager;
    }

    // ==================== 批量发送主入口 ====================

    public Map<String, Object> sendBatchMessages(List<AcquisitionLead> leads, String message) {
        int success = 0;
        int failed = 0;
        List<Map<String, Object>> results = new ArrayList<>();

        if (leads.isEmpty() || message == null || message.isBlank()) {
            return Map.of("success", 0, "failed", leads.size(), "results", List.of(), "error", "leads or message is empty");
        }

        BrowserContext context = playwrightManager.createContext();
        Page page = playwrightManager.newPage(context);

        try {
            for (int i = 0; i < leads.size(); i++) {
                AcquisitionLead lead = leads.get(i);
                String nickname = valueOrEmpty(lead.getNickname());
                String douyinId = valueOrEmpty(lead.getPlatformUserId());

                Map<String, Object> result = new LinkedHashMap<>();
                result.put("nickname", nickname);
                result.put("douyinId", douyinId);

                try {
                    sendOneMessage(page, douyinId, nickname, message);
                    result.put("ok", true);
                    success++;
                    log.info("Sent to {} ({}) — {}/{}", nickname, douyinId, i + 1, leads.size());
                } catch (Exception e) {
                    result.put("ok", false);
                    result.put("error", e.getMessage());
                    failed++;
                    log.warn("Failed to send to {}: {}", nickname, e.getMessage());
                }
                results.add(result);

                // 用户间冷却（最后一条不 sleep）
                if (i < leads.size() - 1) {
                    sleep(interUserDelayMs);
                }
            }
        } finally {
            try { page.close(); } catch (Exception ignored) {}
        }

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("success", success);
        summary.put("failed", failed);
        summary.put("results", results);
        return summary;
    }

    // ==================== 单人私信流程 ====================

    private void sendOneMessage(Page page, String douyinId, String nickname, String message) throws Exception {
        // Step 1: 搜索用户
        String searchUrl = "https://www.douyin.com/search/"
                + java.net.URLEncoder.encode(douyinId.isBlank() ? nickname : douyinId.trim(), StandardCharsets.UTF_8)
                + "?type=user";
        log.info("  Search: {}", searchUrl);

        page.navigate(searchUrl, new Page.NavigateOptions().setTimeout(navigationTimeoutMs));

        // 等待搜索结果中的第一个用户卡片出现
        try {
            page.waitForSelector("a[href*=\"/user/\"]",
                    new Page.WaitForSelectorOptions()
                            .setState(WaitForSelectorState.VISIBLE)
                            .setTimeout(searchResultTimeoutMs));
        } catch (Exception e) {
            throw new RuntimeException("No user found in search results (timeout)");
        }

        // Step 2: 点击第一个用户 → 进入主页
        clickFirstUser(page);

        // 等待主页加载 + 私信按钮出现（并行等两个特征，谁先满足都行）
        try {
            page.waitForSelector(
                    "[data-e2e=\"user-info\"], [class*=\"profile\"], [class*=\"user-info\"], h1, "
                            + "button:has-text('私信'), span:has-text('私信'), "
                            + "[role=\"button\"]:has-text('私信'), button:has-text('发消息'), span:has-text('发消息')",
                    new Page.WaitForSelectorOptions()
                            .setState(WaitForSelectorState.VISIBLE)
                            .setTimeout(profileTimeoutMs));
        } catch (Exception e) {
            throw new RuntimeException("User profile did not load");
        }

        // Step 3: 点击私信按钮
        clickPrivateMessage(page);

        // Step 4: 等待聊天对话框
        try {
            page.waitForSelector("textarea, div[role=\"textbox\"], [contenteditable=\"true\"]",
                    new Page.WaitForSelectorOptions()
                            .setState(WaitForSelectorState.VISIBLE)
                            .setTimeout(chatDialogTimeoutMs));
        } catch (Exception e) {
            throw new RuntimeException("Chat dialog did not open");
        }

        // Step 5: 输入消息并发送
        fillAndSend(page, message);
    }

    // ==================== 页面交互 ====================

    private void clickFirstUser(Page page) throws Exception {
        // JS 点击第一个可见的用户卡片（比 Playwright 原生 click 更快，跳过等待 actionability）
        Boolean clicked = (Boolean) page.evaluate("() => {"
                + "const links = document.querySelectorAll('a[href*=\"/user/\"]');"
                + "for (const a of links) {"
                + "  const rect = a.getBoundingClientRect();"
                + "  if (rect.width > 50 && rect.height > 50) {"
                + "    a.click(); return true;"
                + "  }"
                + "}"
                + "return false;"
                + "}");
        if (Boolean.TRUE.equals(clicked)) {
            log.info("  Clicked user card via JS");
            return;
        }
        // 兜底：Playwright 原生点击
        page.locator("a[href*=\"/user/\"]").first().click(new Locator.ClickOptions().setTimeout(3000));
    }

    private void clickPrivateMessage(Page page) throws Exception {
        // 优先 JS 查找点击（一次遍历，不走多次 isVisible 检查）
        Boolean clicked = (Boolean) page.evaluate("() => {"
                + "const targets = ['私信', '发消息', '聊天', '发私信'];"
                + "const all = document.querySelectorAll('button, span, a, div, [role=\"button\"]');"
                + "for (const el of all) {"
                + "  const text = (el.innerText || el.textContent || '').trim();"
                + "  const rect = el.getBoundingClientRect();"
                + "  if (rect.width <= 0 || rect.height <= 0) continue;"
                + "  for (const t of targets) {"
                + "    if (text === t || text.includes(t)) {"
                + "      el.click(); return true;"
                + "    }"
                + "  }"
                + "}"
                + "return false;"
                + "}");
        if (Boolean.TRUE.equals(clicked)) {
            log.info("  Clicked message button via JS");
            return;
        }

        // Playwright 兜底
        String[] btnTexts = {"私信", "发消息", "聊天", "发私信"};
        for (String text : btnTexts) {
            try {
                Locator btn = page.locator("button:has-text('" + text + "'), span:has-text('" + text + "'), "
                        + "[role=\"button\"]:has-text('" + text + "'), a:has-text('" + text + "')").first();
                if (btn.isVisible()) {
                    btn.click();
                    log.info("  Clicked '{}' button", text);
                    return;
                }
            } catch (Exception ignored) {}
        }

        throw new RuntimeException("Private message button not found on profile");
    }

    private void fillAndSend(Page page, String message) throws Exception {
        // JS 直接填充（跳过 click + fill 两步开销）
        Boolean filled = (Boolean) page.evaluate("(msg) => {"
                + "const selectors = ['textarea', 'div[role=\"textbox\"]', '[contenteditable=\"true\"]'];"
                + "for (const sel of selectors) {"
                + "  const el = document.querySelector(sel);"
                + "  if (!el) continue;"
                + "  const rect = el.getBoundingClientRect();"
                + "  if (rect.width <= 0 || rect.height <= 0) continue;"
                + "  el.focus();"
                + "  if (el.contentEditable === 'true' || el.getAttribute('contenteditable') === 'true') {"
                + "    el.textContent = msg;"
                + "    el.dispatchEvent(new Event('input', {bubbles: true}));"
                + "    el.dispatchEvent(new Event('change', {bubbles: true}));"
                + "  } else {"
                + "    el.value = msg;"
                + "    el.dispatchEvent(new Event('input', {bubbles: true}));"
                + "    el.dispatchEvent(new Event('change', {bubbles: true}));"
                + "  }"
                + "  return true;"
                + "}"
                + "return false;"
                + "}", message);

        if (!Boolean.TRUE.equals(filled)) throw new RuntimeException("No message input found");

        // 消息填充到发送的短延迟（等 DOM 更新）
        sleep(preSendDelayMs);

        // 优先 JS 触发发送（enter），兜底 keyboard.press
        Boolean sent = (Boolean) page.evaluate("() => {"
                + "const btn = document.querySelector('"
                + "button:has-text(\"发送\"), span:has-text(\"发送\"), "
                + "[role=\"button\"]:has-text(\"发送\")');"
                + "if (btn) { btn.click(); return true; }"
                + "return false;"
                + "}");
        if (Boolean.TRUE.equals(sent)) {
            log.info("  Sent via button click");
        } else {
            page.keyboard().press("Enter");
        }

        // 等消息发出（短延迟即可，无需等待页面响应）
        sleep(delayMs);
    }

    // ==================== 工具方法 ====================

    private void sleep(long ms) {
        try { Thread.sleep(ms); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
    }

    private String valueOrEmpty(String v) { return v == null ? "" : v.trim(); }
}
