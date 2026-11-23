-- Seed for the D1 (real SQLite) SQL-injection lab. Fake data only.
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS products;

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT,
  password TEXT,
  role TEXT,
  email TEXT,
  card TEXT
);
INSERT INTO users (username, password, role, email, card) VALUES
  ('admin', 'S3cr3t-Admin-PW!',  'admin',  'admin@example.test', '4111-1111-1111-FAKE'),
  ('alice', 'alice-password-1',  'user',   'alice@example.test', '4111-1111-2222-FAKE'),
  ('bob',   'hunter2-not-real',  'user',   'bob@example.test',   '4111-1111-3333-FAKE'),
  ('carol', 'correcthorse-fake', 'editor', 'carol@example.test', '4111-1111-4444-FAKE');

CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  price TEXT,
  stock TEXT
);
INSERT INTO products (name, price, stock) VALUES
  ('Blue Mug',        '12.00', '40'),
  ('Blueberry Jam',   '6.50',  '18'),
  ('Red Notebook',    '9.00',  '55'),
  ('Green Tea Tin',   '15.00', '7'),
  ('Yellow Umbrella', '22.00', '12');
