
# Minha Grana

Projeto simples de controle financeiro pessoal desenvolvido com Node.js, Express e Mustache.

---

## Descrição

Minha Grana é uma aplicação web que permite ao usuário cadastrar transações financeiras, tanto receitas quanto despesas, com categorias, valores, datas e descrições. O usuário pode criar conta, fazer login, visualizar suas transações, além de editar e excluir entradas existentes.

---

## Funcionalidades

- Cadastro e login de usuários
- Listagem de transações (receitas e despesas)
- Criação de novas transações
- Edição e exclusão de transações existentes
- Interface simples e intuitiva usando Mustache para renderização de templates
- Persistência dos dados em banco SQLite

---

## Tecnologias utilizadas

- Node.js
- Express.js
- Mustache (templating engine)
- SQLite (banco de dados)
- express-session para gerenciamento de sessão
- body-parser para manipulação de dados de formulário

---

## Como rodar o projeto localmente

### Pré-requisitos

- Node.js instalado (https://nodejs.org/)
- Git instalado (https://git-scm.com/)

### Passos

1. Clone o repositório:

```bash
git clone https://github.com/seuusuario/minha-grana.git
```

2. Acesse a pasta do projeto:

```bash
cd minha-grana
```

3. Instale as dependências:

```bash
npm install
```

4. Configure o banco SQLite (se já não estiver configurado) — crie o arquivo do banco e as tabelas conforme seu projeto.

5. Inicie o servidor:

```bash
node app.js
```

6. Acesse no navegador:

```
http://localhost:3000
```

---

## Estrutura de arquivos

- `app.js` - arquivo principal da aplicação com rotas e lógica do servidor
- `views/` - templates Mustache para as páginas web
- `public/` - arquivos estáticos (CSS, imagens, scripts)
- `models/db.js` - configuração da conexão SQLite

---

## Contato

Para dúvidas ou sugestões, abra uma issue ou entre em contato pelo GitHub.

---

**Feito com ❤️ para estudo e prática.**
