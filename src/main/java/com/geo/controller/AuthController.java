package com.geo.controller;

import com.geo.dto.LoginRequest;
import com.geo.dto.RegisterRequest;
import com.geo.entity.SysUser;
import com.geo.service.SysUserService;
import com.geo.util.JwtUtil;
import com.geo.util.Result;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.HashMap;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final SysUserService userService;
    private final JwtUtil jwtUtil;

    public AuthController(SysUserService userService, JwtUtil jwtUtil) {
        this.userService = userService;
        this.jwtUtil = jwtUtil;
    }

    /**
     * 登录
     */
    @PostMapping("/login")
    public Result<?> login(@RequestBody LoginRequest request) {
        return userService.login(request);
    }

    /**
     * 注册
     */
    @PostMapping("/register")
    public Result<?> register(@RequestBody RegisterRequest request) {
        return userService.register(request);
    }

    /**
     * 获取当前登录用户信息（需要 JWT）
     */
    @GetMapping("/me")
    public Result<?> me(@RequestHeader("Authorization") String authHeader) {
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            return Result.error(401, "未登录或 Token 无效");
        }

        String token = authHeader.substring(7);

        if (!jwtUtil.validateToken(token)) {
            return Result.error(401, "Token 已过期或无效");
        }

        String username = jwtUtil.getUsernameFromToken(token);
        SysUser user = userService.findByUsername(username);

        if (user == null) {
            return Result.error(401, "用户不存在");
        }

        Map<String, Object> data = new HashMap<>();
        data.put("id", user.getId());
        data.put("username", user.getUsername());
        data.put("realName", user.getRealName());
        data.put("phone", user.getPhone());
        data.put("email", user.getEmail());
        data.put("status", user.getStatus());
        data.put("role", user.getRole());
        data.put("createTime", user.getCreateTime());

        return Result.success(data);
    }
}
