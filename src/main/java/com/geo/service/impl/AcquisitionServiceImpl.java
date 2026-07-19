package com.geo.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.geo.entity.*;
import com.geo.repository.*;
import com.geo.service.AcquisitionExecutor;
import com.geo.service.AcquisitionService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;

@Service
public class AcquisitionServiceImpl implements AcquisitionService {

    private static final Logger log = LoggerFactory.getLogger(AcquisitionServiceImpl.class);

    private final AcquisitionTaskRepository taskRepo;
    private final CapturedCommentRepository commentRepo;
    private final AcquisitionLeadRepository leadRepo;
    private final AcquisitionRunLogRepository logRepo;
    private final AcquisitionExecutor executor;
    private final ObjectMapper objectMapper;

    public AcquisitionServiceImpl(
            AcquisitionTaskRepository taskRepo,
            CapturedCommentRepository commentRepo,
            AcquisitionLeadRepository leadRepo,
            AcquisitionRunLogRepository logRepo,
            AcquisitionExecutor executor) {
        this.taskRepo = taskRepo;
        this.commentRepo = commentRepo;
        this.leadRepo = leadRepo;
        this.logRepo = logRepo;
        this.executor = executor;
        this.objectMapper = new ObjectMapper();
    }

    // ==================== Task CRUD ====================

    @Override
    @Transactional
    public AcquisitionTask createTask(Long userId, String name, String platform, String configJson) {
        AcquisitionTask task = new AcquisitionTask();
        task.setUserId(userId);
        task.setName(name);
        task.setPlatform(platform != null ? platform : "douyin");
        task.setConfigJson(configJson != null ? configJson : "{}");
        task.setStatus("idle");
        task = taskRepo.save(task);
        addLog(userId, task.getId(), "idle", "Task created: " + task.getName());
        return task;
    }

    @Override
    @Transactional
    public AcquisitionTask updateTask(Long userId, Long taskId, String name, String configJson) {
        AcquisitionTask task = taskRepo.findById(taskId)
                .orElseThrow(() -> new RuntimeException("Task not found"));
        if (!task.getUserId().equals(userId)) throw new RuntimeException("Access denied");
        if (name != null && !name.isBlank()) task.setName(name);
        if (configJson != null) task.setConfigJson(configJson);
        return taskRepo.save(task);
    }

    @Override
    @Transactional
    public void deleteTask(Long userId, Long taskId) {
        AcquisitionTask task = taskRepo.findById(taskId)
                .orElseThrow(() -> new RuntimeException("Task not found"));
        if (!task.getUserId().equals(userId)) throw new RuntimeException("Access denied");
        commentRepo.findByTaskId(taskId).forEach(c -> commentRepo.delete(c));
        leadRepo.findByTaskIdOrderByCreateTimeDesc(taskId).forEach(l -> leadRepo.delete(l));
        logRepo.findByTaskIdOrderByCreateTimeDesc(taskId).forEach(l -> logRepo.delete(l));
        taskRepo.delete(task);
    }

    @Override
    @Transactional
    public AcquisitionTask runTask(Long userId, Long taskId) {
        AcquisitionTask task = taskRepo.findById(taskId)
                .orElseThrow(() -> new RuntimeException("Task not found"));
        if (!task.getUserId().equals(userId)) throw new RuntimeException("Access denied");

        if ("running".equals(task.getStatus())) throw new RuntimeException("Task is already running");

        task.setStatus("running");
        task.setLastRunAt(LocalDateTime.now());

        Map<String, Object> config = parseConfig(task.getConfigJson());
        String keyword = extractKeyword(config);
        task.setCurrentKeyword(keyword);
        String searchUrl = buildSearchUrl(keyword);
        task.setLastSearchUrl(searchUrl);
        task = taskRepo.save(task);

        addLog(userId, taskId, "running", "Task started, searching: " + keyword, searchUrl);

        // Delegate to async executor (separate class so @Async works)
        executor.executeTask(userId, taskId, keyword, config, task.getPlatform());

        return task;
    }

    @Override
    @Transactional
    public void pauseTask(Long userId, Long taskId) {
        AcquisitionTask task = taskRepo.findById(taskId)
                .orElseThrow(() -> new RuntimeException("Task not found"));
        if (!task.getUserId().equals(userId)) throw new RuntimeException("Access denied");
        if (!"running".equals(task.getStatus()) && !"analyzing".equals(task.getStatus())
                && !"executor_required".equals(task.getStatus())) {
            throw new RuntimeException("Only running tasks can be paused");
        }
        task.setStatus("paused");
        taskRepo.save(task);
        addLog(userId, taskId, "paused", "Task paused");
    }

    @Override
    public List<AcquisitionTask> getTasksByUser(Long userId) {
        return taskRepo.findByUserIdOrderByCreateTimeDesc(userId);
    }

    @Override
    public List<AcquisitionTask> getTasksByUserAndPlatform(Long userId, String platform) {
        return taskRepo.findByUserIdAndPlatformOrderByCreateTimeDesc(userId, platform);
    }

    // ==================== Comments ====================

    @Override
    public List<CapturedComment> getCommentsByTask(Long userId, Long taskId) {
        AcquisitionTask task = taskRepo.findById(taskId)
                .orElseThrow(() -> new RuntimeException("Task not found"));
        if (!task.getUserId().equals(userId)) throw new RuntimeException("Access denied");
        return commentRepo.findByTaskIdAndIsIgnoredFalse(taskId);
    }

    @Override
    public Map<String, Object> getCommentsByTaskPaged(Long userId, Long taskId, int page, int size) {
        return getCommentsByTaskPaged(userId, taskId, null, page, size);
    }

    @Override
    public Map<String, Object> getCommentsByTaskPaged(Long userId, Long taskId, String keyword, int page, int size) {
        AcquisitionTask task = taskRepo.findById(taskId)
                .orElseThrow(() -> new RuntimeException("Task not found"));
        if (!task.getUserId().equals(userId)) throw new RuntimeException("Access denied");
        String normalizedKeyword = keyword == null ? "" : keyword.trim();
        log.info("getCommentsByTaskPaged: taskId={}, keyword='{}', normalized='{}'", taskId, keyword, normalizedKeyword);
        Page<CapturedComment> p = normalizedKeyword.isBlank()
                ? commentRepo.findByTaskIdAndIsIgnoredFalse(taskId, PageRequest.of(page, size))
                : commentRepo.findByTaskIdAndKeywordAndIsIgnoredFalse(taskId, normalizedKeyword, PageRequest.of(page, size));
        log.info("getCommentsByTaskPaged result: total={}, pageItems={}", p.getTotalElements(), p.getContent().size());
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("items", p.getContent());
        result.put("total", (int) p.getTotalElements());
        result.put("pages", p.getTotalPages());
        result.put("page", page);
        result.put("keyword", normalizedKeyword);
        return result;
    }

    @Override
    public Map<String, Object> searchComments(Long userId, Long taskId, String keyword, String search, int page, int size) {
        AcquisitionTask task = taskRepo.findById(taskId)
                .orElseThrow(() -> new RuntimeException("Task not found"));
        if (!task.getUserId().equals(userId)) throw new RuntimeException("Access denied");
        String kw = keyword == null ? "" : keyword.trim();
        String q = search == null ? "" : search.trim();
        log.info("searchComments: taskId={}, keyword='{}', search='{}'", taskId, kw, q);
        Page<CapturedComment> p = commentRepo.searchByTask(taskId, kw, q, PageRequest.of(page, size));
        log.info("searchComments result: total={}, pageItems={}", p.getTotalElements(), p.getContent().size());
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("items", p.getContent());
        result.put("total", (int) p.getTotalElements());
        result.put("pages", p.getTotalPages());
        result.put("page", page);
        result.put("keyword", kw);
        result.put("search", q);
        return result;
    }

    @Override
    @Transactional
    public AcquisitionLead addLeadFromComment(Long userId, Long commentId) {
        CapturedComment comment = commentRepo.findById(commentId)
                .orElseThrow(() -> new RuntimeException("Comment not found"));
        if (!comment.getUserId().equals(userId)) throw new RuntimeException("Access denied");

        Optional<AcquisitionLead> existing = leadRepo.findByCommentId(commentId);
        if (existing.isPresent()) return existing.get();

        return createLeadFromComment(comment);
    }

    @Override
    @Transactional
    public List<AcquisitionLead> batchAddLeadsFromComments(Long userId, List<Long> commentIds) {
        List<AcquisitionLead> results = new ArrayList<>();
        for (Long commentId : commentIds) {
            try {
                CapturedComment comment = commentRepo.findById(commentId).orElse(null);
                if (comment == null) continue;
                if (!comment.getUserId().equals(userId)) continue;

                if (leadRepo.findByCommentId(commentId).isPresent()) continue;

                AcquisitionLead lead = createLeadFromComment(comment);
                results.add(lead);
            } catch (Exception e) {
                log.warn("Batch add lead failed for comment {}: {}", commentId, e.getMessage());
            }
        }
        return results;
    }

    private AcquisitionLead createLeadFromComment(CapturedComment comment) {
        AcquisitionLead lead = new AcquisitionLead();
        lead.setUserId(comment.getUserId());
        lead.setTaskId(comment.getTaskId());
        lead.setCommentId(comment.getId());
        lead.setPlatform(comment.getPlatform());
        lead.setSourceVideoUrl(comment.getVideoUrl());
        lead.setSourceVideoTitle(comment.getVideoTitle());
        lead.setKeyword(comment.getKeyword());
        lead.setNickname(comment.getCommenterNickname());
        lead.setPlatformUserId(comment.getCommenterPlatformId());
        lead.setCommentContent(comment.getContent());
        lead.setIntentLevel(comment.getIntentLevel());
        lead.setIntentScore(comment.getIntentScore());
        lead.setDemandKeywordsJson(comment.getIntentKeywordsJson());
        lead.setStatus("new");
        lead = leadRepo.save(lead);

        comment.setLead(true);
        commentRepo.save(comment);

        AcquisitionTask task = taskRepo.findById(comment.getTaskId()).orElse(null);
        if (task != null) {
            task.setLeadCount(task.getLeadCount() + 1);
            taskRepo.save(task);
        }
        return lead;
    }

    @Override
    @Transactional
    public void ignoreComment(Long userId, Long commentId) {
        CapturedComment comment = commentRepo.findById(commentId)
                .orElseThrow(() -> new RuntimeException("Comment not found"));
        if (!comment.getUserId().equals(userId)) throw new RuntimeException("Access denied");
        comment.setIgnored(true);
        commentRepo.save(comment);
    }

    // ==================== Leads ====================

    @Override
    public List<AcquisitionLead> getLeadsByUser(Long userId) {
        return leadRepo.findByUserIdOrderByCreateTimeDesc(userId);
    }

    @Override
    public List<AcquisitionLead> getLeadsByTask(Long userId, Long taskId) {
        AcquisitionTask task = taskRepo.findById(taskId)
                .orElseThrow(() -> new RuntimeException("Task not found"));
        if (!task.getUserId().equals(userId)) throw new RuntimeException("Access denied");
        return leadRepo.findByTaskIdOrderByCreateTimeDesc(taskId);
    }

    @Override
    @Transactional
    public AcquisitionLead updateLead(Long userId, Long leadId, String status, String note) {
        AcquisitionLead lead = leadRepo.findById(leadId)
                .orElseThrow(() -> new RuntimeException("Lead not found"));
        if (!lead.getUserId().equals(userId)) throw new RuntimeException("Access denied");
        if (status != null) lead.setStatus(status);
        if (note != null) lead.setNote(note);
        return leadRepo.save(lead);
    }

    // ==================== Logs ====================

    @Override
    public List<AcquisitionRunLog> getLogsByTask(Long userId, Long taskId) {
        AcquisitionTask task = taskRepo.findById(taskId)
                .orElseThrow(() -> new RuntimeException("Task not found"));
        if (!task.getUserId().equals(userId)) throw new RuntimeException("Access denied");
        return logRepo.findByTaskIdOrderByCreateTimeDesc(taskId);
    }

    // ==================== Stats ====================

    @Override
    public Map<String, Object> getStats(Long userId) {
        List<AcquisitionTask> tasks = taskRepo.findByUserIdOrderByCreateTimeDesc(userId);
        long running = tasks.stream().filter(t -> "running".equals(t.getStatus())).count();
        long totalComments = commentRepo.countByUserIdAndIsIgnoredFalse(userId);
        long totalLeads = leadRepo.countByUserId(userId);
        long highLeads = leadRepo.countByUserIdAndIntentLevel(userId, "high");

        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("tasks", tasks.size());
        stats.put("running", running);
        stats.put("comments", totalComments);
        stats.put("leads", totalLeads);
        stats.put("highLeads", highLeads);
        return stats;
    }

    // ==================== Helpers ====================

    private void addLog(Long userId, Long taskId, String status, String message) {
        addLog(userId, taskId, status, message, null);
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

    @SuppressWarnings("unchecked")
    private Map<String, Object> parseConfig(String configJson) {
        try { return objectMapper.readValue(configJson, Map.class); } catch (Exception e) { return Map.of(); }
    }

    private String buildSearchUrl(String keyword) {
        if (keyword == null || keyword.isBlank()) return "https://www.douyin.com/";
        return "https://www.douyin.com/search/" +
                java.net.URLEncoder.encode(keyword.trim(), java.nio.charset.StandardCharsets.UTF_8) + "?type=video";
    }

    private String extractKeyword(Map<String, Object> config) {
        Object value = config.get("keyword");
        return value == null ? "" : String.valueOf(value).trim();
    }
}
