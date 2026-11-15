CREATE TABLE IF NOT EXISTS review_author_legacy (review_id BIGINT PRIMARY KEY, account_id BIGINT NOT NULL);
SET @review_archive_sql = (SELECT IF(COUNT(*) > 0, 'INSERT IGNORE INTO review_author_legacy (review_id, account_id) SELECT id, account_id FROM reviews', 'SELECT 1') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'reviews' AND column_name = 'account_id');
PREPARE review_archive_stmt FROM @review_archive_sql;
EXECUTE review_archive_stmt;
DEALLOCATE PREPARE review_archive_stmt;
SET @review_drop_sql = (SELECT IF(COUNT(*) > 0, 'ALTER TABLE reviews DROP FOREIGN KEY reviews_ibfk_2, DROP COLUMN account_id', 'SELECT 1') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'reviews' AND column_name = 'account_id');
PREPARE review_drop_stmt FROM @review_drop_sql;
EXECUTE review_drop_stmt;
DEALLOCATE PREPARE review_drop_stmt;
