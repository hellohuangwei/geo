package com.geo.service;

import com.geo.util.Result;

import java.util.Map;

public interface ProductProfileService {

    Result<?> listByUserId(Long userId);

    Result<?> create(Long userId, Map<String, Object> data);

    Result<?> getById(Long id, Long userId);

    Result<?> updateById(Long id, Long userId, Map<String, Object> updates);

    Result<?> deleteById(Long id, Long userId);
}
