// =====================
// CURRENCY FORMATTING
// =====================
function formatCurrencyInput(el) {
  let digits = el.value.replace(/\D/g, "");
  if (!digits) { el.value = ""; return; }
  while (digits.length < 3) digits = "0" + digits;
  const reais = parseInt(digits, 10) / 100;
  el.value = reais.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function parseCurrency(str) {
  if (!str) return 0;
  const clean = str.replace(/[R$\s.]/g, "").replace(",", ".");
  return parseFloat(clean) || 0;
}

// =====================
// SUPABASE
// =====================
const SB_URL = "https://alyzslzefohatbxbmnbb.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFseXpzbHplZm9oYXRieGJtbmJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMDU2NDksImV4cCI6MjA4OTU4MTY0OX0.H_y7gG3CrLusnCrdFYzkwdF5b_0a6mo8U9AY_YKhrr0";
const sb = supabase.createClient(SB_URL, SB_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // localStorage padrão — confiável em todos os ambientes
  }
});

// Apaga a sessão quando a aba/janela é fechada (não no F5)
// beforeunload dispara nos dois casos, então usamos uma flag de navegação
sessionStorage.setItem("tab_active", "1");
window.addEventListener("beforeunload", () => {
  // Se a flag sumiu, significa que é um fechamento real (não F5)
  // Mas beforeunload não distingue F5 de fechar — usamos pagehide + visibilitychange
});

// pageshow com persisted=false = primeira carga real (não F5 de cache)
// Usamos sessionStorage para detectar se é uma nova aba ou F5
const isNewTab = !sessionStorage.getItem("session_exists");
if (isNewTab) {
  // Nova aba/janela — apaga a sessão do Supabase do localStorage
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith("sb-") || key.includes("supabase")) {
      localStorage.removeItem(key);
    }
  });
}
// Marca que esta aba já existe (sobrevive ao F5)
sessionStorage.setItem("session_exists", "1");

// =====================
// CONSTANTS
// =====================
const CAT_COLORS   = ["#7F77DD","#1D9E75","#D85A30","#378ADD","#BA7517","#D4537E","#639922","#884F0B"];
const METHODS      = ["PIX","Cartão de crédito","Cartão de débito","Boleto","Dinheiro","À vista"];
const DEFAULT_CATS = ["Alimentação","Transporte","Moradia","Saúde","Lazer","Educação","Salário","Freelance","Outros"];

const PAGES = [
  { id: "dashboard",    label: "Dashboard"     },
  { id: "lancamentos",  label: "Lançamentos"   },
  { id: "movimentacoes",label: "Movimentações" },
  { id: "bancos",       label: "Bancos"        },
  { id: "cartoes",      label: "Cartões"       },
  { id: "contas-fixas", label: "Contas Fixas"  },
  { id: "metas",        label: "Metas"         },
  { id: "boletos",      label: "Boletos"       },
  { id: "categorias",   label: "Categorias"    },
];

// =====================
// HELPERS
// =====================
const fmt      = v  => "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today    = () => new Date().toISOString().split("T")[0];
const monthKey = d  => new Date(d).toLocaleString("pt-BR", { month: "short", year: "2-digit" });

// Calcula a data da primeira parcela com base na data de compra e dia de fechamento do cartão
function calcFirstInstallmentDate(purchaseDate, closingDay, dueDay) {
  // Parse sem timezone — YYYY-MM-DD direto
  const [year, month, day] = purchaseDate.split("-").map(Number);

  // Regra: se comprou ANTES do fechamento → vence neste mês
  //        se comprou NO dia ou APÓS      → fatura já fechou, vence no próximo mês
  // Ex: fecha dia 1, comprou 20/03 → 20 >= 1 → vence em abril
  // Ex: fecha dia 28, comprou 20/03 → 20 < 28 → vence em março
  let vencMonth = day < closingDay ? month : month + 1;
  let vencYear  = year;

  if (vencMonth > 12) { vencMonth -= 12; vencYear += 1; }

  const mm = String(vencMonth).padStart(2, "0");
  const dd = String(dueDay).padStart(2, "0");
  return `${vencYear}-${mm}-${dd}`;
}

// =====================
// STATE
// =====================
let state = {
  userId:       null,  // FIX: usar userId separado do objeto user
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
  boletos:      [],
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
  if (password.length < 6) { errEl.textContent = "Senha deve ter pelo menos 6 caracteres."; return; }

  const { data, error } = await sb.auth.signUp({ email, password, options: { data: { name } } });
  if (error) { errEl.textContent = error.message; return; }

  if (data.user) {
    const uid = data.user.id;
    await sb.from("categories").insert(DEFAULT_CATS.map(n => ({ name: n, user_id: uid })));
  }
}

async function doLogout() {
  await sb.auth.signOut();
}

// =====================
// SESSION LISTENER — FIX: só recarrega dados no SIGNED_IN, ignora TOKEN_REFRESHED etc.
// =====================
// Função central que inicia o app com um usuário autenticado
async function startApp(user) {
  if (state.userId === user.id && state.categories.length > 0) {
    // Já carregado (ex: TOKEN_REFRESHED) — só garante que o app está visível
    document.getElementById("auth-screen").style.display = "none";
    document.getElementById("app").style.display         = "flex";
    buildNav();
    render();
    return;
  }

  state.userId = user.id;
  document.getElementById("auth-screen").style.display = "none";
  document.getElementById("app").style.display         = "flex";
  document.getElementById("sidebar-user").textContent  = user.email;
  document.getElementById("content").innerHTML         = '<div class="loading-state">Carregando dados...</div>';
  initTheme();

  const ok = await loadData();
  if (!ok) {
    document.getElementById("content").innerHTML =
      '<div class="loading-state" style="color:#D85A30">Erro ao carregar dados.<br>Verifique sua conexão e atualize a página.</div>';
    return;
  }

  buildNav();
  render();
}

function showLogin() {
  state.userId = null;
  resetState();
  document.getElementById("auth-screen").style.display = "flex";
  document.getElementById("app").style.display         = "none";
}

// Inicia o app — verifica sessão existente primeiro, depois escuta eventos
(async () => {
  try {
    const { data } = await sb.auth.getSession();
    if (data?.session?.user) {
      await startApp(data.session.user);
      return;
    }
  } catch(e) {
    console.warn("getSession error:", e);
  }
  showLogin();
})();

sb.auth.onAuthStateChange(async (event, session) => {
  if (event === "SIGNED_IN" && session?.user) {
    await startApp(session.user);
  } else if (event === "SIGNED_OUT") {
    showLogin();
  }
});

function resetState() {
  state.transactions = [];
  state.categories   = [];
  state.goals        = [];
  state.cards        = [];
  state.fixed        = [];
  state.banks        = [];
  state.boletos      = [];
  state.page         = "dashboard";
}

// =====================
// DATA LOADING
// =====================
async function loadData() {
  const uid = state.userId;
  if (!uid) return false;
  try {
    const [r1, r2, r3, r4, r5, r6] = await Promise.all([
      sb.from("transactions")  .select("*").eq("user_id", uid).order("created_at", { ascending: false }),
      sb.from("categories")    .select("*").eq("user_id", uid).order("name"),
      sb.from("goals")         .select("*").eq("user_id", uid).order("created_at"),
      sb.from("cards")         .select("*").eq("user_id", uid).order("created_at"),
      sb.from("fixed_expenses").select("*").eq("user_id", uid).order("created_at"),
      sb.from("banks")         .select("*").eq("user_id", uid).order("created_at"),
    ]);
    state.transactions = r1.data || [];
    state.categories   = (r2.data || []).map(x => ({ id: x.id, name: x.name }));
    state.goals        = r3.data || [];
    state.cards        = r4.data || [];
    state.fixed        = r5.data || [];
    state.banks        = r6.data || [];

    // Boletos separado — não quebra o app se a tabela tiver problema
    try {
      const r7 = await sb.from("boletos").select("*").eq("user_id", uid).eq("paid", false).order("due_date");
      state.boletos = r7.data || [];
    } catch (e) {
      state.boletos = [];
    }

    return true;
  } catch (e) {
    console.error("Erro ao carregar dados:", e);
    return false;
  }
}

// =====================
// BANK BALANCE CALC
// =====================
function bankBalance(bank) {
  const bankId = Number(bank.id);
  const txs = state.transactions.filter(t => Number(t.bank_id) === bankId);
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
  else if (p === "boletos")      renderBoletos();
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

  const expByCat = {};
  txs.filter(t => t.type === "despesa").forEach(t => { expByCat[t.category] = (expByCat[t.category] || 0) + parseFloat(t.amount); });
  const pieItems = Object.entries(expByCat).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const pieTotal = pieItems.reduce((s, x) => s + x[1], 0) || 1;

  const boletosHoje    = state.boletos.filter(b => b.due_date === today());
  const boletosVencidos = state.boletos.filter(b => b.due_date < today());
  const alertBoletos = (boletosHoje.length || boletosVencidos.length) ? `
    <div style="background:#1a1a1a;border:1px solid #E24B4A;border-radius:12px;padding:14px 18px;margin-bottom:1.2rem;display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-size:14px;font-weight:500;color:#D85A30">
          ${boletosHoje.length ? `${boletosHoje.length} boleto(s) vencendo hoje` : ""}
          ${boletosHoje.length && boletosVencidos.length ? " · " : ""}
          ${boletosVencidos.length ? `${boletosVencidos.length} boleto(s) vencido(s)` : ""}
        </div>
        <div style="font-size:12px;color:#884F0B;margin-top:3px">Acesse a página de boletos para pagar</div>
      </div>
      <button class="btn btn-sm" style="border-color:#D85A30;color:#D85A30" onclick="goTo('boletos')">Ver boletos</button>
    </div>
  ` : "";

  document.getElementById("content").innerHTML = alertBoletos + `
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
                <div style="flex:1;background:#1D9E75;border-radius:3px 3px 0 0;height:${Math.round((m.inc/maxV)*95)}px;min-height:2px"></div>
                <div style="flex:1;background:#D85A30;border-radius:3px 3px 0 0;height:${Math.round((m.exp/maxV)*95)}px;min-height:2px"></div>
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
                  <span style="color:#e8e8e8">${Math.round((val/pieTotal)*100)}%</span>
                </div>
                <div style="height:5px;background:#1e2030;border-radius:99px;overflow:hidden">
                  <div style="height:100%;width:${Math.round((val/pieTotal)*100)}%;background:${CAT_COLORS[i%CAT_COLORS.length]};border-radius:99px"></div>
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
  const catOptions  = state.categories.map(c => `<option value="${c.name}">${c.name}</option>`).join("");
  const cardOptions = state.cards.map(c => `<option value="${c.id}">${c.name}</option>`).join("");
  const bankOptions = state.banks.map(b => `<option value="${b.id}">${b.name}</option>`).join("");

  document.getElementById("content").innerHTML = `
    <div class="section">
      <div class="section-title">Lançar Movimento</div>
      <div class="form-grid">
        <div class="form-group">
          <label>Tipo *</label>
          <select id="f-type" onchange="onTxTypeChange()" required>
            <option value="despesa">Despesa</option>
            <option value="receita">Receita</option>
          </select>
        </div>
        <div class="form-group">
          <label>Descrição *</label>
          <input id="f-desc" placeholder="Ex: Supermercado" required>
        </div>
        <div class="form-group">
          <label>Data *</label>
          <input id="f-date" type="date" value="${today()}" required>
        </div>
        <div class="form-group">
          <label>Valor (R$) *</label>
          <input id="f-amount" type="text" inputmode="numeric" placeholder="R$ 0,00" oninput="formatCurrencyInput(this)" required>
        </div>
        <div class="form-group">
          <label>Categoria</label>
          <select id="f-cat"><option value="">-- nenhuma --</option>${catOptions}</select>
        </div>
        <div class="form-group" id="f-bank-group">
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
        <div class="form-group" id="f-installments-group" style="display:none">
          <label>Número de parcelas *</label>
          <input id="f-installments" type="text" inputmode="numeric" placeholder="Ex: 3" oninput="this.value=this.value.replace(/\D/g,'')">
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

// Quando seleciona banco → tipo vira receita, bloqueia cartão e parcelas
function onBankChange() {
  const bankId = document.getElementById("f-bank").value;
  const typeEl = document.getElementById("f-type");
  const cardGroup = document.getElementById("f-card-group");
  const methodGroup = document.getElementById("f-method-group");
  const installGroup = document.getElementById("f-installments-group");
  if (bankId) {
    if (typeEl)        { typeEl.value = "receita"; typeEl.disabled = true; }
    const cardEl = document.getElementById("f-card");
    if (cardEl)        cardEl.value = "";
    if (cardGroup)     { cardGroup.style.opacity = "0.35"; cardGroup.style.pointerEvents = "none"; }
    if (methodGroup)   { methodGroup.style.opacity = "0.35"; methodGroup.style.pointerEvents = "none"; }
    if (installGroup)  installGroup.style.display = "none";
  } else {
    if (typeEl)        typeEl.disabled = false;
    if (cardGroup)     { cardGroup.style.opacity = ""; cardGroup.style.pointerEvents = ""; }
    if (methodGroup)   { methodGroup.style.opacity = ""; methodGroup.style.pointerEvents = ""; }
  }
}

// Quando seleciona cartão → limpa banco, mostra parcelas, filtra métodos
function onCardChange() {
  const cardId      = document.getElementById("f-card")?.value;
  const bankEl      = document.getElementById("f-bank");
  const methodEl    = document.getElementById("f-method");
  const bankGroup   = document.getElementById("f-bank-group");
  const installGroup = document.getElementById("f-installments-group");
  if (!cardId || !bankEl || !methodEl) return;

  if (cardId) {
    bankEl.value = "";
    if (bankGroup)    { bankGroup.style.opacity = "0.35"; bankGroup.style.pointerEvents = "none"; }
    methodEl.innerHTML = `
      <option value="">-- selecione --</option>
      <option value="Cartão de crédito">Cartão de crédito</option>
      <option value="Cartão de débito">Cartão de débito</option>
    `;
    if (installGroup) installGroup.style.display = "flex";
  } else {
    if (bankGroup)    { bankGroup.style.opacity = ""; bankGroup.style.pointerEvents = ""; }
    methodEl.innerHTML = `
      <option value="">-- automático --</option>
      ${METHODS.map(m => `<option>${m}</option>`).join("")}
    `;
    if (installGroup) installGroup.style.display = "none";
  }
}

function onTxTypeChange() {
  const bankEl = document.getElementById("f-bank");
  if (bankEl && bankEl.value) { bankEl.value = ""; onBankChange(); }
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
        ${months.map(m => `<option value="${m}" ${state.filterMonth===m?"selected":""}>${m}</option>`).join("")}
      </select>
      <select onchange="state.filterCat=this.value;render()">
        <option value="">Todas as categorias</option>
        ${state.categories.map(c => `<option value="${c.name}" ${state.filterCat===c.name?"selected":""}>${c.name}</option>`).join("")}
      </select>
      <select onchange="state.filterBank=this.value;render()">
        <option value="">Todos os bancos</option>
        ${state.banks.map(b => `<option value="${b.id}" ${String(state.filterBank)===String(b.id)?"selected":""}>${b.name}</option>`).join("")}
      </select>
      <select onchange="state.filterCard=this.value;render()">
        <option value="">Todos os cartões</option>
        ${state.cards.map(c => `<option value="${c.id}" ${String(state.filterCard)===String(c.id)?"selected":""}>${c.name}</option>`).join("")}
      </select>
    </div>
    <div class="summary-cards">
      <div class="s-card"><div class="s-label">Receitas</div><div class="s-value green" style="font-size:18px">${fmt(inc)}</div></div>
      <div class="s-card"><div class="s-label">Gastos</div><div class="s-value red" style="font-size:18px">${fmt(exp)}</div></div>
      <div class="s-card"><div class="s-label">Saldo</div><div class="s-value ${inc-exp>=0?"green":"red"}" style="font-size:18px">${fmt(inc-exp)}</div></div>
    </div>
    <div class="section">
      <div class="section-title">${txs.length} lançamento${txs.length!==1?"s":""}</div>
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
        <div class="form-group">
          <label>Nome *</label>
          <input id="b-name" placeholder="Ex: Nubank, Itaú, Carteira...">
        </div>
        <div class="form-group">
          <label>Saldo inicial (R$)</label>
          <input id="b-balance" type="text" inputmode="numeric" placeholder="R$ 0,00" oninput="formatCurrencyInput(this)">
        </div>
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
          <span class="s-value ${totalBalance>=0?"green":"red"}" style="font-size:16px">${fmt(totalBalance)}</span>
        </div>
        <div class="bank-grid">
          ${state.banks.map(b => {
            const bal = bankBalance(b);
            const txs = state.transactions.filter(t => t.bank_id === b.id);
            const inc = txs.filter(t => t.type==="receita").reduce((s,t) => s+parseFloat(t.amount), 0);
            const exp = txs.filter(t => t.type==="despesa").reduce((s,t) => s+parseFloat(t.amount), 0);
            return `
              <div class="bank-card">
                <div class="bank-card-header">
                  <div class="bank-card-name">${b.name}</div>
                  <button class="btn-icon" onclick="deleteBank(${b.id})">✕</button>
                </div>
                <div class="bank-card-label">Saldo atual</div>
                <div class="bank-card-balance ${bal>=0?"green":"red"}">${fmt(bal)}</div>
                <div class="bank-card-sub">Inicial: ${fmt(b.initial_balance)} · +${fmt(inc)} / -${fmt(exp)}</div>
                <div style="margin-top:12px;display:flex;gap:6px">
                  <button class="btn btn-secondary btn-sm" onclick="quickDeposit(${b.id})">+ Depósito</button>
                  <button class="btn btn-secondary btn-sm" onclick="state.filterBank='${b.id}';goTo('movimentacoes')">Ver movimentos</button>
                </div>
              </div>
            `;
          }).join("")}
        </div>
      </div>
    ` : `<div class="empty" style="padding:3rem">Nenhum banco cadastrado ainda.</div>`}
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
        <div class="form-group">
          <label>Nome *</label>
          <input id="c-name" placeholder="Ex: Nubank Crédito">
        </div>
        <div class="form-group">
          <label>Tipo *</label>
          <select id="c-type">
            <option value="credito">Crédito</option>
            <option value="debito">Débito</option>
            <option value="pix">PIX</option>
            <option value="dinheiro">Dinheiro</option>
          </select>
        </div>
        <div class="form-group">
          <label>Cor do cartão</label>
          <div style="display:flex;align-items:center;gap:8px">
            <input type="color" id="c-color" value="#7F77DD" style="width:40px;height:36px;padding:2px;border-radius:8px;border:1px solid #2a2d3a;background:#0f1117;cursor:pointer">
            <span id="c-color-label" style="font-size:12px;color:#666">#7F77DD</span>
          </div>
        </div>
        <div class="form-group">
          <label>Limite (R$)</label>
          <input id="c-limit" type="text" inputmode="numeric" placeholder="R$ 0,00" oninput="formatCurrencyInput(this)">
        </div>
        <div class="form-group">
          <label>Fechamento (dia) *</label>
          <input id="c-closing" type="text" inputmode="numeric" placeholder="Ex: 28" oninput="this.value=this.value.replace(/\D/g,'')">
        </div>
        <div class="form-group">
          <label>Vencimento (dia) *</label>
          <input id="c-due" type="text" inputmode="numeric" placeholder="Ex: 5" oninput="this.value=this.value.replace(/\D/g,'')">
        </div>
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
            <div class="card-item" style="border-left:4px solid ${c.color || "#7F77DD"}">
              <div>
                <div class="card-name">
                  <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${c.color || "#7F77DD"};margin-right:6px"></span>
                  ${c.name}
                  <span class="card-type-badge">${c.type}</span>
                </div>
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

  // Atualiza label de cor ao mover o color picker
  const colorInput = document.getElementById("c-color");
  const colorLabel = document.getElementById("c-color-label");
  if (colorInput && colorLabel) {
    colorInput.addEventListener("input", () => { colorLabel.textContent = colorInput.value; });
  }
}

// =====================
// CONTAS FIXAS
// =====================
function renderContasFixas() {
  const catOptions = state.categories.map(c => `<option value="${c.name}">${c.name}</option>`).join("");
  const total      = state.fixed.reduce((s, f) => s + parseFloat(f.amount), 0);

  document.getElementById("content").innerHTML = `
    <div class="section">
      <div class="section-title">Nova Conta Fixa</div>
      <div class="form-grid">
        <div class="form-group">
          <label>Descrição *</label>
          <input id="fx-desc" placeholder="Ex: Aluguel">
        </div>
        <div class="form-group">
          <label>Valor (R$) *</label>
          <input id="fx-amount" type="text" inputmode="numeric" placeholder="R$ 0,00" oninput="formatCurrencyInput(this)">
        </div>
        <div class="form-group">
          <label>Vencimento (dia) *</label>
          <input id="fx-due" type="text" inputmode="numeric" placeholder="Ex: 10" oninput="this.value=this.value.replace(/\D/g,'')">
        </div>
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
        <div class="form-group">
          <label>Nome *</label>
          <input id="g-name" placeholder="Ex: Viagem para SP">
        </div>
        <div class="form-group">
          <label>Valor alvo (R$) *</label>
          <input id="g-target" type="text" inputmode="numeric" placeholder="R$ 0,00" oninput="formatCurrencyInput(this)">
        </div>
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
        const pct  = Math.min(100, Math.round((parseFloat(g.saved)/parseFloat(g.target))*100));
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
              <div style="height:100%;width:${pct}%;background:${pct>=100?"#1D9E75":"#7F77DD"};border-radius:99px;transition:width .4s"></div>
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end">
              ${pct < 100
                ? `<button class="btn btn-secondary btn-sm" onclick="promptDeposit(${g.id})">+ Depositar</button>`
                : `<span style="color:#1D9E75;font-size:12px;font-weight:500">Concluída!</span>`
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
// BOLETOS
// =====================
function renderBoletos() {
  const hoje = today();
  const vencendoHoje  = state.boletos.filter(b => b.due_date === hoje);
  const vencendoBreve = state.boletos.filter(b => b.due_date > hoje);
  const vencidos      = state.boletos.filter(b => b.due_date < hoje);

  document.getElementById("content").innerHTML = `
    <div class="section">
      <div class="section-title">Novo Boleto</div>
      <div class="form-grid">
        <div class="form-group">
          <label>Descrição *</label>
          <input id="bol-desc" placeholder="Ex: Conta de luz">
        </div>
        <div class="form-group">
          <label>Valor (R$) *</label>
          <input id="bol-amount" type="text" inputmode="numeric" placeholder="R$ 0,00" oninput="formatCurrencyInput(this)">
        </div>
        <div class="form-group">
          <label>Vencimento *</label>
          <input id="bol-date" type="date" value="${hoje}">
        </div>
        <div class="form-group">
          <label>Código de barras (opcional)</label>
          <input id="bol-barcode" placeholder="000.00000 00000.000000 00000.000000 0 00000000000000">
        </div>
        <div class="form-group">
          <label>Arquivo (PDF ou imagem, opcional)</label>
          <label for="bol-file" id="bol-file-label" style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:#0f1117;border:1px solid #2a2d3a;border-radius:8px;cursor:pointer;font-size:13px;color:#9a9db0;transition:border-color .15s" onmouseover="this.style.borderColor='#7F77DD'" onmouseout="this.style.borderColor='#2a2d3a'">
            <span style="background:#7F77DD;color:#fff;padding:4px 12px;border-radius:6px;font-size:12px;font-weight:500;white-space:nowrap">Escolher arquivo</span>
            <span id="bol-file-name" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Nenhum arquivo selecionado</span>
          </label>
          <input id="bol-file" type="file" accept=".pdf,image/*" style="display:none" onchange="document.getElementById('bol-file-name').textContent = this.files[0]?.name || 'Nenhum arquivo selecionado'">
        </div>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" onclick="saveBoleto()">Salvar Boleto</button>
        <button class="btn btn-secondary" onclick="clearBoletoForm()">Limpar</button>
      </div>
    </div>

    ${vencendoHoje.length ? `
    <div class="section" style="border-color:#BA7517">
      <div class="section-title" style="color:#BA7517">Vencendo hoje (${vencendoHoje.length})</div>
      ${vencendoHoje.map(b => boletoRow(b, "hoje")).join("")}
    </div>` : ""}

    ${vencidos.length ? `
    <div class="section" style="border-color:#A32D2D">
      <div class="section-title" style="color:#E24B4A">Vencidos (${vencidos.length})</div>
      ${vencidos.map(b => boletoRow(b, "vencido")).join("")}
    </div>` : ""}

    <div class="section">
      <div class="section-title">
        Próximos boletos
        ${vencendoBreve.length === 0 && vencidos.length === 0 && vencendoHoje.length === 0
          ? "" : `<span style="font-size:12px;color:#666;font-weight:400">${vencendoBreve.length} pendente(s)</span>`}
      </div>
      ${vencendoBreve.length
        ? vencendoBreve.map(b => boletoRow(b, "breve")).join("")
        : `<div class="empty">Nenhum boleto cadastrado</div>`}
    </div>
  `;
}

function boletoRow(b, status) {
  const dueFormatted = new Date(b.due_date + "T00:00:00").toLocaleDateString("pt-BR");
  const borderColor  = status === "vencido" ? "#E24B4A" : status === "hoje" ? "#BA7517" : "#1D9E75";
  const dateColor    = status === "vencido" ? "#E24B4A" : status === "hoje" ? "#BA7517" : "#1D9E75";
  const statusLabel  = status === "vencido" ? "Vencido" : status === "hoje" ? "Vence hoje" : "No prazo";

  return `
    <div style="display:flex;align-items:center;padding:12px 0;border-bottom:1px solid #1e2030;gap:12px">
      <div style="width:4px;height:48px;border-radius:99px;background:${borderColor};flex-shrink:0"></div>
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:500;color:#e8e8e8">${b.description}</div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:4px;flex-wrap:wrap">
          <span style="font-size:11px;font-weight:500;padding:2px 8px;border-radius:99px;background:${borderColor}22;color:${borderColor}">${statusLabel}</span>
          <span style="font-size:12px;color:${dateColor}">Vence ${dueFormatted}</span>
          ${b.barcode ? `<span style="font-family:monospace;font-size:11px;color:#555">${b.barcode.substring(0,20)}...</span>` : ""}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
        <span style="font-size:15px;font-weight:600;color:#D85A30">${fmt(b.amount)}</span>
        <div style="display:flex;gap:6px">
          ${b.file_path ? `<button class="btn btn-secondary btn-sm" onclick="downloadBoleto('${b.file_path}','${b.id}')">Abrir arquivo</button>` : ""}
          ${b.barcode ? `<button class="btn btn-secondary btn-sm" onclick="copyBarcode('${b.barcode}')">Copiar código</button>` : ""}
          <button class="btn btn-primary btn-sm" onclick="markBoletoAsPaid(${b.id})">Pago</button>
        </div>
      </div>
    </div>
  `;
}

async function saveBoleto() {
  const uid         = state.userId;
  const description = document.getElementById("bol-desc").value.trim();
  const amount      = parseCurrency(document.getElementById("bol-amount").value);
  const due_date    = document.getElementById("bol-date").value;
  const barcode     = document.getElementById("bol-barcode").value.trim() || null;
  const fileInput   = document.getElementById("bol-file");
  const file        = fileInput?.files?.[0] || null;

  if (!uid)          return alert("Sessão expirada.");
  if (!description)  return alert("Informe a descrição.");
  if (!amount)       return alert("Informe o valor.");
  if (!due_date)     return alert("Informe a data de vencimento.");

  let file_path = null;
  let file_type = null;

  // Upload do arquivo se tiver
  if (file) {
    const ext      = file.name.split(".").pop();
    const path     = `${uid}/${Date.now()}.${ext}`;
    const { error: uploadError } = await sb.storage.from("boletos").upload(path, file, { contentType: file.type });
    if (uploadError) return alert("Erro ao enviar arquivo: " + uploadError.message);
    file_path = path;
    file_type = file.type;
  }

  const { data, error } = await sb.from("boletos").insert([{
    user_id: uid, description, amount, due_date, barcode, file_path, file_type, paid: false
  }]).select().single();

  if (!error && data) {
    state.boletos.push(data);
    state.boletos.sort((a, b) => a.due_date.localeCompare(b.due_date));
    render();
  } else if (error) alert("Erro ao salvar boleto: " + error.message);
}

function clearBoletoForm() {
  ["bol-desc","bol-amount","bol-barcode"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  const fi = document.getElementById("bol-file");
  if (fi) fi.value = "";
}

async function markBoletoAsPaid(id) {
  const boleto = state.boletos.find(b => b.id === id);
  if (!boleto) return;

  // Apaga o arquivo do storage se tiver
  if (boleto.file_path) {
    await sb.storage.from("boletos").remove([boleto.file_path]);
  }

  // Apaga do banco
  const { error } = await sb.from("boletos").delete().eq("id", id).eq("user_id", state.userId);
  if (!error) {
    state.boletos = state.boletos.filter(b => b.id !== id);
    render();
  } else alert("Erro ao marcar como pago: " + error.message);
}

async function downloadBoleto(filePath, boletoId) {
  const { data, error } = await sb.storage.from("boletos").createSignedUrl(filePath, 60);
  if (!error && data?.signedUrl) {
    window.open(data.signedUrl, "_blank");
  } else alert("Erro ao abrir arquivo.");
}

function copyBarcode(barcode) {
  navigator.clipboard.writeText(barcode).then(() => {
    alert("Código de barras copiado!");
  }).catch(() => {
    prompt("Copie o código:", barcode);
  });
}

// =====================
// CATEGORIAS
// =====================
function renderCategorias() {
  document.getElementById("content").innerHTML = `
    <div class="section">
      <div class="section-title">Nova Categoria</div>
      <div class="form-grid">
        <div class="form-group">
          <label>Nome *</label>
          <input id="cat-name" placeholder="Ex: Academia">
        </div>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" onclick="saveCategory()">Salvar</button>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Categorias (${state.categories.length})</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px">
        ${state.categories.map((cat, i) => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 12px;background:#0f1117;border:1px solid #2a2d3a;border-radius:8px">
            <div style="display:flex;align-items:center;gap:8px">
              <div style="width:9px;height:9px;border-radius:50%;background:${CAT_COLORS[i%CAT_COLORS.length]};flex-shrink:0"></div>
              <span style="font-size:13px">${cat.name}</span>
            </div>
            <button class="btn-icon" onclick="deleteCategory(${cat.id})">✕</button>
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
  const card = state.cards.find(c => Number(c.id) === Number(tx.card_id));
  const bank = state.banks.find(b => Number(b.id) === Number(tx.bank_id));
  const installInfo = tx.installment_total > 1
    ? `<span class="badge badge-method">${tx.installment_number}/${tx.installment_total}x</span>`
    : "";
  return `
    <div class="tx-row">
      <div class="tx-icon ${tx.type==="receita"?"inc":"exp"}">${tx.type==="receita"?"↑":"↓"}</div>
      <div class="tx-info">
        <div class="tx-name">${tx.description}</div>
        <div class="tx-sub">
          ${new Date(tx.date).toLocaleDateString("pt-BR")}
          ${tx.category       ? `<span class="badge badge-cat">${tx.category}</span>`          : ""}
          ${bank              ? `<span class="badge badge-bank">${bank.name}</span>`            : ""}
          ${tx.payment_method ? `<span class="badge badge-method">${tx.payment_method}</span>` : ""}
          ${card              ? `<span class="badge badge-method" style="border-left:3px solid ${card.color||"#7F77DD"};padding-left:6px">${card.name}</span>` : ""}
          ${installInfo}
        </div>
      </div>
      <span class="tx-amount ${tx.type==="receita"?"green":"red"}">
        ${tx.type==="receita"?"+":"-"}${fmt(tx.amount)}
      </span>
      <button class="btn-icon" onclick="deleteTx(${tx.id})">✕</button>
    </div>
  `;
}

// =====================
// ACTIONS — TRANSACTIONS
// =====================
async function saveTx() {
  const uid            = state.userId;
  const type           = document.getElementById("f-type").value;
  const description    = document.getElementById("f-desc").value.trim();
  const amount         = parseCurrency(document.getElementById("f-amount").value);
  const category       = document.getElementById("f-cat").value    || null;
  const date           = document.getElementById("f-date").value;
  const bank_id        = document.getElementById("f-bank").value   || null;
  const payment_method = document.getElementById("f-method").value || null;
  const card_id        = document.getElementById("f-card").value   || null;
  const installments   = parseInt(document.getElementById("f-installments")?.value) || 1;

  if (!uid)          return alert("Sessão expirada. Faça login novamente.");
  if (!description)  return alert("Informe a descrição.");
  if (!amount)       return alert("Informe o valor.");
  if (!date)         return alert("Informe a data.");

  // Se tem cartão com múltiplas parcelas
  if (card_id && installments > 1) {
    const card = state.cards.find(c => c.id === parseInt(card_id));
    if (!card || !card.closing_day || !card.due_day) {
      return alert("Para parcelar, o cartão precisa ter dia de fechamento e vencimento cadastrados.");
    }

    const amountPerInstallment = amount / installments;
    const rows = [];
    let firstDate = calcFirstInstallmentDate(date, card.closing_day, card.due_day);

    for (let i = 0; i < installments; i++) {
      const installDate = addMonths(firstDate, i);
      rows.push({
        user_id: uid, type, description: `${description} (${i+1}/${installments})`,
        amount: parseFloat(amountPerInstallment.toFixed(2)),
        category, date: installDate, payment_method: payment_method || "Cartão de crédito",
        bank_id: null, card_id: parseInt(card_id),
        installment_number: i + 1, installment_total: installments,
      });
    }

    const { data, error } = await sb.from("transactions").insert(rows).select();
    if (!error && data) {
      data.forEach(d => state.transactions.unshift(d));
      state.transactions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      render();
    } else if (error) alert("Erro ao salvar parcelas: " + error.message);
    return;
  }

  // Lançamento único
  const { data, error } = await sb.from("transactions").insert([{
    user_id: uid, type, description, amount, category, date, payment_method,
    bank_id:  bank_id  ? parseInt(bank_id)  : null,
    card_id:  card_id  ? parseInt(card_id)  : null,
    installment_number: 1, installment_total: 1,
  }]).select().single();

  if (!error && data) { state.transactions.unshift(data); render(); }
  else if (error) alert("Erro: " + error.message);
}

// Adiciona N meses a uma data ISO
function addMonths(dateStr, months) {
  const d = new Date(dateStr + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split("T")[0];
}

function clearTxForm() {
  ["f-desc","f-amount"].forEach(id => document.getElementById(id).value = "");
  const bankEl = document.getElementById("f-bank");
  if (bankEl) { bankEl.value = ""; onBankChange(); }
  const cardEl = document.getElementById("f-card");
  if (cardEl) { cardEl.value = ""; onCardChange(); }
}

async function deleteTx(id) {
  const { error } = await sb.from("transactions").delete().eq("id", id).eq("user_id", state.userId);
  if (!error) { state.transactions = state.transactions.filter(t => t.id !== id); render(); }
  else alert("Erro ao excluir transação: " + error.message);
}

// =====================
// ACTIONS — BANKS
// =====================
async function saveBank() {
  const uid             = state.userId;
  const name            = document.getElementById("b-name").value.trim();
  const initial_balance = parseCurrency(document.getElementById("b-balance").value) || 0;

  if (!uid)   return alert("Sessão expirada. Faça login novamente.");
  if (!name)  return alert("Informe o nome do banco.");

  const { data, error } = await sb.from("banks").insert([{ name, initial_balance, user_id: uid }]).select().single();
  if (!error && data) { state.banks.push(data); render(); }
  else if (error) alert("Erro ao salvar banco: " + error.message);
}

function clearBankForm() {
  document.getElementById("b-name").value    = "";
  document.getElementById("b-balance").value = "";
}

async function deleteBank(id) {
  const { error } = await sb.from("banks").delete().eq("id", id).eq("user_id", state.userId);
  if (!error) { state.banks = state.banks.filter(b => b.id !== id); render(); }
  else alert("Erro ao excluir banco: " + error.message);
}

async function quickDeposit(bankId) {
  const amtStr = prompt("Valor do depósito (R$):\nExemplo: 150,00");
  const amount = parseCurrency(amtStr);
  if (!amount || isNaN(amount)) return;
  const desc = prompt("Descrição:", "Depósito") || "Depósito";
  const { data, error } = await sb.from("transactions").insert([{
    user_id: state.userId, type: "receita", description: desc,
    amount, date: today(), bank_id: bankId, category: null,
    installment_number: 1, installment_total: 1,
  }]).select().single();
  if (!error && data) { state.transactions.unshift(data); render(); }
}

// =====================
// ACTIONS — CARDS
// =====================
async function saveCard() {
  const uid          = state.userId;
  const name         = document.getElementById("c-name").value.trim();
  const type         = document.getElementById("c-type").value;
  const color        = document.getElementById("c-color").value;
  const limit_amount = parseCurrency(document.getElementById("c-limit").value) || 0;
  const closing_day  = parseInt(document.getElementById("c-closing").value) || null;
  const due_day      = parseInt(document.getElementById("c-due").value)     || null;

  if (!uid)          return alert("Sessão expirada. Faça login novamente.");
  if (!name)         return alert("Informe o nome do cartão.");
  if (!closing_day)  return alert("Informe o dia de fechamento.");
  if (!due_day)      return alert("Informe o dia de vencimento.");

  const { data, error } = await sb.from("cards").insert([{ name, type, color, limit_amount, closing_day, due_day, user_id: uid }]).select().single();
  if (!error && data) { state.cards.push(data); render(); }
  else if (error) alert("Erro ao salvar cartão: " + error.message);
}

function clearCardForm() { document.getElementById("c-name").value = ""; }

async function deleteCard(id) {
  const { error } = await sb.from("cards").delete().eq("id", id).eq("user_id", state.userId);
  if (!error) { state.cards = state.cards.filter(c => c.id !== id); render(); }
  else alert("Erro ao excluir cartão: " + error.message);
}

// =====================
// ACTIONS — FIXED
// =====================
async function saveFixed() {
  const uid            = state.userId;
  const description    = document.getElementById("fx-desc").value.trim();
  const amount         = parseCurrency(document.getElementById("fx-amount").value);
  const due_day        = parseInt(document.getElementById("fx-due").value) || null;
  const category       = document.getElementById("fx-cat").value    || null;
  const payment_method = document.getElementById("fx-method").value || null;

  if (!uid)          return alert("Sessão expirada. Faça login novamente.");
  if (!description)  return alert("Informe a descrição.");
  if (!amount)       return alert("Informe o valor.");
  if (!due_day)      return alert("Informe o dia de vencimento.");

  const { data, error } = await sb.from("fixed_expenses").insert([{ description, amount, due_day, category, payment_method, user_id: uid }]).select().single();
  if (!error && data) { state.fixed.push(data); render(); }
  else if (error) alert("Erro ao salvar conta fixa: " + error.message);
}

function clearFixedForm() {
  ["fx-desc","fx-amount"].forEach(id => document.getElementById(id).value = "");
}

async function deleteFixed(id) {
  const { error } = await sb.from("fixed_expenses").delete().eq("id", id).eq("user_id", state.userId);
  if (!error) { state.fixed = state.fixed.filter(f => f.id !== id); render(); }
  else alert("Erro ao excluir conta fixa: " + error.message);
}

// =====================
// ACTIONS — GOALS
// =====================
async function saveGoal() {
  const uid     = state.userId;
  const name    = document.getElementById("g-name").value.trim();
  const target  = parseCurrency(document.getElementById("g-target").value);
  const bank_id = document.getElementById("g-bank").value || null;

  if (!uid)    return alert("Sessão expirada. Faça login novamente.");
  if (!name)   return alert("Informe o nome da meta.");
  if (!target) return alert("Informe o valor alvo.");

  const { data, error } = await sb.from("goals").insert([{
    name, target, saved: 0, user_id: uid,
    bank_id: bank_id ? parseInt(bank_id) : null,
  }]).select().single();
  if (!error && data) { state.goals.push(data); render(); }
  else if (error) alert("Erro ao salvar meta: " + error.message);
}

function clearGoalForm() {
  ["g-name","g-target"].forEach(id => document.getElementById(id).value = "");
}

async function deleteGoal(id) {
  const { error } = await sb.from("goals").delete().eq("id", id).eq("user_id", state.userId);
  if (!error) { state.goals = state.goals.filter(g => g.id !== id); render(); }
  else alert("Erro ao excluir meta: " + error.message);
}

async function promptDeposit(id) {
  const goal   = state.goals.find(g => g.id === id);
  const amtStr = prompt("Quanto você guardou? (R$)\nExemplo: 150,00");
  const amount = parseCurrency(amtStr);
  if (!amount || isNaN(amount)) return;

  const newSaved = Math.min(parseFloat(goal.target), parseFloat(goal.saved) + amount);
  const { error } = await sb.from("goals").update({ saved: newSaved }).eq("id", id).eq("user_id", state.userId);
  if (error) { alert("Erro ao atualizar meta: " + error.message); return; }
  goal.saved = newSaved;

  if (goal.bank_id) {
    const { data } = await sb.from("transactions").insert([{
      user_id: state.userId, type: "receita",
      description: `Depósito na meta: ${goal.name}`,
      amount, date: today(), bank_id: goal.bank_id, category: null,
      installment_number: 1, installment_total: 1,
    }]).select().single();
    if (data) state.transactions.unshift(data);
  }
  render();
}

// =====================
// ACTIONS — CATEGORIES  FIX: deletar por ID, não por nome
// =====================
async function saveCategory() {
  const uid  = state.userId;
  const name = document.getElementById("cat-name").value.trim();

  if (!uid)  return alert("Sessão expirada. Faça login novamente.");
  if (!name) return alert("Informe o nome da categoria.");
  if (state.categories.find(c => c.name === name)) return alert("Categoria já existe.");

  const { data, error } = await sb.from("categories").insert([{ name, user_id: uid }]).select().single();
  if (!error && data) {
    state.categories.push({ id: data.id, name: data.name });
    state.categories.sort((a, b) => a.name.localeCompare(b.name));
    render();
  } else if (error) alert("Erro ao salvar categoria: " + error.message);
}

async function deleteCategory(id) {
  const { error } = await sb.from("categories").delete().eq("id", id).eq("user_id", state.userId);
  if (!error) { state.categories = state.categories.filter(c => c.id !== id); render(); }
  else alert("Erro ao excluir categoria: " + error.message);
}

// =====================
// THEME
// =====================
function toggleTheme() {
  const isLight = document.body.classList.toggle("light-mode");
  const btn = document.getElementById("theme-btn");
  btn.textContent = isLight ? "Modo escuro" : "Modo claro";
  localStorage.setItem("theme", isLight ? "light" : "dark");
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
