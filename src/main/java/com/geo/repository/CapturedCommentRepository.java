package com.geo.repository;

import com.geo.entity.CapturedComment;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;

public interface CapturedCommentRepository extends JpaRepository<CapturedComment, Long> {
    List<CapturedComment> findByTaskId(Long taskId);
    List<CapturedComment> findByTaskIdAndIsIgnoredFalse(Long taskId);
    Page<CapturedComment> findByTaskIdAndIsIgnoredFalse(Long taskId, Pageable pageable);
    Page<CapturedComment> findByTaskIdAndKeywordAndIsIgnoredFalse(Long taskId, String keyword, Pageable pageable);
    long countByUserIdAndIsIgnoredFalse(Long userId);
    List<CapturedComment> findByTaskIdAndIsIgnoredFalseAndIntentLevelIsNull(Long taskId);
    long countByTaskIdAndIntentLevel(Long taskId, String intentLevel);

    /** 关键词精确 + 内容模糊 + 昵称模糊 联合搜索 */
    @Query("SELECT c FROM CapturedComment c WHERE c.taskId = :taskId AND c.isIgnored = false "
         + "AND (:keyword = '' OR c.keyword = :keyword) "
         + "AND (:search = '' OR c.content LIKE %:search% OR c.commenterNickname LIKE %:search%)")
    Page<CapturedComment> searchByTask(@Param("taskId") Long taskId,
                                       @Param("keyword") String keyword,
                                       @Param("search") String search,
                                       Pageable pageable);
}
