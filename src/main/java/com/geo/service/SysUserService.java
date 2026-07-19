package com.geo.service;

import com.geo.dto.LoginRequest;
import com.geo.dto.RegisterRequest;
import com.geo.entity.SysUser;
import com.geo.util.Result;

public interface SysUserService {

    Result<?> login(LoginRequest request);

    Result<?> register(RegisterRequest request);

    SysUser findByUsername(String username);
}
