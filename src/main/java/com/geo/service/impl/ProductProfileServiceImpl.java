package com.geo.service.impl;

import com.geo.entity.ProductProfile;
import com.geo.entity.UserActivity;
import com.geo.repository.ProductProfileRepository;
import com.geo.service.ActivityService;
import com.geo.service.ProductProfileService;
import com.geo.util.Result;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
public class ProductProfileServiceImpl implements ProductProfileService {

    private final ProductProfileRepository profileRepository;
    private final ActivityService activityService;

    public ProductProfileServiceImpl(ProductProfileRepository profileRepository,
                                      ActivityService activityService) {
        this.profileRepository = profileRepository;
        this.activityService = activityService;
    }

    @Override
    public Result<?> listByUserId(Long userId) {
        List<ProductProfile> profiles = profileRepository.findAllByUserId(userId);
        List<Map<String, Object>> result = profiles.stream()
                .map(this::toMap)
                .toList();
        return Result.success(result);
    }

    @Override
    public Result<?> create(Long userId, Map<String, Object> data) {
        ProductProfile profile = new ProductProfile(userId);
        applyUpdates(profile, data);
        profileRepository.save(profile);
        activityService.logActivity(userId, UserActivity.TYPE_PRODUCT,
            "添加产品信息",
            profile.getProductName() != null ? "已录入产品——" + profile.getProductName() : "已录入产品信息",
            profile.getId());
        return Result.success("创建成功", toMap(profile));
    }

    @Override
    public Result<?> getById(Long id, Long userId) {
        Optional<ProductProfile> opt = profileRepository.findByIdAndUserId(id, userId);
        return opt.isPresent() ? Result.success(toMap(opt.get())) : Result.error(404, "产品画像不存在");
    }

    @Override
    public Result<?> updateById(Long id, Long userId, Map<String, Object> updates) {
        Optional<ProductProfile> opt = profileRepository.findByIdAndUserId(id, userId);
        if (opt.isEmpty()) return Result.error(404, "产品画像不存在");
        ProductProfile profile = opt.get();
        applyUpdates(profile, updates);
        profileRepository.save(profile);
        return Result.success("保存成功", toMap(profile));
    }

    @Override
    public Result<?> deleteById(Long id, Long userId) {
        Optional<ProductProfile> opt = profileRepository.findByIdAndUserId(id, userId);
        if (opt.isEmpty()) return Result.error(404, "产品画像不存在");
        profileRepository.delete(opt.get());
        return Result.success("删除成功");
    }

    private void applyUpdates(ProductProfile profile, Map<String, Object> updates) {
        if (updates.containsKey("productName")) profile.setProductName((String) updates.get("productName"));
        if (updates.containsKey("keyFeatures")) profile.setKeyFeatures((String) updates.get("keyFeatures"));
        if (updates.containsKey("advantages")) profile.setAdvantages((String) updates.get("advantages"));
        if (updates.containsKey("applicableScenarios")) profile.setApplicableScenarios((String) updates.get("applicableScenarios"));
        if (updates.containsKey("caseStudies")) profile.setCaseStudies((String) updates.get("caseStudies"));
    }

    private Map<String, Object> toMap(ProductProfile p) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", p.getId());
        map.put("userId", p.getUserId());
        map.put("productName", p.getProductName());
        map.put("keyFeatures", p.getKeyFeatures());
        map.put("advantages", p.getAdvantages());
        map.put("applicableScenarios", p.getApplicableScenarios());
        map.put("caseStudies", p.getCaseStudies());
        map.put("createTime", p.getCreateTime());
        map.put("updateTime", p.getUpdateTime());
        return map;
    }
}
