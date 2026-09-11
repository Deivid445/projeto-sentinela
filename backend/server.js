const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();

app.use(express.json());
app.use(cors());

// Servir frontend se a pasta existir (suporta tanto subpasta ../frontend quanto na raiz)
const frontendPath = path.join(__dirname, "../frontend");
if (fs.existsSync(frontendPath)) {
  app.use(express.static(frontendPath));
} else {
  app.use(express.static(__dirname));
}

const DB_FILE = path.join(__dirname, "db.json");

// Estrutura inicial do banco caso não exista
const initialData = {
  usuarios: [
    { usuario: "admin", senha: "123", tipo: "triagem" },
    { usuario: "medico", senha: "123", tipo: "medico" },
    { usuario: "atendimento", senha: "123", tipo: "atendimento" }
  ],
  pacientes: [],
  triagens: [],
  consultas: [],
  tv_chamada: null,
  tv_historico: []
};

// Variável em memória para evitar quedas no Render/Heroku caso o disco seja somente-leitura
let memoryDB = { ...initialData };

function readDB() {
  if (!fs.existsSync(DB_FILE)) {
    writeDB(initialData);
    return initialData;
  }
  try {
    const fileData = fs.readFileSync(DB_FILE, "utf8");
    const db = JSON.parse(fileData);
    if (!db.usuarios || db.usuarios.length === 0) db.usuarios = initialData.usuarios;
    if (!db.pacientes) db.pacientes = [];
    if (!db.triagens) db.triagens = [];
    if (!db.consultas) db.consultas = [];
    if (!db.tv_chamada) db.tv_chamada = null;
    if (!db.tv_historico) db.tv_historico = [];
    memoryDB = db;
    return db;
  } catch (err) {
    console.error("Erro ao ler db.json, usando banco em memória:", err);
    return memoryDB;
  }
}

function writeDB(data) {
  memoryDB = data;
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.warn("Aviso: Não foi possível salvar em disco (sistema de arquivos em modo leitura). Dados mantidos em memória temporária.");
  }
}

// LOGIN
app.post("/login", (req, res) => {
  const db = readDB();

  const user = db.usuarios.find(u =>
    u.usuario === req.body.usuario &&
    u.senha === req.body.senha
  );

  if (!user) {
    return res.status(401).json({ erro: "Login inválido" });
  }

  res.json(user);
});

// ATENDIMENTO - cadastrar paciente
app.post("/atendimento", (req, res) => {
  const db = readDB();

  const paciente = {
    id: Date.now(),
    nome: req.body.nome,
    cpf: req.body.cpf,
    tipo: req.body.tipo || "Particular",
    status: "triagem",
    createdAt: new Date().toISOString()
  };

  db.pacientes.push(paciente);
  writeDB(db);

  res.json(paciente);
});

// LISTAR PACIENTES (triagem busca quem foi cadastrado no atendimento)
app.get("/pacientes", (req, res) => {
  const db = readDB();
  res.json(db.pacientes);
});

// TRIAGEM
app.post("/triagem", (req, res) => {
  const db = readDB();

  let risco = req.body.risco;

  if (req.body.temperatura >= 39) {
    risco = "vermelho";
  } else if (req.body.temperatura >= 38) {
    risco = "amarelo";
  } else if (!risco) {
    risco = "verde";
  }

  const triagem = {
    id: Date.now(),
    nome: req.body.nome,
    sintoma: req.body.sintoma,
    temperatura: req.body.temperatura,
    alergia: req.body.alergia,
    observacao: req.body.observacao,
    risco,
    status: "aguardando_medico",
    createdAt: new Date().toISOString()
  };

  // Atualiza o status do paciente na lista geral de atendimento
  const pac = db.pacientes.find(p => p.nome.toLowerCase() === req.body.nome.toLowerCase());
  if (pac) pac.status = "atendido_triagem";

  db.triagens.push(triagem);
  writeDB(db);

  res.json(triagem);
});

// LISTAR TRIAGENS
app.get("/triagens", (req, res) => {
  const db = readDB();
  res.json(db.triagens);
});

// ============ MÍDIA INDOOR - TV ============

app.post("/tv/chamar", (req, res) => {
  const db = readDB();

  const chamada = {
    id: Date.now().toString(),
    localTipo: req.body.localTipo,
    localNumero: req.body.localNumero,
    paciente: req.body.paciente,
    hora: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  };

  db.tv_chamada = chamada;
  db.tv_historico.unshift(chamada);
  if (db.tv_historico.length > 5) db.tv_historico.pop();

  writeDB(db);
  res.json(chamada);
});

app.get("/tv/chamada", (req, res) => {
  const db = readDB();
  res.json({
    chamada: db.tv_chamada,
    historico: db.tv_historico
  });
});

// LISTA DE MEDICAÇÕES CADASTRADAS
app.get("/lista-medicacoes", (req, res) => {
  res.json([
    "Dipirona",
    "Paracetamol",
    "Ibuprofeno",
    "Amoxicilina",
    "Azitromicina",
    "Loratadina",
    "Omeprazol",
    "Buscopan",
    "Dramin",
    "Soro fisiológico"
  ]);
});

// CONSULTA
app.post("/consulta", (req, res) => {
  const db = readDB();

  const consulta = {
    id: Date.now(),
    paciente: req.body.paciente,
    diagnostico: req.body.diagnostico,
    medicacao: req.body.medicacao,
    obs: req.body.obs,
    createdAt: new Date().toISOString()
  };

  // Remove o paciente da fila de triagem pendente após o atendimento do médico
  db.triagens = db.triagens.filter(t => t.nome.toLowerCase() !== req.body.paciente.toLowerCase());

  db.consultas.push(consulta);
  writeDB(db);

  res.json(consulta);
});

// MEDICAÇÕES PRESCRITAS
app.get("/medicacoes", (req, res) => {
  const db = readDB();
  res.json(db.consultas);
});

// START
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
