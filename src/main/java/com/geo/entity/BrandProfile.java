package com.geo.entity;

import jakarta.persistence.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

@Entity
@Table(name = "brand_profile")
@EntityListeners(AuditingEntityListener.class)
public class BrandProfile {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 关联用户 ID（一对一） */
    @Column(name = "user_id", nullable = false, unique = true)
    private Long userId;

    /** 品牌名称 */
    @Column(name = "brand_name", length = 200)
    private String brandName;

    /** 品牌别称（多个用逗号分隔，如：微盟集团,Weimob） */
    @Column(name = "brand_aliases", length = 500)
    private String brandAliases;

    /** 行业 */
    @Column(length = 200)
    private String industry;

    /** 服务区域 */
    @Column(name = "service_area", length = 200)
    private String serviceArea;

    /** 品牌简介 */
    @Column(columnDefinition = "TEXT")
    private String description;

    /** 目标客户特征 */
    @Column(name = "target_customers", columnDefinition = "TEXT")
    private String targetCustomers;

    /** 资质/奖项 */
    @Column(columnDefinition = "TEXT")
    private String qualifications;

    /** 行业和客户痛点 */
    @Column(name = "pain_points", columnDefinition = "TEXT")
    private String painPoints;

    /** 品牌官网 */
    @Column(length = 500)
    private String website;

    /** 竞争对手 */
    @Column(columnDefinition = "TEXT")
    private String competitors;

    @CreatedDate
    @Column(name = "create_time", updatable = false)
    private LocalDateTime createTime;

    @LastModifiedDate
    @Column(name = "update_time")
    private LocalDateTime updateTime;

    // ==================== Constructors ====================

    public BrandProfile() {
    }

    public BrandProfile(Long userId) {
        this.userId = userId;
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

    public String getBrandName() {
        return brandName;
    }

    public void setBrandName(String brandName) {
        this.brandName = brandName;
    }

    public String getBrandAliases() {
        return brandAliases;
    }

    public void setBrandAliases(String brandAliases) {
        this.brandAliases = brandAliases;
    }

    public String getIndustry() {
        return industry;
    }

    public void setIndustry(String industry) {
        this.industry = industry;
    }

    public String getServiceArea() {
        return serviceArea;
    }

    public void setServiceArea(String serviceArea) {
        this.serviceArea = serviceArea;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getTargetCustomers() {
        return targetCustomers;
    }

    public void setTargetCustomers(String targetCustomers) {
        this.targetCustomers = targetCustomers;
    }

    public String getQualifications() {
        return qualifications;
    }

    public void setQualifications(String qualifications) {
        this.qualifications = qualifications;
    }

    public String getPainPoints() {
        return painPoints;
    }

    public void setPainPoints(String painPoints) {
        this.painPoints = painPoints;
    }

    public String getWebsite() {
        return website;
    }

    public void setWebsite(String website) {
        this.website = website;
    }

    public String getCompetitors() {
        return competitors;
    }

    public void setCompetitors(String competitors) {
        this.competitors = competitors;
    }

    public LocalDateTime getCreateTime() {
        return createTime;
    }

    public void setCreateTime(LocalDateTime createTime) {
        this.createTime = createTime;
    }

    public LocalDateTime getUpdateTime() {
        return updateTime;
    }

    public void setUpdateTime(LocalDateTime updateTime) {
        this.updateTime = updateTime;
    }
}
