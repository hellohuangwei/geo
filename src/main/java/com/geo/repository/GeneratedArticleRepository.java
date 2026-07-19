package com.geo.repository;

import com.geo.entity.GeneratedArticle;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface GeneratedArticleRepository extends JpaRepository<GeneratedArticle, Long> {

    Page<GeneratedArticle> findByUserIdOrderByCreateTimeDesc(Long userId, Pageable pageable);

    Optional<GeneratedArticle> findByIdAndUserId(Long id, Long userId);

    List<GeneratedArticle> findByUserIdOrderByCreateTimeDesc(Long userId);

    long countByUserId(Long userId);

    void deleteByIdAndUserId(Long id, Long userId);
}
