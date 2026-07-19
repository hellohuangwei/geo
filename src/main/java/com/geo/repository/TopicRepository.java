package com.geo.repository;

import com.geo.entity.Topic;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface TopicRepository extends JpaRepository<Topic, Long> {
    List<Topic> findByUserIdOrderByCreateTimeDesc(Long userId);
    boolean existsByNameAndUserId(String name, Long userId);
}
