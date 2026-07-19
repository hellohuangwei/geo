package com.geo.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "acquisition_task")
public class AcquisitionTask {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long userId;

    @Column(nullable = false, length = 255)
    private String name;

    @Column(nullable = false, length = 50)
    private String platform = "douyin";

    @Column(nullable = false, length = 30)
    private String status = "idle"; // idle, running, paused, completed, failed

    /** 采集配置 JSON */
    @Column(columnDefinition = "TEXT")
    private String configJson = "{}";

    @Column(length = 255)
    private String currentKeyword;

    @Column(length = 2000)
    private String lastSearchUrl;

    private int collectedVideoCount = 0;

    private int analyzedCommentCount = 0;

    private int leadCount = 0;

    private LocalDateTime lastRunAt;

    @Column(updatable = false)
    private LocalDateTime createTime;

    private LocalDateTime updateTime;

    @PrePersist
    protected void onCreate() {
        createTime = LocalDateTime.now();
        updateTime = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updateTime = LocalDateTime.now();
    }

    // --- getters / setters ---

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getPlatform() { return platform; }
    public void setPlatform(String platform) { this.platform = platform; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getConfigJson() { return configJson; }
    public void setConfigJson(String configJson) { this.configJson = configJson; }

    public String getCurrentKeyword() { return currentKeyword; }
    public void setCurrentKeyword(String currentKeyword) { this.currentKeyword = currentKeyword; }

    public String getLastSearchUrl() { return lastSearchUrl; }
    public void setLastSearchUrl(String lastSearchUrl) { this.lastSearchUrl = lastSearchUrl; }

    public int getCollectedVideoCount() { return collectedVideoCount; }
    public void setCollectedVideoCount(int collectedVideoCount) { this.collectedVideoCount = collectedVideoCount; }

    public int getAnalyzedCommentCount() { return analyzedCommentCount; }
    public void setAnalyzedCommentCount(int analyzedCommentCount) { this.analyzedCommentCount = analyzedCommentCount; }

    public int getLeadCount() { return leadCount; }
    public void setLeadCount(int leadCount) { this.leadCount = leadCount; }

    public LocalDateTime getLastRunAt() { return lastRunAt; }
    public void setLastRunAt(LocalDateTime lastRunAt) { this.lastRunAt = lastRunAt; }

    public LocalDateTime getCreateTime() { return createTime; }
    public void setCreateTime(LocalDateTime createTime) { this.createTime = createTime; }

    public LocalDateTime getUpdateTime() { return updateTime; }
    public void setUpdateTime(LocalDateTime updateTime) { this.updateTime = updateTime; }
}
