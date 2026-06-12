CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session TEXT,
  client TEXT,
  ver TEXT,
  spot_type TEXT,
  hero_pos TEXT,
  vs_pos TEXT,
  depth INTEGER,
  threebet_to_bb REAL,
  hand_key TEXT,
  action TEXT,
  gto_best TEXT,
  correct INTEGER,
  chosen_freq REAL,
  extra TEXT,
  ts INTEGER
);
CREATE INDEX IF NOT EXISTS idx_attempts_spot ON attempts (spot_type, depth);
CREATE INDEX IF NOT EXISTS idx_attempts_ts ON attempts (ts);
CREATE INDEX IF NOT EXISTS idx_attempts_client ON attempts (client);
