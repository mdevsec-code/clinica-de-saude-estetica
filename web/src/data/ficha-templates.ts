import type { FichaField } from '@/types';

// Modelos de partida por tipo de ficha, transcritos dos formulários reais em
// papel da clínica (pasta "Formulários de fichas", códigos CNC-FRM/AUT/TC).
// Cada campo carrega `section` (a letra e o título da seção do documento
// original, ex. "B — Avaliação pré-procedimento") — é o que permite
// reconstruir na tela/impressão o mesmo agrupamento em seções do papel,
// sem precisar de uma segunda estrutura de dados paralela pra manter em
// sincronia (o agrupamento nasce do próprio campo). fields continua sendo
// uma lista livre (o admin edita/apaga campos e pode digitar section livre
// também), não um schema rígido — ver comentário em schema.prisma no model
// PatientFicha.
export const FICHA_PRESETS: Record<string, FichaField[]> = {
  'Anamnese e Avaliação Corporal': [
    { label: 'Sexo', value: '', section: 'A — Identificação do paciente' },
    { label: 'Contato de emergência (nome / telefone / parentesco)', value: '', section: 'B — Contato de emergência' },
    { label: 'Já realizou tratamento estético corporal antes? Qual/quando?', value: '', section: 'C — Queixa, objetivo e histórico estético' },
    { label: 'Pratica atividade física regularmente? Frequência', value: '', section: 'C — Queixa, objetivo e histórico estético' },
    { label: 'Queixa principal', value: '', section: 'C — Queixa, objetivo e histórico estético' },
    { label: 'Objetivo do(a) paciente com o tratamento', value: '', section: 'C — Queixa, objetivo e histórico estético' },
    { label: 'Hipertensão não controlada?', value: '', section: 'D — Histórico de saúde' },
    { label: 'Diabetes?', value: '', section: 'D — Histórico de saúde' },
    { label: 'Doença renal ou cardíaca?', value: '', section: 'D — Histórico de saúde' },
    { label: 'Epilepsia?', value: '', section: 'D — Histórico de saúde' },
    { label: 'Trombose ou histórico de trombose?', value: '', section: 'D — Histórico de saúde' },
    { label: 'Varizes?', value: '', section: 'D — Histórico de saúde' },
    { label: 'Possui problema ortopédico?', value: '', section: 'D — Histórico de saúde' },
    { label: 'Nódulos ou cistos?', value: '', section: 'D — Histórico de saúde' },
    { label: 'Histórico oncológico?', value: '', section: 'D — Histórico de saúde' },
    { label: 'Uso de próteses metálicas?', value: '', section: 'D — Histórico de saúde' },
    { label: 'Está gestante ou amamentando?', value: '', section: 'D — Histórico de saúde' },
    { label: 'Realizou cirurgia nos últimos 6 meses?', value: '', section: 'D — Histórico de saúde' },
    { label: 'Possui alergias conhecidas?', value: '', section: 'D — Histórico de saúde' },
    { label: 'Faz uso de medicamentos contínuos?', value: '', section: 'D — Histórico de saúde' },
    { label: 'É fumante?', value: '', section: 'D — Histórico de saúde' },
    { label: 'Outra condição de saúde não mencionada', value: '', section: 'D — Histórico de saúde' },
    { label: 'Altura (m) / data da avaliação', value: '', section: 'E — Avaliação corporal' },
    { label: 'Peso (kg) — início / meio / fim', value: '', section: 'E — Avaliação corporal' },
    { label: 'Busto (cm) — início / meio / fim', value: '', section: 'E — Avaliação corporal' },
    { label: 'Braço esquerdo (cm) — início / meio / fim', value: '', section: 'E — Avaliação corporal' },
    { label: 'Braço direito (cm) — início / meio / fim', value: '', section: 'E — Avaliação corporal' },
    { label: 'Abdômen (cm) — início / meio / fim', value: '', section: 'E — Avaliação corporal' },
    { label: 'Cintura (cm) — início / meio / fim', value: '', section: 'E — Avaliação corporal' },
    { label: 'Quadril (cm) — início / meio / fim', value: '', section: 'E — Avaliação corporal' },
    { label: 'Culote (cm) — início / meio / fim', value: '', section: 'E — Avaliação corporal' },
    { label: 'Coxa esquerda (cm) — início / meio / fim', value: '', section: 'E — Avaliação corporal' },
    { label: 'Coxa direita (cm) — início / meio / fim', value: '', section: 'E — Avaliação corporal' },
    { label: 'Panturrilha esquerda (cm) — início / meio / fim', value: '', section: 'E — Avaliação corporal' },
    { label: 'Panturrilha direita (cm) — início / meio / fim', value: '', section: 'E — Avaliação corporal' },
    { label: 'Plano de atendimento e evolução (sessões: data / procedimento / executor)', value: '', section: 'F — Plano de atendimento e evolução' },
  ],
  'Toxina Botulínica': [
    { label: 'Contato de emergência (nome / telefone)', value: '', section: 'A — Identificação do paciente' },
    { label: 'Alergia ou sensibilidade à toxina botulínica?', value: '', section: 'B — Avaliação pré-procedimento' },
    { label: 'Doença neuromuscular (miastenia gravis, Eaton-Lambert, ELA)?', value: '', section: 'B — Avaliação pré-procedimento' },
    { label: 'Está gestante ou amamentando?', value: '', section: 'B — Avaliação pré-procedimento' },
    { label: 'Infecção ativa ou alteração de pele na região a tratar?', value: '', section: 'B — Avaliação pré-procedimento' },
    { label: 'Procedimento estético/cirúrgico recente na região?', value: '', section: 'B — Avaliação pré-procedimento' },
    { label: 'Uso de anticoagulantes / aminoglicosídeos?', value: '', section: 'B — Avaliação pré-procedimento' },
    { label: 'Histórico de reação adversa a toxina botulínica anterior?', value: '', section: 'B — Avaliação pré-procedimento' },
    { label: 'Outra condição relevante', value: '', section: 'B — Avaliação pré-procedimento' },
    { label: 'Já realizou toxina botulínica antes? (data / região / produto / dose / resultado / intercorrência)', value: '', section: 'C — Histórico de toxina botulínica' },
    { label: 'Queixa principal', value: '', section: 'D — Queixa, objetivo e avaliação estética' },
    { label: 'Objetivo do(a) paciente com o tratamento', value: '', section: 'D — Queixa, objetivo e avaliação estética' },
    { label: 'Avaliação profissional / observações relevantes', value: '', section: 'D — Queixa, objetivo e avaliação estética' },
    { label: 'Produto — nome comercial / princípio ativo / fabricante / registro ANVISA', value: '', section: 'E — Produto e rastreabilidade' },
    { label: 'Produto — apresentação / unidades por frasco / lote / validade', value: '', section: 'E — Produto e rastreabilidade' },
    { label: 'Testa (rugas horizontais) — tratada / unidades / observações', value: '', section: 'F — Mapa facial e registro por região' },
    { label: 'Glabela (rugas glabelares) — tratada / unidades / observações', value: '', section: 'F — Mapa facial e registro por região' },
    { label: 'Região periorbital (pés de galinha) — tratada / unidades / observações', value: '', section: 'F — Mapa facial e registro por região' },
    { label: 'Região nasal (rugas nasais) — tratada / unidades / observações', value: '', section: 'F — Mapa facial e registro por região' },
    { label: 'Elevação da sobrancelha — tratada / unidades / observações', value: '', section: 'F — Mapa facial e registro por região' },
    { label: 'Região perioral (ao redor dos lábios) — tratada / unidades / observações', value: '', section: 'F — Mapa facial e registro por região' },
    { label: 'Cantos da boca — tratada / unidades / observações', value: '', section: 'F — Mapa facial e registro por região' },
    { label: 'Linhas de marionete — tratada / unidades / observações', value: '', section: 'F — Mapa facial e registro por região' },
    { label: 'Região do mento — tratada / unidades / observações', value: '', section: 'F — Mapa facial e registro por região' },
    { label: 'Bandas platismais / rugas do pescoço — tratada / unidades / observações', value: '', section: 'F — Mapa facial e registro por região' },
    { label: 'Data da aplicação / profissional executor / registro profissional', value: '', section: 'G — Registro do procedimento' },
    { label: 'Responsável técnico (quando aplicável)', value: '', section: 'G — Registro do procedimento' },
    { label: 'Observações gerais do atendimento', value: '', section: 'G — Registro do procedimento' },
    { label: 'Orientações fornecidas ao paciente', value: '', section: 'H — Orientações e acompanhamento' },
    { label: 'Retorno sugerido em', value: '', section: 'H — Orientações e acompanhamento' },
    { label: 'Intercorrências / eventos adversos', value: '', section: 'I — Intercorrências / eventos adversos' },
  ],
  'Toxina Botulínica + Preenchimento (mesma sessão)': [
    { label: 'Contato de emergência (nome / telefone)', value: '', section: 'A — Identificação do paciente' },
    { label: 'Alergia conhecida à toxina botulínica?', value: '', section: 'B — Avaliação pré-procedimento' },
    { label: 'Alergia conhecida ao ácido hialurônico ou anestésicos locais?', value: '', section: 'B — Avaliação pré-procedimento' },
    { label: 'Doença neuromuscular, autoimune ou inflamatória relevante?', value: '', section: 'B — Avaliação pré-procedimento' },
    { label: 'Está gestante ou amamentando?', value: '', section: 'B — Avaliação pré-procedimento' },
    { label: 'Infecção ativa ou alteração de pele na região?', value: '', section: 'B — Avaliação pré-procedimento' },
    { label: 'Procedimento estético/cirúrgico recente na região?', value: '', section: 'B — Avaliação pré-procedimento' },
    { label: 'Uso de anticoagulantes / aminoglicosídeos?', value: '', section: 'B — Avaliação pré-procedimento' },
    { label: 'Histórico de queloide ou cicatrização hipertrófica?', value: '', section: 'B — Avaliação pré-procedimento' },
    { label: 'Histórico de reação adversa a toxina/preenchimento anterior?', value: '', section: 'B — Avaliação pré-procedimento' },
    { label: 'Outra condição relevante', value: '', section: 'B — Avaliação pré-procedimento' },
    { label: 'Queixa principal', value: '', section: 'C — Queixa, objetivo e planejamento' },
    { label: 'Objetivo do(a) paciente com o tratamento', value: '', section: 'C — Queixa, objetivo e planejamento' },
    { label: 'Plano — regiões indicadas para toxina botulínica', value: '', section: 'C — Queixa, objetivo e planejamento' },
    { label: 'Plano — regiões indicadas para preenchimento', value: '', section: 'C — Queixa, objetivo e planejamento' },
    { label: 'Regiões tratadas — toxina botulínica (região / tratada / unidades / observações)', value: '', section: 'E — Regiões tratadas' },
    { label: 'Regiões tratadas — preenchimento (região / tratada / mL / observações)', value: '', section: 'E — Regiões tratadas' },
    { label: 'Toxina botulínica — nome comercial / fabricante / registro ANVISA / apresentação / lote / validade', value: '', section: 'F — Produtos e rastreabilidade' },
    { label: 'Preenchimento (ácido hialurônico) — nome comercial / fabricante / registro ANVISA / concentração / lote / validade', value: '', section: 'F — Produtos e rastreabilidade' },
    { label: 'Data da aplicação / profissional executor / registro profissional', value: '', section: 'H — Registro do procedimento' },
    { label: 'Responsável técnico (quando aplicável)', value: '', section: 'H — Registro do procedimento' },
    { label: 'Observações gerais do atendimento', value: '', section: 'H — Registro do procedimento' },
    { label: 'Intercorrências / eventos adversos', value: '', section: 'I — Intercorrências / eventos adversos' },
    { label: 'Orientações fornecidas ao paciente', value: '', section: 'J — Orientações e acompanhamento' },
    { label: 'Retorno sugerido em', value: '', section: 'J — Orientações e acompanhamento' },
  ],
  'Registro de Administração de Tirzepatida': [
    { label: 'Peso atual (kg)', value: '', section: 'A — Identificação do paciente' },
    { label: 'Contato de emergência (telefone)', value: '', section: 'A — Identificação do paciente' },
    { label: 'Prescritor(a) / CRM / data da prescrição', value: '', section: 'B — Prescrição médica (referência)' },
    { label: 'Indicação conforme receita / dose prescrita', value: '', section: 'B — Prescrição médica (referência)' },
    { label: 'Receita de controle especial dentro da validade (90 dias) e conferida?', value: '', section: 'B — Prescrição médica (referência)' },
    { label: 'Histórico pessoal/familiar de carcinoma medular de tireoide ou NEM tipo 2?', value: '', section: 'C — Triagem de segurança para administração' },
    { label: 'Hipersensibilidade conhecida à tirzepatida ou componente da fórmula?', value: '', section: 'C — Triagem de segurança para administração' },
    { label: 'Está gestante ou amamentando?', value: '', section: 'C — Triagem de segurança para administração' },
    { label: 'Uso de insulina ou medicamentos que estimulam sua liberação?', value: '', section: 'C — Triagem de segurança para administração' },
    { label: 'Reação adversa em dose anterior desta medicação?', value: '', section: 'C — Triagem de segurança para administração' },
    { label: 'Sintomas gastrointestinais persistentes ou dor abdominal no momento?', value: '', section: 'C — Triagem de segurança para administração' },
    { label: 'Infecção ativa ou alteração de pele na região de aplicação?', value: '', section: 'C — Triagem de segurança para administração' },
    { label: 'Outra condição relevante', value: '', section: 'C — Triagem de segurança para administração' },
    { label: 'Produto — nome comercial / fabricante / registro ANVISA', value: '', section: 'D — Produto e rastreabilidade' },
    { label: 'Produto — apresentação (dose única/multidose) / concentração (mg) / lote / validade / origem', value: '', section: 'D — Produto e rastreabilidade' },
    { label: 'Data / horário da administração', value: '', section: 'E — Registro da administração' },
    { label: 'Dose administrada / local de aplicação (abdômen / coxa / braço)', value: '', section: 'E — Registro da administração' },
    { label: 'Profissional responsável pela administração / registro profissional', value: '', section: 'E — Registro da administração' },
    { label: 'Eventos adversos', value: '', section: 'F — Eventos adversos' },
    { label: 'Orientações fornecidas ao paciente', value: '', section: 'H — Orientações e acompanhamento' },
    { label: 'Próxima administração prevista', value: '', section: 'H — Orientações e acompanhamento' },
  ],
  'PEIM — Procedimento Estético Injetável em Microvasos': [
    { label: 'Possui diabetes ou outra alteração da glicemia?', value: '', section: 'B — Avaliação pré-procedimento e triagem vascular' },
    { label: 'Histórico de trombose venosa profunda ou tromboflebite?', value: '', section: 'B — Avaliação pré-procedimento e triagem vascular' },
    { label: 'Faz uso de anticoagulantes?', value: '', section: 'B — Avaliação pré-procedimento e triagem vascular' },
    { label: 'Está gestante ou amamentando?', value: '', section: 'B — Avaliação pré-procedimento e triagem vascular' },
    { label: 'Alergia conhecida à glicose ou componentes da solução?', value: '', section: 'B — Avaliação pré-procedimento e triagem vascular' },
    { label: 'Possui varizes tronculares na região?', value: '', section: 'B — Avaliação pré-procedimento e triagem vascular' },
    { label: 'Edema, dor, câimbras ou peso nas pernas ao final do dia?', value: '', section: 'B — Avaliação pré-procedimento e triagem vascular' },
    { label: 'Alterações de pele sugestivas de insuficiência venosa crônica?', value: '', section: 'B — Avaliação pré-procedimento e triagem vascular' },
    { label: 'Procedimento estético/cirúrgico recente na região?', value: '', section: 'B — Avaliação pré-procedimento e triagem vascular' },
    { label: 'Histórico de reação adversa a PEIM anterior?', value: '', section: 'B — Avaliação pré-procedimento e triagem vascular' },
    { label: 'Outra condição relevante', value: '', section: 'B — Avaliação pré-procedimento e triagem vascular' },
    { label: 'Queixa principal', value: '', section: 'C — Queixa, objetivo e regiões indicadas' },
    { label: 'Objetivo do(a) paciente com o tratamento', value: '', section: 'C — Queixa, objetivo e regiões indicadas' },
    { label: 'Avaliação profissional / região(ões) indicada(s)', value: '', section: 'C — Queixa, objetivo e regiões indicadas' },
    { label: 'Solução — nome comercial / fabricante / registro ANVISA / concentração / lote / validade', value: '', section: 'D — Produto e rastreabilidade' },
    { label: 'Volume máximo previsto para a sessão (mL)', value: '', section: 'D — Produto e rastreabilidade' },
    { label: 'Coxa esquerda / direita — tratada / volume (mL) / observações', value: '', section: 'E — Mapa corporal e registro por região' },
    { label: 'Perna (panturrilha) esquerda / direita — tratada / volume (mL) / observações', value: '', section: 'E — Mapa corporal e registro por região' },
    { label: 'Tornozelo esquerdo / direito — tratada / volume (mL) / observações', value: '', section: 'E — Mapa corporal e registro por região' },
    { label: 'Outra região — tratada / volume (mL) / observações', value: '', section: 'E — Mapa corporal e registro por região' },
    { label: 'Data da aplicação / profissional executor / registro profissional', value: '', section: 'G — Registro do procedimento' },
    { label: 'Volume total utilizado (mL)', value: '', section: 'G — Registro do procedimento' },
    { label: 'Observações gerais do atendimento', value: '', section: 'G — Registro do procedimento' },
    { label: 'Intercorrências / eventos adversos', value: '', section: 'H — Intercorrências / eventos adversos' },
    { label: 'Orientações fornecidas ao paciente', value: '', section: 'I — Orientações e acompanhamento' },
    { label: 'Retorno sugerido em', value: '', section: 'I — Orientações e acompanhamento' },
  ],
  'Autorização de Uso de Imagem': [
    { label: 'Autoriza uso para prontuário e acompanhamento clínico interno?', value: '', section: 'Marque todas as opções que se aplicam' },
    { label: 'Autoriza uso (podendo incluir o rosto) para redes sociais e marketing?', value: '', section: 'Marque todas as opções que se aplicam' },
    { label: 'Autoriza uso sem identificação do rosto para redes sociais e marketing?', value: '', section: 'Marque todas as opções que se aplicam' },
    { label: 'Não autoriza uso para divulgação/marketing em nenhuma hipótese?', value: '', section: 'Marque todas as opções que se aplicam' },
  ],
  'Termo de Consentimento — Preenchimento com Ácido Hialurônico': [
    { label: 'Alergia conhecida ao ácido hialurônico ou anestésicos locais?', value: '', section: 'B — Avaliação pré-procedimento' },
    { label: 'Doença autoimune ou inflamatória relevante?', value: '', section: 'B — Avaliação pré-procedimento' },
    { label: 'Está gestante ou amamentando?', value: '', section: 'B — Avaliação pré-procedimento' },
    { label: 'Infecção ativa ou alteração de pele na região a tratar?', value: '', section: 'B — Avaliação pré-procedimento' },
    { label: 'Procedimento estético/cirúrgico recente na região?', value: '', section: 'B — Avaliação pré-procedimento' },
    { label: 'Uso de anticoagulantes ou outros medicamentos que possam interferir?', value: '', section: 'B — Avaliação pré-procedimento' },
    { label: 'Histórico de queloide ou cicatrização hipertrófica?', value: '', section: 'B — Avaliação pré-procedimento' },
    { label: 'Histórico de reação adversa a preenchimento anterior?', value: '', section: 'B — Avaliação pré-procedimento' },
    { label: 'Outra condição relevante', value: '', section: 'B — Avaliação pré-procedimento' },
    { label: 'Queixa principal', value: '', section: 'C — Queixa, objetivo e indicação' },
    { label: 'Objetivo do(a) paciente com o tratamento', value: '', section: 'C — Queixa, objetivo e indicação' },
    { label: 'Avaliação profissional / região(ões) indicada(s)', value: '', section: 'C — Queixa, objetivo e indicação' },
    { label: 'Produto — nome comercial / fabricante / registro ANVISA / apresentação / concentração', value: '', section: 'E — Produto e rastreabilidade' },
    { label: 'Produto — lote / validade', value: '', section: 'E — Produto e rastreabilidade' },
    { label: 'Região(ões) tratada(s) / quantidade utilizada (mL)', value: '', section: 'E — Produto e rastreabilidade' },
    { label: 'Cuidados e orientações pós-procedimento fornecidas', value: '', section: 'G — Cuidados e orientações pós-procedimento' },
    { label: 'Retorno sugerido em', value: '', section: 'G — Cuidados e orientações pós-procedimento' },
  ],
};

export const fichaPresetNames = Object.keys(FICHA_PRESETS);

// Modelo em branco = o PDF original de verdade (pasta "Formulários de
// fichas" na raiz do repo, copiado pra web/public/fichas-modelos/), aberto
// direto numa aba — não uma reconstrução em HTML. É o documento real da
// clínica, com todas as tabelas de risco, mapas corporais/faciais e textos
// de consentimento originais; o navegador cuida da impressão sozinho (menu
// de imprimir do próprio visualizador de PDF). Uma ficha JÁ PREENCHIDA (com
// dados de um paciente) continua sendo renderizada em HTML (ver
// AdminFichaPrintModal.vue) — os PDFs não têm campo de formulário
// preenchível (confirmado: nenhum tem /AcroForm), então sobrepor as
// respostas registradas em cima do PDF original exigiria calibrar a posição
// exata de cada campo, em cada página, dos 7 modelos — trabalho grande e
// frágil, descartado por ora.
export const FICHA_BLANK_PDF: Record<string, string> = {
  'Anamnese e Avaliação Corporal': '/fichas-modelos/CNC-FRM-001.pdf',
  'Toxina Botulínica': '/fichas-modelos/CNC-FRM-002.pdf',
  'Toxina Botulínica + Preenchimento (mesma sessão)': '/fichas-modelos/CNC-FRM-003.pdf',
  'Registro de Administração de Tirzepatida': '/fichas-modelos/CNC-FRM-004.pdf',
  'PEIM — Procedimento Estético Injetável em Microvasos': '/fichas-modelos/CNC-FRM-005.pdf',
  'Autorização de Uso de Imagem': '/fichas-modelos/CNC-AUT-001.pdf',
  'Termo de Consentimento — Preenchimento com Ácido Hialurônico': '/fichas-modelos/CNC-TC-001.pdf',
};

// Aviso fixo impresso junto da ficha (ver AdminFichaPrintModal.vue) — o
// modelo "Registro de Administração de Tirzepatida" traz uma ressalva
// extra: o próprio formulário em papel da clínica já chega com um aviso
// interno pendente de validação jurídica/técnica sobre qual categoria
// profissional pode de fato administrar a substância (nenhuma prescrição ou
// aplicação real deveria usar esse modelo até essa validação acontecer).
export const FICHA_LEGAL_WARNING: Record<string, string> = {
  'Registro de Administração de Tirzepatida':
    'Este documento registra a administração de um medicamento sob prescrição médica válida — não é um receituário nem substitui a prescrição. A clínica não prescreve tirzepatida. Pendente de validação: confirmar formalmente com a responsável técnica/assessoria jurídica da clínica qual categoria profissional está habilitada para realizar a administração antes de usar este modelo em atendimento real.',
};

// Heurísticas de renderização pra impressão (ver AdminFichaPrintModal.vue):
// nenhuma delas precisa de metadado extra por campo — o próprio texto do
// rótulo já carrega o sinal, exatamente como no documento original (toda
// pergunta do papel termina em "?" com três caixinhas Sim/Não/N.A. ao lado).
export function isYesNoField(label: string): boolean {
  return label.trim().endsWith('?');
}

// Campos que no papel original vêm com várias linhas de espaço pra escrever
// (queixa, objetivo, observações, orientações...) — os demais ganham só uma
// linha em branco.
export function isLongTextField(label: string): boolean {
  return /queixa|objetivo|observaç|orienta|avaliação profissional|plano de atendimento|relatório de evolução/i.test(label);
}

// Agrupa uma lista de campos pelas seções (na ordem de primeira aparição),
// preservando a ordem dos campos dentro de cada seção. Campos sem `section`
// (ficha "Outro tipo" criada do zero pelo admin) caem num grupo sem título.
export function groupFieldsBySection<T extends { section?: string | null }>(fields: T[]): { section: string | null; items: T[] }[] {
  const groups: { section: string | null; items: T[] }[] = [];
  for (const field of fields) {
    const section = field.section ?? null;
    const last = groups[groups.length - 1];
    if (last && last.section === section) {
      last.items.push(field);
    } else {
      groups.push({ section, items: [field] });
    }
  }
  return groups;
}
