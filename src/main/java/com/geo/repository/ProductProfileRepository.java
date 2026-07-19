package com.geo.repository;

import com.geo.entity.ProductProfile;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ProductProfileRepository extends JpaRepository<ProductProfile, Long> {

    List<ProductProfile> findAllByUserId(Long userId);

    Optional<ProductProfile> findByIdAndUserId(Long id, Long userId);
}
