// Os CSVs são a fonte dos resultados de cada divisão.
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(field.trim()); field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = []; field = '';
      if (char === '\r' && text[i + 1] === '\n') i++;
    } else field += char;
  }
  if (quoted) throw new Error('Campo com aspas incompletas no CSV.');
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  const headers = rows.shift() || [];
  const required = ['campeonato', 'edicao', 'participante', 'campeao', 'vice'];
  if (required.some(header => !headers.includes(header))) {
    throw new Error('Cabeçalho inválido no CSV.');
  }
  return rows.map(values => Object.fromEntries(headers.map((header, i) => [header, values[i] || ''])));
}

async function loadEditions(group) {
  const response = await fetch(`./${group}.csv`);
  if (!response.ok) throw new Error(`Não foi possível carregar ${group}.csv.`);
  return parseCSV(await response.text()).map(row => {
    const number = Number(row.edicao);
    if (row.campeonato.toLowerCase() !== group || !Number.isInteger(number) || number < 1 || !row.campeao || !row.vice) {
      throw new Error(`Resultado inválido em ${group}.csv.`);
    }
    return {
      nome: `${number}º Campeonato da ${row.campeonato}`,
      edicao: number,
      grupo: group,
      participante: row.participante.toLowerCase(),
      especial: Boolean(row.participante) && row.participante.toLowerCase() !== 'nenhum',
      campeao: row.campeao,
      vice: row.vice
    };
  });
}

async function main() {
  const editions = (await Promise.all(['vila', 'tecno'].map(loadEditions))).flat();
  if (!editions.length) throw new Error('Nenhuma edição encontrada nos CSVs.');

  // ===== CÁLCULOS =====
  const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const chave  = n => n;
  const rotulo = p => [...p.apelidos].join(" / ");

  function buildRanking(list){
    const players = Object.create(null);
    list.forEach(e => {
      const idx = editions.indexOf(e);
      [["campeao","titulos"],["vice","vices"]].forEach(([key, field]) => {
        const k = chave(e[key]);
        players[k] ??= { nome:k, apelidos:new Set(), titulos:0, vices:0, primeira:idx, finais:0 };
        players[k].apelidos.add(e[key]);
        players[k][field]++;
        players[k].finais++;
      });
    });
    const sorted = Object.values(players).sort((a,b) =>
      b.titulos - a.titulos || b.vices - a.vices || a.primeira - b.primeira
    );
    // posição com empate (mesmos títulos e vices = mesma posição)
    sorted.forEach((p, i) => {
      const first = sorted.findIndex(q => q.titulos === p.titulos && q.vices === p.vices);
      p.pos = first + 1;
    });
    return sorted;
  }

  const ranking = buildRanking(editions);

  const maxTit = Math.max(...ranking.map(p => p.titulos));
  const maxVic = Math.max(...ranking.map(p => p.vices));
  const maioresCampeoes = ranking.filter(p => p.titulos === maxTit);
  const maioresVices    = ranking.filter(p => p.vices === maxVic);

  const nomes = arr => arr.map(rotulo).join(" · ");
  const tags  = arr => arr.map(p => `<span class="tag">${escapeHTML(rotulo(p))}</span>`).join("");

  // ===== DESTAQUES =====
  const empateCampeao = maioresCampeoes.length > 1;
  document.getElementById("highlights").innerHTML = `
    <div class="hl gold">
      <div class="label">Maior campeão${empateCampeao ? " (empate)" : ""}</div>
      <div class="big">${empateCampeao ? maxTit + " título cada" : escapeHTML(maioresCampeoes[0].nome)}</div>
      <div class="note">${empateCampeao
        ? "Empate no topo da tabela de títulos. A briga está aberta!"
        : maxTit + " títulos conquistados."}</div>
      <div>${tags(maioresCampeoes)}</div>
      <div class="icon">🏆</div>
    </div>
    <div class="hl silver">
      <div class="label">Maior vice</div>
      <div class="big">${escapeHTML(nomes(maioresVices))}</div>
      <div class="note">${maxVic} vice-campeonatos. Sempre na final, falta só o título!</div>
      <div>${tags(maioresVices)}</div>
      <div class="icon">🥈</div>
    </div>
    <div class="hl gold">
      <div class="label">Campeões do torneio</div>
      <div class="big">${ranking.filter(p=>p.titulos>0).length} campeões diferentes</div>
      <div class="note">Em ${editions.length} edições, ${ranking.filter(p=>p.titulos>0).length} jogadores já levantaram a taça.</div>
      <div>${tags(ranking.filter(p=>p.titulos>0))}</div>
      <div class="icon">★</div>
    </div>
  `;

  // ===== EDIÇÕES =====
  const renderEdition = e => `
    <article class="edition${e.especial ? ' special' : ''}">
      <div class="top">
        <div class="ed-name">${escapeHTML(e.nome)}</div>
        <span class="badge ${e.grupo}">${e.grupo === "vila" ? "Vila" : "Tecno"}</span>
      </div>
      ${e.especial ? `
        <div class="edition-special">
          <span class="special-label">★ Edição especial</span>
          <span>Participação da <strong>${escapeHTML(e.participante === 'vila' ? 'Vila' : e.participante === 'tecno' ? 'Tecno' : e.participante)}</strong></span>
        </div>
      ` : ''}
      <div class="final">
        <div class="place first">
          <div class="medal">1</div>
          <div><div class="role">Campeão</div><div class="pname">${escapeHTML(e.campeao)}</div></div>
        </div>
        <div class="place second">
          <div class="medal">2</div>
          <div><div class="role">Vice-campeão</div><div class="pname">${escapeHTML(e.vice)}</div></div>
        </div>
      </div>
    </article>
  `;
  document.getElementById("editions").innerHTML = ['vila', 'tecno'].map(group => `
    <section class="edition-group" aria-labelledby="editions-${group}">
      <h3 class="edition-group-title ${group}" id="editions-${group}">${group === 'vila' ? 'Vila' : 'Tecno'}</h3>
      <div class="edition-group-grid">
        <div class="edition-trophy-slot">
          ${group === 'vila'
            ? '<img class="edition-trophy edition-trophy-vila" src="svg/trofeu-vila.svg" alt="Troféu do Campeonato da Vila">'
            : '<img class="edition-trophy" src="img/trofeu-tecno.png" alt="Troféu do Campeonato da Tecno">'}
        </div>
        ${editions.filter(e => e.grupo === group).sort((a, b) => b.edicao - a.edicao).map(renderEdition).join('')}
      </div>
    </section>
  `).join('');

  // ===== RANKING =====
  const views = {
    geral: { label: "Ranking Geral", rows: ranking,
             info: "Todas as edições somadas (Vila + Tecno)." },
    vila:  { label: "Só Vila", rows: buildRanking(editions.filter(e => e.grupo === "vila")),
             info: "Considera apenas os Campeonatos da Vila." },
    tecno: { label: "Só Tecno", rows: buildRanking(editions.filter(e => e.grupo === "tecno")),
             info: "Considera apenas os Campeonatos da Tecno." }
  };

  function renderRank(key){
    const v = views[key];
    document.getElementById("rank").innerHTML = v.rows.map(p => `
      <div class="rank-card ${p.pos<=3 ? "top"+p.pos : ""}">
        <div class="pos">${p.pos}</div>
        <div>
          <div class="rank-name">${escapeHTML(rotulo(p))}</div>
          <div class="rank-sub">${p.finais} ${p.finais>1 ? "finais disputadas" : "final disputada"}</div>
        </div>
        <div class="stats">
          <div class="stat champ"><b>${p.titulos}</b><small>Títulos</small></div>
          <div class="stat vice"><b>${p.vices}</b><small>Vices</small></div>
        </div>
      </div>
    `).join("");
    document.getElementById("legend").textContent =
      v.info + " Ordenado por títulos e depois por vices; empatados dividem a posição.";
    document.querySelectorAll("#tabs button").forEach(b =>
      b.classList.toggle("active", b.dataset.key === key));
  }

  document.getElementById("tabs").innerHTML = Object.entries(views).map(([k, v]) =>
    `<button data-key="${k}">${v.label}</button>`).join("");
  document.getElementById("tabs").addEventListener("click", ev => {
    const k = ev.target.dataset.key;
    if (k) renderRank(k);
  });
  renderRank("geral");

  // ===== NÚMEROS =====
  const vilaEd  = editions.filter(e => e.grupo === "vila").length;
  const tecnoEd = editions.filter(e => e.grupo === "tecno").length;
  document.getElementById("counters").innerHTML = [
    [editions.length, "Edições"],
    [vilaEd, "Campeonatos da Vila"],
    [tecnoEd, "Campeonatos da Tecno"],
    [ranking.length, "Finalistas"]
  ].map(([n,l]) => `<div class="counter"><b>${n}</b><span>${l}</span></div>`).join("");
}

main().catch(error => {
  console.error(error);
  const message = document.createElement('p');
  message.setAttribute('role', 'alert');
  message.textContent = 'Não foi possível carregar os resultados. Confira os arquivos CSV e abra o site por um servidor local.';
  document.getElementById('highlights').replaceChildren(message);
});
