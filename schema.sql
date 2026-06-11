CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session TEXT,
  spot_type TEXT,
  hero_pos TEXT,
  vs_pos TEXT,
  depth INTEGER,
  threebet_to_bb REAL,
  hand_key TEXT,
  action TEXT,
  gto_best TEXT,
  correct INTEGER,
  ts INTEGER
);
CREATE INDEX IF NOT EXISTS idx_attempts_spot ON attempts (spot_type, depth);
CREATE INDEX IF NOT EXISTS idx_attempts_ts ON attempts (ts);
