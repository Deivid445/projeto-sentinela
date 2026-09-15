const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();

app.use(express.json());
app.use(cors());

// Servir frontend se a pasta existir
const frontendPath = path.join(__dirname, "../frontend");
if (fs.existsSync(frontendPath)) {
  app.use(express.static(frontendPath));
} else {
  app.use(express.static(__dirname));
}

const DB_FILE = path.join(__dirname, "db.json");

// Estrutura inicial do banco
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

// Clone profundo para evitar vazamento de memória com initialData
let memoryDB = JSON.parse(JSON.stringify(initialData));
let isFileSystemWritable = true;

// Carrega o banco do disco na inicialização do servidor
function initDB() {
  if (fs.existsSync(DB_FILE)) {
    try {
      const fileData = fs.readFileSync(DB_FILE, "utf8");
      const db = JSON.parse(fileData);
      memoryDB = {
        usuarios: db.usuarios?.length ? db.usuarios : initialData.usuarios,
        pacientes: db.pacientes || [],
        triagens: db.triagens || [],
        consultas: db.consultas || [],
        tv_chamada: db.tv_chamada || null,
        tv_historico: db.tv_historico || []
      };
    } catch (err) {
      console.error("Erro ao carregar db.json inicial, mantendo memória padrão:", err);
    }
  } else {
    writeDB(memoryDB);
  }
}

function readDB() {
  // Se o disco estiver funcional, lê dele. Caso contrário, mantém a versão em memória.
  if (!isFileSystemWritable) return memoryDB;

  try {
    if (fs.existsSync(DB_FILE)) {
      const fileData = fs.readFileSync(DB_FILE, "utf8");
      memoryDB = JSON.parse(fileData);
    }
  } catch (err) {
    console.warn("Erro ao ler db.json em tempo de execução, usando dados da memória.");
  }

  return memoryDB;
}

function writeDB(data) {
  memoryDB = data;
  if (!isFileSystemWritable) return;

  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    isFileSystemWritable = false;
    console.warn("Aviso: Ambiente de leitura estrita detectado (Render/Heroku). Operando via RAM.");
  }
}

// Inicializa os dados
initDB();

// LOGIN
app.post("/login", (req, res) => {
  const { usuario, senha } = req.body;
  const db = readDB();

  const user = db.usuarios.find(u => u.usuario === usuario && u.senha === senha);

  if (!user) {
    return res.status(401).json({ erro: "Login inválido" });
  }

  res.json(user);
});

// ATENDIMENTO - Cadastrar paciente
app.post("/atendimento", (req, res) => {
  const { nome, cpf, tipo } = req.body;

  if (!nome) {
    return res.status(400).json({ erro: "Nome do paciente é obrigatório" });
  }

  const db = readDB();

  const paciente = {
    id: Date.now().toString(),
    nome: nome.trim(),
    cpf: cpf ? cpf.trim() : "",
    tipo: tipo || "Particular",
    status: "triagem",
    createdAt: new Date().toISOString()
  };

  db.pacientes.push(paciente);
  writeDB(db);

  res.status(201).json(paciente);
});

// LISTAR PACIENTES
app.get("/pacientes", (req, res) => {
  const db = readDB();
  res.json(db.pacientes);
});

// TRIAGEM
app.post("/triagem", (req, res) => {
  const { pacienteId, nome, sintoma, temperatura, alergia, observacao } = req.body;
  const tempNum = parseFloat(temperatura) || 0;
  const db = readDB();

  let risco = req.body.risco;

  if (tempNum >= 39) {
    risco = "vermelho";
  } else if (tempNum >= 38) {
    risco = "amarelo";
  } else if (!risco) {
    risco = "verde";
  }

  const triagem = {
    id: Date.now().toString(),
    pacienteId: pacienteId || null,
    nome: nome ? nome.trim() : "",
    sintoma,
    temperatura: tempNum,
    alergia,
    observacao,
    risco,
    status: "aguardando_medico",
    createdAt: new Date().toISOString()
  };

  // Busca por id preferencialmente, fallback para nome limpo
  const pac = db.pacientes.find(p => 
    (pacienteId && p.id === pacienteId) || 
    (nome && p.nome.toLowerCase().trim() === nome.toLowerCase().trim())
  );
  
  if (pac) pac.status = "atendido_triagem";

  db.triagens.push(triagem);
  writeDB(db);

  res.status(201).json(triagem);
});

// LISTAR TRIAGENS
app.get("/triagens", (req, res) => {
  const db = readDB();
  res.json(db.triagens);
});

// MÍDIA INDOOR - TV
app.post("/tv/chamar", (req, res) => {
  const { localTipo, localNumero, paciente } = req.body;
  const db = readDB();

  const chamada = {
    id: Date.now().toString(),
    localTipo,
    localNumero,
    paciente,
    hora: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  };

  db.tv_chamada = chamada;
  db.tv_historico.unshift(chamada);
  
  if (db.tv_historico.length > 5) {
    db.tv_historico = db.tv_historico.slice(0, 5);
  }

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
  const { paciente, diagnostico, medicacao, obs } = req.body;
  const db = readDB();

  const consulta = {
    id: Date.now().toString(),
    paciente: paciente ? paciente.trim() : "",
    diagnostico,
    medicacao,
    obs,
    createdAt: new Date().toISOString()
  };

  // Remove da lista de triagem pendente
  if (paciente) {
    const nomeLimpo = paciente.toLowerCase().trim();
    db.triagens = db.triagens.filter(t => t.nome.toLowerCase().trim() !== nomeLimpo);
  }

  db.consultas.push(consulta);
  writeDB(db);

  res.status(201).json(consulta);
});

// MEDICAÇÕES PRESCRITAS
app.get("/medicacoes", (req, res) => {
  const db = readDB();
  res.json(db.consultas);
});

// INICIALIZAÇÃO
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
