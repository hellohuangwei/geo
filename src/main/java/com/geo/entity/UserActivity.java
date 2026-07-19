package com.geo.entity;

import jakarta.persistence.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

@Entity
@Table(name = "user_activity")
@EntityListeners(AuditingEntityListener.class)
public class UserActivity {

    /** 活动类型常量 */
    public static final String TYPE_BRAND = "brand";
    public static final String TYPE_PRODUCT = "product";
    public static final String TYPE_TOPIC = "topic";
    public static final String TYPE_KNOWLEDGE = "knowledge";
    public static final String TYPE_ARTICLE = "article";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 关联用户 ID */
    @Column(name = "user_id", nullable = false)
    private Long userId;

    /** 活动类型: brand / product / topic / knowledge / article */
    @Column(name = "activity_type", nullable = false, length = 50)
    private String activityType;

    /** 活动标题 */
    @Column(nullable = false, length = 200)
    private String title;

    /** 活动描述 */
    @Column(length = 500)
    private String description;

    /** 优先级（越小越靠前），用于引导排序 */
    @Column(name = "priority")
    private Integer priority;

    /** 是否为必要引导项：1=是 0=否 */
    @Column(name = "is_required", nullable = false)
    private Integer isRequired = 0;

    /** 关联的目标记录 ID（如文章ID、产品ID等），用于跳转 */
    @Column(name = "target_id")
    private Long targetId;

    @CreatedDate
    @Column(name = "create_time", updatable = false)
    private LocalDateTime createTime;

    // ==================== Constructors ====================

    public UserActivity() {
    }

    public UserActivity(Long userId, String activityType, String title, String description) {
        this.userId = userId;
        this.activityType = activityType;
        this.title = title;
        this.description = description;
        this.isRequired = 0;
    }

    public UserActivity(Long userId, String activityType, String title, String description, int priority, int isRequired) {
        this.userId = userId;
        this.activityType = activityType;
        this.title = title;
        this.description = description;
        this.priority = priority;
        this.isRequired = isRequired;
    }

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

    public String getActivityType() {
        return activityType;
    }

    public void setActivityType(String activityType) {
        this.activityType = activityType;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public Integer getPriority() {
        return priority;
    }

    public void setPriority(Integer priority) {
        this.priority = priority;
    }

    public Integer getIsRequired() {
        return isRequired;
    }

    public void setIsRequired(Integer isRequired) {
        this.isRequired = isRequired;
    }

    public Long getTargetId() { return targetId; }
    public void setTargetId(Long targetId) { this.targetId = targetId; }

    public LocalDateTime getCreateTime() {
        return createTime;
    }

    public void setCreateTime(LocalDateTime createTime) {
        this.createTime = createTime;
    }
}
