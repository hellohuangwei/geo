package com.geo.controller;

import com.geo.entity.SysUser;
import com.geo.repository.SysUserRepository;
import com.geo.service.ActivityService;
import com.geo.util.JwtUtil;
import com.geo.util.Result;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/activities")
public class ActivityController {

    private final ActivityService activityService;
    private final JwtUtil jwtUtil;
    private final SysUserRepository userRepository;

    public ActivityController(ActivityService activityService,
                              JwtUtil jwtUtil,
                              SysUserRepository userRepository) {
        this.activityService = activityService;
        this.jwtUtil = jwtUtil;
        this.userRepository = userRepository;
    }

    /** 获取当前用户活动列表 */
    @GetMapping
    public Result<?> list(@RequestHeader("Authorization") String authHeader,
                          @RequestParam(defaultValue = "6") int limit) {
        Long userId = getUserId(authHeader);
        if (userId == null) {
            return Result.error(401, "未登录或 Token 无效");
        }
        return activityService.getRecentActivities(userId, limit);
    }

    private Long getUserId(String authHeader) {
        if (authHeader == null || !authHeader.startsWith("Bearer ")) return null;
        String token = authHeader.substring(7);
        if (!jwtUtil.validateToken(token)) return null;
        String username = jwtUtil.getUsernameFromToken(token);
        SysUser user = userRepository.findByUsername(username).orElse(null);
        return user != null ? user.getId() : null;
    }
}
