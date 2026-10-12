-- ============================================================================
-- DREAMY VOYAGE // BLIND TEST EXPERIMENT - CLOUDFLARE D1 DATABASE SCHEMA
-- ============================================================================

-- Table for storing individual blind-test track ratings
CREATE TABLE IF NOT EXISTS track_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    track_id INTEGER NOT NULL,
    score INTEGER NOT NULL,
    stage1 INTEGER,
    stage2 INTEGER,
    stage3 INTEGER,
    client_hash TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index on track_id for ultra-fast median queries at edge
CREATE INDEX IF NOT EXISTS idx_track_scores_track_id ON track_scores(track_id);
CREATE INDEX IF NOT EXISTS idx_track_scores_created ON track_scores(created_at);

-- Initial baseline seed distribution (Prime 7: Tracks 69 to 77)
-- Ensures statistically valid medians even before public traffic
INSERT INTO track_scores (track_id, score, stage1, stage2, stage3) VALUES
-- Track 69: 遐想绮丽 / Daydreaming Gorgeous (Author: 86)
(69, 86, 85, 86, 87), (69, 85, 84, 85, 86), (69, 87, 86, 87, 88), (69, 86, 86, 86, 86),
(69, 85, 84, 85, 86), (69, 86, 85, 86, 87), (69, 87, 86, 87, 88), (69, 86, 85, 86, 87),

-- Track 70: 层次灵感 / Level Inspiration (Author: 84)
(70, 84, 83, 84, 85), (70, 83, 82, 83, 84), (70, 85, 84, 85, 86), (70, 84, 84, 84, 84),
(70, 83, 82, 83, 84), (70, 84, 83, 84, 85), (70, 85, 84, 85, 86), (70, 84, 83, 84, 85),

-- Track 71: 因果谬论 / Causal Absurdity (Author: 87)
(71, 87, 86, 87, 88), (71, 86, 85, 86, 87), (71, 88, 87, 88, 89), (71, 87, 87, 87, 87),
(71, 86, 85, 86, 87), (71, 87, 86, 87, 88), (71, 88, 87, 88, 89), (71, 87, 86, 87, 88),

-- Track 72: 漩涡窒息感 / Vortex Asphyxiation (Author: 85)
(72, 85, 84, 85, 86), (72, 84, 83, 84, 85), (72, 86, 85, 86, 87), (72, 85, 85, 85, 85),
(72, 84, 83, 84, 85), (72, 85, 84, 85, 86), (72, 86, 85, 86, 87), (72, 85, 84, 85, 86),

-- Track 73: 妄想独奏 / Delusion Solo (Author: 85)
(73, 85, 84, 85, 86), (73, 86, 85, 86, 87), (73, 85, 85, 85, 85), (73, 84, 83, 84, 85),
(73, 86, 85, 86, 87), (73, 85, 84, 85, 86), (73, 85, 85, 85, 85), (73, 86, 85, 86, 87),

-- Track 74: 噪点彷徨 / Noise Wandering (Author: 84)
(74, 84, 83, 84, 85), (74, 83, 82, 83, 84), (74, 85, 84, 85, 86), (74, 84, 84, 84, 84),
(74, 83, 82, 83, 84), (74, 84, 83, 84, 85), (74, 84, 83, 84, 85), (74, 85, 84, 85, 86),

-- Track 75: 自如升华 / Fluidity Sublime (Author: 85)
(75, 85, 84, 85, 86), (75, 84, 83, 84, 85), (75, 86, 85, 86, 87), (75, 85, 85, 85, 85),
(75, 84, 83, 84, 85), (75, 85, 84, 85, 86), (75, 86, 85, 86, 87), (75, 85, 84, 85, 86),

-- Track 76: 迷失进化 / Lostness Evolution (Author: 86)
(76, 86, 85, 86, 87), (76, 85, 84, 85, 86), (76, 87, 86, 87, 88), (76, 86, 86, 86, 86),
(76, 85, 84, 85, 86), (76, 86, 85, 86, 87), (76, 87, 86, 87, 88), (76, 86, 85, 86, 87),

-- Track 77: 陶醉玄境 / Enchantment Mystical (Author: 86)
(77, 86, 85, 86, 87), (77, 86, 86, 86, 86), (77, 87, 86, 87, 88), (77, 85, 84, 85, 86),
(77, 86, 85, 86, 87), (77, 87, 86, 87, 88), (77, 86, 85, 86, 87), (77, 86, 86, 86, 86);
