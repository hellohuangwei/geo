package com.geo.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.imageio.ImageIO;
import java.awt.AWTException;
import java.awt.GraphicsEnvironment;
import java.awt.Rectangle;
import java.awt.Robot;
import java.awt.Toolkit;
import java.awt.datatransfer.StringSelection;
import java.awt.event.InputEvent;
import java.awt.event.KeyEvent;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * @deprecated 已替换为 Playwright 浏览器自动化方案，请使用 {@code AcquisitionService + DouyinAutomationService}
 */
@Deprecated


@Service
public class DouyinScreenAutomationService {

    private static final List<String> SEARCH_TEMPLATES = List.of(
            "douyin-search-box.png",
            "search-box.png",
            "search-icon.png"
    );

    private static final List<String> VIDEO_TEMPLATES = List.of(
            "video-card.png",
            "video-play.png",
            "douyin-video.png"
    );

    private static final List<String> COMMENT_TEMPLATES = List.of(
            "comment-icon.png",
            "douyin-comment.png",
            "comment-button.png"
    );

    @Value("${douyin.acquisition.template-dir:automation-templates/douyin}")
    private String templateDir;

    @Value("${douyin.acquisition.match-threshold:0.88}")
    private double matchThreshold;

    @Value("${douyin.acquisition.match-step:3}")
    private int matchStep;

    public RunResult run(String taskId, String keyword, String searchUrl, Map<String, Object> body) {
        List<String> steps = new ArrayList<>();
        steps.add("已进入后端屏幕自动化执行器，任务：" + taskId);
        steps.add("图标模板目录：" + Path.of(templateDir).toAbsolutePath());

        if (GraphicsEnvironment.isHeadless()) {
            steps.add("当前运行环境没有可操作桌面，无法触发真实鼠标点击。");
            return RunResult.disconnected("当前运行环境没有可操作桌面，无法执行鼠标自动点击。", steps);
        }

        if (!Files.isDirectory(Path.of(templateDir))) {
            steps.add("未找到图标模板目录，请放入搜索框、视频卡片、评论按钮等 PNG 模板后重试。");
            return RunResult.disconnected("未找到图标模板目录，已准备好图标匹配执行器。", steps);
        }

        try {
            Robot robot = new Robot();
            robot.setAutoDelay(80);
            sleep(Duration.ofMillis(1200));

            boolean clicked = false;
            if (clickFirstMatched(robot, SEARCH_TEMPLATES, "搜索框/搜索图标", steps).isPresent()) {
                clicked = true;
                pasteText(robot, keyword);
                press(robot, KeyEvent.VK_ENTER);
                steps.add("已通过鼠标点击聚焦搜索入口，并输入关键词：" + (keyword.isBlank() ? "未设置关键词" : keyword));
                sleep(Duration.ofMillis(1800));
            } else {
                steps.add("未匹配到搜索入口模板，继续尝试当前页面的视频结果。");
            }

            int videoLimit = intFromConfig(body, "collectVideoCount", 3);
            int commentsPerVideo = intFromConfig(body, "commentsPerVideo", 30);
            for (int index = 0; index < videoLimit; index++) {
                Optional<ScreenMatch> video = clickFirstMatched(robot, VIDEO_TEMPLATES, "视频卡片/播放入口", steps);
                if (video.isEmpty()) {
                    steps.add("第 " + (index + 1) + " 个视频未匹配到模板，停止逐视频点击。");
                    break;
                }

                clicked = true;
                steps.add("已点击第 " + (index + 1) + " 个视频结果，坐标：" + video.get().centerX() + "," + video.get().centerY());
                sleep(Duration.ofMillis(1500));

                Optional<ScreenMatch> commentButton = clickFirstMatched(robot, COMMENT_TEMPLATES, "评论按钮", steps);
                if (commentButton.isPresent()) {
                    steps.add("已打开评论区，开始滚动采集视窗，目标评论数：" + commentsPerVideo);
                    scroll(robot, Math.max(2, Math.min(8, commentsPerVideo / 10)));
                } else {
                    steps.add("未匹配到评论按钮模板，跳过当前视频评论区。");
                }

                press(robot, KeyEvent.VK_ESCAPE);
                sleep(Duration.ofMillis(600));
            }

            if (!clicked) {
                return RunResult.disconnected("未匹配到可点击图标，请重新截取模板图后再试。", steps);
            }

            steps.add("鼠标自动点击流程完成；评论文本抽取仍需接入 DOM/插件解析后返回 comments。");
            return RunResult.connected("已完成图标匹配与鼠标点击流程。", steps, List.of());
        } catch (AWTException ex) {
            steps.add("创建系统鼠标控制器失败：" + ex.getMessage());
            return RunResult.disconnected("系统鼠标控制器不可用。", steps);
        }
    }

    private Optional<ScreenMatch> clickFirstMatched(Robot robot, List<String> candidates, String label, List<String> steps) {
        for (String candidate : candidates) {
            Optional<ScreenMatch> match = findTemplate(robot, candidate);
            if (match.isPresent()) {
                ScreenMatch hit = match.get();
                moveAndClick(robot, hit.centerX(), hit.centerY());
                steps.add("已匹配并点击「" + label + "」模板 " + candidate + "，相似度：" + String.format("%.3f", hit.score()));
                return match;
            }
        }
        return Optional.empty();
    }

    private Optional<ScreenMatch> findTemplate(Robot robot, String filename) {
        Path templatePath = Path.of(templateDir, filename);
        if (!Files.isRegularFile(templatePath)) {
            return Optional.empty();
        }

        try {
            BufferedImage screen = robot.createScreenCapture(new Rectangle(Toolkit.getDefaultToolkit().getScreenSize()));
            BufferedImage template = ImageIO.read(templatePath.toFile());
            if (template == null || template.getWidth() > screen.getWidth() || template.getHeight() > screen.getHeight()) {
                return Optional.empty();
            }
            return match(screen, template, Math.max(1, matchStep)).filter(hit -> hit.score() >= matchThreshold);
        } catch (IOException ex) {
            return Optional.empty();
        }
    }

    private Optional<ScreenMatch> match(BufferedImage screen, BufferedImage template, int step) {
        double bestScore = -1;
        int bestX = 0;
        int bestY = 0;
        int maxX = screen.getWidth() - template.getWidth();
        int maxY = screen.getHeight() - template.getHeight();

        for (int y = 0; y <= maxY; y += step) {
            for (int x = 0; x <= maxX; x += step) {
                double score = similarityAt(screen, template, x, y, step);
                if (score > bestScore) {
                    bestScore = score;
                    bestX = x;
                    bestY = y;
                }
            }
        }

        if (bestScore < 0) {
            return Optional.empty();
        }
        return Optional.of(new ScreenMatch(
                bestX,
                bestY,
                bestX + template.getWidth() / 2,
                bestY + template.getHeight() / 2,
                bestScore
        ));
    }

    private double similarityAt(BufferedImage screen, BufferedImage template, int startX, int startY, int step) {
        long samples = 0;
        double squared = 0;

        for (int ty = 0; ty < template.getHeight(); ty += step) {
            for (int tx = 0; tx < template.getWidth(); tx += step) {
                int templateRgb = template.getRGB(tx, ty);
                int alpha = (templateRgb >>> 24) & 0xff;
                if (alpha < 32) {
                    continue;
                }

                int screenRgb = screen.getRGB(startX + tx, startY + ty);
                int dr = ((screenRgb >> 16) & 0xff) - ((templateRgb >> 16) & 0xff);
                int dg = ((screenRgb >> 8) & 0xff) - ((templateRgb >> 8) & 0xff);
                int db = (screenRgb & 0xff) - (templateRgb & 0xff);
                squared += dr * dr + dg * dg + db * db;
                samples++;
            }
        }

        if (samples == 0) {
            return 0;
        }

        double normalizedDistance = Math.sqrt(squared / (samples * 3.0)) / 255.0;
        return 1.0 - normalizedDistance;
    }

    private void moveAndClick(Robot robot, int x, int y) {
        robot.mouseMove(x, y);
        robot.mousePress(InputEvent.BUTTON1_DOWN_MASK);
        robot.delay(70);
        robot.mouseRelease(InputEvent.BUTTON1_DOWN_MASK);
    }

    private void pasteText(Robot robot, String text) {
        Toolkit.getDefaultToolkit().getSystemClipboard().setContents(new StringSelection(text == null ? "" : text), null);
        robot.keyPress(KeyEvent.VK_CONTROL);
        robot.keyPress(KeyEvent.VK_V);
        robot.keyRelease(KeyEvent.VK_V);
        robot.keyRelease(KeyEvent.VK_CONTROL);
    }

    private void press(Robot robot, int keyCode) {
        robot.keyPress(keyCode);
        robot.keyRelease(keyCode);
    }

    private void scroll(Robot robot, int rounds) {
        for (int i = 0; i < rounds; i++) {
            robot.mouseWheel(5);
            sleep(Duration.ofMillis(550));
        }
    }

    private void sleep(Duration duration) {
        try {
            Thread.sleep(duration.toMillis());
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
        }
    }

    @SuppressWarnings("unchecked")
    private int intFromConfig(Map<String, Object> body, String key, int fallback) {
        Object configValue = body.get("config");
        if (configValue instanceof Map<?, ?> config) {
            Object value = ((Map<String, Object>) config).get(key);
            if (value instanceof Number number) {
                return number.intValue();
            }
            if (value instanceof String text) {
                try {
                    return Integer.parseInt(text);
                } catch (NumberFormatException ignored) {
                    return fallback;
                }
            }
        }
        return fallback;
    }

    public record RunResult(
            boolean executorConnected,
            String message,
            List<String> steps,
            List<Map<String, Object>> comments
    ) {
        static RunResult connected(String message, List<String> steps, List<Map<String, Object>> comments) {
            return new RunResult(true, message, steps, comments);
        }

        static RunResult disconnected(String message, List<String> steps) {
            return new RunResult(false, message, steps, List.of());
        }
    }

    private record ScreenMatch(int x, int y, int centerX, int centerY, double score) {
    }
}

