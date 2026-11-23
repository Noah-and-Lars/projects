// seed.js — obviously-FAKE data for the SQL-injection teaching lab.
// None of this is real. Card numbers use the reserved 4111 1111 test prefix
// and are clearly placeholders. Do not put real data in a vulnerable app.

export const users = [
  { id: 1, username: 'admin',  password: 'S3cr3t-Admin-PW!', role: 'admin',  email: 'admin@example.test',  card: '4111-1111-1111-FAKE' },
  { id: 2, username: 'alice',  password: 'alice-password-1',  role: 'user',   email: 'alice@example.test',  card: '4111-1111-2222-FAKE' },
  { id: 3, username: 'bob',    password: 'hunter2-not-real',  role: 'user',   email: 'bob@example.test',    card: '4111-1111-3333-FAKE' },
  { id: 4, username: 'carol',  password: 'correcthorse-fake', role: 'editor', email: 'carol@example.test',  card: '4111-1111-4444-FAKE' },
];

export const products = [
  { id: 101, name: 'Blue Mug',        price: '12.00', stock: '40' },
  { id: 102, name: 'Blueberry Jam',   price: '6.50',  stock: '18' },
  { id: 103, name: 'Red Notebook',    price: '9.00',  stock: '55' },
  { id: 104, name: 'Green Tea Tin',   price: '15.00', stock: '7'  },
  { id: 105, name: 'Yellow Umbrella', price: '22.00', stock: '12' },
];

export default { users, products };
