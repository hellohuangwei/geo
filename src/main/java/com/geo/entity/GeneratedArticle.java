package com.geo.entity;

import jakarta.persistence.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

@Entity
@Table(name = "generated_article")
@EntityListeners(AuditingEntityListener.class)
public class GeneratedArticle {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id")
    private Long userId;

    @Column(nullable = false, length = 500)
    private String title;

    @Column(length = 1000)
    private String summary;

    @Column(columnDefinition = "TEXT")
    private String content;

    /** JSON 数组：["tag1","tag2"] */
    @Column(columnDefinition = "TEXT")
    private String tags;

    @Column(length = 200)
    private String topic;

    @Column(length = 200)
    private String product;

    /** JSON 数组：场景问题列表 */
    @Column(name = "scene_questions", columnDefinition = "TEXT")
    private String sceneQuestions;

    @Column(length = 2000)
    private String notes;

    /** JSON 对象：各平台发布状态 {"zhihu":"published","baijiahao":"draft"} */
    @Column(name = "publish_status", columnDefinition = "TEXT")
    private String publishStatus;

    @CreatedDate
    @Column(name = "create_time", updatable = false)
    private LocalDateTime createTime;

    // ==================== Constructors ====================

    public GeneratedArticle() {}

    // ==================== Getters & Setters ====================

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getSummary() {
        return summary;
    }

    public void setSummary(String summary) {
        this.summary = summary;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public String getTags() {
        return tags;
    }

    public void setTags(String tags) {
        this.tags = tags;
    }

    public String getTopic() {
        return topic;
    }

    public void setTopic(String topic) {
        this.topic = topic;
    }

    public String getProduct() {
        return product;
    }

    public void setProduct(String product) {
        this.product = product;
    }

    public String getSceneQuestions() {
        return sceneQuestions;
    }

    public void setSceneQuestions(String sceneQuestions) {
        this.sceneQuestions = sceneQuestions;
    }

    public String getNotes() {
        return notes;
    }

    public void setNotes(String notes) {
        this.notes = notes;
    }

    public String getPublishStatus() {
        return publishStatus;
    }

    public void setPublishStatus(String publishStatus) {
        this.publishStatus = publishStatus;
    }

    public LocalDateTime getCreateTime() {
        return createTime;
    }

    public void setCreateTime(LocalDateTime createTime) {
        this.createTime = createTime;
    }
}
