package com.geo.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.geo.dto.CreateTaskRequest;
import com.geo.dto.UpdateLeadRequest;
import com.geo.dto.UpdateTaskRequest;
import com.geo.entity.*;
import com.geo.repository.*;
import com.geo.dto.IntentAnalysisResult;
import com.geo.service.AcquisitionService;
import com.geo.service.CommentAnalysisService;
import com.geo.service.DouyinMessageService;
import com.geo.service.IntentAnalysisService;
import com.geo.service.PlatformAutomationService;
import com.geo.service.PlaywrightManager;
import com.geo.util.JwtUtil;
import com.geo.util.Result;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.*;

@RestController
@RequestMapping("/api/acquisition")
public class AcquisitionController {

    private static final Logger log = LoggerFactory.getLogger(AcquisitionController.class);

    private final AcquisitionService acquisitionService;
    private final IntentAnalysisService intentAnalysisService;
    private final JwtUtil jwtUtil;
    private final SysUserRepository userRepository;
    private final AcquisitionTaskRepository taskRepo;
    private final CapturedCommentRepository commentRepo;
    private final AcquisitionLeadRepository leadRepo;
    private final Map<String, PlatformAutomationService> platformServices;
    private final DouyinMessageService douyinMessageService;
    private final CommentAnalysisService commentAnalysisService;
    private final PlaywrightManager playwrightManager;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public AcquisitionController(AcquisitionService acquisitionService,
                                  IntentAnalysisService intentAnalysisService,
                                  JwtUtil jwtUtil,
                                  SysUserRepository userRepository,
                                  AcquisitionTaskRepository taskRepo,
                                  CapturedCommentRepository commentRepo,
                                  AcquisitionLeadRepository leadRepo,
                                  List<PlatformAutomationService> platformServices,
                                  DouyinMessageService douyinMessageService,
                                  CommentAnalysisService commentAnalysisService,
                                  PlaywrightManager playwrightManager) {
        this.acquisitionService = acquisitionService;
        this.intentAnalysisService = intentAnalysisService;
        this.jwtUtil = jwtUtil;
        this.userRepository = userRepository;
        this.taskRepo = taskRepo;
        this.commentRepo = commentRepo;
        this.leadRepo = leadRepo;
        this.douyinMessageService = douyinMessageService;
        this.commentAnalysisService = commentAnalysisService;
        this.playwrightManager = playwrightManager;
        Map<String, PlatformAutomationService> map = new LinkedHashMap<>();
        for (PlatformAutomationService svc : platformServices) {
            map.put(svc.getPlatform().toLowerCase(), svc);
        }
        this.platformServices = map;
    }

    // ==================== 任务 ====================

    @GetMapping("/tasks")
    public Result<?> listTasks(@RequestHeader("Authorization") String authHeader,
                                @RequestParam(required = false) String platform) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");

        List<AcquisitionTask> tasks = platform != null
                ? acquisitionService.getTasksByUserAndPlatform(userId, platform)
                : acquisitionService.getTasksByUser(userId);

        return Result.success("ok", tasks);
    }

    @PostMapping("/tasks")
    public Result<?> createTask(@RequestHeader("Authorization") String authHeader,
                                 @RequestBody CreateTaskRequest request) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");

        AcquisitionTask task = acquisitionService.createTask(
                userId, request.getName(), request.getPlatform(), request.getConfigJson());
        return Result.success("任务已创建", task);
    }

    @PutMapping("/tasks/{taskId}")
    public Result<?> updateTask(@RequestHeader("Authorization") String authHeader,
                                 @PathVariable Long taskId,
                                 @RequestBody UpdateTaskRequest request) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");

        try {
            AcquisitionTask task = acquisitionService.updateTask(
                    userId, taskId, request.getName(), request.getConfigJson());
            return Result.success("任务已更新", task);
        } catch (RuntimeException e) {
            return Result.error(400, e.getMessage());
        }
    }

    @DeleteMapping("/tasks/{taskId}")
    public Result<?> deleteTask(@RequestHeader("Authorization") String authHeader,
                                 @PathVariable Long taskId) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");

        try {
            acquisitionService.deleteTask(userId, taskId);
            return Result.success("任务已删除", null);
        } catch (RuntimeException e) {
            return Result.error(400, e.getMessage());
        }
    }

    @PostMapping("/tasks/{taskId}/run")
    public Result<?> runTask(@RequestHeader("Authorization") String authHeader,
                              @PathVariable Long taskId,
                              @RequestBody(required = false) Map<String, Object> body) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");

        try {
            AcquisitionTask task = taskRepo.findById(taskId).orElse(null);
            if (task == null) return Result.error(400, "Task not found");
            if (!task.getUserId().equals(userId)) return Result.error(403, "Access denied");

            String platformKey = task.getPlatform() != null ? task.getPlatform().toLowerCase() : "douyin";
            PlatformAutomationService platformSvc = platformServices.get(platformKey);
            if (platformSvc == null) return Result.error(400, "Unsupported platform: " + platformKey);

            Map<String, Object> config = new LinkedHashMap<>(parseConfig(task.getConfigJson()));
            String configKeyword = extractKeyword(config);
            String requestKeyword = body == null ? "" : String.valueOf(body.getOrDefault("keyword", "")).trim();
            String returnUrl = body == null ? "" : String.valueOf(body.getOrDefault("returnUrl", "")).trim();
            String keyword = !requestKeyword.isBlank() ? requestKeyword : configKeyword;
            config.put("keyword", keyword);
            if (!returnUrl.isBlank()) {
                config.put("returnUrl", returnUrl);
            }
            String searchUrl = buildSearchUrl(keyword);
            log.info("Acquisition run: taskId={}, keyword='{}', searchUrl='{}'",
                    taskId, keyword, searchUrl);

            task.setConfigJson(objectMapper.writeValueAsString(config));
            task.setCurrentKeyword(keyword);
            task.setLastSearchUrl(searchUrl);
            task.setStatus("running");
            task.setLastRunAt(LocalDateTime.now());
            taskRepo.save(task);

            // 同步调用平台自动化，返回所有评论
            List<Map<String, Object>> rawList = platformSvc.execute(task);
            log.info("Collected {} raw comments", rawList.size());

            // 先检查验证码标记（在去重过滤之前）
            boolean captchaDetected = rawList.stream().anyMatch(
                c -> Boolean.TRUE.equals(c.get("_captchaDetected")));

            // 去重统计 + 存库
            Set<String> seenComments = new HashSet<>();
            Set<String> seenVideos = new HashSet<>();
            List<Map<String, Object>> result = new ArrayList<>();
            for (Map<String, Object> raw : rawList) {
                if (Boolean.TRUE.equals(raw.get("_captchaDetected"))) continue;
                String content = String.valueOf(raw.getOrDefault("content", ""));
                if (content.isBlank()) continue;
                String videoUrl = String.valueOf(raw.getOrDefault("videoUrl", ""));
                String nickname = String.valueOf(raw.getOrDefault("nickname", ""));
                String dedupeKey = String.join("|", videoUrl, nickname, content);
                if (!seenComments.add(dedupeKey)) continue;
                if (!videoUrl.isBlank()) seenVideos.add(videoUrl);
                result.add(raw);

                // 保存到数据库
                CapturedComment comment = new CapturedComment();
                comment.setUserId(userId);
                comment.setTaskId(taskId);
                comment.setPlatform(platformKey);
                comment.setKeyword(keyword);
                comment.setVideoUrl(videoUrl.isBlank() ? null : videoUrl);
                comment.setVideoTitle(strVal(raw.get("videoTitle"), null));
                comment.setVideoAuthorName(strVal(raw.get("videoAuthorName"), null));
                comment.setCommenterNickname(nickname);
                comment.setCommenterPlatformId(strVal(raw.get("douyinId"), null));
                comment.setCommenterAvatarUrl(strVal(raw.get("avatarUrl"), null));
                comment.setContent(content);
                comment.setLikes(raw.get("likes") instanceof Number n ? n.intValue() : 0);
                comment.setReplyCount(raw.get("replyCount") instanceof Number n ? n.intValue() : 0);
                String publishedAt = strVal(raw.get("publishedAt"), null);
                if (publishedAt != null && !publishedAt.isBlank()) {
                    try { comment.setPublishedAt(LocalDateTime.parse(publishedAt.substring(0, 19))); } catch (Exception ignored) {}
                }
                commentRepo.save(comment);
            }

            task.setAnalyzedCommentCount(task.getAnalyzedCommentCount() + result.size());
            task.setCollectedVideoCount(task.getCollectedVideoCount() + seenVideos.size());
            task.setStatus(captchaDetected ? "executor_required" : "completed");
            task.setLastRunAt(LocalDateTime.now());
            taskRepo.save(task);

            Map<String, Object> data = new LinkedHashMap<>();
            data.put("taskId", task.getId());
            data.put("keyword", keyword);
            data.put("searchUrl", searchUrl);
            data.put("commentCount", result.size());
            data.put("videoCount", seenVideos.size());
            data.put("captchaDetected", captchaDetected);
            data.put("comments", result);
            String msg = "采集完成，共 " + result.size() + " 条评论"
                + (captchaDetected ? "（检测到验证码，请去抖音页面完成验证后重试）" : "");
            return Result.success(msg, data);
        } catch (Exception e) {
            log.error("Collection failed: {}", e.getMessage(), e);
            return Result.error(500, "采集失败: " + e.getMessage());
        }
    }

    @PostMapping("/tasks/{taskId}/pause")
    public Result<?> pauseTask(@RequestHeader("Authorization") String authHeader,
                                @PathVariable Long taskId) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");

        try {
            acquisitionService.pauseTask(userId, taskId);
            return Result.success("任务已暂停", null);
        } catch (RuntimeException e) {
            return Result.error(400, e.getMessage());
        }
    }

    // ==================== 评论 ====================

    @GetMapping("/tasks/{taskId}/comments")
    public Result<?> getComments(@RequestHeader("Authorization") String authHeader,
                                  @PathVariable Long taskId,
                                  @RequestParam(defaultValue = "0") int page,
                                  @RequestParam(defaultValue = "50") int size,
                                  @RequestParam(required = false) String keyword,
                                  @RequestParam(required = false) String search) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");

        try {
            Map<String, Object> data;
            if (search != null && !search.isBlank()) {
                data = acquisitionService.searchComments(userId, taskId, keyword, search, page, size);
            } else {
                data = acquisitionService.getCommentsByTaskPaged(userId, taskId, keyword, page, size);
            }
            return Result.success("ok", data);
        } catch (RuntimeException e) {
            return Result.error(400, e.getMessage());
        }
    }

    @PostMapping("/comments/{commentId}/add-lead")
    public Result<?> addLeadFromComment(@RequestHeader("Authorization") String authHeader,
                                         @PathVariable Long commentId) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");

        try {
            AcquisitionLead lead = acquisitionService.addLeadFromComment(userId, commentId);
            return Result.success("已加入客户库", lead);
        } catch (RuntimeException e) {
            return Result.error(400, e.getMessage());
        }
    }

    @PostMapping("/batch-add-leads")
    public Result<?> batchAddLeadsFromComments(@RequestHeader("Authorization") String authHeader,
                                                @RequestBody Map<String, Object> body) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");

        @SuppressWarnings("unchecked")
        List<Integer> rawIds = (List<Integer>) body.getOrDefault("commentIds", List.of());
        List<Long> commentIds = rawIds.stream().map(Integer::longValue).toList();
        if (commentIds.isEmpty()) return Result.error(400, "请选择至少一条评论");

        List<AcquisitionLead> leads = acquisitionService.batchAddLeadsFromComments(userId, commentIds);
        return Result.success("成功加入 " + leads.size() + " 位客户，跳过 " + (commentIds.size() - leads.size()) + " 条", leads);
    }

    @PostMapping("/comments/{commentId}/ignore")
    public Result<?> ignoreComment(@RequestHeader("Authorization") String authHeader,
                                    @PathVariable Long commentId) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");

        try {
            acquisitionService.ignoreComment(userId, commentId);
            return Result.success("已忽略", null);
        } catch (RuntimeException e) {
            return Result.error(400, e.getMessage());
        }
    }

    // ==================== 客户 ====================

    @GetMapping("/leads")
    public Result<?> listLeads(@RequestHeader("Authorization") String authHeader,
                                @RequestParam(required = false) Long taskId) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");

        List<AcquisitionLead> leads = taskId != null
                ? acquisitionService.getLeadsByTask(userId, taskId)
                : acquisitionService.getLeadsByUser(userId);

        return Result.success("ok", leads);
    }

    @PostMapping("/leads/send-messages")
    public Result<?> batchSendMessages(@RequestHeader("Authorization") String authHeader,
                                        @RequestBody Map<String, Object> body) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");

        @SuppressWarnings("unchecked")
        List<Integer> rawIds = (List<Integer>) body.getOrDefault("leadIds", List.of());
        String message = String.valueOf(body.getOrDefault("message", ""));
        if (rawIds.isEmpty() || message.isBlank()) {
            return Result.error(400, "leadIds 和 message 不能为空");
        }

        List<Long> leadIds = rawIds.stream().map(Integer::longValue).toList();
        List<AcquisitionLead> leads = new ArrayList<>();
        for (Long id : leadIds) {
            AcquisitionLead lead = leadRepo.findById(id).orElse(null);
            if (lead != null && lead.getUserId().equals(userId)) {
                leads.add(lead);
            }
        }

        if (leads.isEmpty()) return Result.error(400, "没有找到有效的客户");

        Map<String, Object> result = douyinMessageService.sendBatchMessages(leads, message);
        return Result.success("发送完成：" + result.get("success") + " 成功，" + result.get("failed") + " 失败", result);
    }

    @PutMapping("/leads/{leadId}")
    public Result<?> updateLead(@RequestHeader("Authorization") String authHeader,
                                 @PathVariable Long leadId,
                                 @RequestBody UpdateLeadRequest request) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");

        try {
            AcquisitionLead lead = acquisitionService.updateLead(
                    userId, leadId, request.getStatus(), request.getNote());
            return Result.success("客户已更新", lead);
        } catch (RuntimeException e) {
            return Result.error(400, e.getMessage());
        }
    }

    // ==================== 日志 ====================

    @GetMapping("/tasks/{taskId}/logs")
    public Result<?> getLogs(@RequestHeader("Authorization") String authHeader,
                              @PathVariable Long taskId) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");

        try {
            List<AcquisitionRunLog> logs = acquisitionService.getLogsByTask(userId, taskId);
            return Result.success("ok", logs);
        } catch (RuntimeException e) {
            return Result.error(400, e.getMessage());
        }
    }

    // ==================== 统计 ====================

    @GetMapping("/stats")
    public Result<?> getStats(@RequestHeader("Authorization") String authHeader) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");

        Map<String, Object> stats = acquisitionService.getStats(userId);
        return Result.success("ok", stats);
    }

    // ==================== AI 分析 ====================

    @PostMapping("/comments/analyze")
    public Result<?> analyzeComments(@RequestHeader("Authorization") String authHeader,
                                     @RequestBody Map<String, Object> body) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> comments = (List<Map<String, Object>>) body.getOrDefault("comments", List.of());
        String keyword = String.valueOf(body.getOrDefault("keyword", ""));
        String industry = String.valueOf(body.getOrDefault("industry", ""));

        Map<String, Object> aiContext = new LinkedHashMap<>();
        aiContext.put("keyword", keyword);
        aiContext.put("industryRole", industry);

        List<Map<String, Object>> results = new ArrayList<>();
        for (Map<String, Object> c : comments) {
            String content = String.valueOf(c.getOrDefault("content", ""));
            if (content.isBlank()) {
                results.add(Map.of("content", "", "analysis", Map.of(
                    "level", "none", "score", 0, "reason", "", "demandKeywords", List.of())));
                continue;
            }
            IntentAnalysisResult analysis = intentAnalysisService.analyze(content, aiContext);
            Map<String, Object> item = new LinkedHashMap<>(c);
            item.put("analysis", Map.of(
                "level", analysis.getLevel(),
                "score", analysis.getScore(),
                "reason", analysis.getReason(),
                "demandKeywords", analysis.getDemandKeywords()
            ));
            results.add(item);
        }
        return Result.success("AI 分析完成，共 " + results.size() + " 条", Map.of("comments", results));
    }

    // ==================== 批量 AI 分析（核心新接口） ====================

    /**
     * 对任务下所有未分析评论执行 AI 意向分析
     * 同步执行（少量评论）或异步执行（大量评论）
     */
    @PostMapping("/tasks/{taskId}/analyze")
    public Result<?> analyzeTaskComments(@RequestHeader("Authorization") String authHeader,
                                         @PathVariable Long taskId,
                                         @RequestParam(defaultValue = "false") boolean async) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");

        try {
            AcquisitionTask task = taskRepo.findById(taskId).orElse(null);
            if (task == null) return Result.error(400, "任务不存在");
            if (!task.getUserId().equals(userId)) return Result.error(403, "无权访问");

            List<CapturedComment> unanalyzed = commentRepo
                    .findByTaskIdAndIsIgnoredFalseAndIntentLevelIsNull(taskId);
            if (unanalyzed.isEmpty()) {
                return Result.success("没有需要分析的评论", Map.of("total", 0, "message", "所有评论已分析"));
            }

            if (async || unanalyzed.size() > 20) {
                // 大量评论走异步，立即返回
                commentAnalysisService.analyzeTaskCommentsAsync(userId, taskId);
                return Result.success("已提交异步分析任务，共 " + unanalyzed.size() + " 条评论，稍后查看结果",
                        Map.of("total", unanalyzed.size(), "async", true));
            } else {
                // 少量评论同步执行，立即返回结果
                Map<String, Object> stats = commentAnalysisService.analyzeTaskComments(userId, taskId);
                return Result.success("AI 分析完成", stats);
            }
        } catch (RuntimeException e) {
            return Result.error(400, e.getMessage());
        }
    }

    /**
     * 单条评论重新 AI 分析
     */
    @PostMapping("/comments/{commentId}/analyze")
    public Result<?> analyzeSingleComment(@RequestHeader("Authorization") String authHeader,
                                          @PathVariable Long commentId) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");

        try {
            Map<String, Object> result = commentAnalysisService.analyzeSingleComment(userId, commentId);
            return Result.success("分析完成", result);
        } catch (RuntimeException e) {
            return Result.error(400, e.getMessage());
        }
    }

    /**
     * 获取任务的意向分布统计
     */
    @GetMapping("/tasks/{taskId}/intent-stats")
    public Result<?> getIntentStats(@RequestHeader("Authorization") String authHeader,
                                    @PathVariable Long taskId) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");

        try {
            Map<String, Object> stats = commentAnalysisService.getIntentStats(userId, taskId);
            return Result.success("ok", stats);
        } catch (RuntimeException e) {
            return Result.error(400, e.getMessage());
        }
    }

    /**
     * 检查 Edge CDP 调试端口是否就绪（只读，不触发任何操作）。
     */
    @GetMapping("/cdp/status")
    public Result<?> cdpStatus(@RequestHeader(value = "Authorization", required = false) String authHeader) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");

        boolean reachable = playwrightManager.isCdpReachable();
        return Result.success("ok", Map.of("cdpReady", reachable));
    }

    /**
     * 确保 Edge 浏览器 CDP 调试端口就绪。
     * 如果端口不通，会 kill 所有 Edge 进程并用真实 profile 重启（保留 Cookie/登录态），
     * 同时在重启后的浏览器中打开 GEO 页面。
     */
    @GetMapping("/cdp/ensure")
    public Result<?> ensureCdp(@RequestHeader(value = "Authorization", required = false) String authHeader,
                               @RequestHeader(value = "Referer", required = false) String referer) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");

        try {
            boolean wasReachable = playwrightManager.isCdpReachable();
            if (wasReachable) {
                return Result.success("CDP 调试端口已就绪", Map.of("cdpReady", true, "wasAlreadyRunning", true));
            }

            log.info("CDP not reachable, killing Edge and restarting with --remote-debugging-port=9222...");
            playwrightManager.getBrowser(); // kill 全部 Edge 并用真实 profile 重启

            boolean nowReachable = playwrightManager.isCdpReachable();
            // 重启后在 Edge 中打开 GEO 页面
            if (nowReachable && referer != null && !referer.isBlank()) {
                try {
                    var contexts = playwrightManager.getBrowser().contexts();
                    if (!contexts.isEmpty()) {
                        var page = contexts.get(0).newPage();
                        page.navigate(referer);
                        log.info("Opened GEO page in restarted Edge: {}", referer);
                    }
                } catch (Exception e) {
                    log.warn("Failed to open GEO page after restart: {}", e.getMessage());
                }
            }
            return Result.success(
                nowReachable ? "已重启 Edge 并开启 CDP 调试端口" : "CDP 启动中，请稍候",
                Map.of("cdpReady", nowReachable, "wasAlreadyRunning", false)
            );
        } catch (Exception e) {
            log.error("CDP ensure failed: {}", e.getMessage(), e);
            return Result.error(500, "CDP 调试端口启动失败: " + e.getMessage());
        }
    }

    /**
     * 一条龙：保存任务 → kill Edge 重启 CDP → 执行采集。
     * 前端确认弹窗后调用此接口，即使前端页面被杀也能完成后端采集。
     */
    @PostMapping("/cdp/ensure-and-run")
    public Result<?> ensureCdpAndRun(@RequestHeader(value = "Authorization", required = false) String authHeader,
                                     @RequestBody Map<String, Object> body) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");

        String taskIdStr = String.valueOf(body.getOrDefault("taskId", ""));
        String keyword = String.valueOf(body.getOrDefault("keyword", "")).trim();
        if (keyword.isEmpty()) return Result.error(400, "keyword 不能为空");

        try {
            Long taskId = Long.parseLong(taskIdStr);
            AcquisitionTask task = taskRepo.findById(taskId).orElse(null);
            if (task == null || !task.getUserId().equals(userId)) {
                return Result.error(400, "任务不存在");
            }

            String platformKey = task.getPlatform() != null ? task.getPlatform().toLowerCase() : "douyin";
            PlatformAutomationService platformSvc = platformServices.get(platformKey);
            if (platformSvc == null) return Result.error(400, "Unsupported platform: " + platformKey);

            // Step 1: 确保 CDP（kill Edge + 重启）
            if (!playwrightManager.isCdpReachable()) {
                log.info("CDP not reachable, killing Edge and restarting...");
                playwrightManager.getBrowser();
            }

            // Step 2: 更新任务状态
            Map<String, Object> config = new LinkedHashMap<>(parseConfig(task.getConfigJson()));
            config.put("keyword", keyword);
            String searchUrl = buildSearchUrl(keyword);
            task.setConfigJson(objectMapper.writeValueAsString(config));
            task.setCurrentKeyword(keyword);
            task.setLastSearchUrl(searchUrl);
            task.setStatus("running");
            task.setLastRunAt(LocalDateTime.now());
            taskRepo.save(task);

            // Step 3: 执行采集
            log.info("Starting acquisition: taskId={}, keyword='{}'", taskId, keyword);
            List<Map<String, Object>> rawList = platformSvc.execute(task);
            log.info("Collected {} raw comments", rawList.size());

            boolean captchaDetected = rawList.stream().anyMatch(
                c -> Boolean.TRUE.equals(c.get("_captchaDetected")));

            Set<String> seenComments = new HashSet<>();
            Set<String> seenVideos = new HashSet<>();
            List<Map<String, Object>> result = new ArrayList<>();
            for (Map<String, Object> raw : rawList) {
                if (Boolean.TRUE.equals(raw.get("_captchaDetected"))) continue;
                String content = String.valueOf(raw.getOrDefault("content", ""));
                if (content.isBlank()) continue;
                String videoUrl = String.valueOf(raw.getOrDefault("videoUrl", ""));
                String nickname = String.valueOf(raw.getOrDefault("nickname", ""));
                String dedupeKey = String.join("|", videoUrl, nickname, content);
                if (!seenComments.add(dedupeKey)) continue;
                if (!videoUrl.isBlank()) seenVideos.add(videoUrl);
                result.add(raw);

                CapturedComment comment = new CapturedComment();
                comment.setUserId(userId);
                comment.setTaskId(taskId);
                comment.setPlatform(platformKey);
                comment.setKeyword(keyword);
                comment.setVideoUrl(videoUrl.isBlank() ? null : videoUrl);
                comment.setVideoTitle(strVal(raw.get("videoTitle"), null));
                comment.setVideoAuthorName(strVal(raw.get("videoAuthorName"), null));
                comment.setCommenterNickname(nickname);
                comment.setCommenterPlatformId(strVal(raw.get("douyinId"), null));
                comment.setCommenterAvatarUrl(strVal(raw.get("avatarUrl"), null));
                comment.setContent(content);
                comment.setLikes(raw.get("likes") instanceof Number n ? n.intValue() : 0);
                comment.setReplyCount(raw.get("replyCount") instanceof Number n ? n.intValue() : 0);
                String publishedAt = strVal(raw.get("publishedAt"), null);
                if (publishedAt != null && !publishedAt.isBlank()) {
                    try { comment.setPublishedAt(LocalDateTime.parse(publishedAt.substring(0, 19))); } catch (Exception ignored) {}
                }
                commentRepo.save(comment);
            }

            task.setAnalyzedCommentCount(task.getAnalyzedCommentCount() + result.size());
            task.setCollectedVideoCount(task.getCollectedVideoCount() + seenVideos.size());
            task.setStatus(captchaDetected ? "executor_required" : "completed");
            task.setLastRunAt(LocalDateTime.now());
            taskRepo.save(task);

            // Step 4: 清理抖音标签页 + 打开前端页面
            String returnUrl = String.valueOf(body.getOrDefault("returnUrl", "")).trim();
            cleanupAndNavigate(returnUrl);

            Map<String, Object> data = new LinkedHashMap<>();
            data.put("taskId", task.getId());
            data.put("keyword", keyword);
            data.put("searchUrl", searchUrl);
            data.put("commentCount", result.size());
            data.put("videoCount", seenVideos.size());
            data.put("captchaDetected", captchaDetected);
            data.put("comments", result);
            String msg = "采集完成，共 " + result.size() + " 条评论"
                + (captchaDetected ? "（检测到验证码）" : "");
            return Result.success(msg, data);
        } catch (Exception e) {
            log.error("CDP ensure-and-run failed: {}", e.getMessage(), e);
            return Result.error(500, "采集失败: " + e.getMessage());
        }
    }

    /** 采集完成后：关闭所有抖音标签页，打开前端页面，恢复窗口 */
    private void cleanupAndNavigate(String returnUrl) {
        try {
            if (!playwrightManager.isBrowserReady()) return;
            var browser = playwrightManager.getBrowser();
            var contexts = browser.contexts();
            for (var ctx : contexts) {
                for (var page : ctx.pages()) {
                    String url = page.url().toLowerCase();
                    if (url.contains("douyin.com") || url.contains("edge://newtab") || url.contains("127.0.0.1:9222")) {
                        try { page.close(); } catch (Exception ignored) {}
                    }
                }
            }
            // 打开前端页面并恢复窗口（采集期间浏览器处于最小化状态）
            if (!returnUrl.isBlank() && !contexts.isEmpty()) {
                var page = contexts.get(0).newPage();
                page.navigate(returnUrl);
                page.bringToFront(); // 采集完成，恢复窗口让用户看到结果
                log.info("Opened frontend page and brought to front: {}", returnUrl);
            }
        } catch (Exception e) {
            log.warn("cleanupAndNavigate failed: {}", e.getMessage());
        }
    }

    // ==================== 内部方法 ====================

    private Long getUserId(String authHeader) {
        if (authHeader == null || !authHeader.startsWith("Bearer ")) return null;
        String token = authHeader.substring(7);
        if (!jwtUtil.validateToken(token)) return null;
        String username = jwtUtil.getUsernameFromToken(token);
        SysUser user = userRepository.findByUsername(username).orElse(null);
        return user != null ? user.getId() : null;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parseConfig(String configJson) {
        try {
            return objectMapper.readValue(configJson, Map.class);
        } catch (Exception e) {
            return Map.of();
        }
    }

    private String extractKeyword(Map<String, Object> config) {
        Object value = config.get("keyword");
        return value == null ? "" : String.valueOf(value).trim();
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

}
