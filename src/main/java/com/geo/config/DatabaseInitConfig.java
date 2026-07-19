package com.geo.config;

import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

import javax.sql.DataSource;

@Configuration
public class DatabaseInitConfig {

    @Bean
    CommandLineRunner fixProductProfileUniqueConstraint(DataSource dataSource) {
        return args -> {
            JdbcTemplate jdbc = new JdbcTemplate(dataSource);
            // 移除旧的一对一唯一约束
            try {
                jdbc.execute("ALTER TABLE product_profile DROP INDEX UKfg1rx45bhbywscvff6il0ow90");
            } catch (Exception ignored) { }

            // 通用兜底：找到 user_id 上的唯一索引并删除
            try {
                var rs = jdbc.getDataSource().getConnection().getMetaData()
                    .getIndexInfo(null, null, "product_profile", true, false);
                while (rs.next()) {
                    String idxName = rs.getString("INDEX_NAME");
                    String colName = rs.getString("COLUMN_NAME");
                    if (idxName != null && "user_id".equals(colName) && !"PRIMARY".equals(idxName)) {
                        try { jdbc.execute("ALTER TABLE product_profile DROP INDEX " + idxName); } catch (Exception e2) { }
                    }
                }
                rs.close();
            } catch (Exception ignored) { }

            // user_activity 表新增字段（如不存在则添加）
            try {
                jdbc.execute("ALTER TABLE user_activity ADD COLUMN priority INT NULL");
            } catch (Exception ignored) { }
            try {
                jdbc.execute("ALTER TABLE user_activity ADD COLUMN is_required TINYINT NOT NULL DEFAULT 0");
            } catch (Exception ignored) { }
            // 删除旧字段
            try {
                jdbc.execute("ALTER TABLE user_activity DROP COLUMN is_initial");
            } catch (Exception ignored) { }
            try {
                jdbc.execute("ALTER TABLE user_activity ADD COLUMN target_id BIGINT NULL");
            } catch (Exception ignored) { }
            // 把引导项的创建时间设为固定旧值，确保新操作记录排在前面
            try {
                jdbc.execute("UPDATE user_activity SET create_time='2020-01-01 00:00:00' WHERE is_required=1 AND create_time>'2020-01-02'");
            } catch (Exception ignored) { }
        };
    }
}
