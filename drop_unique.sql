ALTER TABLE product_profile DROP INDEX IF EXISTS UK_xxx;
ALTER TABLE product_profile DROP INDEX IF EXISTS user_id;
SHOW INDEX FROM product_profile;
