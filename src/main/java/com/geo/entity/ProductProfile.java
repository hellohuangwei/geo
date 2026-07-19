package com.geo.entity;

import jakarta.persistence.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

@Entity
@Table(name = "product_profile")
@EntityListeners(AuditingEntityListener.class)
public class ProductProfile {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 关联用户 ID */
    @Column(name = "user_id", nullable = false)
    private Long userId;

    /** 产品名称：产品的正式称谓 */
    @Column(name = "product_name", length = 200)
    private String productName;

    /** 核心功能：产品为解决用户关键问题所提供的能力 */
    @Column(name = "key_features", columnDefinition = "TEXT")
    private String keyFeatures;

    /** 产品优势：与竞争对手（或旧方式）相比，产品所具有的独特长处和吸引力 */
    @Column(columnDefinition = "TEXT")
    private String advantages;

    /** 适用场景/行业/人群：产品使用的具体情境、领域、用户角色或客户类型 */
    @Column(name = "applicable_scenarios", columnDefinition = "TEXT")
    private String applicableScenarios;

    /** 合作案例：过往服务的、具有代表性的客户实例 */
    @Column(name = "case_studies", columnDefinition = "TEXT")
    private String caseStudies;

    @CreatedDate
    @Column(name = "create_time", updatable = false)
    private LocalDateTime createTime;

    @LastModifiedDate
    @Column(name = "update_time")
    private LocalDateTime updateTime;

    // ==================== Constructors ====================

    public ProductProfile() {
    }

    public ProductProfile(Long userId) {
        this.userId = userId;
    }

    // ==================== Getters & Setters ====================

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }

    public String getProductName() { return productName; }
    public void setProductName(String productName) { this.productName = productName; }

    public String getKeyFeatures() { return keyFeatures; }
    public void setKeyFeatures(String keyFeatures) { this.keyFeatures = keyFeatures; }

    public String getAdvantages() { return advantages; }
    public void setAdvantages(String advantages) { this.advantages = advantages; }

    public String getApplicableScenarios() { return applicableScenarios; }
    public void setApplicableScenarios(String applicableScenarios) { this.applicableScenarios = applicableScenarios; }

    public String getCaseStudies() { return caseStudies; }
    public void setCaseStudies(String caseStudies) { this.caseStudies = caseStudies; }

    public LocalDateTime getCreateTime() { return createTime; }
    public void setCreateTime(LocalDateTime createTime) { this.createTime = createTime; }

    public LocalDateTime getUpdateTime() { return updateTime; }
    public void setUpdateTime(LocalDateTime updateTime) { this.updateTime = updateTime; }
}
