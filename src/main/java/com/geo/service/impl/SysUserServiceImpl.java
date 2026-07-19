package com.geo.service.impl;

import com.geo.dto.LoginRequest;
import com.geo.dto.RegisterRequest;
import com.geo.entity.SysUser;
import com.geo.repository.SysUserRepository;
import com.geo.service.SysUserService;
import com.geo.util.JwtUtil;
import com.geo.util.Result;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

@Service
public class SysUserServiceImpl implements SysUserService {

    private final SysUserRepository userRepository;
    private final BCryptPasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;

    public SysUserServiceImpl(SysUserRepository userRepository,
                              BCryptPasswordEncoder passwordEncoder,
                              JwtUtil jwtUtil) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtUtil = jwtUtil;
    }

    @Override
    public Result<?> login(LoginRequest request) {
        String username = request.getUsername();
        String password = request.getPassword();

        // 1. 查询用户
        Optional<SysUser> optUser = userRepository.findByUsername(username);
        if (optUser.isEmpty()) {
            return Result.error("用户名或密码错误");
        }

        SysUser user = optUser.get();

        // 2. 校验密码
        if (!passwordEncoder.matches(password, user.getPassword())) {
            return Result.error("用户名或密码错误");
        }

        // 3. 检查账号状态
        if (user.getStatus() == 0) {
            return Result.error("账号已被禁用，请联系管理员");
        }

        // 4. 生成 JWT
        String token = jwtUtil.generateToken(user.getId(), user.getUsername());

        // 5. 构建返回数据（不返回密码）
        Map<String, Object> data = new HashMap<>();
        data.put("token", token);
        data.put("user", toUserMap(user));

        return Result.success("登录成功", data);
    }

    @Override
    public Result<?> register(RegisterRequest request) {
        // 1. 检查用户名是否已存在
        if (userRepository.existsByUsername(request.getUsername())) {
            return Result.error("用户名已存在");
        }

        // 2. 创建用户
        SysUser user = new SysUser();
        user.setUsername(request.getUsername());
        user.setPassword(passwordEncoder.encode(request.getPassword()));
        user.setRealName(request.getRealName());
        user.setPhone(request.getPhone());
        user.setEmail(request.getEmail());

        userRepository.save(user);

        return Result.success("注册成功");
    }

    @Override
    public SysUser findByUsername(String username) {
        return userRepository.findByUsername(username).orElse(null);
    }

    /**
     * 将用户对象转为不包含敏感信息（密码）的 Map
     */
    private Map<String, Object> toUserMap(SysUser user) {
        Map<String, Object> map = new HashMap<>();
        map.put("id", user.getId());
        map.put("username", user.getUsername());
        map.put("realName", user.getRealName());
        map.put("phone", user.getPhone());
        map.put("email", user.getEmail());
        map.put("status", user.getStatus());
        map.put("role", user.getRole());
        map.put("createTime", user.getCreateTime());
        return map;
    }
}
