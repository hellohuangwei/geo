package com.geo.repository;

import com.geo.entity.AcquisitionRunLog;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface AcquisitionRunLogRepository extends JpaRepository<AcquisitionRunLog, Long> {
    List<AcquisitionRunLog> findByTaskIdOrderByCreateTimeDesc(Long taskId);
}
