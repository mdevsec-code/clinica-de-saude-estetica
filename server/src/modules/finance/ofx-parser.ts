// Parser mínimo de OFX (Open Financial Exchange — o formato padrão de
// exportação de extrato bancário, historicamente associado ao Microsoft
// Money, daí o pedido do cliente por "formato OFX money"). Escrito à mão em
// vez de trazer uma dependência externa: o subconjunto do formato que
// interessa aqui (blocos <STMTTRN>...</STMTTRN> com FITID/DTPOSTED/TRNAMT/
// NAME/MEMO) é simples e estável o bastante para não justificar mais uma
// dependência de terceiros num parser de poucas dezenas de linhas.
//
// OFX tem duas variantes: a antiga (SGML, tags sem fechamento obrigatório,
// ex.: "<FITID>123") e a nova (XML de verdade, com fechamento). Este parser
// aceita as duas: normaliza tudo para uma única linha por tag antes de
// extrair os blocos, então funciona nos dois casos sem precisar de um parser
// XML de verdade.

export interface ParsedOfxTransaction {
  fitId: string;
  postedAt: Date;
  amountCents: number;
  description: string;
  memo: string | null;
}

function extractTag(block: string, tag: string): string | null {
  // Cobre tanto "<TAG>valor</TAG>" (XML) quanto "<TAG>valor" sem fechamento
  // (SGML antigo) — no segundo caso, o valor vai até a próxima quebra de
  // linha ou até a próxima tag de abertura, o que vier primeiro.
  const closed = block.match(new RegExp(`<${tag}>([^<\\r\\n]*)(?:</${tag}>)?`, 'i'));
  return closed ? closed[1].trim() : null;
}

// DTPOSTED vem como YYYYMMDD ou YYYYMMDDHHMMSS[.xxx][+TZ] — só a data
// importa para conciliação (o extrato não dá o horário exato do lançamento
// de forma útil para casar com despesas, que já são lançadas por dia).
function parseOfxDate(raw: string): Date | null {
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!match) return null;
  const [, year, month, day] = match;
  return new Date(`${year}-${month}-${day}T12:00:00Z`);
}

// TRNAMT vem em unidade decimal (ex.: "-149.90") — converte para centavos
// como Int, mesmo padrão de amountCents usado em todo o resto do sistema
// (Expense, Service.priceCents), evitando erro de ponto flutuante.
function parseAmountCents(raw: string): number | null {
  const normalized = raw.replace(',', '.');
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

export function parseOfx(content: string): ParsedOfxTransaction[] {
  const blocks = content.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? [];
  const transactions: ParsedOfxTransaction[] = [];

  for (const block of blocks) {
    const fitId = extractTag(block, 'FITID');
    const dtposted = extractTag(block, 'DTPOSTED');
    const trnamt = extractTag(block, 'TRNAMT');
    const name = extractTag(block, 'NAME') ?? extractTag(block, 'PAYEE');
    const memo = extractTag(block, 'MEMO');

    if (!fitId || !dtposted || !trnamt) continue;

    const postedAt = parseOfxDate(dtposted);
    const amountCents = parseAmountCents(trnamt);
    if (!postedAt || amountCents === null) continue;

    transactions.push({
      fitId,
      postedAt,
      amountCents,
      description: name || memo || 'Transação sem descrição',
      memo: memo || null,
    });
  }

  return transactions;
}
