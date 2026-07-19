package com.geo.service;

import com.geo.entity.*;
import com.geo.repository.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;

/**
 * Async executor for acquisition tasks — separate from AcquisitionServiceImpl
 * so Spring AOP can properly intercept @Async.
 */
@Service
public class AcquisitionExecutor {

    private static final Logger log = LoggerFactory.getLogger(AcquisitionExecutor.class);

    private final AcquisitionTaskRepository taskRepo;
    private final AcquisitionRunLogRepository logRepo;
    private final CapturedCommentRepository commentRepo;
    private final Map<String, PlatformAutomationService> platformServices;

    public AcquisitionExecutor(
            AcquisitionTaskRepository taskRepo,
            AcquisitionRunLogRepository logRepo,
            CapturedCommentRepository commentRepo,
            List<PlatformAutomationService> platformServices) {
        this.taskRepo = taskRepo;
        this.logRepo = logRepo;
        this.commentRepo = commentRepo;
        Map<String, PlatformAutomationService> map = new LinkedHashMap<>();
        for (PlatformAutomationService svc : platformServices) {
            map.put(svc.getPlatform().toLowerCase(), svc);
        }
        this.platformServices = map;
    }

    @Async("acquisitionTaskExecutor")
    public void executeTask(Long userId, Long taskId, String keyword,
                             Map<String, Object> config, String platform) {
        AcquisitionTask task = null;
        try {
            task = taskRepo.findById(taskId).orElse(null);
            if (task == null) {
                log.error("Task {} not found", taskId);
                return;
            }

            String platformKey = platform == null ? "douyin" : platform.toLowerCase();
            PlatformAutomationService platformSvc = platformServices.get(platformKey);
            if (platformSvc == null) {
                throw new RuntimeException("Unsupported platform: " + platform);
            }

            addLog(userId, taskId, "running", "Starting platform automation...");

            String searchKeyword = keyword == null ? "" : keyword.trim();
            if (searchKeyword.isBlank() && task.getCurrentKeyword() != null) {
                searchKeyword = task.getCurrentKeyword().trim();
            }

            // 1. Execute platform automation for the configured keyword
            List<Map<String, Object>> rawComments = new ArrayList<>();
            task.setCurrentKeyword(searchKeyword);
            String searchUrl = buildSearchUrl(searchKeyword);
            task.setLastSearchUrl(searchUrl);
            taskRepo.save(task);
            addLog(userId, taskId, "running",
                    "Searching keyword: " + (searchKeyword.isBlank() ? "(current page)" : searchKeyword), searchUrl);

            List<Map<String, Object>> collected = platformSvc.execute(task);
            addLog(userId, taskId, "running",
                    "Platform returned " + collected.size() + " raw comments for keyword: " + (searchKeyword.isBlank() ? "(current page)" : searchKeyword));
            for (Map<String, Object> raw : collected) {
                Map<String, Object> item = new LinkedHashMap<>(raw);
                item.putIfAbsent("keyword", searchKeyword);
                rawComments.add(item);
            }

            // 2. 保存评论到数据库（去重后）
            int commentCount = 0;
            Set<String> seenComments = new HashSet<>();
            Set<String> seenVideos = new HashSet<>();

            for (Map<String, Object> raw : rawComments) {
                String content = String.valueOf(raw.getOrDefault("content", ""));
                if (content.isBlank()) continue;
                String videoUrl = String.valueOf(raw.getOrDefault("videoUrl", ""));
                String nickname = String.valueOf(raw.getOrDefault("nickname", ""));
                String dedupeKey = String.join("|", videoUrl, nickname, content);
                if (!seenComments.add(dedupeKey)) continue;
                if (!videoUrl.isBlank()) seenVideos.add(videoUrl);

                CapturedComment comment = new CapturedComment();
                comment.setUserId(userId);
                comment.setTaskId(taskId);
                comment.setPlatform(platform != null ? platform : "douyin");
                comment.setKeyword(searchKeyword);
                comment.setPlatformVideoId(strVal(raw.get("videoId"), null));
                comment.setVideoUrl(videoUrl.isBlank() ? null : videoUrl);
                comment.setVideoTitle(strVal(raw.get("videoTitle"), null));
                comment.setVideoAuthorName(strVal(raw.get("videoAuthorName"), null));
                comment.setCommenterNickname(nickname);
                comment.setCommenterPlatformId(strVal(raw.get("douyinId"), null));
                comment.setCommenterAvatarUrl(strVal(raw.get("avatarUrl"), null));
                comment.setContent(content);
                comment.setLikes(intVal(raw.get("likes")));
                comment.setReplyCount(intVal(raw.get("replyCount")));
                String publishedAt = strVal(raw.get("publishedAt"), null);
                if (publishedAt != null && !publishedAt.isBlank()) {
                    try { comment.setPublishedAt(LocalDateTime.parse(publishedAt.substring(0, 19))); } catch (Exception ignored) {}
                }
                commentRepo.save(comment);
                commentCount++;
            }

            // 3. Update task stats
            task.setStatus("completed");
            task.setAnalyzedCommentCount(task.getAnalyzedCommentCount() + commentCount);
            task.setLeadCount(task.getLeadCount());
            task.setCollectedVideoCount(task.getCollectedVideoCount() + seenVideos.size());
            task.setLastRunAt(LocalDateTime.now());
            taskRepo.save(task);

            addLog(userId, taskId, "completed",
                    String.format("Done: %d comments, %d unique videos",
                            commentCount, seenVideos.size()));

        } catch (Exception e) {
            log.error("Task execution failed: {}", e.getMessage(), e);
            if (task != null) {
                task.setStatus("failed");
                taskRepo.save(task);
            }
            addLog(userId, taskId, "failed", "Execution failed: " + e.getMessage());
        }
    }

    private void addLog(Long userId, Long taskId, String status, String message) {
        AcquisitionRunLog logEntry = new AcquisitionRunLog();
        logEntry.setUserId(userId);
        logEntry.setTaskId(taskId);
        logEntry.setStatus(status);
        logEntry.setMessage(message);
        logRepo.save(logEntry);
    }

    private void addLog(Long userId, Long taskId, String status, String message, String searchUrl) {
        AcquisitionRunLog logEntry = new AcquisitionRunLog();
        logEntry.setUserId(userId);
        logEntry.setTaskId(taskId);
        logEntry.setStatus(status);
        logEntry.setMessage(message);
        logEntry.setSearchUrl(searchUrl);
        logRepo.save(logEntry);
    }

    private String buildSearchUrl(String keyword) {
        if (keyword == null || keyword.isBlank()) return "https://www.douyin.com/";
        return "https://www.douyin.com/search/" +
                java.net.URLEncoder.encode(keyword.trim(), java.nio.charset.StandardCharsets.UTF_8) + "?type=video";
    }

    private String strVal(Object value, String fallback) {
        if (value instanceof String s && !s.isBlank()) return s;
        if (value != null) {
            String s = value.toString().trim();
            if (!s.isEmpty()) return s;
        }
        return fallback;
    }

    private int intVal(Object value) {
        if (value instanceof Number n) return n.intValue();
        if (value instanceof String s) {
            try { return Integer.parseInt(s); } catch (NumberFormatException ignored) {}
        }
        return 0;
    }
}
