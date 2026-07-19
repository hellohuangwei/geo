package com.geo.service.impl;

import com.geo.entity.BrandProfile;
import com.geo.entity.UserActivity;
import com.geo.repository.BrandProfileRepository;
import com.geo.service.ActivityService;
import com.geo.service.BrandProfileService;
import com.geo.util.Result;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

@Service
public class BrandProfileServiceImpl implements BrandProfileService {

    private final BrandProfileRepository profileRepository;
    private final ActivityService activityService;

    public BrandProfileServiceImpl(BrandProfileRepository profileRepository,
                                    ActivityService activityService) {
        this.profileRepository = profileRepository;
        this.activityService = activityService;
    }

    @Override
    public Result<?> getByUserId(Long userId) {
        Optional<BrandProfile> optProfile = profileRepository.findByUserId(userId);
        if (optProfile.isPresent()) {
            return Result.success(toMap(optProfile.get()));
        }
        // 不存在则返回空对象（前端用于判断是否已填写）
        return Result.success(null);
    }

    @Override
    public Result<?> updateByUserId(Long userId, Map<String, Object> updates) {
        Optional<BrandProfile> optProfile = profileRepository.findByUserId(userId);
        BrandProfile profile;

        if (optProfile.isPresent()) {
            profile = optProfile.get();
        } else {
            profile = new BrandProfile(userId);
        }

        // 仅更新传入的字段
        if (updates.containsKey("brandName")) {
            profile.setBrandName((String) updates.get("brandName"));
        }
        if (updates.containsKey("brandAliases")) {
            profile.setBrandAliases((String) updates.get("brandAliases"));
        }
        if (updates.containsKey("industry")) {
            profile.setIndustry((String) updates.get("industry"));
        }
        if (updates.containsKey("serviceArea")) {
            profile.setServiceArea((String) updates.get("serviceArea"));
        }
        if (updates.containsKey("description")) {
            profile.setDescription((String) updates.get("description"));
        }
        if (updates.containsKey("targetCustomers")) {
            profile.setTargetCustomers((String) updates.get("targetCustomers"));
        }
        if (updates.containsKey("qualifications")) {
            profile.setQualifications((String) updates.get("qualifications"));
        }
        if (updates.containsKey("painPoints")) {
            profile.setPainPoints((String) updates.get("painPoints"));
        }
        if (updates.containsKey("website")) {
            profile.setWebsite((String) updates.get("website"));
        }
        if (updates.containsKey("competitors")) {
            profile.setCompetitors((String) updates.get("competitors"));
        }

        profileRepository.save(profile);

        // 记录活动日志
        activityService.logActivity(userId, UserActivity.TYPE_BRAND,
            "编辑品牌档案",
            profile.getBrandName() != null ? "已完成品牌信息配置——" + profile.getBrandName() : "已完成品牌信息配置");

        return Result.success("保存成功", toMap(profile));
    }

    @Override
    public Result<?> deleteByUserId(Long userId) {
        Optional<BrandProfile> opt = profileRepository.findByUserId(userId);
        if (opt.isEmpty()) {
            return Result.error(404, "品牌信息不存在");
        }
        profileRepository.delete(opt.get());
        return Result.success("删除成功");
    }

    private Map<String, Object> toMap(BrandProfile profile) {
        Map<String, Object> map = new HashMap<>();
        map.put("id", profile.getId());
        map.put("userId", profile.getUserId());
        map.put("brandName", profile.getBrandName());
        map.put("brandAliases", profile.getBrandAliases());
        map.put("industry", profile.getIndustry());
        map.put("serviceArea", profile.getServiceArea());
        map.put("description", profile.getDescription());
        map.put("targetCustomers", profile.getTargetCustomers());
        map.put("qualifications", profile.getQualifications());
        map.put("painPoints", profile.getPainPoints());
        map.put("website", profile.getWebsite());
        map.put("competitors", profile.getCompetitors());
        map.put("createTime", profile.getCreateTime());
        map.put("updateTime", profile.getUpdateTime());
        return map;
    }
}
