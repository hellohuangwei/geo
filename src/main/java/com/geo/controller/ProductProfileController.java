package com.geo.controller;

import com.geo.entity.SysUser;
import com.geo.repository.SysUserRepository;
import com.geo.service.ProductProfileService;
import com.geo.util.JwtUtil;
import com.geo.util.Result;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/product-profiles")
public class ProductProfileController {

    private final ProductProfileService profileService;
    private final JwtUtil jwtUtil;
    private final SysUserRepository userRepository;

    public ProductProfileController(ProductProfileService profileService,
                                    JwtUtil jwtUtil,
                                    SysUserRepository userRepository) {
        this.profileService = profileService;
        this.jwtUtil = jwtUtil;
        this.userRepository = userRepository;
    }

    /** 获取当前用户的所有产品画像 */
    @GetMapping
    public Result<?> list(@RequestHeader("Authorization") String authHeader) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");
        return profileService.listByUserId(userId);
    }

    /** 新建产品画像 */
    @PostMapping
    public Result<?> create(@RequestHeader("Authorization") String authHeader,
                            @RequestBody Map<String, Object> data) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");
        return profileService.create(userId, data);
    }

    /** 获取单个产品画像 */
    @GetMapping("/{id}")
    public Result<?> detail(@RequestHeader("Authorization") String authHeader,
                            @PathVariable Long id) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");
        return profileService.getById(id, userId);
    }

    /** 更新单个产品画像 */
    @PutMapping("/{id}")
    public Result<?> update(@RequestHeader("Authorization") String authHeader,
                            @PathVariable Long id,
                            @RequestBody Map<String, Object> updates) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");
        return profileService.updateById(id, userId, updates);
    }

    /** 删除单个产品画像 */
    @DeleteMapping("/{id}")
    public Result<?> delete(@RequestHeader("Authorization") String authHeader,
                            @PathVariable Long id) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");
        return profileService.deleteById(id, userId);
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
