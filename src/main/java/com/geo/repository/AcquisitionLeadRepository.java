package com.geo.repository;

import com.geo.entity.AcquisitionLead;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface AcquisitionLeadRepository extends JpaRepository<AcquisitionLead, Long> {
    List<AcquisitionLead> findByUserIdOrderByCreateTimeDesc(Long userId);
    List<AcquisitionLead> findByTaskIdOrderByCreateTimeDesc(Long taskId);
    Optional<AcquisitionLead> findByCommentId(Long commentId);
    long countByUserId(Long userId);
    long countByUserIdAndIntentLevel(Long userId, String intentLevel);
}
