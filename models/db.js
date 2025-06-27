// models/db.js

const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./models/database.sqlite');

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      senha TEXT NOT NULL,
      telefone TEXT,
      usuario TEXT NOT NULL
      -- A coluna 'foto_perfil_url' foi removida em alterações anteriores.
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS produtos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT,
      valor TEXT,
      usuario TEXT,
      FOREIGN KEY (usuario) REFERENCES usuarios(usuario)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS transacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      valor REAL NOT NULL,
      data TEXT NOT NULL,
      categoria TEXT NOT NULL,
      descricao TEXT,
      tipo TEXT CHECK(tipo IN ('receita', 'despesa')) NOT NULL,
      usuario TEXT NOT NULL,
      FOREIGN KEY (usuario) REFERENCES usuarios(usuario)
    )
  `);

  //nova tabela para armazenar os limites de gastos por categoria para cada usuario
  db.run(`
    CREATE TABLE IF NOT EXISTS user_payment_targets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_email TEXT NOT NULL, -- email identifcador
      category TEXT NOT NULL,
      target_amount REAL NOT NULL,
      UNIQUE(user_email, category), 
      FOREIGN KEY (user_email) REFERENCES usuarios(email)
    )
  `);
});

module.exports = db;
