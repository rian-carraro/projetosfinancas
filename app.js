// =====================
// CURRENCY FORMATTING
// =====================
function formatCurrencyInput(el) {
  // Remove everything except digits
  let digits = el.value.replace(/\D/g, "");
  if (!digits) { el.value = ""; return; }
  // Pad to at least 3 digits so we always have cents
  while (digits.length < 3) digits = "0" + digits;
  const cents = parseInt(digits, 10);
  const reais = cents / 100;
  el.value = reais.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function parseCurrency(str) {
  if (!str) return 0;
  // Remove R$, dots (thousands), spaces — keep comma as decimal
  const clean = str.replace(/[R$\s.]/g, "").replace(",", ".");
  return parseFloat(clean) || 0;
}

// =====================
// SUPABASE
// =====================
const SB_URL = "https://alyzslzefohatbxbmnbb.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFseXpzbHplZm9oYXRieGJtbmJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMDU2NDksImV4cCI6MjA4OTU4MTY0OX0.H_y7gG3CrLusnCrdFYzkwdF5b_0a6mo8U9AY_YKhrr0";
const sb = supabase.createClient(SB_URL, SB_KEY);

// =====================
// CONSTANTS
// =====================
const CAT_COLORS    = ["#7F77DD","#1D9E75","#D85A30","#378ADD","#BA7517","#D4537E","#639922","#884F0B"];
const METHODS       = ["PIX","Cartão de crédito","Cartão de débito","Boleto","Dinheiro","À vista"];
const DEFAULT_CATS  = ["Alimentação","Transporte","Moradia","Saúde","Lazer","Educação","Salário","Freelance","Outros"];

const PAGES = [
  { id: "dashboard",    label: "Dashboard"     },
  { id: "lancamentos",  label: "Lançamentos"   },
  { id: "movimentacoes",label: "Movimentações" },
  { id: "bancos",       label: "Bancos"        },
  { id: "cartoes",      label: "Cartões"       },
  { id: "contas-fixas", label: "Contas Fixas"  },
  { id: "metas",        label: "Metas"         },
  { id: "categorias",   label: "Categorias"    },
];

// =====================
// HELPERS
// =====================
const fmt      = v  => "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today    = () => new Date().toISOString().split("T")[0];
const monthKey = d  => new Date(d).toLocaleString("pt-BR", { month: "short", year: "2-digit" });

// =====================
// STATE
// =====================
let state = {
  user:         null,
  page:         "dashboard",
  transactions: [],
  categories:   [],
  goals:        [],
  cards:        [],
  fixed:        [],
  banks:        [],
  filterMonth:  "",
  filterCat:    "",
  filterCard:   "",
  filterBank:   "",
};

// =====================
// AUTH
// =====================
function switchAuthTab(tab) {
  document.querySelectorAll(".auth-tab").forEach((t, i) => t.classList.toggle("active", (i === 0) === (tab === "login")));
  document.getElementById("auth-login").style.display    = tab === "login"    ? "block" : "none";
  document.getElementById("auth-register").style.display = tab === "register" ? "block" : "none";
}

async function doLogin() {
  const email    = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const errEl    = document.getElementById("login-error");
  errEl.textContent = "";

  if (!email || !password) { errEl.textContent = "Preencha email e senha."; return; }

  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) errEl.textContent = "Email ou senha incorretos.";
}

async function doRegister() {
  const name     = document.getElementById("reg-name").value.trim();
  const email    = document.getElementById("reg-email").value.trim();
  const password = document.getElementById("reg-password").value;
  const errEl    = document.getElementById("reg-error");
  errEl.textContent = "";

  if (!name || !email || !password) { errEl.textContent = "Preencha todos os campos."; return; }
  if (password.length < 6)          { errEl.textContent = "Senha deve ter pelo menos 6 caracteres."; return; }

  const { data, error } = await sb.auth.signUp({ email, password, options: { data: { name } } });
  if (error) { errEl.textContent = error.message; return; }

  // Criar categorias padrão para o novo usuário
  if (data.user) {
    const uid = data.user.id;
    await sb.from("categories").insert(DEFAULT_CATS.map(name => ({ name, user_id: uid })));
  }
}

async function doLogout() {
  await sb.auth.signOut();
}

// =====================
// SESSION LISTENER
// =====================
sb.auth.onAuthStateChange(async (event, session) => {
  if (session?.user) {
    state.user = session.user;
    document.getElementById("auth-screen").style.display = "none";
    document.getElementById("app").style.display         = "flex";
    document.getElementById("sidebar-user").textContent  = session.user.email;
    initTheme();
    await loadData();
    buildNav();
    render();
  } else {
    state.user = null;
    document.getElementById("auth-screen").style.display = "flex";
    document.getElementById("app").style.display         = "none";
    resetState();
  }
});

function resetState() {
  state.transactions = [];
  state.categories   = [];
  state.goals        = [];
  state.cards        = [];
  state.fixed        = [];
  state.banks        = [];
  state.page         = "dashboard";
}

// =====================
// DATA LOADING
// =====================
async function loadData() {
  const uid = state.user.id;
  const [r1, r2, r3, r4, r5, r6] = await Promise.all([
    sb.from("transactions")  .select("*").eq("user_id", uid).order("created_at", { ascending: false }),
    sb.from("categories")    .select("*").eq("user_id", uid).order("name"),
    sb.from("goals")         .select("*").eq("user_id", uid).order("created_at"),
    sb.from("cards")         .select("*").eq("user_id", uid).order("created_at"),
    sb.from("fixed_expenses").select("*").eq("user_id", uid).order("created_at"),
    sb.from("banks")         .select("*").eq("user_id", uid).order("created_at"),
  ]);
  state.transactions = r1.data || [];
  state.categories   = (r2.data || []).map(x => x.name);
  state.goals        = r3.data || [];
  state.cards        = r4.data || [];
  state.fixed        = r5.data || [];
  state.banks        = r6.data || [];
}

// =====================
// BANK BALANCE CALC
// =====================
function bankBalance(bank) {
  const txs = state.transactions.filter(t => t.bank_id === bank.id);
  const inc  = txs.filter(t => t.type === "receita").reduce((s, t) => s + parseFloat(t.amount), 0);
  const exp  = txs.filter(t => t.type === "despesa").reduce((s, t) => s + parseFloat(t.amount), 0);
  return parseFloat(bank.initial_balance) + inc - exp;
}

// =====================
// NAVIGATION
// =====================
function buildNav() {
  document.getElementById("nav").innerHTML = PAGES.map(p => `
    <div class="nav-item ${state.page === p.id ? "active" : ""}" onclick="goTo('${p.id}')">
      ${p.label}
    </div>
  `).join("");
}

function goTo(page) {
  state.page = page;
  buildNav();
  closeSidebar();
  document.getElementById("page-title").textContent = PAGES.find(p => p.id === page)?.label || "";
  render();
}

function render() {
  const p = state.page;
  if      (p === "dashboard")    renderDashboard();
  else if (p === "lancamentos")  renderLancamentos();
  else if (p === "movimentacoes")renderMovimentacoes();
  else if (p === "bancos")       renderBancos();
  else if (p === "cartoes")      renderCartoes();
  else if (p === "contas-fixas") renderContasFixas();
  else if (p === "metas")        renderMetas();
  else if (p === "categorias")   renderCategorias();
}

// =====================
// DASHBOARD
// =====================
function renderDashboard() {
  const txs        = state.transactions;
  const inc        = txs.filter(t => t.type === "receita").reduce((s, t) => s + parseFloat(t.amount), 0);
  const exp        = txs.filter(t => t.type === "despesa").reduce((s, t) => s + parseFloat(t.amount), 0);
  const bal        = inc - exp;
  const fixedTotal = state.fixed.reduce((s, f) => s + parseFloat(f.amount), 0);
  const totalBankBalance = state.banks.reduce((s, b) => s + bankBalance(b), 0);

  // Gráfico barras
  const months = {};
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const k = d.toLocaleString("pt-BR", { month: "short", year: "2-digit" });
    months[k] = { k, inc: 0, exp: 0 };
  }
  txs.forEach(t => {
    const k = monthKey(t.date);
    if (months[k]) { t.type === "receita" ? months[k].inc += parseFloat(t.amount) : months[k].exp += parseFloat(t.amount); }
  });
  const mArr = Object.values(months);
  const maxV = Math.max(...mArr.map(m => Math.max(m.inc, m.exp)), 1);

  // Categorias
  const expByCat = {};
  txs.filter(t => t.type === "despesa").forEach(t => { expByCat[t.category] = (expByCat[t.category] || 0) + parseFloat(t.amount); });
  const pieItems = Object.entries(expByCat).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const pieTotal = pieItems.reduce((s, x) => s + x[1], 0) || 1;

  document.getElementById("content").innerHTML = `
    <div class="summary-cards" style="grid-template-columns:repeat(4,1fr)">
      <div class="s-card">
        <div class="s-label">Saldo (transações)</div>
        <div class="s-value ${bal >= 0 ? "green" : "red"}">${fmt(bal)}</div>
        <div class="s-sub">todas as transações</div>
      </div>
      <div class="s-card">
        <div class="s-label">Saldo em bancos</div>
        <div class="s-value ${totalBankBalance >= 0 ? "green" : "red"}">${fmt(totalBankBalance)}</div>
        <div class="s-sub">${state.banks.length} banco(s)</div>
      </div>
      <div class="s-card">
        <div class="s-label">Receitas</div>
        <div class="s-value green">${fmt(inc)}</div>
      </div>
      <div class="s-card">
        <div class="s-label">Gastos</div>
        <div class="s-value red">${fmt(exp)}</div>
        <div class="s-sub">Fixas: ${fmt(fixedTotal)}/mês</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
      <div class="section">
        <div class="section-title">Últimos 6 meses</div>
        ${mArr.some(m => m.inc > 0 || m.exp > 0) ? `
          <div style="display:flex;align-items:flex-end;gap:4px;height:100px;margin-bottom:6px">
            ${mArr.map(m => `
              <div style="flex:1;display:flex;gap:2px;align-items:flex-end">
                <div style="flex:1;background:#1D9E75;border-radius:3px 3px 0 0;height:${Math.round((m.inc / maxV) * 95)}px;min-height:2px"></div>
                <div style="flex:1;background:#D85A30;border-radius:3px 3px 0 0;height:${Math.round((m.exp / maxV) * 95)}px;min-height:2px"></div>
              </div>`).join("")}
          </div>
          <div style="display:flex;justify-content:space-around;margin-bottom:8px">
            ${mArr.map(m => `<span style="font-size:10px;color:#444;flex:1;text-align:center">${m.k}</span>`).join("")}
          </div>
          <div style="display:flex;gap:12px;font-size:11px;color:#666">
            <span><span style="display:inline-block;width:8px;height:8px;background:#1D9E75;border-radius:2px;margin-right:4px"></span>Receitas</span>
            <span><span style="display:inline-block;width:8px;height:8px;background:#D85A30;border-radius:2px;margin-right:4px"></span>Gastos</span>
          </div>
        ` : `<div class="empty">Sem dados ainda</div>`}
      </div>

      <div class="section">
        <div class="section-title">Gastos por categoria</div>
        ${pieItems.length ? `
          <div style="display:flex;flex-direction:column;gap:8px">
            ${pieItems.map(([name, val], i) => `
              <div>
                <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">
                  <span style="color:#9a9db0">${name || "Sem categoria"}</span>
                  <span style="color:#e8e8e8">${Math.round((val / pieTotal) * 100)}%</span>
                </div>
                <div style="height:5px;background:#1e2030;border-radius:99px;overflow:hidden">
                  <div style="height:100%;width:${Math.round((val / pieTotal) * 100)}%;background:${CAT_COLORS[i % CAT_COLORS.length]};border-radius:99px"></div>
                </div>
              </div>`).join("")}
          </div>
        ` : `<div class="empty">Sem despesas</div>`}
      </div>
    </div>

    <div class="section">
      <div class="section-title">
        Movimentações recentes
        <button class="btn btn-secondary btn-sm" onclick="goTo('movimentacoes')">Ver todas</button>
      </div>
      ${txs.slice(0, 5).map(tx => txRow(tx)).join("") || `<div class="empty">Nenhuma transação</div>`}
    </div>
  `;
}

// =====================
// LANÇAMENTOS
// =====================
function renderLancamentos() {
  const catOptions  = state.categories.map(c => `<option value="${c}">${c}</option>`).join("");
  const cardOptions = state.cards.map(c => `<option value="${c.id}">${c.name}</option>`).join("");
  const bankOptions = state.banks.map(b => `<option value="${b.id}">${b.name}</option>`).join("");

  document.getElementById("content").innerHTML = `
    <div class="section">
      <div class="section-title">Lançar Movimento</div>
      <div class="form-grid">
        <div class="form-group">
          <label>Tipo</label>
          <select id="f-type" onchange="onTxTypeChange()">
            <option value="despesa">Despesa</option>
            <option value="receita">Receita</option>
          </select>
        </div>
        <div class="form-group"><label>Descrição</label><input id="f-desc" placeholder="Ex: Supermercado"></div>
        <div class="form-group"><label>Data</label><input id="f-date" type="date" value="${today()}"></div>
        <div class="form-group">
          <label>Valor (R$)</label>
          <input id="f-amount" type="text" inputmode="numeric" placeholder="R$ 0,00" oninput="formatCurrencyInput(this)">
        </div>
        <div class="form-group">
          <label>Categoria</label>
          <select id="f-cat"><option value="">-- nenhuma --</option>${catOptions}</select>
        </div>
        <div class="form-group">
          <label>Banco (opcional)</label>
          <select id="f-bank" onchange="onBankChange()">
            <option value="">-- nenhum --</option>${bankOptions}
          </select>
        </div>
        <div class="form-group" id="f-method-group">
          <label>Método de pagamento</label>
          <select id="f-method">
            <option value="">-- automático --</option>
            ${METHODS.map(m => `<option>${m}</option>`).join("")}
          </select>
        </div>
        <div class="form-group" id="f-card-group">
          <label>Cartão (opcional)</label>
          <select id="f-card" onchange="onCardChange()">
            <option value="">-- nenhum --</option>${cardOptions}
          </select>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" onclick="saveTx()">Salvar</button>
        <button class="btn btn-secondary" onclick="clearTxForm()">Limpar</button>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Últimos lançamentos</div>
      ${state.transactions.slice(0, 10).map(tx => txRow(tx)).join("") || `<div class="empty">Nenhuma transação</div>`}
    </div>
  `;
}

// Quando seleciona banco → tipo vira receita e bloqueia cartão
function onBankChange() {
  const bankId = document.getElementById("f-bank").value;
  const typeEl = document.getElementById("f-type");
  const cardGroup = document.getElementById("f-card-group");
  const methodGroup = document.getElementById("f-method-group");

  if (bankId) {
    typeEl.value = "receita";
    typeEl.disabled = true;
    // Limpa e desabilita cartão
    document.getElementById("f-card").value = "";
    cardGroup.style.opacity = "0.35";
    cardGroup.style.pointerEvents = "none";
    methodGroup.style.opacity = "0.35";
    methodGroup.style.pointerEvents = "none";
  } else {
    typeEl.disabled = false;
    cardGroup.style.opacity = "";
    cardGroup.style.pointerEvents = "";
    methodGroup.style.opacity = "";
    methodGroup.style.pointerEvents = "";
  }
}

// Quando seleciona cartão → limpa banco, só permite crédito ou débito
function onCardChange() {
  const cardId = document.getElementById("f-card").value;
  const bankEl = document.getElementById("f-bank");
  const methodEl = document.getElementById("f-method");
  const bankGroup = bankEl.closest(".form-group");

  if (cardId) {
    bankEl.value = "";
    bankGroup.style.opacity = "0.35";
    bankGroup.style.pointerEvents = "none";
    // Filtra método para só crédito/débito
    methodEl.innerHTML = `
      <option value="">-- selecione --</option>
      <option value="Cartão de crédito">Cartão de crédito</option>
      <option value="Cartão de débito">Cartão de débito</option>
    `;
  } else {
    bankGroup.style.opacity = "";
    bankGroup.style.pointerEvents = "";
    methodEl.innerHTML = `
      <option value="">-- automático --</option>
      ${METHODS.map(m => `<option>${m}</option>`).join("")}
    `;
  }
}

function onTxTypeChange() {
  // Se banco estava selecionado e mudou tipo, limpa banco
  const bankEl = document.getElementById("f-bank");
  if (bankEl && bankEl.value) {
    bankEl.value = "";
    onBankChange();
  }
}

// =====================
// MOVIMENTAÇÕES
// =====================
function renderMovimentacoes() {
  const months = [...new Set(state.transactions.map(t => monthKey(t.date)))];

  let txs = state.transactions;
  if (state.filterMonth) txs = txs.filter(t => monthKey(t.date) === state.filterMonth);
  if (state.filterCat)   txs = txs.filter(t => t.category === state.filterCat);
  if (state.filterCard)  txs = txs.filter(t => String(t.card_id) === String(state.filterCard));
  if (state.filterBank)  txs = txs.filter(t => String(t.bank_id) === String(state.filterBank));

  const inc = txs.filter(t => t.type === "receita").reduce((s, t) => s + parseFloat(t.amount), 0);
  const exp = txs.filter(t => t.type === "despesa").reduce((s, t) => s + parseFloat(t.amount), 0);

  document.getElementById("content").innerHTML = `
    <div class="filters">
      <select onchange="state.filterMonth=this.value;render()">
        <option value="">Todos os meses</option>
        ${months.map(m => `<option value="${m}" ${state.filterMonth === m ? "selected" : ""}>${m}</option>`).join("")}
      </select>
      <select onchange="state.filterCat=this.value;render()">
        <option value="">Todas as categorias</option>
        ${state.categories.map(c => `<option value="${c}" ${state.filterCat === c ? "selected" : ""}>${c}</option>`).join("")}
      </select>
      <select onchange="state.filterBank=this.value;render()">
        <option value="">Todos os bancos</option>
        ${state.banks.map(b => `<option value="${b.id}" ${String(state.filterBank) === String(b.id) ? "selected" : ""}>${b.name}</option>`).join("")}
      </select>
      <select onchange="state.filterCard=this.value;render()">
        <option value="">Todos os cartões</option>
        ${state.cards.map(c => `<option value="${c.id}" ${String(state.filterCard) === String(c.id) ? "selected" : ""}>${c.name}</option>`).join("")}
      </select>
    </div>

    <div class="summary-cards">
      <div class="s-card"><div class="s-label">Receitas</div><div class="s-value green" style="font-size:18px">${fmt(inc)}</div></div>
      <div class="s-card"><div class="s-label">Gastos</div><div class="s-value red" style="font-size:18px">${fmt(exp)}</div></div>
      <div class="s-card"><div class="s-label">Saldo</div><div class="s-value ${inc - exp >= 0 ? "green" : "red"}" style="font-size:18px">${fmt(inc - exp)}</div></div>
    </div>

    <div class="section">
      <div class="section-title">${txs.length} lançamento${txs.length !== 1 ? "s" : ""}</div>
      ${txs.map(tx => txRow(tx)).join("") || `<div class="empty">Nenhuma transação encontrada</div>`}
    </div>
  `;
}

// =====================
// BANCOS
// =====================
function renderBancos() {
  const totalBalance = state.banks.reduce((s, b) => s + bankBalance(b), 0);

  document.getElementById("content").innerHTML = `
    <div class="section">
      <div class="section-title">Novo Banco / Conta</div>
      <div class="form-grid">
        <div class="form-group"><label>Nome</label><input id="b-name" placeholder="Ex: Nubank, Itaú, Carteira..."></div>
        <div class="form-group"><label>Saldo inicial (R$)</label><input id="b-balance" type="text" inputmode="numeric" placeholder="R$ 0,00" oninput="formatCurrencyInput(this)"></div>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" onclick="saveBank()">Salvar Banco</button>
        <button class="btn btn-secondary" onclick="clearBankForm()">Limpar</button>
      </div>
    </div>

    ${state.banks.length ? `
      <div class="section">
        <div class="section-title">
          Saldo total em bancos
          <span class="s-value ${totalBalance >= 0 ? "green" : "red"}" style="font-size:16px">${fmt(totalBalance)}</span>
        </div>
        <div class="bank-grid">
          ${state.banks.map(b => {
            const bal  = bankBalance(b);
            const txs  = state.transactions.filter(t => t.bank_id === b.id);
            const inc  = txs.filter(t => t.type === "receita").reduce((s, t) => s + parseFloat(t.amount), 0);
            const exp  = txs.filter(t => t.type === "despesa").reduce((s, t) => s + parseFloat(t.amount), 0);
            return `
              <div class="bank-card">
                <div class="bank-card-header">
                  <div class="bank-card-name">${b.name}</div>
                  <button class="btn-icon" onclick="deleteBank(${b.id})">✕</button>
                </div>
                <div class="bank-card-label">Saldo atual</div>
                <div class="bank-card-balance ${bal >= 0 ? "green" : "red"}">${fmt(bal)}</div>
                <div class="bank-card-sub">
                  Inicial: ${fmt(b.initial_balance)} · +${fmt(inc)} / -${fmt(exp)}
                </div>
                <div style="margin-top:12px;display:flex;gap:6px">
                  <button class="btn btn-secondary btn-sm" onclick="quickDeposit(${b.id})">+ Depósito</button>
                  <button class="btn btn-secondary btn-sm" onclick="state.filterBank='${b.id}';goTo('movimentacoes')">Ver movimentos</button>
                </div>
              </div>
            `;
          }).join("")}
        </div>
      </div>
    ` : ""}

    ${state.banks.length === 0 ? `<div class="empty" style="padding:3rem">Nenhum banco cadastrado ainda.</div>` : ""}
  `;
}

// =====================
// CARTÕES
// =====================
function renderCartoes() {
  document.getElementById("content").innerHTML = `
    <div class="section">
      <div class="section-title">Novo Cartão</div>
      <div class="form-grid">
        <div class="form-group"><label>Nome</label><input id="c-name" placeholder="Ex: Nubank Crédito"></div>
        <div class="form-group">
          <label>Tipo</label>
          <select id="c-type">
            <option value="credito">Crédito</option>
            <option value="debito">Débito</option>
            <option value="pix">PIX</option>
            <option value="dinheiro">Dinheiro</option>
          </select>
        </div>
        <div class="form-group"><label>Limite (R$)</label><input id="c-limit" type="text" inputmode="numeric" placeholder="R$ 0,00" oninput="formatCurrencyInput(this)"></div>
        <div class="form-group"><label>Fechamento (dia)</label><input id="c-closing" type="number" min="1" max="31" placeholder="Ex: 20"></div>
        <div class="form-group"><label>Vencimento (dia)</label><input id="c-due" type="number" min="1" max="31" placeholder="Ex: 5"></div>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" onclick="saveCard()">Salvar Cartão</button>
        <button class="btn btn-secondary" onclick="clearCardForm()">Limpar</button>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Meus Cartões</div>
      ${state.cards.length ? `
        <div class="cards-grid">
          ${state.cards.map(c => `
            <div class="card-item">
              <div>
                <div class="card-name">${c.name}<span class="card-type-badge">${c.type}</span></div>
                <div class="card-detail">
                  ${c.limit_amount > 0 ? "Limite: " + fmt(c.limit_amount) : "Sem limite"}
                  ${c.closing_day ? " · Fecha dia " + c.closing_day : ""}
                  ${c.due_day     ? " · Vence dia " + c.due_day     : ""}
                </div>
              </div>
              <button class="btn-icon" onclick="deleteCard(${c.id})">✕</button>
            </div>
          `).join("")}
        </div>
      ` : `<div class="empty">Nenhum cartão cadastrado</div>`}
    </div>
  `;
}

// =====================
// CONTAS FIXAS
// =====================
function renderContasFixas() {
  const catOptions = state.categories.map(c => `<option value="${c}">${c}</option>`).join("");
  const total      = state.fixed.reduce((s, f) => s + parseFloat(f.amount), 0);

  document.getElementById("content").innerHTML = `
    <div class="section">
      <div class="section-title">Nova Conta Fixa</div>
      <div class="form-grid">
        <div class="form-group"><label>Descrição</label><input id="fx-desc" placeholder="Ex: Aluguel"></div>
        <div class="form-group"><label>Valor (R$)</label><input id="fx-amount" type="text" inputmode="numeric" placeholder="R$ 0,00" oninput="formatCurrencyInput(this)"></div>
        <div class="form-group"><label>Vencimento (dia)</label><input id="fx-due" type="number" min="1" max="31" placeholder="Ex: 10"></div>
        <div class="form-group">
          <label>Categoria</label>
          <select id="fx-cat"><option value="">-- nenhuma --</option>${catOptions}</select>
        </div>
        <div class="form-group">
          <label>Método de pagamento</label>
          <select id="fx-method">
            <option value="">-- nenhum --</option>
            ${METHODS.map(m => `<option>${m}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" onclick="saveFixed()">Salvar</button>
        <button class="btn btn-secondary" onclick="clearFixedForm()">Limpar</button>
      </div>
    </div>

    <div class="section">
      <div class="section-title">
        Contas Fixas
        <span style="font-size:13px;color:#D85A30;font-weight:400">${fmt(total)}/mês</span>
      </div>
      ${state.fixed.map(f => `
        <div class="fixed-item">
          <div>
            <div style="font-size:13.5px;font-weight:500">${f.description}</div>
            <div style="font-size:11px;color:#555;margin-top:2px">
              Vence dia ${f.due_day}
              ${f.category       ? " · " + f.category       : ""}
              ${f.payment_method ? " · " + f.payment_method : ""}
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:14px;font-weight:600;color:#D85A30">${fmt(f.amount)}</span>
            <button class="btn-icon" onclick="deleteFixed(${f.id})">✕</button>
          </div>
        </div>
      `).join("") || `<div class="empty">Nenhuma conta fixa cadastrada</div>`}
    </div>
  `;
}

// =====================
// METAS
// =====================
function renderMetas() {
  const bankOptions = state.banks.map(b => `<option value="${b.id}">${b.name}</option>`).join("");

  document.getElementById("content").innerHTML = `
    <div class="section">
      <div class="section-title">Nova Meta</div>
      <div class="form-grid">
        <div class="form-group"><label>Nome</label><input id="g-name" placeholder="Ex: Viagem para SP"></div>
        <div class="form-group"><label>Valor alvo (R$)</label><input id="g-target" type="text" inputmode="numeric" placeholder="R$ 0,00" oninput="formatCurrencyInput(this)"></div>
        <div class="form-group">
          <label>Banco vinculado (opcional)</label>
          <select id="g-bank"><option value="">-- nenhum --</option>${bankOptions}</select>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" onclick="saveGoal()">Salvar Meta</button>
        <button class="btn btn-secondary" onclick="clearGoalForm()">Limpar</button>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Minhas Metas</div>
      ${state.goals.length ? state.goals.map(g => {
        const pct  = Math.min(100, Math.round((parseFloat(g.saved) / parseFloat(g.target)) * 100));
        const bank = state.banks.find(b => b.id === g.bank_id);
        return `
          <div style="padding:14px 0;border-bottom:1px solid #1e2030">
            <div style="display:flex;justify-content:space-between;margin-bottom:7px;align-items:center">
              <div>
                <span style="font-size:14px;font-weight:500">${g.name}</span>
                ${bank ? `<span class="badge badge-bank" style="margin-left:8px">${bank.name}</span>` : ""}
              </div>
              <span style="font-size:12px;color:#666">${pct}% · ${fmt(g.saved)} de ${fmt(g.target)}</span>
            </div>
            <div style="height:7px;background:#1e2030;border-radius:99px;overflow:hidden;margin-bottom:10px">
              <div style="height:100%;width:${pct}%;background:${pct >= 100 ? "#1D9E75" : "#7F77DD"};border-radius:99px;transition:width .4s"></div>
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end">
              ${pct < 100
                ? `<button class="btn btn-secondary btn-sm" onclick="promptDeposit(${g.id})">+ Depositar</button>`
                : `<span style="color:#1D9E75;font-size:12px;font-weight:500">✓ Concluída!</span>`
              }
              <button class="btn btn-danger btn-sm" onclick="deleteGoal(${g.id})">Excluir</button>
            </div>
          </div>
        `;
      }).join("") : `<div class="empty">Nenhuma meta cadastrada</div>`}
    </div>
  `;
}

// =====================
// CATEGORIAS
// =====================
function renderCategorias() {
  document.getElementById("content").innerHTML = `
    <div class="section">
      <div class="section-title">Nova Categoria</div>
      <div class="form-grid">
        <div class="form-group"><label>Nome</label><input id="cat-name" placeholder="Ex: Academia"></div>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" onclick="saveCategory()">Salvar</button>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Categorias</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px">
        ${state.categories.map((cat, i) => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 12px;background:#0f1117;border:1px solid #2a2d3a;border-radius:8px">
            <div style="display:flex;align-items:center;gap:8px">
              <div style="width:9px;height:9px;border-radius:50%;background:${CAT_COLORS[i % CAT_COLORS.length]}"></div>
              <span style="font-size:13px">${cat}</span>
            </div>
            <button class="btn-icon" onclick="deleteCategory('${cat}')">✕</button>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

// =====================
// TX ROW COMPONENT
// =====================
function txRow(tx) {
  const card = state.cards.find(c => c.id === tx.card_id);
  const bank = state.banks.find(b => b.id === tx.bank_id);
  return `
    <div class="tx-row">
      <div class="tx-icon ${tx.type === "receita" ? "inc" : "exp"}">${tx.type === "receita" ? "↑" : "↓"}</div>
      <div class="tx-info">
        <div class="tx-name">${tx.description}</div>
        <div class="tx-sub">
          ${new Date(tx.date).toLocaleDateString("pt-BR")}
          ${tx.category       ? `<span class="badge badge-cat">${tx.category}</span>`          : ""}
          ${bank              ? `<span class="badge badge-bank">${bank.name}</span>`         : ""}
          ${tx.payment_method ? `<span class="badge badge-method">${tx.payment_method}</span>` : ""}
          ${card              ? `<span class="badge badge-method">${card.name}</span>`       : ""}
        </div>
      </div>
      <span class="tx-amount ${tx.type === "receita" ? "green" : "red"}">
        ${tx.type === "receita" ? "+" : "-"}${fmt(tx.amount)}
      </span>
      <button class="btn-icon" onclick="deleteTx(${tx.id})">✕</button>
    </div>
  `;
}

// =====================
// ACTIONS — TRANSACTIONS
// =====================
async function saveTx() {
  const uid            = state.user.id;
  const type           = document.getElementById("f-type").value;
  const description    = document.getElementById("f-desc").value.trim();
  const amount         = parseCurrency(document.getElementById("f-amount").value);
  const category       = document.getElementById("f-cat").value    || null;
  const date           = document.getElementById("f-date").value;
  const bank_id        = document.getElementById("f-bank").value   || null;
  const payment_method = document.getElementById("f-method").value || null;
  const card_id        = document.getElementById("f-card").value   || null;

  if (!description || !amount || !date) return alert("Preencha descrição, valor e data.");

  const { data, error } = await sb.from("transactions").insert([{
    user_id: uid, type, description, amount, category, date, payment_method,
    bank_id:  bank_id  ? parseInt(bank_id)  : null,
    card_id:  card_id  ? parseInt(card_id)  : null,
  }]).select().single();

  if (!error && data) { state.transactions.unshift(data); render(); }
  else if (error) alert("Erro: " + error.message);
}

function clearTxForm() {
  ["f-desc","f-amount"].forEach(id => document.getElementById(id).value = "");
  const bankEl = document.getElementById("f-bank");
  if (bankEl) { bankEl.value = ""; onBankChange(); }
  const cardEl = document.getElementById("f-card");
  if (cardEl) { cardEl.value = ""; onCardChange(); }
}

async function deleteTx(id) {
  await sb.from("transactions").delete().eq("id", id);
  state.transactions = state.transactions.filter(t => t.id !== id);
  render();
}

// =====================
// ACTIONS — BANKS
// =====================
async function saveBank() {
  const name            = document.getElementById("b-name").value.trim();
  const initial_balance = parseCurrency(document.getElementById("b-balance").value) || 0;

  if (!name) return alert("Informe o nome do banco.");

  const { data, error } = await sb.from("banks").insert([{ name, initial_balance, user_id: state.user.id }]).select().single();
  if (!error && data) { state.banks.push(data); render(); }
}

function clearBankForm() {
  document.getElementById("b-name").value    = "";
  document.getElementById("b-balance").value = "";
}

async function deleteBank(id) {
  await sb.from("banks").delete().eq("id", id);
  state.banks = state.banks.filter(b => b.id !== id);
  render();
}

async function quickDeposit(bankId) {
  const amtStr = prompt("Valor do depósito (R$):\nExemplo: 150,00");
  const amount = parseCurrency(amtStr);
  if (!amount || isNaN(amount)) return;

  const desc = prompt("Descrição (ex: Salário, Transferência):", "Depósito") || "Depósito";

  const { data, error } = await sb.from("transactions").insert([{
    user_id:     state.user.id,
    type:        "receita",
    description: desc,
    amount,
    date:        today(),
    bank_id:     bankId,
    category:    null,
  }]).select().single();

  if (!error && data) { state.transactions.unshift(data); render(); }
}

// =====================
// ACTIONS — CARDS
// =====================
async function saveCard() {
  const name         = document.getElementById("c-name").value.trim();
  const type         = document.getElementById("c-type").value;
  const limit_amount = parseCurrency(document.getElementById("c-limit").value) || 0;
  const closing_day  = parseInt(document.getElementById("c-closing").value)   || null;
  const due_day      = parseInt(document.getElementById("c-due").value)       || null;

  if (!name) return alert("Informe o nome do cartão.");

  const { data, error } = await sb.from("cards").insert([{ name, type, limit_amount, closing_day, due_day, user_id: state.user.id }]).select().single();
  if (!error && data) { state.cards.push(data); render(); }
}

function clearCardForm() { document.getElementById("c-name").value = ""; }

async function deleteCard(id) {
  await sb.from("cards").delete().eq("id", id);
  state.cards = state.cards.filter(c => c.id !== id);
  render();
}

// =====================
// ACTIONS — FIXED
// =====================
async function saveFixed() {
  const description    = document.getElementById("fx-desc").value.trim();
  const amount         = parseCurrency(document.getElementById("fx-amount").value);
  const due_day        = parseInt(document.getElementById("fx-due").value)    || 1;
  const category       = document.getElementById("fx-cat").value    || null;
  const payment_method = document.getElementById("fx-method").value || null;

  if (!description || !amount) return alert("Preencha descrição e valor.");

  const { data, error } = await sb.from("fixed_expenses").insert([{ description, amount, due_day, category, payment_method, user_id: state.user.id }]).select().single();
  if (!error && data) { state.fixed.push(data); render(); }
}

function clearFixedForm() {
  ["fx-desc","fx-amount"].forEach(id => document.getElementById(id).value = "");
}

async function deleteFixed(id) {
  await sb.from("fixed_expenses").delete().eq("id", id);
  state.fixed = state.fixed.filter(f => f.id !== id);
  render();
}

// =====================
// ACTIONS — GOALS
// =====================
async function saveGoal() {
  const name    = document.getElementById("g-name").value.trim();
  const target  = parseCurrency(document.getElementById("g-target").value);
  const bank_id = document.getElementById("g-bank").value || null;

  if (!name || !target) return alert("Preencha nome e valor alvo.");

  const { data, error } = await sb.from("goals").insert([{
    name, target, saved: 0,
    user_id: state.user.id,
    bank_id: bank_id ? parseInt(bank_id) : null,
  }]).select().single();

  if (!error && data) { state.goals.push(data); render(); }
}

function clearGoalForm() {
  ["g-name","g-target"].forEach(id => document.getElementById(id).value = "");
}

async function deleteGoal(id) {
  await sb.from("goals").delete().eq("id", id);
  state.goals = state.goals.filter(g => g.id !== id);
  render();
}

async function promptDeposit(id) {
  const goal    = state.goals.find(g => g.id === id);
  const amtStr  = prompt("Quanto você guardou? (R$)\nExemplo: 150,00");
  const amount  = parseCurrency(amtStr);
  if (!amount || isNaN(amount)) return;

  const newSaved = Math.min(parseFloat(goal.target), parseFloat(goal.saved) + amount);

  // Atualizar meta
  await sb.from("goals").update({ saved: newSaved }).eq("id", id);
  goal.saved = newSaved;

  // Se a meta tem banco vinculado, registrar como receita no banco
  if (goal.bank_id) {
    const bank = state.banks.find(b => b.id === goal.bank_id);
    const { data } = await sb.from("transactions").insert([{
      user_id:     state.user.id,
      type:        "receita",
      description: `Depósito na meta: ${goal.name}`,
      amount,
      date:        today(),
      bank_id:     goal.bank_id,
      category:    null,
    }]).select().single();
    if (data) state.transactions.unshift(data);
  }

  render();
}

// =====================
// ACTIONS — CATEGORIES
// =====================
async function saveCategory() {
  const name = document.getElementById("cat-name").value.trim();
  if (!name || state.categories.includes(name)) return;

  const { error } = await sb.from("categories").insert([{ name, user_id: state.user.id }]);
  if (!error) {
    state.categories.push(name);
    state.categories.sort();
    render();
  }
}

async function deleteCategory(name) {
  await sb.from("categories").delete().eq("name", name).eq("user_id", state.user.id);
  state.categories = state.categories.filter(c => c !== name);
  render();
}


// =====================
// THEME
// =====================
function toggleTheme() {
  const isDark = document.body.classList.toggle("light-mode");
  const btn = document.getElementById("theme-btn");
  btn.textContent = isDark ? "Modo escuro" : "Modo claro";
  localStorage.setItem("theme", isDark ? "light" : "dark");
}

function initTheme() {
  const saved = localStorage.getItem("theme");
  if (saved === "light") {
    document.body.classList.add("light-mode");
    const btn = document.getElementById("theme-btn");
    if (btn) btn.textContent = "Modo escuro";
  }
}

// =====================
// SIDEBAR MOBILE
// =====================
function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("open");
  document.getElementById("overlay").classList.toggle("open");
}

function closeSidebar() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("overlay").classList.remove("open");
}
