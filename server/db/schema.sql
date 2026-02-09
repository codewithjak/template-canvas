-- Database schema for Template Canvas Editor

-- Create database (run this manually if database doesn't exist)
-- CREATE DATABASE IF NOT EXISTS panavi_14_10_25;
-- USE panavi_14_10_25;

-- Templates table
CREATE TABLE IF NOT EXISTS templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  data JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_name (name),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Example: Insert a sample template
-- INSERT INTO templates (name, data) VALUES (
--   'Sample Template',
--   '{"version": "1.0", "elements": [{"id": "text-1", "type": "text", "content": "Hello {{name}}", "position": {"x": 100, "y": 50}, "style": {"fontSize": 16, "fontWeight": "normal", "color": "#000000"}}]}'
-- );
