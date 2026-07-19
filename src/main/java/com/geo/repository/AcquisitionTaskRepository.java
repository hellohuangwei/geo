package com.geo.repository;

import com.geo.entity.AcquisitionTask;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface AcquisitionTaskRepository extends JpaRepository<AcquisitionTask, Long> {
    List<AcquisitionTask> findByUserIdOrderByCreateTimeDesc(Long userId);
    List<AcquisitionTask> findByUserIdAndPlatformOrderByCreateTimeDesc(Long userId, String platform);
}
