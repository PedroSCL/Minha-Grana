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

function getInitials(name) {
    if (!name) return '';
    const parts = name.split(' ');
    if (parts.length === 1) {
        return parts[0].charAt(0).toUpperCase();
    }
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

// autenticacao
function auth(req, res, next) {
  if (req.session && req.session.usuario) {
    req.session.usuario.iniciais = getInitials(req.session.usuario.nome);
    return next();
  } else {
    res.redirect('/login');
  }
}

app.get('/', (req, res) => res.render('home'));

app.get('/login', (req, res) => res.render('login'));

app.post('/login', (req, res) => {
  const { email, senha } = req.body;

  db.get("SELECT * FROM usuarios WHERE email = ?", [email], (err, usuario) => {
    if (err) {
      console.error("Erro no servidor ao tentar fazer login:", err.message);
      return res.status(500).send("Erro no servidor ao tentar fazer login.");
    }
    if (usuario && usuario.senha === senha) {
      req.session.usuario = usuario;
      return res.redirect('/dashboard'); 
    } else {
      res.render('login', { loginError: true });
    }
  });
});

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
      console.error("Erro ao criar a conta:", err.message);
      return res.status(500).send("Erro ao criar a conta.");
    }
    res.redirect('/login');
  });
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

app.get('/dashboard', auth, async (req, res) => { 
  const user = req.session.usuario;
  const usuarioEmail = user.usuario; 

  //definir metas padrao caso nao existam no banco de dados
  const defaultTargets = {
      'Conta': 1000,
      'Assinaturas': 250,
      'Aluguel': 1000,
      'Comida': 700
  };

  let userPaymentTargets = {};

  try {
      const targetsDb = await new Promise((resolve, reject) => {
          db.all("SELECT category, target_amount FROM user_payment_targets WHERE user_email = ?", [usuarioEmail], (err, rows) => {
              if (err) reject(err);
              resolve(rows);
          });
      });

      targetsDb.forEach(row => {
          userPaymentTargets[row.category] = { target_amount: row.target_amount };
      });

      for (const category in defaultTargets) {
          if (!userPaymentTargets[category]) {
              userPaymentTargets[category] = { target_amount: defaultTargets[category] };
          }
      }

  } catch (err) {
      console.error("Erro ao buscar metas de pagamento do usuário:", err.message);
      //fallback para metas padrão em caso de erro
      for (const category in defaultTargets) {
          userPaymentTargets[category] = { target_amount: defaultTargets[category] };
      }
  }


  db.all("SELECT valor, tipo, data, categoria, descricao FROM transacoes WHERE usuario = ? ORDER BY data ASC", [usuarioEmail], (err, transacoes) => {
    if (err) {
      console.error("Erro ao buscar transações para o dashboard:", err.message);
      return res.status(500).send("Erro ao carregar dados do dashboard.");
    }

    let totalReceitas = 0;
    let totalDespesas = 0;
    let totalInvestimentos = 0; 
    const monthlyData = {}; 
    const recentTransactions = []; 
    const categories = new Set(); 

    //objeto para armazenar os totais de pagamentos 
    const paymentTotals = {
        'Conta': { current: 0, icon: '🏠' },
        'Assinaturas': { current: 0, icon: '🔗' },
        'Aluguel': { current: 0, icon: '🏢' },
        'Comida': { current: 0, icon: '🍔' }
    };

    const monthsOrder = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    
    const currentYear = new Date().getFullYear();
    monthsOrder.forEach(month => {
        monthlyData[`${month}/${currentYear}`] = { receitas: 0, despesas: 0 };
    });

    transacoes.forEach(transacao => {
        const valor = parseFloat(transacao.valor);
        const transactionDate = new Date(transacao.data); 
        const monthYear = `${monthsOrder[transactionDate.getMonth()]}/${transactionDate.getFullYear()}`;

        if (!monthlyData[monthYear]) {
            monthlyData[monthYear] = { receitas: 0, despesas: 0 };
        }

        if (transacao.tipo === 'receita') {
            totalReceitas += valor;
            monthlyData[monthYear].receitas += valor;
        } else if (transacao.tipo === 'despesa') {
            totalDespesas += valor;
            monthlyData[monthYear].despesas += valor;

            //logica para Pagamentos
            const categoriaLower = transacao.categoria.toLowerCase();
            if (categoriaLower === 'aluguel' && paymentTotals['Aluguel']) {
                paymentTotals['Aluguel'].current += valor;
            } else if (categoriaLower === 'alimentação' && paymentTotals['Comida']) { 
                paymentTotals['Comida'].current += valor;
            } else if (categoriaLower === 'assinaturas' && paymentTotals['Assinaturas']) {
                paymentTotals['Assinaturas'].current += valor;
            } 
            else if ((categoriaLower === 'contas de consumo' || categoriaLower === 'serviços') && paymentTotals['Conta']) {
                paymentTotals['Conta'].current += valor;
            }
        }

        if (transacao.categoria.toLowerCase() === 'investimento') {
            if (transacao.tipo === 'receita') {
                totalInvestimentos += valor; 
            } else if (transacao.tipo === 'despesa') {
                totalInvestimentos -= valor; 
            }
        }
        categories.add(transacao.categoria); 
    });

    const saldoFinal = totalReceitas - totalDespesas;

    const allMonthlyLabels = Object.keys(monthlyData).sort((a, b) => {
        const [monthA, yearA] = a.split('/');
        const [monthB, yearB] = b.split('/');
        const dateA = new Date(`${monthA} 1, ${yearA}`);
        const dateB = new Date(`${monthB} 1, ${yearB}`);
        return dateA - dateB;
    });

    const chartLabels = allMonthlyLabels;
    const chartReceitasData = chartLabels.map(label => monthlyData[label] ? monthlyData[label].receitas : 0);
    const chartDespesasData = chartLabels.map(label => monthlyData[label] ? monthlyData[label].despesas : 0);

    const sortedTransactionsDesc = [...transacoes].sort((a, b) => new Date(b.data) - new Date(a.data));
    for (let i = 0; i < Math.min(6, sortedTransactionsDesc.length); i++) {
        const t = sortedTransactionsDesc[i];
        recentTransactions.push({
            descricao: t.descricao,
            valor: parseFloat(t.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
            tipo: t.tipo,
            data: new Date(t.data).toLocaleDateString('pt-BR'),
            categoria: t.categoria,
            isReceita: t.tipo === 'receita', 
            isDespesa: t.tipo === 'despesa'  
        });
    }
    
    const formattedPayments = Object.keys(paymentTotals).map(key => {
        const p = paymentTotals[key];
        const targetAmount = userPaymentTargets[key] ? userPaymentTargets[key].target_amount : defaultTargets[key];
        
        const currentClamped = Math.min(p.current, targetAmount); 
        return {
            name: key,
            current: p.current.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
            total: targetAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
            percentage: ((currentClamped / targetAmount) * 100).toFixed(0),
            icon: p.icon
        };
    });


    res.render('dashboard', {
      nomeUsuario: user.nome,
      iniciaisUsuario: user.iniciais, 
      saldoFinal: saldoFinal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      totalReceitas: totalReceitas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      totalDespesas: totalDespesas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      totalInvestimentos: totalInvestimentos.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), 
      
      transacoesRecentes: recentTransactions,
      payments: formattedPayments, 

      chartLabels: JSON.stringify(chartLabels),
      chartReceitasData: JSON.stringify(chartReceitasData),
      chartDespesasData: JSON.stringify(chartDespesasData)
    });
  });
});

//rota GET para a pagina de configuracoes de pagamentos
app.get('/configuracoes-pagamentos', auth, async (req, res) => {
    const user = req.session.usuario;
    const usuarioEmail = user.usuario;

    //metas padrão para preencher se o usuário nao estiver configurado
    const defaultTargets = {
        'Conta': 1000,
        'Assinaturas': 250,
        'Aluguel': 1000,
        'Comida': 700
    };

    let paymentTargets = {}; 

    try {
        const targetsDb = await new Promise((resolve, reject) => {
            db.all("SELECT category, target_amount FROM user_payment_targets WHERE user_email = ?", [usuarioEmail], (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });

        targetsDb.forEach(row => {
            paymentTargets[row.category] = { target_amount: row.target_amount };
        });

        for (const category in defaultTargets) {
            if (!paymentTargets[category]) {
                paymentTargets[category] = { target_amount: defaultTargets[category] };
            }
        }

    } catch (err) {
        console.error("Erro ao buscar metas de pagamento para configurações:", err.message);
        for (const category in defaultTargets) {
            paymentTargets[category] = { target_amount: defaultTargets[category] };
        }
    }

    res.render('configuracoes_pagamentos', {
        nomeUsuario: user.nome,
        iniciaisUsuario: user.iniciais,
        paymentTargets: paymentTargets, //passa o objeto com as metas para o template
        successMessage: req.query.success ? "Metas de pagamento salvas com sucesso!" : null,
        errorMessage: req.query.error ? "Erro ao salvar metas de pagamento." : null
    });
});

//rota POST para salvar as configuracoes de pagamentos
app.post('/configuracoes-pagamentos', auth, async (req, res) => {
    const usuarioEmail = req.session.usuario.usuario;
    const { Conta, Assinaturas, Aluguel, Comida } = req.body;

    const categoriesToUpdate = {
        'Conta': parseFloat(Conta),
        'Assinaturas': parseFloat(Assinaturas),
        'Aluguel': parseFloat(Aluguel),
        'Comida': parseFloat(Comida)
    };

    let hasError = false;

    for (const category in categoriesToUpdate) {
        const targetAmount = categoriesToUpdate[category];
        if (isNaN(targetAmount)) {
            hasError = true;
            break;
        }

        try {
            await new Promise((resolve, reject) => {
                db.run(`
                    INSERT INTO user_payment_targets (user_email, category, target_amount)
                    VALUES (?, ?, ?)
                    ON CONFLICT(user_email, category) DO UPDATE SET target_amount = excluded.target_amount
                `, [usuarioEmail, category, targetAmount], function(err) {
                    if (err) reject(err);
                    resolve();
                });
            });
        } catch (err) {
            console.error(`Erro ao salvar meta para ${category}:`, err.message);
            hasError = true;
            break;
        }
    }

    if (hasError) {
        res.redirect('/configuracoes-pagamentos?error=true');
    } else {
        res.redirect('/configuracoes-pagamentos?success=true');
    }
});


app.get('/transacoes', auth, (req, res) => {
  const usuario = req.session.usuario.usuario;

  db.all("SELECT * FROM transacoes WHERE usuario = ? ORDER BY data DESC", [usuario], (err, rows) => {
    if (err) {
      console.error("Erro ao buscar transações:", err.message);
      return res.status(500).send("Erro ao buscar transações.");
    }
    const formattedRows = rows.map(row => ({
        ...row,
        valor: parseFloat(row.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
        data: new Date(row.data).toLocaleDateString('pt-BR'), 
        isReceita: row.tipo === 'receita', 
        isDespesa: row.tipo === 'despesa'  
    }));
    res.render('transacoes', { 
        transacoes: formattedRows, 
        nomeUsuario: req.session.usuario.nome,
        iniciaisUsuario: req.session.usuario.iniciais 
    });
  });
});

app.get('/transacoes/nova', auth, (req, res) => {
  res.render('nova_transacao', {
    nomeUsuario: req.session.usuario.nome,
    iniciaisUsuario: req.session.usuario.iniciais 
  });
});

app.post('/transacoes/nova', auth, (req, res) => {
  let { valor, data, categoria, descricao, tipo } = req.body;
  const usuario = req.session.usuario.usuario;

  tipo = tipo.toLowerCase();

  const sql = "INSERT INTO transacoes (valor, data, categoria, descricao, tipo, usuario) VALUES (?, ?, ?, ?, ?, ?)";

  db.run(sql, [valor, data, categoria, descricao, tipo, usuario], (err) => {
    if (err) {
      console.error("Erro ao adicionar transação:", err.message);
      return res.status(500).send("Erro ao adicionar transação.");
    }
    res.redirect('/transacoes');
  });
});

app.get('/transacoes/deletar/:id', auth, (req, res) => {
  const usuario = req.session.usuario.usuario;
  const id = req.params.id;

  db.run("DELETE FROM transacoes WHERE id = ? AND usuario = ?", [id, usuario], function(err) {
    if (err) {
      console.error("Erro ao excluir a transação:", err.message);
      return res.status(500).send("Erro ao excluir a transação.");
    }
    if (this.changes === 0) {
      return res.status(404).send("Transação não encontrada ou sem permissão para excluir.");
    }
    res.redirect('/transacoes');
  });
});

app.get('/transacoes/editar/:id', auth, (req, res) => {
  const usuario = req.session.usuario.usuario;
  const id = req.params.id;

  db.get("SELECT * FROM transacoes WHERE id = ? AND usuario = ?", [id, usuario], (err, row) => {
    if (err) {
      console.error("Erro ao buscar a transação para edição:", err.message);
      return res.status(500).send("Erro ao buscar a transação.");
    }
    if (!row) return res.status(404).send("Transação não encontrada ou sem permissão para editar.");

    row.isReceita = row.tipo === "receita";
    row.isDespesa = row.tipo === "despesa";
    row.formattedDate = row.data;

    res.render('editar_transacao', { 
        transacao: row,
        nomeUsuario: req.session.usuario.nome, 
        iniciaisUsuario: req.session.usuario.iniciais, 
        equals: function () {
            return function (text, render) {
                const parts = text.split(' '); 
                const expected = parts[0];
                const actual = render(parts[1]); 
                return expected === actual ? 'selected' : ''; 
            };
        }
    });
  });
});

app.post('/transacoes/editar/:id', auth, (req, res) => {
  const usuario = req.session.usuario.usuario;
  const id = req.params.id;
  const { tipo, valor, data, categoria, descricao } = req.body;

  const sql = `
    UPDATE transacoes
    SET tipo = ?, valor = ?, data = ?, categoria = ?, descricao = ?
    WHERE id = ? AND usuario = ?
  `;

  db.run(sql, [tipo, valor, data, categoria, descricao, id, usuario], function(err) {
    if (err) {
      console.error("Erro ao atualizar a transação:", err.message);
      return res.status(500).send("Erro ao atualizar a transação.");
    }

    if (this.changes === 0) {
      return res.status(404).send("Transação não encontrada ou sem permissão para editar.");
    }

    res.redirect('/transacoes');
  });
});


// Rotas do Perfil 
app.get('/perfil', auth, (req, res) => {
    const user = req.session.usuario;
    res.render('perfil', {
        nome: user.nome,
        email: user.email,
        telefone: user.telefone,
        iniciaisUsuario: user.iniciais, 
        nomeUsuario: user.nome 
    });
});

app.post('/perfil', auth, (req, res) => {
    const usuarioEmail = req.session.usuario.usuario; 
    const { nome, telefone } = req.body; 

    const sql = `
        UPDATE usuarios
        SET nome = ?, telefone = ?
        WHERE usuario = ?
    `;

    db.run(sql, [nome, telefone, usuarioEmail], function(err) { 
        if (err) {
            console.error("Erro ao atualizar o perfil:", err.message);
            return res.status(500).send("Erro ao atualizar o perfil. Tente novamente.");
        }
        
        req.session.usuario.nome = nome;
        req.session.usuario.telefone = telefone;

        res.redirect('/perfil?success=true'); 
    });
});


// Porta do servidor
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
