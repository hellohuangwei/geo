package com.geo.service;

import com.geo.util.Result;

public interface BrandProfileService {

    Result<?> getByUserId(Long userId);

    Result<?> updateByUserId(Long userId, java.util.Map<String, Object> updates);

    Result<?> deleteByUserId(Long userId);
}
