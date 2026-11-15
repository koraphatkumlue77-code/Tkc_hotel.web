SET @payment_channel_ddl = (SELECT IF(COUNT(*) > 0, 'SELECT 1', 'ALTER TABLE payments ADD COLUMN channel_detail VARCHAR(24) NULL') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'payments' AND column_name = 'channel_detail');
PREPARE payment_channel_stmt FROM @payment_channel_ddl;
EXECUTE payment_channel_stmt;
DEALLOCATE PREPARE payment_channel_stmt;
