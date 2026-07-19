package com.geo.entity;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "captured_comment")
public class CapturedComment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long userId;

    @Column(nullable = false)
    private Long taskId;

    @Column(nullable = false, length = 50)
    private String platform;

    @Column(length = 255)
    private String platformVideoId;

    @Column(length = 2000)
    private String videoUrl;

    @Column(length = 500)
    private String videoTitle;

    @Column(length = 255)
    private String videoAuthorName;

    @Column(length = 255)
    private String keyword;

    @Column(length = 255)
    private String commenterNickname;

    @Column(length = 255)
    private String commenterPlatformId;

    @Column(length = 2000)
    private String commenterAvatarUrl;

    @Column(columnDefinition = "TEXT")
    private String content;

    private LocalDateTime publishedAt;

    private int likes = 0;

    private int replyCount = 0;

    /** 意向级别: high, medium, low, none */
    @Column(length = 20)
    private String intentLevel;

    private int intentScore = 0;

    /** AI 分析理由 */
    @Column(columnDefinition = "TEXT")
    private String intentReason;

    /** 需求关键词 JSON 数组 */
    @Column(columnDefinition = "TEXT")
    private String intentKeywordsJson = "[]";

    private boolean isLead = false;

    private boolean isIgnored = false;

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

    public String getPlatform() { return platform; }
    public void setPlatform(String platform) { this.platform = platform; }

    public String getPlatformVideoId() { return platformVideoId; }
    public void setPlatformVideoId(String platformVideoId) { this.platformVideoId = platformVideoId; }

    public String getVideoUrl() { return videoUrl; }
    public void setVideoUrl(String videoUrl) { this.videoUrl = videoUrl; }

    public String getVideoTitle() { return videoTitle; }
    public void setVideoTitle(String videoTitle) { this.videoTitle = videoTitle; }

    public String getVideoAuthorName() { return videoAuthorName; }
    public void setVideoAuthorName(String videoAuthorName) { this.videoAuthorName = videoAuthorName; }

    public String getKeyword() { return keyword; }
    public void setKeyword(String keyword) { this.keyword = keyword; }

    public String getCommenterNickname() { return commenterNickname; }
    public void setCommenterNickname(String commenterNickname) { this.commenterNickname = commenterNickname; }

    public String getCommenterPlatformId() { return commenterPlatformId; }
    public void setCommenterPlatformId(String commenterPlatformId) { this.commenterPlatformId = commenterPlatformId; }

    public String getCommenterAvatarUrl() { return commenterAvatarUrl; }
    public void setCommenterAvatarUrl(String commenterAvatarUrl) { this.commenterAvatarUrl = commenterAvatarUrl; }

    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }

    public LocalDateTime getPublishedAt() { return publishedAt; }
    public void setPublishedAt(LocalDateTime publishedAt) { this.publishedAt = publishedAt; }

    public int getLikes() { return likes; }
    public void setLikes(int likes) { this.likes = likes; }

    public int getReplyCount() { return replyCount; }
    public void setReplyCount(int replyCount) { this.replyCount = replyCount; }

    public String getIntentLevel() { return intentLevel; }
    public void setIntentLevel(String intentLevel) { this.intentLevel = intentLevel; }

    public int getIntentScore() { return intentScore; }
    public void setIntentScore(int intentScore) { this.intentScore = intentScore; }

    public String getIntentReason() { return intentReason; }
    public void setIntentReason(String intentReason) { this.intentReason = intentReason; }

    public String getIntentKeywordsJson() { return intentKeywordsJson; }
    public void setIntentKeywordsJson(String intentKeywordsJson) { this.intentKeywordsJson = intentKeywordsJson; }

    @JsonProperty("isLead")
    public boolean isLead() { return isLead; }
    public void setLead(boolean lead) { isLead = lead; }

    @JsonProperty("isIgnored")
    public boolean isIgnored() { return isIgnored; }
    public void setIgnored(boolean ignored) { isIgnored = ignored; }

    public LocalDateTime getCreateTime() { return createTime; }
    public void setCreateTime(LocalDateTime createTime) { this.createTime = createTime; }

    public LocalDateTime getUpdateTime() { return updateTime; }
    public void setUpdateTime(LocalDateTime updateTime) { this.updateTime = updateTime; }
}
