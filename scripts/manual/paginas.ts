/**
 * O catálogo de capturas do manual: que páginas fotografar, por que ordem, e o que apontar em cada
 * uma (§pedido do cliente 2026-09-13: capítulos por papel, "com cada tendo imagem clara com
 * ponteiros", e no fim de cada capítulo os problemas que podem enfrentar).
 *
 * Só dados — o motor que executa isto é scripts/manual/capturar.ts. A ordem dentro de cada capítulo
 * é a ordem do manual, e a ordem dos capítulos é a que o cliente pediu: Admin, DAAC, Professor,
 * Secretaria, Estudante, Dev.
 *
 * As rotas vêm da barra lateral real de cada papel (src/components/layout/Sidebar.tsx) e foram
 * confirmadas contra o site publicado por scripts/manual/descobrir.ts. Não são de memória: os
 * rótulos e as rotas já mudaram várias vezes, e um guião escrito de cabeça falha em silêncio —
 * a captura sai, mas da página errada.
 */

export type Acao =
  | { tipo: "clicar"; selector: string }
  | { tipo: "clicarTexto"; texto: string }
  | { tipo: "preencher"; selector: string; valor: string }
  | { tipo: "esperar"; ms: number }
  | { tipo: "esperarSelector"; selector: string };

export interface Ponteiro {
  /** Seletor CSS. Use `texto` em vez disto sempre que houver um rótulo visível. */
  selector?: string;
  /** O rótulo que a pessoa vê no ecrã — botão, cabeçalho, campo. É o que o manual vai citar. */
  texto?: string;
  /** A explicação que sai na legenda, a seguir ao número. */
  nota: string;
}

export interface Captura {
  /** Nome do ficheiro, sem extensão. */
  id: string;
  rota: string;
  /** Título da secção no manual. */
  titulo: string;
  /** O parágrafo que explica o ecrã. */
  legenda: string;
  ponteiros?: Ponteiro[];
  acoes?: Acao[];
  esperarPor?: string;
  /** Captura a página toda em vez de só o que cabe no ecrã. Para listas longas. */
  paginaInteira?: boolean;
  /** Recorta a imagem a este elemento — útil para um formulário dentro de uma página grande. */
  recortar?: string;
  /** A captura muda de rota de propósito (ex.: abrir a ficha de um aluno pelo nome). */
  permitirRedirecionamento?: boolean;
}

export interface Capitulo {
  /** Identificador curto — também o nome da pasta das imagens. */
  papel: string;
  /** Título do capítulo no manual. */
  nome: string;
  /** A frase de abertura do capítulo: quem é esta pessoa e o que lhe compete. */
  resumo: string;
  /** null = fotografar sem sessão (o ecrã de entrada). */
  login: { identificador: string; senha: string } | null;
  capturas: Captura[];
  /** O que pode correr mal, no fim do capítulo — sintoma e o que fazer. */
  problemas: { sintoma: string; causa: string; solucao: string }[];
}

const SENHA = "Ispc@2026";

/** Ponteiros que se repetem em todos os capítulos — a moldura do sistema. */
const PONTEIROS_MOLDURA: Ponteiro[] = [
  { selector: "aside", nota: "Menu lateral: tudo o que este papel pode fazer está aqui. Muda conforme quem entra." },
  { selector: "header", nota: "Barra de topo: a data que o sistema considera hoje, o seu nome, e a saída da conta." },
  { selector: "h1", nota: "Título da página onde está, para não se perder." },
];

export const CAPITULOS: Capitulo[] = [
  // ===========================================================================================
  {
    papel: "acesso",
    nome: "Entrar no Sistema",
    resumo:
      "Todos os papéis entram pelo mesmo ecrã. O que cada pessoa vê depois disso é que muda — " +
      "não há endereços diferentes para a Secretaria e para os estudantes.",
    login: null,
    capturas: [
      {
        id: "login",
        rota: "/login",
        titulo: "O ecrã de entrada",
        legenda:
          "Pode entrar com o email ou com o número de estudante — o sistema aceita os dois no mesmo campo. " +
          "A senha inicial de qualquer conta nova é Ispc@2026, e o sistema obriga a trocá-la na primeira entrada.",
        ponteiros: [
          { selector: 'input[name="identificador"]', nota: "Email (ex. secretaria@ispc.ao) ou número de estudante (ex. ISPC2026-0001)." },
          { selector: 'input[name="password"]', nota: "Senha. Na primeira entrada é a senha inicial dada pelo Administrador." },
          { selector: 'button[type="submit"]', nota: "Entrar." },
        ],
      },
    ],
    problemas: [
      {
        sintoma: "A senha não é aceite e a pessoa jura que está certa.",
        causa: "A senha foi reposta pelo Administrador, ou nunca foi trocada depois de a conta ser criada.",
        solucao:
          "Tente a senha inicial Ispc@2026. Se não entrar, o Administrador repõe a senha em Usuários > Professores " +
          "ou Usuários > Equipa, com o botão Repor Senha — o estado ao lado do nome diz se a conta ainda está na senha padrão.",
      },
      {
        sintoma: "Entra e é logo mandado para um ecrã de trocar a senha, sem conseguir sair dele.",
        causa: "É o comportamento esperado de uma conta nova ou recém-reposta.",
        solucao: "Defina a senha nova. Só depois disso o resto do sistema fica acessível.",
      },
      {
        sintoma: "Entra mas cai numa página diferente da que esperava.",
        causa: "Cada papel tem a sua página de entrada — o Professor vai para as suas disciplinas, o Dev para as reclamações.",
        solucao: "Não é erro. Use o menu lateral para navegar.",
      },
    ],
  },

  // ===========================================================================================
  {
    papel: "admin",
    nome: "Administrador",
    resumo:
      "O Administrador é quem monta o sistema e quem manda nas contas. É o único papel que cria " +
      "professores e staff, que repõe senhas, que mexe na configuração financeira e que vê o registo " +
      "de auditoria. Partilha a gestão académica com o DAAC.",
    login: { identificador: "admin@ispc.ao", senha: SENHA },
    capturas: [
      {
        id: "dashboard",
        rota: "/dashboard",
        titulo: "Página Inicial",
        legenda:
          "O resumo do sistema. A secção 'A precisar de atenção' é a mais útil no dia a dia: enquanto " +
          "houver trabalho por fazer ali, há professores e alunos que não conseguem usar as disciplinas.",
        ponteiros: [
          ...PONTEIROS_MOLDURA,
          { texto: "A PRECISAR DE ATENÇÃO", nota: "Trabalho pendente que está a travar outras pessoas — disciplinas sem professor, horários por marcar." },
          { texto: "Atribuir professores", nota: "Atalho directo para resolver as disciplinas sem professor." },
        ],
      },
      {
        id: "configuracao-academica",
        rota: "/admin/academico/configuracao",
        titulo: "Configuração Académica",
        legenda:
          "O primeiro ecrã a preencher num sistema novo. Define as datas do ano letivo, a janela em que a " +
          "Secretaria pode processar rematrículas, qual é o semestre corrente, e se os professores podem " +
          "ou não lançar notas neste momento.",
        paginaInteira: true,
        ponteiros: [
          { texto: "1º Semestre", nota: "O semestre corrente. Só as disciplinas deste semestre ficam abertas aos professores." },
          { texto: "Aberto", nota: "Lançamento de notas. Fechado aqui, nenhum professor consegue lançar — o DAAC continua a poder." },
          { texto: "Guardar", nota: "Nada é aplicado antes de guardar." },
        ],
      },
      {
        id: "cursos",
        rota: "/admin/cursos",
        titulo: "Cursos",
        legenda:
          "Os cursos que o Instituto oferece. A duração em anos que definir aqui é o que limita até que ano " +
          "curricular se podem criar turmas e plano curricular.",
        ponteiros: [
          { texto: "Adicionar", nota: "Criar um curso novo: nome, código e duração em anos." },
        ],
      },
      {
        id: "disciplinas",
        rota: "/admin/disciplinas",
        titulo: "Disciplinas",
        legenda:
          "O catálogo de disciplinas. Criar a disciplina aqui não a põe em nenhum ano — isso é o passo " +
          "seguinte, no Plano Curricular. São dois passos de propósito: a mesma disciplina pode entrar em " +
          "vários cursos sem ser duplicada.",
        paginaInteira: true,
        ponteiros: [
          { texto: "Adicionar", nota: "Criar uma disciplina: nome, código e carga horária." },
          { texto: "Filtrar", nota: "Filtrar por curso quando a lista crescer." },
        ],
      },
      {
        id: "plano-curricular",
        rota: "/admin/curriculo",
        titulo: "Plano Curricular",
        legenda:
          "Onde se diz em que ano e semestre de cada curso se lecciona cada disciplina. É esta ligação — a " +
          "cadeira curricular — que faz as turmas nascerem já com as disciplinas certas, e é aqui que se " +
          "marca a monografia do último ano.",
        paginaInteira: true,
        ponteiros: [
          { texto: "Adicionar ao plano", nota: "Põe uma disciplina num ano e semestre de um curso." },
          { texto: "Editar", nota: "Regras da cadeira: se permite dispensa, a nota mínima, e se é a monografia." },
        ],
      },
      {
        id: "turmas",
        rota: "/admin/turmas",
        titulo: "Turmas",
        legenda:
          "Uma turma é uma coorte: curso, ano curricular, período e ano letivo. Ao criar a turma, as " +
          "disciplinas vêm automaticamente do plano curricular — só falta atribuir o professor a cada uma.",
        paginaInteira: true,
        ponteiros: [
          { texto: "Criar turma", nota: "Criar a coorte. As disciplinas do plano entram sozinhas." },
          { texto: "Filtrar", nota: "Filtrar por curso, ano ou ano letivo." },
        ],
      },
      {
        id: "turma-detalhe",
        rota: "/admin/turmas",
        titulo: "Dentro de uma turma",
        legenda:
          "Aqui atribui-se o professor a cada disciplina da turma. Uma disciplina sem professor continua a " +
          "existir e o aluno vê-a, mas a pauta fica só de leitura: não há quem possa lançar notas nem marcar presenças.",
        acoes: [{ tipo: "clicarTexto", texto: "Engenharia Informática" }, { tipo: "esperar", ms: 2500 }],
        permitirRedirecionamento: true,
        paginaInteira: true,
      },
      {
        id: "precos",
        rota: "/admin/precos",
        titulo: "Preços de Propina",
        legenda:
          "O preço mensal da propina, por categoria de estudante e por ano curricular. É igual em todos os " +
          "cursos. As três categorias são Normal, Bolseiro INAGBE e Comparticipada.",
        paginaInteira: true,
      },
      {
        id: "emolumentos",
        rota: "/admin/emolumentos",
        titulo: "Emolumentos",
        legenda:
          "O catálogo de declarações, certidões e outros serviços pagos. Os alunos vêem esta lista e é por " +
          "aqui que sabem quanto custa cada pedido.",
        ponteiros: [
          { texto: "Adicionar", nota: "Criar um serviço novo com o seu preço." },
          { texto: "Ativo", nota: "Desligar um serviço esconde-o dos alunos sem apagar o histórico." },
        ],
      },
      {
        id: "finalistas",
        rota: "/admin/finalistas",
        titulo: "Finalistas",
        legenda:
          "Os alunos no último ano. A monografia é atribuída ao confirmar o pagamento; depois disso atribui-se " +
          "o orientador, marca-se a defesa e lança-se a nota. A nota da defesa é única — não há recurso.",
        paginaInteira: true,
        ponteiros: [
          { texto: "Pauta de defesas", nota: "A pauta impressa das defesas marcadas." },
          { texto: "Lançar", nota: "Lançar a nota da defesa. Só o DAAC e o Administrador podem — nem o orientador." },
        ],
      },
      {
        id: "notas",
        rota: "/notas",
        titulo: "Notas e Frequência",
        legenda:
          "A entrada para as pautas de todas as turmas. O Administrador e o DAAC podem lançar notas em " +
          "qualquer disciplina e em qualquer semestre, mesmo com o lançamento fechado aos professores.",
        paginaInteira: true,
      },
      {
        id: "horario",
        rota: "/horario",
        titulo: "Horário e Provas",
        legenda:
          "As aulas semanais e as datas das provas. As provas seguem uma ordem obrigatória: não se marca o " +
          "exame antes da P2, nem o recurso antes do exame.",
        ponteiros: [
          { texto: "Aulas", nota: "O horário semanal das aulas." },
          { texto: "Provas", nota: "As datas e salas das provas de cada época." },
        ],
      },
      {
        id: "registo-pagamentos",
        rota: "/financeiro/registo",
        titulo: "Registo de Pagamentos",
        legenda:
          "Pesquisa-se o aluno pelo nome, confirmam-se os meses pagos em lote e emite-se o recibo. É também " +
          "aqui que se reverte um pagamento confirmado por engano.",
      },
      {
        id: "devedores",
        rota: "/financeiro/devedores",
        titulo: "Lista de Devedores",
        legenda:
          "Alunos com propinas ou multas em atraso além da tolerância. Pode ordenar-se por antiguidade da " +
          "dívida, por valor ou por nome, e imprimir-se.",
        paginaInteira: true,
        ponteiros: [
          { texto: "Antiguidade", nota: "Ordenar pela dívida mais antiga — normalmente a mais urgente." },
          { texto: "Imprimir", nota: "Lista em papel para a reunião ou para o arquivo." },
        ],
      },
      {
        id: "configuracao-financeira",
        rota: "/admin/financeiro/configuracao",
        titulo: "Configuração Financeira",
        legenda:
          "O dia de vencimento das propinas, a tolerância antes de haver multa, o valor da multa, e o " +
          "bloqueio de acesso às notas por dívida. Exclusivo do Administrador.",
        paginaInteira: true,
      },
      {
        id: "professores",
        rota: "/admin/professores",
        titulo: "Professores",
        legenda:
          "As contas do corpo docente. Cada professor criado aqui recebe uma conta com a senha inicial. O " +
          "estado ao lado do nome diz se a pessoa já definiu a senha dela ou se ainda está na padrão.",
        paginaInteira: true,
        ponteiros: [
          { texto: "Adicionar", nota: "Criar um professor e a conta de acesso dele." },
          { texto: "Repor Senha", nota: "Devolve a conta à senha inicial. Use quando alguém perde a senha." },
        ],
      },
      {
        id: "equipa",
        rota: "/admin/equipa",
        titulo: "Equipa",
        legenda:
          "As contas do DAAC, da Secretaria e do responsável técnico. É o ecrã mais sensível do sistema e só " +
          "o Administrador o vê.",
        ponteiros: [
          { texto: "Adicionar", nota: "Criar uma conta de staff, escolhendo o papel." },
          { texto: "Repor Senha", nota: "Repor a senha de um membro da equipa." },
        ],
      },
      {
        id: "gestao-matricula",
        rota: "/alunos",
        titulo: "Gestão de Matrícula",
        legenda:
          "A lista de estudantes e o ponto de entrada para a ficha de cada um. É por aqui que se matricula " +
          "alguém novo e que se acompanha o percurso de quem já está.",
        paginaInteira: true,
        ponteiros: [
          { texto: "Nova matrícula", nota: "Matricular um estudante novo." },
          { texto: "Filtrar", nota: "Filtrar por curso, ano, estado ou nome." },
        ],
      },
      {
        id: "ficha-aluno",
        rota: "/alunos",
        titulo: "A ficha de um estudante",
        legenda:
          "Tudo sobre uma pessoa num só lugar: dados, situação financeira, aproveitamento, documentos e " +
          "histórico. É também daqui que se processa a rematrícula para o ano seguinte.",
        acoes: [{ tipo: "clicarTexto", texto: "Marta Kiala" }, { tipo: "esperar", ms: 2500 }],
        permitirRedirecionamento: true,
        paginaInteira: true,
      },
      {
        id: "auditoria",
        rota: "/auditoria",
        titulo: "Registo de Auditoria",
        legenda:
          "Todas as acções feitas no sistema, com quem as fez, quando e de que endereço. Não se apaga nem se " +
          "edita. É o que responde a 'quem mudou esta nota?'.",
        paginaInteira: true,
      },
    ],
    problemas: [
      {
        sintoma: "Criei a disciplina mas ela não aparece em nenhuma turma.",
        causa: "Criar a disciplina no catálogo não a põe em nenhum ano do curso.",
        solucao:
          "Vá a Gestão Académica > Plano Curricular e use Adicionar ao plano para dizer em que ano e semestre " +
          "ela se lecciona. Só depois as turmas desse ano a passam a ter.",
      },
      {
        sintoma: "O professor diz que não consegue lançar notas.",
        causa: "Três causas possíveis, por ordem de probabilidade.",
        solucao:
          "Confirme em Configuração Académica se o lançamento de notas está Aberto; se a disciplina é do " +
          "semestre corrente; e se a disciplina tem professor atribuído na turma. Uma disciplina sem professor " +
          "tem a pauta só de leitura.",
      },
      {
        sintoma: "A Secretaria não consegue processar uma rematrícula.",
        causa: "A janela de matrícula está fechada, ou o aluno tem cadeiras por avaliar.",
        solucao:
          "Veja as datas da janela em Configuração Académica. Se estiver dentro do prazo, o problema é do " +
          "aluno: uma cadeira sem nota lançada impede a rematrícula, de propósito.",
      },
      {
        sintoma: "Apaguei uma conta por engano.",
        causa: "Não há desfazer.",
        solucao:
          "Crie a conta outra vez com o mesmo email. O histórico de acções continua no Registo de Auditoria, " +
          "que nunca se apaga.",
      },
      {
        sintoma: "Um aluno finalista aparece como Trancado no fim do ano.",
        causa: "Ele não renovou a matrícula e a defesa ainda não tinha nota lançada.",
        solucao:
          "Lance a nota da defesa em Finalistas. Um finalista com a monografia aprovada no curso e ano da " +
          "última matrícula passa a Formado, não a Trancado.",
      },
    ],
  },

  // ===========================================================================================
  {
    papel: "daac",
    nome: "DAAC",
    resumo:
      "O DAAC trata do académico: cursos, disciplinas, plano curricular, turmas, horários, notas, " +
      "finalistas e o percurso dos estudantes. Vê a situação financeira de um aluno, mas não registra " +
      "pagamentos, e não mexe em contas de staff nem na configuração financeira.",
    login: { identificador: "daac@ispc.ao", senha: SENHA },
    capturas: [
      {
        id: "dashboard",
        rota: "/dashboard",
        titulo: "Página Inicial do DAAC",
        legenda: "O mesmo resumo do Administrador, sem as secções que não são do domínio do DAAC.",
        ponteiros: PONTEIROS_MOLDURA,
      },
      {
        id: "plano-curricular",
        rota: "/admin/curriculo",
        titulo: "Plano Curricular",
        legenda:
          "O ecrã central do DAAC. Define o desenho de cada curso, e é aqui que se marca qual é a cadeira " +
          "de monografia do último ano — o sistema não adivinha qual é.",
        paginaInteira: true,
        ponteiros: [
          { texto: "Adicionar ao plano", nota: "Pôr uma disciplina num ano e semestre." },
          { texto: "Editar", nota: "Marcar a monografia, e as regras de dispensa da cadeira." },
        ],
      },
      {
        id: "turmas",
        rota: "/admin/turmas",
        titulo: "Turmas",
        legenda: "Criar as coortes do ano letivo e atribuir os professores às disciplinas de cada uma.",
        paginaInteira: true,
      },
      {
        id: "finalistas",
        rota: "/admin/finalistas",
        titulo: "Finalistas e Orientadores",
        legenda:
          "O DAAC confirma o pagamento da monografia, atribui o orientador, marca a defesa e lança a nota. " +
          "Há um limite de orientandos por professor, configurável em Configuração Académica.",
        paginaInteira: true,
        ponteiros: [
          { texto: "Lançar", nota: "A nota da defesa. Única — sem recurso nem exame especial." },
          { texto: "Pauta de defesas", nota: "A pauta das defesas marcadas, para imprimir." },
        ],
      },
      {
        id: "notas",
        rota: "/notas",
        titulo: "Notas e Frequência",
        legenda:
          "O DAAC lança notas em qualquer disciplina e em qualquer semestre, mesmo quando o lançamento está " +
          "fechado aos professores. É o que permite corrigir uma nota depois de o semestre fechar.",
        paginaInteira: true,
      },
      {
        id: "horario",
        rota: "/horario",
        titulo: "Horário e Provas",
        legenda: "As aulas semanais e as datas das provas de cada época.",
      },
      {
        id: "gestao-estudante",
        rota: "/alunos",
        titulo: "Gestão de Estudante",
        legenda:
          "Aproveitamento, histórico e documentos de cada estudante. O DAAC vê a situação financeira em modo " +
          "de leitura — registar pagamentos é da Secretaria e do Administrador.",
        paginaInteira: true,
      },
      {
        id: "configuracao-academica",
        rota: "/admin/academico/configuracao",
        titulo: "Configuração Académica",
        legenda:
          "O semestre corrente, a janela de matrícula, as regras de retenção e o limite de orientandos por " +
          "professor. Mudar o semestre aqui fecha o anterior.",
        paginaInteira: true,
      },
    ],
    problemas: [
      {
        sintoma: "A monografia não aparece ao aluno do último ano.",
        causa: "A cadeira do último ano não está marcada como monografia, ou o pagamento não foi confirmado.",
        solucao:
          "Em Plano Curricular, edite a cadeira do último ano e marque-a como monografia. Depois, em " +
          "Finalistas, confirme o pagamento — é isso que dá a monografia ao aluno.",
      },
      {
        sintoma: "Não consigo atribuir mais orientandos a um professor.",
        causa: "Ele chegou ao limite configurado.",
        solucao:
          "Escolha outro professor, ou suba o limite em Configuração Académica. O valor 0 significa sem limite.",
      },
      {
        sintoma: "Mudei o semestre e as notas do semestre anterior ficaram fechadas.",
        causa: "É o comportamento esperado — mudar de semestre fecha o anterior aos professores.",
        solucao:
          "O DAAC continua a poder lançar e corrigir em qualquer semestre. Faça-o em Notas e Frequência.",
      },
      {
        sintoma: "Criei a turma mas ela não tem disciplinas.",
        causa: "O plano curricular desse curso e ano está vazio.",
        solucao:
          "Preencha o Plano Curricular primeiro. As disciplinas de uma turma nascem do plano, não se " +
          "acrescentam à mão uma a uma.",
      },
    ],
  },

  // ===========================================================================================
  {
    papel: "professor",
    nome: "Professor",
    resumo:
      "O professor trata das disciplinas que lhe foram atribuídas: marca presenças, lança notas e " +
      "acompanha os orientandos. Não cria disciplinas nem turmas, e não lança a nota de uma defesa.",
    login: { identificador: "antonio.sousa@ispc.ao", senha: SENHA },
    capturas: [
      {
        id: "minhas-disciplinas",
        rota: "/professor",
        titulo: "Minhas Disciplinas",
        legenda:
          "As disciplinas atribuídas a si no semestre corrente. Cada uma abre a pauta, onde se lançam as " +
          "notas e se marcam as presenças.",
        paginaInteira: true,
        ponteiros: PONTEIROS_MOLDURA,
      },
      {
        id: "pauta",
        rota: "/professor",
        titulo: "A pauta de uma disciplina",
        legenda:
          "Uma linha por aluno e uma coluna por época. A média de frequência sai do P1 e do P2; o exame só " +
          "entra para quem não ficou dispensado. Guarde antes de sair — o editor fecha ao guardar.",
        acoes: [{ tipo: "clicarTexto", texto: "Programação I" }, { tipo: "esperar", ms: 2500 }],
        permitirRedirecionamento: true,
        paginaInteira: true,
      },
      {
        id: "horario",
        rota: "/horario",
        titulo: "Meu Horário",
        legenda: "As suas aulas da semana e as provas que tem marcadas.",
      },
      {
        id: "orientandos",
        rota: "/professor/orientandos",
        titulo: "Meus Orientandos",
        legenda:
          "Os finalistas que orienta, com o estado da defesa de cada um. A nota da defesa não é lançada por " +
          "si — é do júri, pelo DAAC.",
        paginaInteira: true,
      },
      {
        id: "reclamacoes",
        rota: "/reclamacoes",
        titulo: "Reclamações e Sugestões",
        legenda:
          "O canal para reportar problemas do sistema ou sugerir melhorias. Vai para o responsável técnico, " +
          "não para a direcção académica.",
      },
    ],
    problemas: [
      {
        sintoma: "Guardei a nota, ela ficou guardada, mas o editor não fechou.",
        causa: "Era um defeito conhecido, corrigido.",
        solucao: "Se voltar a acontecer, recarregue a página — a nota está guardada. E reporte em Reclamações.",
      },
      {
        sintoma: "Os campos de nota estão bloqueados.",
        causa: "O lançamento de notas está fechado, a disciplina não é do semestre corrente, ou é uma monografia.",
        solucao:
          "Fale com o DAAC para reabrir o lançamento. Numa monografia os campos estão bloqueados de propósito: " +
          "a nota da defesa é lançada pelo DAAC.",
      },
      {
        sintoma: "Falta um aluno na minha pauta.",
        causa: "Ele não está inscrito na cadeira, ou a matrícula dele está trancada.",
        solucao: "Peça à Secretaria para confirmar a matrícula e a inscrição dele nessa cadeira.",
      },
      {
        sintoma: "Um repetente aparece sem presenças nas aulas já dadas.",
        causa: "Ele inscreveu-se depois de essas aulas terem sido marcadas.",
        solucao: "Marque as presenças em falta na lista de aulas dessa disciplina.",
      },
      {
        sintoma: "Não vejo nenhuma disciplina.",
        causa: "Nenhuma disciplina lhe foi atribuída neste semestre.",
        solucao: "O DAAC atribui os professores às disciplinas dentro de cada turma.",
      },
    ],
  },

  // ===========================================================================================
  {
    papel: "secretaria",
    nome: "Secretaria",
    resumo:
      "A Secretaria é o balcão: matricula estudantes, registra pagamentos, emite recibos e acompanha " +
      "devedores. Não mexe em cursos, disciplinas nem notas.",
    login: { identificador: "secretaria@ispc.ao", senha: SENHA },
    capturas: [
      {
        id: "dashboard",
        rota: "/dashboard",
        titulo: "Página Inicial",
        legenda: "O resumo do dia: o que está por cobrar e o que precisa de atenção.",
        ponteiros: PONTEIROS_MOLDURA,
      },
      {
        id: "registo-pagamentos",
        rota: "/financeiro/registo",
        titulo: "Registo de Pagamentos",
        legenda:
          "O ecrã do dia a dia, com letras maiores de propósito. Pesquisa-se o aluno pelo nome, marcam-se os " +
          "meses que ele está a pagar, confirma-se e imprime-se o recibo.",
        ponteiros: [
          { texto: "Pesquis", nota: "Pesquisar o aluno pelo nome ou número de estudante." },
        ],
      },
      {
        id: "gestao-matricula",
        rota: "/alunos",
        titulo: "Gestão de Matrícula",
        legenda:
          "Matricular estudantes novos e processar rematrículas para o ano seguinte, dentro da janela " +
          "definida pelo DAAC.",
        paginaInteira: true,
        ponteiros: [{ texto: "Nova matrícula", nota: "Matricular um estudante novo." }],
      },
      {
        id: "ficha-aluno",
        rota: "/alunos",
        titulo: "A ficha de um estudante",
        legenda:
          "A situação financeira, o aproveitamento e o histórico. É daqui que se processa a rematrícula e se " +
          "reactiva quem ficou trancado.",
        acoes: [{ tipo: "clicarTexto", texto: "Sandra Vieira Dias" }, { tipo: "esperar", ms: 2500 }],
        permitirRedirecionamento: true,
        paginaInteira: true,
      },
      {
        id: "devedores",
        rota: "/financeiro/devedores",
        titulo: "Lista de Devedores",
        legenda: "Quem está em atraso, há quanto tempo e quanto deve. Ordenável e imprimível.",
        paginaInteira: true,
      },
      {
        id: "reclamacoes",
        rota: "/reclamacoes",
        titulo: "Reclamações e Sugestões",
        legenda: "Para reportar problemas do sistema ao responsável técnico.",
      },
    ],
    problemas: [
      {
        sintoma: "Confirmei um pagamento no aluno errado.",
        causa: "Engano de balcão.",
        solucao:
          "Em Registo de Pagamentos, procure o aluno e reverta o pagamento. A reversão fica registada na " +
          "auditoria, com o seu nome.",
      },
      {
        sintoma: "O botão de processar rematrícula não aparece.",
        causa: "A janela de matrícula está fechada.",
        solucao:
          "Confirme as datas com o DAAC. Fora da janela, só o Administrador pode matricular — e pode haver " +
          "multa por rematrícula tardia, se estiver configurada.",
      },
      {
        sintoma: "O sistema recusa a rematrícula de um aluno.",
        causa: "Ele tem cadeiras por avaliar, ou reprovações acima do limite.",
        solucao:
          "Uma cadeira sem nota lançada impede a rematrícula. Peça ao professor ou ao DAAC para lançar as " +
          "notas que faltam.",
      },
      {
        sintoma: "Um aluno diz que pagou mas continua na lista de devedores.",
        causa: "O pagamento não foi confirmado no sistema, ou foi confirmado noutro mês.",
        solucao:
          "Abra a ficha dele e veja mês a mês o que está pago. Confirme o mês certo — a dívida é por mês de " +
          "referência, não um saldo global.",
      },
      {
        sintoma: "Não consigo abrir as notas de um aluno.",
        causa: "A Secretaria não tem acesso a notas.",
        solucao: "É o DAAC que trata de notas. Não é uma avaria.",
      },
    ],
  },

  // ===========================================================================================
  {
    papel: "estudante",
    nome: "Estudante",
    resumo:
      "O estudante consulta o que é dele: notas, horário, propinas e, se for finalista, a monografia. " +
      "Não altera nada — excepto a própria senha e o envio de reclamações.",
    login: { identificador: "helder.zua@aluno.ispc.ao", senha: SENHA },
    capturas: [
      {
        id: "dashboard",
        rota: "/dashboard",
        titulo: "Página Inicial do Estudante",
        legenda: "O resumo do percurso: o ano em que está, as propinas e o que tem por fazer.",
        ponteiros: PONTEIROS_MOLDURA,
      },
      {
        id: "minhas-notas",
        rota: "/minhas-notas",
        titulo: "Minhas Notas",
        legenda:
          "As notas por ano do curso, com o estado de cada cadeira. Pode imprimir as notas de cada ano " +
          "separadamente. Quando repete uma cadeira e a supera, a reprovação anterior deixa de aparecer.",
        paginaInteira: true,
        ponteiros: [{ texto: "Imprimir", nota: "Imprime as notas do ano que está a ver." }],
      },
      {
        id: "finalista",
        rota: "/finalista",
        titulo: "Finalista",
        legenda:
          "Só aparece a quem tem monografia. Mostra o orientador e os contactos dele, a data e a sala da " +
          "defesa, e a nota depois de lançada.",
        paginaInteira: true,
      },
      {
        id: "horario",
        rota: "/horario",
        titulo: "Meu Horário",
        legenda: "As aulas da semana e as datas das provas.",
      },
      {
        id: "propinas",
        rota: "/financeiro",
        titulo: "Minhas Propinas",
        legenda:
          "Mês a mês, o que está pago e o que está em dívida. Se o bloqueio por dívida estiver activo, é " +
          "aqui que se percebe porque é que as notas deixaram de abrir.",
        paginaInteira: true,
      },
      {
        id: "emolumentos",
        rota: "/financeiro/emolumentos",
        titulo: "Catálogo de Emolumentos",
        legenda: "Quanto custa cada declaração, certidão ou segunda via, para saber antes de ir ao balcão.",
      },
      {
        id: "reclamacoes",
        rota: "/reclamacoes",
        titulo: "Reclamações e Sugestões",
        legenda: "Para reportar um problema do sistema ou sugerir uma melhoria.",
      },
    ],
    problemas: [
      {
        sintoma: "As minhas notas não abrem.",
        causa: "Bloqueio por propinas em atraso.",
        solucao:
          "Veja Minhas Finanças > Minhas Propinas. Regularize na Secretaria; o acesso volta logo que o " +
          "pagamento for confirmado.",
      },
      {
        sintoma: "O professor disse que lançou a nota, mas não a vejo.",
        causa: "A nota pode estar lançada numa época que ainda não conta, ou há um atraso de confirmação.",
        solucao: "Espere um dia. Se continuar, reporte em Reclamações, dizendo a disciplina e a época.",
      },
      {
        sintoma: "Reprovei e repeti a cadeira. Ainda vejo a nota antiga.",
        causa: "A nota antiga só desaparece quando a repetição for aprovada.",
        solucao: "Depois de aprovar na repetição, a reprovação anterior deixa de aparecer.",
      },
      {
        sintoma: "Não vejo o menu Finalista.",
        causa: "Só aparece a quem tem monografia atribuída.",
        solucao: "A monografia é atribuída pelo DAAC ao confirmar o pagamento. Fale com a Secretaria.",
      },
      {
        sintoma: "Ainda não me foi atribuído um orientador.",
        causa: "A atribuição é feita pelo DAAC.",
        solucao: "Fale com a Secretaria se demorar mais do que o esperado.",
      },
    ],
  },

  // ===========================================================================================
  {
    papel: "dev",
    nome: "Responsável Técnico",
    resumo:
      "O responsável técnico tem uma função única no sistema: receber e dar seguimento às reclamações " +
      "e sugestões de todos os outros papéis. Não gere nada de académico nem de financeiro.",
    login: { identificador: "dev@ispc.ao", senha: SENHA },
    capturas: [
      {
        id: "caixa-reclamacoes",
        rota: "/admin/reclamacoes",
        titulo: "Caixa de Reclamações e Sugestões",
        legenda:
          "Tudo o que os estudantes, professores e staff reportam sobre o sistema chega aqui. Cada entrada " +
          "passa por Pendente, Em análise e Resolvido, e pode levar uma resposta curta que o autor vê.",
        paginaInteira: true,
        ponteiros: PONTEIROS_MOLDURA,
      },
    ],
    problemas: [
      {
        sintoma: "A barra lateral só tem um item.",
        causa: "É o esperado — o papel tem uma só função.",
        solucao:
          "Se precisar das ferramentas de simulação (relógio simulado e sala de comando), elas só aparecem " +
          "quando o modo de simulação está ligado nas variáveis de ambiente do servidor. Em operação real " +
          "está desligado, de propósito.",
      },
      {
        sintoma: "Uma reclamação não diz quem a enviou.",
        causa: "Foi enviada por uma conta de staff sem ficha de professor nem de estudante.",
        solucao: "O nome da conta aparece na entrada. Se faltar, veja o Registo de Auditoria pela data.",
      },
    ],
  },
];
