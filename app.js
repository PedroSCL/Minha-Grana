const express = require('express');
const mustacheExpress = require('mustache-express');
const session = require('express-session');
const bodyParser = require('body-parser');
const app = express();
const db = require('./models/db');

app.engine('mustache', mustacheExpress());
app.set('view engine', 'mustache');
app.set('views', __dirname + '/views');

app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
  secret: 'catolica',
  resave: false,
  saveUninitialized: false
}));

// autenticação
function auth(req, res, next) {
  if (req.session && req.session.usuario) {
    return next();
  } else {
    res.redirect('/login');
  }
}

// ================= HOME =================
app.get('/', (req, res) => res.render('home'));

// ================= LOGIN =================
app.get('/login', (req, res) => res.render('login'));

app.post('/login', (req, res) => {
  const { email, senha } = req.body;

  db.get("SELECT * FROM usuarios WHERE email = ?", [email], (err, usuario) => {
    if (err) return res.status(500).send("Erro no servidor ao tentar fazer login.");
    if (usuario && usuario.senha === senha) {
      req.session.usuario = usuario;
      return res.redirect('/transacoes');
    } else {
      res.send('Login inválido. Verifique seu email e senha.');
    }
  });
});

// ================= CADASTRO =================
app.get('/cadastro', (req, res) => {
  const email = req.query.email || '';
  res.render('cadastro', { email });
});

app.post('/cadastro', (req, res) => {
  const { nome, email, senha, telefone } = req.body;
  const sql = "INSERT INTO usuarios (nome, email, senha, telefone, usuario) VALUES (?, ?, ?, ?, ?)";

  db.run(sql, [nome, email, senha, telefone, email], function (err) {
    if (err) {
      if (err.message.includes("UNIQUE constraint failed")) {
        return res.send("Erro: Este email já está cadastrado. Tente fazer login.");
      }
      return res.status(500).send("Erro ao criar a conta.");
    }
    res.redirect('/login');
  });
});

// ================= LOGOUT =================
app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// ================= PRODUTOS (LEGADO) =================
app.get('/dashboard', auth, (req, res) => {
  const user = req.session.usuario;
  db.all("SELECT * FROM produtos WHERE usuario = ?", [user.usuario], (err, rows) => {
    res.render('dashboard', { produtos: rows, nomeUsuario: user.nome });
  });
});

app.post('/adicionar', auth, (req, res) => {
  const { nome, valor } = req.body;
  const usuario = req.session.usuario.usuario;
  db.run("INSERT INTO produtos (nome, valor, usuario) VALUES (?, ?, ?)", [nome, valor, usuario], () => {
    res.redirect('/dashboard');
  });
});

app.get('/deletar/:id', auth, (req, res) => {
  const usuario = req.session.usuario.usuario;
  db.run("DELETE FROM produtos WHERE id = ? AND usuario = ?", [req.params.id, usuario], () => {
    res.redirect('/dashboard');
  });
});

app.get('/editar/:id', auth, (req, res) => {
  const usuario = req.session.usuario.usuario;
  db.get("SELECT * FROM produtos WHERE id = ? AND usuario = ?", [req.params.id, usuario], (err, row) => {
    if (row) {
      res.render('editar', { produto: row });
    } else {
      res.send("Produto não encontrado ou você não tem permissão para editá-lo.");
    }
  });
});

app.post('/editar/:id', auth, (req, res) => {
  const { nome, valor } = req.body;
  const usuario = req.session.usuario.usuario;
  db.run("UPDATE produtos SET nome = ?, valor = ? WHERE id = ? AND usuario = ?", [nome, valor, req.params.id, usuario], () => {
    res.redirect('/dashboard');
  });
});

// ================= TRANSACOES =================
app.get('/transacoes', auth, (req, res) => {
  const usuario = req.session.usuario.usuario;
  db.all("SELECT * FROM transacoes WHERE usuario = ? ORDER BY data DESC", [usuario], (err, rows) => {
    if (err) return res.status(500).send("Erro ao buscar transações.");
    res.render('transacoes', { transacoes: rows, nomeUsuario: req.session.usuario.nome });
  });
});

app.get('/transacoes/nova', auth, (req, res) => {
  res.render('nova_transacao');
});

app.post('/transacoes/nova', auth, (req, res) => {
  let { valor, data, categoria, descricao, tipo } = req.body;
  const usuario = req.session.usuario.usuario;

  tipo = tipo.toLowerCase();

  const sql = "INSERT INTO transacoes (valor, data, categoria, descricao, tipo, usuario) VALUES (?, ?, ?, ?, ?, ?)";

  db.run(sql, [valor, data, categoria, descricao, tipo, usuario], (err) => {
    if (err) return res.status(500).send("Erro ao adicionar transação.");
    res.redirect('/transacoes');
  });
});

// deletar transação
app.get('/transacoes/deletar/:id', auth, (req, res) => {
  const usuario = req.session.usuario.usuario;
  const id = req.params.id;

  db.run("DELETE FROM transacoes WHERE id = ? AND usuario = ?", [id, usuario], function(err) {
    if (err) {
      return res.status(500).send("Erro ao excluir a transação.");
    }
    if (this.changes === 0) {
      return res.status(404).send("Transação não encontrada ou sem permissão para excluir.");
    }
    res.redirect('/transacoes');
  });
});

//formulário de edição da transação
app.get('/transacoes/editar/:id', auth, (req, res) => {
  const usuario = req.session.usuario.usuario;
  const id = req.params.id;

  db.get("SELECT * FROM transacoes WHERE id = ? AND usuario = ?", [id, usuario], (err, row) => {
    if (err) return res.status(500).send("Erro ao buscar a transação.");
    if (!row) return res.status(404).send("Transação não encontrada ou sem permissão para editar.");

    row.isReceita = row.tipo === "receita";
    row.isDespesa = row.tipo === "despesa";

    res.render('editar_transacao', { transacao: row });
  });
});

// salvar edição da transação
app.post('/transacoes/editar/:id', auth, (req, res) => {
  const usuario = req.session.usuario.usuario;
  const id = req.params.id;
  let { valor, data, categoria, descricao, tipo } = req.body;

  tipo = tipo.toLowerCase();

  const sql = `
    UPDATE transacoes
    SET valor = ?, data = ?, categoria = ?, descricao = ?, tipo = ?
    WHERE id = ? AND usuario = ?
  `;

  db.run(sql, [valor, data, categoria, descricao, tipo, id, usuario], function(err) {
    if (err) {
      console.error('Erro no UPDATE:', err);
      return res.status(500).send("Erro ao atualizar a transação.");
    }
    if (this.changes === 0) return res.status(404).send("Transação não encontrada ou sem permissão para editar.");
    res.redirect('/transacoes');
  });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
