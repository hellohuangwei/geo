package com.geo.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "acquisition_lead")
public class AcquisitionLead {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long userId;

    @Column(nullable = false)
    private Long taskId;

    private Long commentId;

    @Column(nullable = false, length = 50)
    private String platform;

    @Column(length = 2000)
    private String sourceVideoUrl;

    @Column(length = 500)
    private String sourceVideoTitle;

    @Column(length = 255)
    private String keyword;

    @Column(length = 255)
    private String nickname;

    @Column(length = 255)
    private String platformUserId;

    @Column(columnDefinition = "TEXT")
    private String commentContent;

    /** 意向级别: high, medium, low */
    @Column(length = 20)
    private String intentLevel;

    private int intentScore = 0;

    /** 需求关键词 JSON 数组 */
    @Column(columnDefinition = "TEXT")
    private String demandKeywordsJson = "[]";

    /** 客户状态: new, pending, contacted, communicating, converted, invalid */
    @Column(length = 30)
    private String status = "new";

    @Column(columnDefinition = "TEXT")
    private String note = "";

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

    public Long getTaskId() { return taskId; }
    public void setTaskId(Long taskId) { this.taskId = taskId; }

    public Long getCommentId() { return commentId; }
    public void setCommentId(Long commentId) { this.commentId = commentId; }

    public String getPlatform() { return platform; }
    public void setPlatform(String platform) { this.platform = platform; }

    public String getSourceVideoUrl() { return sourceVideoUrl; }
    public void setSourceVideoUrl(String sourceVideoUrl) { this.sourceVideoUrl = sourceVideoUrl; }

    public String getSourceVideoTitle() { return sourceVideoTitle; }
    public void setSourceVideoTitle(String sourceVideoTitle) { this.sourceVideoTitle = sourceVideoTitle; }

    public String getKeyword() { return keyword; }
    public void setKeyword(String keyword) { this.keyword = keyword; }

    public String getNickname() { return nickname; }
    public void setNickname(String nickname) { this.nickname = nickname; }

    public String getPlatformUserId() { return platformUserId; }
    public void setPlatformUserId(String platformUserId) { this.platformUserId = platformUserId; }

    public String getCommentContent() { return commentContent; }
    public void setCommentContent(String commentContent) { this.commentContent = commentContent; }

    public String getIntentLevel() { return intentLevel; }
    public void setIntentLevel(String intentLevel) { this.intentLevel = intentLevel; }

    public int getIntentScore() { return intentScore; }
    public void setIntentScore(int intentScore) { this.intentScore = intentScore; }

    public String getDemandKeywordsJson() { return demandKeywordsJson; }
    public void setDemandKeywordsJson(String demandKeywordsJson) { this.demandKeywordsJson = demandKeywordsJson; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }

    public LocalDateTime getCreateTime() { return createTime; }
    public void setCreateTime(LocalDateTime createTime) { this.createTime = createTime; }

    public LocalDateTime getUpdateTime() { return updateTime; }
    public void setUpdateTime(LocalDateTime updateTime) { this.updateTime = updateTime; }
}
