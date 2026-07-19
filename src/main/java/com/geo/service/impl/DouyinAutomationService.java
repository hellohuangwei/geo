package com.geo.service.impl;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.geo.entity.AcquisitionTask;
import com.geo.service.PlatformAutomationService;
import com.geo.service.PlaywrightManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;
import java.util.*;

/**
 * Douyin automation — delegates to the proven Node.js Playwright CDP script.
 */
@Service
public class DouyinAutomationService implements PlatformAutomationService {

    private static final Logger log = LoggerFactory.getLogger(DouyinAutomationService.class);
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final PlaywrightManager playwrightManager;

    @Value("${acquisition.douyin.script-path:frontend/douyin-automation.mjs}")
    private String scriptPath;

    public DouyinAutomationService(PlaywrightManager playwrightManager) {
        this.playwrightManager = playwrightManager;
    }

    @Override
    public String getPlatform() { return "douyin"; }

    @Override
    public List<Map<String, Object>> execute(AcquisitionTask task) throws Exception {
        // 只检查 CDP 端口是否可达，不杀浏览器、不重启 Edge、不跳转页面
        log.info("Checking CDP availability at port 9222...");
        if (!playwrightManager.isCdpReachable()) {
            throw new RuntimeException("浏览器调试端口 9222 不可达。请先启动带 --remote-debugging-port=9222 的 Edge 浏览器。\n"
                    + "方法一：在前端项目目录运行 npm run dev（自动启动 Edge + CDP）\n"
                    + "方法二：手动运行 start msedge --remote-debugging-port=9222");
        }
        log.info("CDP port 9222 is reachable");
        Map<String, Object> config = parseConfig(task.getConfigJson());
        String keyword = getKeyword(task, config);
        int targetCount = intFromConfig(config, "targetCommentCount", 100);
        String returnUrl = strFromConfig(config, "returnUrl", "");
        log.info("Douyin automation: keyword='{}', target {} comments", keyword, targetCount);
        return runScript(keyword, targetCount, returnUrl);
    }

    private List<Map<String, Object>> runScript(String keyword, int targetCount, String returnUrl) throws Exception {
        // Build command: keyword + targetCount + --json flag
        List<String> cmd = new ArrayList<>();
        cmd.add("node");
        cmd.add(scriptPath);
        cmd.add(keyword != null ? keyword : "");
        cmd.add(String.valueOf(targetCount));
        cmd.add("--json");

        log.info("Running: {}", String.join(" ", cmd));

        ProcessBuilder pb = new ProcessBuilder(cmd);
        if (returnUrl != null && !returnUrl.isBlank()) {
            pb.environment().put("DOUYIN_RETURN_URL", returnUrl);
        }
        pb.redirectErrorStream(true);
        Process process = pb.start();

        StringBuilder output = new StringBuilder();
        AtomicReference<Throwable> readerFailure = new AtomicReference<>();
        Thread readerThread = new Thread(() -> {
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    synchronized (output) {
                        output.append(line).append("\n");
                    }
                    log.info("  script: {}", line);
                }
            } catch (Throwable t) {
                readerFailure.set(t);
            }
        }, "douyin-automation-output");
        readerThread.setDaemon(true);
        readerThread.start();

        process.waitFor();

        readerThread.join(2000);
        if (readerFailure.get() != null) {
            throw new RuntimeException("Failed to read automation output: " + readerFailure.get().getMessage(), readerFailure.get());
        }

        int exitCode = process.exitValue();
        String stdout;
        synchronized (output) {
            stdout = output.toString();
        }
        log.info("Script output: {} chars", stdout.length());
        if (exitCode != 0) {
            throw new RuntimeException("Douyin automation exited with code " + exitCode + ": " + shorten(stdout, 1000));
        }

        return parseJsonOutput(stdout, keyword);
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> parseJsonOutput(String output, String keyword) {
        // Find the JSON block (between ===JSON_START=== and ===JSON_END===)
        String json = output;
        int start = output.indexOf("===JSON_START===");
        int end = output.indexOf("===JSON_END===");
        if (start >= 0 && end > start) {
            json = output.substring(start + 17, end).trim();
        }

        try {
            // New format: { comments: [...], progress: [...], captchaDetected: bool }
            Map<String, Object> parsed = objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {});
            List<Map<String, Object>> comments = (List<Map<String, Object>>) parsed.getOrDefault("comments", List.of());
            List<Map<String, Object>> progress = (List<Map<String, Object>>) parsed.getOrDefault("progress", List.of());
            boolean captcha = Boolean.TRUE.equals(parsed.get("captchaDetected"));
            log.info("Parsed {} comments, captchaDetected={}", comments.size(), captcha);
            // Attach metadata for frontend access
            if (!comments.isEmpty()) {
                if (!progress.isEmpty()) comments.get(0).put("_progress", progress);
                if (captcha) comments.get(0).put("_captchaDetected", true);
            } else if (captcha) {
                // 0 comments but captcha detected — add a synthetic entry to carry the flag
                Map<String, Object> capEntry = new LinkedHashMap<>();
                capEntry.put("_captchaDetected", true);
                capEntry.put("content", "");
                capEntry.put("nickname", "");
                comments = List.of(capEntry);
            }
            return comments;
        } catch (Exception e) {
            log.warn("New format parse failed: {}, trying old format", e.getMessage());
            // Fallback: old flat array format
            try {
                List<Map<String, Object>> comments = objectMapper.readValue(json,
                        new TypeReference<List<Map<String, Object>>>() {});
                log.info("Parsed {} comments (old format)", comments.size());
                return comments;
            } catch (Exception ignored) {}
        }
        return List.of();
    }

    private String getKeyword(AcquisitionTask task, Map<String, Object> config) {
        Object kw = config.get("keyword");
        String keyword = kw == null ? "" : String.valueOf(kw).trim();
        if (!keyword.isBlank()) {
            return keyword;
        }
        if (task.getCurrentKeyword() != null && !task.getCurrentKeyword().isBlank()) {
            return task.getCurrentKeyword().trim();
        }
        return "";
    }

    private Map<String, Object> parseConfig(String json) {
        try { return objectMapper.readValue(json, new TypeReference<>() {}); }
        catch (Exception e) { return Map.of(); }
    }

    private int intFromConfig(Map<String, Object> config, String key, int fallback) {
        Object val = config.get(key);
        if (val instanceof Number n) return n.intValue();
        if (val instanceof String s) {
            try { return Integer.parseInt(s); } catch (NumberFormatException ignored) {}
        }
        return fallback;
    }

    private String strFromConfig(Map<String, Object> config, String key, String fallback) {
        Object val = config.get(key);
        if (val == null) return fallback;
        String text = String.valueOf(val).trim();
        return text.isBlank() ? fallback : text;
    }

    private String shorten(String text, int maxLen) {
        if (text == null || text.length() <= maxLen) return text;
        return text.substring(0, maxLen) + "...";
    }
}
