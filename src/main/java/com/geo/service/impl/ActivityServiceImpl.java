package com.geo.service.impl;

import com.geo.entity.UserActivity;
import com.geo.repository.*;
import com.geo.service.ActivityService;
import com.geo.util.Result;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
public class ActivityServiceImpl implements ActivityService {

    private final UserActivityRepository activityRepository;
    private final BrandProfileRepository brandRepo;
    private final ProductProfileRepository productRepo;
    private final TopicRepository topicRepo;
    private final GeneratedArticleRepository articleRepo;

    public ActivityServiceImpl(UserActivityRepository activityRepository,
                                BrandProfileRepository brandRepo,
                                ProductProfileRepository productRepo,
                                TopicRepository topicRepo,
                                GeneratedArticleRepository articleRepo) {
        this.activityRepository = activityRepository;
        this.brandRepo = brandRepo;
        this.productRepo = productRepo;
        this.topicRepo = topicRepo;
        this.articleRepo = articleRepo;
    }

    @Override
    public void logActivity(Long userId, String activityType, String title, String description) {
        logActivity(userId, activityType, title, description, null);
    }

    @Override
    public void logActivity(Long userId, String activityType, String title, String description, Long targetId) {
        UserActivity activity = new UserActivity(userId, activityType, title, description);
        activity.setTargetId(targetId);
        activityRepository.save(activity);
    }

    @Override
    public Result<?> getRecentActivities(Long userId, int limit) {
        List<UserActivity> all = activityRepository.findByUserIdOrderByCreateTimeDesc(userId);

        // 按类型去重，每个类型只保留最新一条
        Map<String, UserActivity> latestByType = new LinkedHashMap<>();
        for (UserActivity a : all) {
            latestByType.putIfAbsent(a.getActivityType(), a);
        }

        // 确保 5 条必要引导项已入库
        seedRequiredItems(userId, latestByType);

        // 检查实际数据表，确认是否已完成
        boolean hasBrand = brandRepo.findByUserId(userId).isPresent();
        boolean hasProduct = !productRepo.findAllByUserId(userId).isEmpty();
        boolean hasTopic = !topicRepo.findByUserIdOrderByCreateTimeDesc(userId).isEmpty();
        boolean hasArticle = articleRepo.countByUserId(userId) > 0;

        // 重新取最新数据
        all = activityRepository.findByUserIdOrderByCreateTimeDesc(userId);

        // 分离：必要项 (is_required=1) 和 实际操作记录 (is_required=0)
        Map<String, UserActivity> reqMap = new LinkedHashMap<>();
        List<UserActivity> realList = new ArrayList<>();
        for (UserActivity a : all) {
            if (a.getIsRequired() != null && a.getIsRequired() == 1) {
                reqMap.putIfAbsent(a.getActivityType(), a);
            } else {
                realList.add(a); // 全部保留，不去重
            }
        }

        // 必要项按 priority 排序
        List<UserActivity> reqList = new ArrayList<>(reqMap.values());
        reqList.sort(Comparator.comparing(a -> a.getPriority() != null ? a.getPriority() : Integer.MAX_VALUE));

        // 真实记录按时间倒序
        realList.sort((a, b) -> b.getCreateTime().compareTo(a.getCreateTime()));

        List<Map<String, Object>> result = new ArrayList<>();

        // 1. 5 条必要项（固定文案）
        for (UserActivity req : reqList) {
            String type = req.getActivityType();
            boolean done = isTypeDone(type, hasBrand, hasProduct, hasTopic, hasArticle);
            Map<String, Object> item = new HashMap<>();
            item.put("activityType", type);
            item.put("done", done);
            item.put("title", req.getTitle());
            item.put("description", done ? buildDoneDesc(type, null) : req.getDescription());
            item.put("createTime", req.getCreateTime());
            item.put("isRequired", true);
            item.put("targetId", null);
            result.add(item);
        }

        // 2. 真实操作记录（独立新增条目）
        for (UserActivity real : realList) {
            String type = real.getActivityType();
            boolean done = isTypeDone(type, hasBrand, hasProduct, hasTopic, hasArticle);
            Map<String, Object> item = new HashMap<>();
            item.put("activityType", type);
            item.put("done", done);
            item.put("title", real.getTitle());
            item.put("description", real.getDescription() != null && !real.getDescription().isBlank()
                ? real.getDescription() : buildDoneDesc(type, null));
            item.put("createTime", real.getCreateTime());
            item.put("isRequired", false);
            item.put("targetId", real.getTargetId());
            result.add(item);
        }

        // 3. done=false 的同类型只保留一条（required 优先），done=true 的全部保留
        Map<String, Map<String, Object>> undoneMap = new LinkedHashMap<>();
        List<Map<String, Object>> newResult = new ArrayList<>();
        for (Map<String, Object> item : result) {
            boolean done = (boolean) item.get("done");
            if (done) {
                newResult.add(item); // done=true 全部保留
            } else {
                String type = (String) item.get("activityType");
                Map<String, Object> existing = undoneMap.get(type);
                if (existing == null) {
                    undoneMap.put(type, item);
                } else {
                    boolean newReq = (boolean) item.getOrDefault("isRequired", false);
                    boolean oldReq = (boolean) existing.getOrDefault("isRequired", false);
                    if (newReq && !oldReq) undoneMap.put(type, item); // required 优先
                }
            }
        }
        newResult.addAll(undoneMap.values());
        result = newResult;

        // 4. 排序：未完成优先 → real 记录优先 → 时间倒序
        result.sort((a, b) -> {
            boolean aDone = (boolean) a.get("done");
            boolean bDone = (boolean) b.get("done");
            if (!aDone && bDone) return -1;
            if (aDone && !bDone) return 1;
            // 都完成：real 记录（非 required）排在 required 上面
            boolean aReq = (boolean) a.getOrDefault("isRequired", false);
            boolean bReq = (boolean) b.getOrDefault("isRequired", false);
            if (!aReq && bReq) return -1;
            if (aReq && !bReq) return 1;
            // 同组内时间倒序
            Object ta = a.get("createTime"), tb = b.get("createTime");
            if (ta == null && tb == null) return 0;
            if (ta == null) return 1;
            if (tb == null) return -1;
            return ((Comparable) tb).compareTo(ta);
        });

        // 5. 截断
        if (result.size() > limit) result = result.subList(0, limit);

        return Result.success(result);
    }

    /** 确保 5 条必要引导项已入库（只检查 is_required=1 的） */
    private void seedRequiredItems(Long userId, Map<String, UserActivity> existing) {
        String[][] defaults = {
            { UserActivity.TYPE_BRAND,    "1", "编辑品牌档案",   "完善品牌信息以开启 AI 监测" },
            { UserActivity.TYPE_PRODUCT,  "2", "添加产品信息",   "录入产品优势特性以优化内容生成" },
            { UserActivity.TYPE_TOPIC,    "3", "配置话题关键词", "设置监控话题让 AI 精准捕捉舆情" },
            { UserActivity.TYPE_KNOWLEDGE,"4", "上传知识库文件", "充实品牌知识以提升 AI 引用准确度" },
            { UserActivity.TYPE_ARTICLE,  "5", "发布文章", "开始 AI 驱动的内容创作与分发" },
        };
        for (String[] d : defaults) {
            String type = d[0];
            // 已有 is_required=1 的记录则跳过
            UserActivity old = existing.get(type);
            if (old != null && old.getIsRequired() != null && old.getIsRequired() == 1) continue;
            UserActivity guide = new UserActivity(userId, type, d[2], d[3],
                Integer.parseInt(d[1]), 1);
            guide.setCreateTime(java.time.LocalDateTime.of(2020, 1, 1, 0, 0)); // 固定旧时间
            activityRepository.save(guide);
            existing.put(type, guide);
        }
    }

    private boolean isTypeDone(String type, boolean hasBrand, boolean hasProduct,
                                boolean hasTopic, boolean hasArticle) {
        return switch (type) {
            case UserActivity.TYPE_BRAND -> hasBrand;
            case UserActivity.TYPE_PRODUCT -> hasProduct;
            case UserActivity.TYPE_TOPIC -> hasTopic;
            case UserActivity.TYPE_KNOWLEDGE -> false; // 知识库暂无后端，暂不标记完成
            case UserActivity.TYPE_ARTICLE -> hasArticle;
            default -> false;
        };
    }

    private String buildDoneDesc(String type, UserActivity activity) {
        if (activity != null && activity.getDescription() != null && !activity.getDescription().isBlank()) {
            return activity.getDescription();
        }
        return switch (type) {
            case UserActivity.TYPE_BRAND -> "已完成品牌信息配置";
            case UserActivity.TYPE_PRODUCT -> "已录入产品信息";
            case UserActivity.TYPE_TOPIC -> "已配置监控话题";
            case UserActivity.TYPE_KNOWLEDGE -> "已上传知识库文件";
            case UserActivity.TYPE_ARTICLE -> "已发布文章";
            default -> "";
        };
    }

    private String getDefaultTitle(String type) {
        return switch (type) {
            case UserActivity.TYPE_BRAND -> "编辑品牌档案";
            case UserActivity.TYPE_PRODUCT -> "添加产品信息";
            case UserActivity.TYPE_TOPIC -> "配置话题关键词";
            case UserActivity.TYPE_KNOWLEDGE -> "上传知识库文件";
            case UserActivity.TYPE_ARTICLE -> "发布文章";
            default -> "";
        };
    }

    private String getDefaultDesc(String type) {
        return switch (type) {
            case UserActivity.TYPE_BRAND -> "完善品牌信息以开启 AI 监测";
            case UserActivity.TYPE_PRODUCT -> "录入产品优势特性以优化内容生成";
            case UserActivity.TYPE_TOPIC -> "设置监控话题让 AI 精准捕捉舆情";
            case UserActivity.TYPE_KNOWLEDGE -> "充实品牌知识以提升 AI 引用准确度";
            case UserActivity.TYPE_ARTICLE -> "开始 AI 驱动的内容创作与分发";
            default -> "";
        };
    }
}
