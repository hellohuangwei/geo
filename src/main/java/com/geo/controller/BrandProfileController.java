package com.geo.controller;

import com.geo.entity.SysUser;
import com.geo.repository.SysUserRepository;
import com.geo.service.BrandProfileService;
import com.geo.util.JwtUtil;
import com.geo.util.Result;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/brand-profile")
public class BrandProfileController {

    private final BrandProfileService profileService;
    private final JwtUtil jwtUtil;
    private final SysUserRepository userRepository;

    public BrandProfileController(BrandProfileService profileService,
                                  JwtUtil jwtUtil,
                                  SysUserRepository userRepository) {
        this.profileService = profileService;
        this.jwtUtil = jwtUtil;
        this.userRepository = userRepository;
    }

    /**
     * 获取当前用户的品牌介绍
     */
    @GetMapping
    public Result<?> get(@RequestHeader("Authorization") String authHeader) {
        Long userId = getUserId(authHeader);
        if (userId == null) {
            return Result.error(401, "未登录或 Token 无效");
        }
        return profileService.getByUserId(userId);
    }

    /**
     * 更新当前用户的品牌介绍
     */
    @PutMapping
    public Result<?> update(@RequestHeader("Authorization") String authHeader,
                             @RequestBody Map<String, Object> updates) {
        Long userId = getUserId(authHeader);
        if (userId == null) {
            return Result.error(401, "未登录或 Token 无效");
        }
        return profileService.updateByUserId(userId, updates);
    }

    /**
     * 删除当前用户的品牌介绍
     */
    @DeleteMapping
    public Result<?> delete(@RequestHeader("Authorization") String authHeader) {
        Long userId = getUserId(authHeader);
        if (userId == null) {
            return Result.error(401, "未登录或 Token 无效");
        }
        return profileService.deleteByUserId(userId);
    }

    /**
     * 从 JWT 中提取当前用户 ID
     */
    private Long getUserId(String authHeader) {
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            return null;
        }
        String token = authHeader.substring(7);
        if (!jwtUtil.validateToken(token)) {
            return null;
        }
        String username = jwtUtil.getUsernameFromToken(token);
        SysUser user = userRepository.findByUsername(username).orElse(null);
        return user != null ? user.getId() : null;
    }
}
