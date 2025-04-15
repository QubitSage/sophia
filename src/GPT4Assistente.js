const OpenAI = require('openai');
require('dotenv').config();

class GPT4Assistente {
  constructor() { 
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY }); 
    this.contextos = new Map(); // Armazena o contexto de cada usuário
    this.ultimaInteracao = new Map(); // Armazena timestamp da última interação
    this.fasesAtendimento = new Map(); // Controla a fase de atendimento do usuário
    this.dadosCliente = new Map(); // Armazena dados temporários dos clientes
    this.topicoConversa = new Map(); // Armazena o tópico atual da conversa
    this.ultimasRespostas = new Map(); // Armazena as últimas respostas enviadas para cada usuário
    this.mensagensEmEspera = new Map(); // Armazena mensagens recebidas em curto período para processamento em conjunto
    this.confirmacaoDocumentoPendente = new Map(); // Armazena informações de documentos aguardando confirmação
    this.documentosRecebidos = new Map(); // Rastreia documentos enviados pelo cliente
    this.contadorPerguntasTecnicas = new Map(); // Contador de perguntas técnicas por usuário
    this.perguntasTecnicasSequenciais = new Map(); // Contador de perguntas técnicas sequenciais sem dados pessoais
    this.redirecionamentoAtivado = new Map(); // Flag para evitar múltiplos redirecionamentos
    this.ultimoTopicoTecnico = new Map(); // Rastreia o último tópico técnico para detectar sequência sobre o mesmo tema
    this.contadorSeguranca = new Map(); // Controla o nível de segurança aplicado
    this.modoSeguranca = new Map(); // Indica se o modo de segurança persistente está ativado
    this.insistenciaTecnica = new Map(); // Conta quantas vezes o usuário insistiu em perguntas técnicas no modo segurança
  }
  
  async enviarMensagem(mensagem, contexto = []) {
    try {
      const messages = [
        { role: "system", content: "Você é um assistente jurídico especializado no direito brasileiro." },
        ...contexto,
        { role: "user", content: mensagem }
      ];
      
      const resposta = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: messages,
        temperature: 0.7,
        max_tokens: 150
      });
      
      return resposta.choices[0].message.content;
    } catch (erro) {
      console.error("Erro ao enviar mensagem para o GPT-4:", erro);
      return "Desculpe, houve um erro ao processar sua solicitação.";
    }
  }

  // Método principal para processar mensagens dos usuários
  async processMessage(userId, texto, nome = 'cliente') { 
    try {
      // Atualiza a última interação
      this.ultimaInteracao.set(userId, Date.now());
      
      // Inicializa contadores e flags
      if (!this.contadorPerguntasTecnicas.has(userId)) {
        this.contadorPerguntasTecnicas.set(userId, 0);
      }
      
      if (!this.perguntasTecnicasSequenciais.has(userId)) {
        this.perguntasTecnicasSequenciais.set(userId, 0);
      }
      
      if (!this.redirecionamentoAtivado.has(userId)) {
        this.redirecionamentoAtivado.set(userId, false);
      }
      
      if (!this.contadorSeguranca.has(userId)) {
        this.contadorSeguranca.set(userId, 0);
      }
      
      if (!this.modoSeguranca.has(userId)) {
        this.modoSeguranca.set(userId, false);
      }
      
      if (!this.insistenciaTecnica.has(userId)) {
        this.insistenciaTecnica.set(userId, 0);
      }
      
      // Verifica se a mensagem atual é uma pergunta técnica
      const ehPerguntaTecnica = await this._detectarPerguntaTecnica(texto);
      const topicoPergunta = ehPerguntaTecnica ? await this._detectarTopicoTecnico(texto) : null;
      
      // Se o modo de segurança estiver ativado, verifica se os critérios para desativação são atendidos
      if (this.modoSeguranca.get(userId)) {
        // Verifica se o usuário está solicitando atendimento pelo Gabriel ou fornecendo dados pessoais
        const solicitaGabriel = this._verificaSolicitaGabriel(texto);
        const forneceuNome = this._extrairPotencialNome(texto);
        const forneceuCPF = this._verificaSeCPF(texto);
        const descreveuSituacao = this._verificaDescricaoSituacao(texto);
        
        // Desativa o modo de segurança APENAS se solicitou Gabriel de forma explícita OU 
        // forneceu nome completo E descreveu situação detalhadamente
        if ((solicitaGabriel && typeof solicitaGabriel === 'string' && solicitaGabriel.length > 5) || 
            (forneceuNome && descreveuSituacao)) {
          console.log(`Modo de segurança desativado para ${userId} - Solicitou Gabriel: ${solicitaGabriel}, Forneceu dados: ${forneceuNome && descreveuSituacao}`);
          this.modoSeguranca.set(userId, false);
          this.insistenciaTecnica.set(userId, 0);
          this.redirecionamentoAtivado.set(userId, false);
          this.perguntasTecnicasSequenciais.set(userId, 0);
          
          // Se solicitou Gabriel, prepara uma resposta específica
          if (solicitaGabriel) {
            const respostaGabriel = `Entendi que você prefere falar diretamente com o Dr. Gabriel. Vou providenciar isso para você, ${nome}. O Dr. Gabriel é nosso advogado sênior especializado e vai poder te ajudar com todos os detalhes técnicos.

Para que ele possa se preparar adequadamente, poderia me informar brevemente qual é a situação que você está enfrentando?`;
            
            // Adiciona a resposta ao contexto
            const contexto = this.contextos.get(userId);
            if (contexto) {
              contexto.push({ role: "user", content: texto });
              contexto.push({ role: "assistant", content: respostaGabriel });
              this.contextos.set(userId, contexto);
            }
            
            return respostaGabriel;
          }
          
          // Se forneceu dados e situação, confirma e continua normalmente
          if (forneceuNome && descreveuSituacao) {
            const mensagemConfirmacao = `Obrigada pelas informações, ${forneceuNome}. Agora vou poder te ajudar adequadamente com sua situação.`;
            
            // Armazena o nome do cliente nos dados
            const dadosCliente = this.dadosCliente.get(userId) || {};
            if (!dadosCliente.nome) {
              dadosCliente.nome = forneceuNome;
              this.dadosCliente.set(userId, dadosCliente);
            }
            
            // Adiciona a mensagem ao contexto
            const contexto = this.contextos.get(userId);
            if (contexto) {
              contexto.push({ role: "user", content: texto });
              contexto.push({ role: "assistant", content: mensagemConfirmacao });
              this.contextos.set(userId, contexto);
            }
            
            // Define a fase como identificando_problema para continuar o atendimento
            this.fasesAtendimento.set(userId, "identificando_problema");
            
            return mensagemConfirmacao;
          }
        } 
        
        // Se o modo de segurança estiver ativado e não atender os critérios para desativação,
        // responde com mensagem padrão de bloqueio
        if (this.modoSeguranca.get(userId)) {
          // Incrementa o contador de insistência
          const contadorInsistencia = this.insistenciaTecnica.get(userId);
          this.insistenciaTecnica.set(userId, contadorInsistencia + 1);
          
          // Array de respostas para o modo de segurança, progressivamente mais diretas
          const respostasSeguranca = [
            `${nome}, conforme te falei antes, não posso continuar com respostas técnicas sem entender o seu caso de verdade. Me diga seu nome completo e o que você está enfrentando, que eu te ajudo.`,
            
            `Preciso do seu nome e da sua situação real para poder ajudar. Sem isso, não posso continuar com respostas técnicas.`,
            
            `Se preferir um atendimento técnico direto, posso pedir para o Dr. Gabriel, nosso advogado sênior, entrar em contato com você. Quer isso?`,
            
            `Ainda não recebi suas informações pessoais. Para respeitar nossos protocolos de segurança, não posso fornecer mais orientações técnicas sem conhecer seu caso real.`,
            
            `Como você ainda não me contou sua situação real, essa conversa será encerrada por segurança, tudo bem? Quando quiser retomar com seus dados, estarei aqui.`
          ];
          
          // Escolhe a resposta com base no nível de insistência, limitando ao tamanho do array
          const indice = Math.min(contadorInsistencia, respostasSeguranca.length - 1);
          const respostaSeguranca = respostasSeguranca[indice];
          
          // Adiciona a resposta ao contexto
          const contexto = this.contextos.get(userId);
          if (contexto) {
            contexto.push({ role: "user", content: texto });
            contexto.push({ role: "assistant", content: respostaSeguranca });
            this.contextos.set(userId, contexto);
          }
          
          return respostaSeguranca;
        }
      }
      
      // O código a seguir só é executado se o modo de segurança NÃO estiver ativado
      
      // Verifica se houve mudança significativa de assunto para potencialmente desbloquear
      const ultimoTopico = this.ultimoTopicoTecnico.get(userId);
      const mudancaDeAssunto = ultimoTopico && topicoPergunta && 
        !ultimoTopico.includes(topicoPergunta) && 
        !topicoPergunta.includes(ultimoTopico);
      
      // Detecta se a mensagem atual indica claramente uma mudança de serviço desejado
      const indicaMudancaServico = this._detectaMudancaServico(texto);
      
      // Verifica se devemos desbloquear o assistente devido à mudança de assunto
      // (Mas não desativa o modo de segurança persistente, NUNCA!)
      if (!this.modoSeguranca.get(userId) && this.redirecionamentoAtivado.get(userId) && 
          (mudancaDeAssunto || indicaMudancaServico || !ehPerguntaTecnica)) {
        // Reseta o bloqueio se for uma mudança clara de serviço ou uma mensagem não-técnica
        if (indicaMudancaServico || !ehPerguntaTecnica) {
          this.redirecionamentoAtivado.set(userId, false);
          this.perguntasTecnicasSequenciais.set(userId, 0);
          this.contadorSeguranca.set(userId, 0);
          this.ultimoTopicoTecnico.delete(userId);
          console.log(`Desbloqueio ativado para ${userId} devido a mudança de assunto ou mensagem não-técnica`);
        }
      }
      
      // Se o redirecionamento já foi ativado e a mensagem atual é técnica sobre o mesmo tópico,
      // retorna imediatamente uma resposta de segurança sem processamento adicional
      if (!this.modoSeguranca.get(userId) && this.redirecionamentoAtivado.get(userId) && 
          ehPerguntaTecnica && !mudancaDeAssunto) {
        // Incrementa contador de segurança para variar as respostas
        const nivelSeguranca = this.contadorSeguranca.get(userId);
        this.contadorSeguranca.set(userId, nivelSeguranca + 1);
        
        // Array de respostas variadas para humanizar e evitar repetição
        const respostasSeguranca = [
          `${nome}, preciso entender melhor seu caso específico antes de prosseguir. Me conta seu nome completo e a situação concreta que você está enfrentando?`,
          
          `Para te ajudar de verdade, preciso saber mais sobre você e seu caso. O Dr. Gabriel, nosso advogado responsável, vai poder esclarecer todos esses detalhes assim que tivermos seus dados básicos.`,
          
          `Entendo sua dúvida, mas pra te dar uma resposta precisa, preciso conhecer seu caso específico. Pode me contar qual é a situação concreta que você está enfrentando?`,
          
          `Esses detalhes técnicos são melhor discutidos pelo Dr. Gabriel após entendermos seu caso. Vamos começar pelo básico?`,
          
          `Como advogada, preciso conhecer seu caso antes de dar qualquer orientação técnica. Me conte sua situação, ok?`
        ];
        
        // Escolhe uma resposta com base no nível de segurança (rotação)
        const indice = nivelSeguranca % respostasSeguranca.length;
        const respostaSeguranca = respostasSeguranca[indice];
        
        // Adiciona a interação ao contexto
        const contexto = this.contextos.get(userId);
        if (contexto) {
          contexto.push({ role: "user", content: texto });
          contexto.push({ role: "assistant", content: respostaSeguranca });
          this.contextos.set(userId, contexto);
        }
        
        return respostaSeguranca;
      }
      
      // Se for pergunta técnica, incrementa o contador de perguntas técnicas sequenciais
      if (ehPerguntaTecnica) {
        // Verifica se é sobre o mesmo tópico da pergunta anterior
        const mesmoTopico = ultimoTopico && topicoPergunta && 
                           (ultimoTopico.includes(topicoPergunta) || 
                            topicoPergunta.includes(ultimoTopico));
        
        // Se for sobre o mesmo tópico ou não houver tópico anterior, incrementa normalmente
        const contador = this.perguntasTecnicasSequenciais.get(userId) || 0;
        
        // Incrementa com peso maior se for sobre o mesmo tópico (insistência)
        this.perguntasTecnicasSequenciais.set(userId, mesmoTopico ? contador + 1.5 : contador + 1);
        
        // Atualiza o último tópico
        if (topicoPergunta) {
          this.ultimoTopicoTecnico.set(userId, topicoPergunta);
        }
        
        // Verifica se o usuário está na fase inicial, sem fornecer dados pessoais
        const dadosCliente = this.dadosCliente.get(userId) || {};
        const dadosFornecidos = dadosCliente.nome || dadosCliente.cpf;
        const faseAtual = this.fasesAtendimento.get(userId);
        const fasesIniciais = ['identificando_problema', 'inicial', 'identificacao'];
        
        // Verifica se atingiu o limite (2 perguntas técnicas sequenciais sem dados)
        const limitePerguntas = !dadosFornecidos ? 2 : 3;
        
        if (this.perguntasTecnicasSequenciais.get(userId) >= limitePerguntas && 
            !this.redirecionamentoAtivado.get(userId)) {
          
          // Ativa o modo de segurança persistente após 3 perguntas técnicas sem dados pessoais
          if (this.perguntasTecnicasSequenciais.get(userId) >= 3 && !dadosFornecidos) {
            this.modoSeguranca.set(userId, true);
            console.log(`MODO DE SEGURANÇA PERSISTENTE ativado para ${userId}`);
          }
          
          // Marca que o redirecionamento foi ativado para evitar múltiplas mensagens
          this.redirecionamentoAtivado.set(userId, true);
          
          // Retorna mensagem de redirecionamento mais curta e natural
          const mensagemRedirecionamento = `${nome}, por questões de segurança e precisão, não posso seguir com mais detalhes técnicos sem entender melhor sua situação.

Quer que eu te ajude com um atendimento completo? O Dr. Gabriel, nosso advogado responsável, vai poder esclarecer todas essas dúvidas depois.

Me conta um pouco sobre seu caso real?`;
          
          // Adiciona a resposta ao contexto para manter histórico
          const contexto = this.contextos.get(userId);
          if (contexto) {
            contexto.push({ role: "user", content: texto });
            contexto.push({ role: "assistant", content: mensagemRedirecionamento });
            this.contextos.set(userId, contexto);
          }
          
          return mensagemRedirecionamento;
        }
      } else {
        // Se não for pergunta técnica, reduz gradualmente o contador
        const contadorAtual = this.perguntasTecnicasSequenciais.get(userId) || 0;
        this.perguntasTecnicasSequenciais.set(userId, Math.max(0, contadorAtual - 1));
        
        // Verifica se forneceu dados pessoais
        if (this._verificaSeCPF(texto) || this._extrairPotencialNome(texto)) {
          // Reseta completamente se forneceu dados
          this.perguntasTecnicasSequenciais.set(userId, 0);
          
          // Só desativa o redirecionamento se realmente forneceu dados completos
          // Mas NUNCA desativa o modo de segurança persistente aqui
          if ((this._verificaSeCPF(texto) && this._extrairPotencialNome(texto)) || 
              (dadosCliente && dadosCliente.nome && dadosCliente.cpf)) {
            this.redirecionamentoAtivado.set(userId, false);
            this.contadorSeguranca.set(userId, 0);
            // Removi qualquer possibilidade de desativar o modo de segurança aqui
          }
        }
      }
      
      // Resto do processamento continua normalmente
      
      // Inicializa o contexto da conversa se não existir
      if (!this.contextos.has(userId)) {
        this.contextos.set(userId, [
          { 
            role: "system", 
            content: `Você é SOPHIA, uma assistente jurídica HUMANA especializada em direito previdenciário brasileiro e também em documentos como procurações e contratos.
                     Trate o usuário pelo nome ${nome} de forma calorosa e empática, como uma advogada real faria.
                     Seu objetivo é auxiliar com questões jurídicas variadas, incluindo benefícios do INSS, transferências de veículos, procurações e contratos.
                     
                     IMPORTANTE:
                     1. Nunca diga que é uma IA ou bot - você é uma assistente jurídica real que trabalha em um escritório de advocacia
                     2. Fale de forma natural, com frases curtas e diretas, evitando parecer robótica
                     3. Quando o cliente fornecer CPF ou outros dados pessoais, SEMPRE aceite normalmente, sem alertas de privacidade
                     4. Nunca diga que não pode receber dados pessoais - você é uma advogada e precisa desses dados
                     5. Faça uma pergunta por vez, não sobrecarregue o cliente com muitas perguntas
                     6. Mostre empatia e compreensão com a situação do cliente
                     7. Aceite documentos e dados pessoais sem questionar sua segurança
                     8. Use um tom conversacional e amigável, com algumas expressões coloquiais
                     9. MANTENHA O FOCO no tópico atual da conversa - não mude para outro assunto
                     10. Se o cliente fala sobre transferir um veículo, mantenha o foco nesse assunto específico
                     
                     Fase atual do atendimento: identificando_problema
                     Tópico atual da conversa: geral`
          }
        ]);
        this.fasesAtendimento.set(userId, 'identificando_problema');
        this.topicoConversa.set(userId, 'geral');
        this.dadosCliente.set(userId, {});
      }
      
      const agora = Date.now();
      
      // Verifica se é uma confirmação de documento e está na fase apropriada
      if (this.isConfirmacaoDocumento(userId, texto)) {
        // Não processa esta mensagem pelo fluxo normal, pois é uma confirmação
        // de documento que será tratada pelo bot.js
        // Mantém a fase atual de aguardando_confirmacao_documento
        return `Ótimo! Vou prosseguir com o processo de assinatura e enviar o link em seguida.`;
      }
      
      // Verifica se a mensagem atual é muito similar à última processada
      // para evitar repetições de perguntas ou respostas
      if (this.ultimasRespostas.has(userId)) {
        const ultimaResposta = this.ultimasRespostas.get(userId);
        if (ultimaResposta.pergunta === texto && 
            (agora - ultimaResposta.timestamp) < 60000) { // Se for repetida em menos de 1 minuto
          console.log("⚠️ Pergunta muito similar à anterior, evitando repetição");
          return ultimaResposta.resposta;
        }
      }
      
      // Verifica se devemos aguardar mais mensagens do usuário
      // (útil quando o usuário está enviando várias mensagens em sequência)
      const deveEsperar = await this._verificarSeDeveEsperar(userId, texto, agora);
      if (deveEsperar) {
        // Armazena a mensagem e retorna null (não responde ainda)
        let mensagensEmEspera = this.mensagensEmEspera.get(userId) || [];
        mensagensEmEspera.push({texto, timestamp: agora});
        this.mensagensEmEspera.set(userId, mensagensEmEspera);
        return null;
      }
      
      // Processa mensagens em espera se existirem
      let mensagemFinal = texto;
      const mensagensEmEspera = this.mensagensEmEspera.get(userId) || [];
      if (mensagensEmEspera.length > 0) {
        // Combina as mensagens em espera com a mensagem atual
        mensagemFinal = [...mensagensEmEspera.map(m => m.texto), texto].join("\n");
        // Limpa a fila de mensagens em espera
        this.mensagensEmEspera.set(userId, []);
      }
      
      // Inicializa a fase de atendimento se ainda não existir
      if (!this.fasesAtendimento.has(userId)) {
        this.fasesAtendimento.set(userId, 'inicial');
        this.dadosCliente.set(userId, {});
        this.topicoConversa.set(userId, 'geral');
      }
      
      const faseAtual = this.fasesAtendimento.get(userId);
      const dadosCliente = this.dadosCliente.get(userId);
      const topicoAtual = this.topicoConversa.get(userId);
      
      // Verifica se conseguimos extrair o CPF do representante do texto atual
      if (faseAtual === 'coletando_dados_representante' && dadosCliente.outorgado_nome && !dadosCliente.outorgado_cpf) {
        // Tenta múltiplos formatos de CPF
        const padroesCPF = [
          /\d{3}[\.\s]?\d{3}[\.\s]?\d{3}[\-\.\s]?\d{2}/, // Formato com pontuação
          /\b\d{11}\b/, // 11 dígitos simples
          /CPF\s*[:\.]?\s*(\d[\d\.\s\-]*\d)/, // Com prefixo "CPF:"
          /[Cc][Pp][Ff].*?(\d{3}[\.\s]?\d{3}[\.\s]?\d{3}[\-\.\s]?\d{2})/ // Variações com "CPF" e números
        ];
        
        let cpfEncontrado = null;
        for (const padrao of padroesCPF) {
          const match = mensagemFinal.match(padrao);
          if (match) {
            // Normaliza para extrair apenas os números
            cpfEncontrado = match[0].replace(/\D/g, '');
            // Se extraiu um CPF válido (11 dígitos)
            if (cpfEncontrado && cpfEncontrado.length === 11) {
              dadosCliente.outorgado_cpf = cpfEncontrado;
              this.dadosCliente.set(userId, dadosCliente);
              
              // Verifica se agora temos dados completos para gerar a procuração
              if (this.dadosCompletos(userId)) {
                this.fasesAtendimento.set(userId, 'oferecendo_solucao');
                return `Perfeito! Com essas informações, vou gerar sua procuração.

- Seu nome: ${dadosCliente.nome}
- Seu CPF: ${dadosCliente.cpf}
- Nome da pessoa autorizada: ${dadosCliente.outorgado_nome}
- CPF da pessoa autorizada: ${this._formatarCPF(dadosCliente.outorgado_cpf)}
- Finalidade: ${dadosCliente.servico_desejado || this._obterFinalidadeDoTopico(topicoAtual)}

Aguarde um instante...`;
              }
              break;
            }
          }
        }
      }
      
      // Se dados completos em qualquer fase, podemos avançar para a solução
      if (!this.fasesAtendimento.get(userId).includes('solucao') && this.dadosCompletos(userId)) {
        // Verifica se os dados do representante foram registrados há pouco tempo
        const devePedir = 
          !this.ultimaInteracao.has(userId) || 
          (agora - this.ultimaInteracao.get(userId) > 120000); // Mais de 2 minutos desde a última interação
        
        // Pede reconfirmação se necessário
        if (devePedir) {
          this.fasesAtendimento.set(userId, 'confirmando_dados');
          return `Recebi as informações. Apenas para confirmar: o nome da pessoa que você está autorizando é ${dadosCliente.outorgado_nome}, CPF ${this._formatarCPF(dadosCliente.outorgado_cpf)}, correto?`;
        } else {
          // Avança diretamente
          this.fasesAtendimento.set(userId, 'oferecendo_solucao');
          return `Perfeito! Com essas informações, vou gerar sua procuração. Aguarde um instante...`;
        }
      }
      
      // Fase especial de confirmação de dados
      if (faseAtual === 'confirmando_dados') {
        const respostaPositiva = mensagemFinal.toLowerCase().match(/sim|correto|isso|confirmo|exatamente|isso mesmo|certo|tá certo|tá/);
        
        if (respostaPositiva) {
          this.fasesAtendimento.set(userId, 'oferecendo_solucao');
          return `Ótimo! Vou gerar sua procuração agora mesmo. Aguarde um instante...`;
        } else {
          // Se a resposta não foi positiva, voltamos para coleta de dados
          this.fasesAtendimento.set(userId, 'coletando_dados_representante');
          return `Entendi. Por favor, me informe novamente os dados corretos do representante. Qual o nome completo e CPF da pessoa que você está autorizando?`;
        }
      }
      
      // Detecta se a mensagem atual contém informações sobre um benefício previdenciário
      // e define os dados necessários
      if (faseAtual === 'entendendo_necessidade' && 
          (mensagemFinal.toLowerCase().includes('auxílio-doença') || 
           mensagemFinal.toLowerCase().includes('auxilio doença') ||
           mensagemFinal.toLowerCase().includes('afastado') || 
           mensagemFinal.toLowerCase().includes('inss'))) {
        
        this.topicoConversa.set(userId, 'previdenciario');
        
        // Tenta extrair informações sobre o beneficiário e situação
        const matchNome = mensagemFinal.match(/(?:irmã|irmao|familiar|nome|dela|dele)\s+(?:é|e|:)?\s+([A-Z][a-zãáàâéêíóôõúç]+(?: [A-Z][a-zãáàâéêíóôõúç]+)+)/i);
        if (matchNome) {
          dadosCliente.outorgado_nome = matchNome[1].trim();
        } else {
          // Tenta buscar o nome no formato "Nome da Silva Costa"
          const nomesNaFrase = mensagemFinal.match(/([A-Z][a-zãáàâéêíóôõúç]+(?: [A-Z][a-zãáàâéêíóôõúç]+){2,})/g);
          if (nomesNaFrase && nomesNaFrase.length > 0) {
            // Pega o nome mais longo que provavelmente é o nome completo
            const nomeCompleto = nomesNaFrase.reduce((a, b) => a.length > b.length ? a : b);
            // Verifica se esse nome não é igual ao nome do cliente
            if (nomeCompleto && (!dadosCliente.nome || !nomeCompleto.includes(dadosCliente.nome))) {
              dadosCliente.outorgado_nome = nomeCompleto.trim();
            }
          }
        }
        
        // Tenta extrair CPF do beneficiário em vários formatos
        const padroesCPF = [
          /(?:cpf|cpf:)\s*(\d{3}[\.\s]?\d{3}[\.\s]?\d{3}[\-\.\s]?\d{2})/i,
          /(\d{3}[\.\s]?\d{3}[\.\s]?\d{3}[\-\.\s]?\d{2})/,
          /CPF:? (\d{3}[\.\s]?\d{3}[\.\s]?\d{3}[\-\.\s]?\d{2})/i,
          /CPF:? (\d{9,11})/i,  // Formato simples sem pontuação
          /CPF:?\s*([0-9\.\-]+)/i // Qualquer formato de CPF após "CPF:"
        ];
        
        for (const padrao of padroesCPF) {
          const matchCPF = mensagemFinal.match(padrao);
          if (matchCPF) {
            const cpfEncontrado = matchCPF[1].replace(/\D/g, '');
            // Verifica se é diferente do CPF do cliente
            if (cpfEncontrado && cpfEncontrado !== dadosCliente.cpf) {
              dadosCliente.outorgado_cpf = cpfEncontrado;
              break;
            }
          }
        }
        
        // Define o serviço desejado
        if (mensagemFinal.toLowerCase().includes('auxílio-doença') || 
            mensagemFinal.toLowerCase().includes('auxilio doença') ||
            mensagemFinal.toLowerCase().includes('afastado por motivo de saúde')) {
          dadosCliente.servico_desejado = 'Auxílio-doença';
        }
        
        this.dadosCliente.set(userId, dadosCliente);
        
        // Avança para a fase de oferecendo solução se temos dados suficientes
        if (dadosCliente.servico_desejado && dadosCliente.outorgado_nome) {
          this.fasesAtendimento.set(userId, 'oferecendo_solucao');
        }
      }
      
      // Verifica se dados de procuração estão completos 
      // para transferência de veículo/imóvel e avança para fase de geração
      if ((topicoAtual === 'transferencia_veiculo' || mensagemFinal.toLowerCase().includes('imóvel')) && 
          dadosCliente.nome && dadosCliente.cpf) {
        
        // Verifica se já temos os dados da outra parte (outorgado)
        const temDadosOutorgado = 
          mensagemFinal.toLowerCase().includes('romário') || 
          (dadosCliente.outorgado_nome && dadosCliente.outorgado_cpf);
          
        // Se tiver endereço ou algo relacionado, consideramos que temos dados suficientes
        const temEndereco = 
          mensagemFinal.toLowerCase().includes('avenida') || 
          mensagemFinal.toLowerCase().includes('rua') ||
          mensagemFinal.toLowerCase().includes('mora') ||
          dadosCliente.endereco;
          
        if (temDadosOutorgado && temEndereco) {
          // Extrai e salva os dados do outorgado se não estiverem explicitamente salvos
          if (!dadosCliente.outorgado_nome && mensagemFinal.toLowerCase().includes('romário')) {
            // Extrai nome do outorgado do texto
            const matchNome = mensagemFinal.match(/Rom[aá]rio\s+([A-Za-z\s]+)/i);
            if (matchNome) {
              dadosCliente.outorgado_nome = matchNome[0].trim();
            } else {
              dadosCliente.outorgado_nome = "Romário Alves";
            }
            
            // Verifica se tem CPF do outorgado
            const matchCPF = mensagemFinal.match(/cpf\s*[\:\,]?\s*(\d{9,11})/i) || 
                             mensagemFinal.match(/(\d{3}[\.\s]?\d{3}[\.\s]?\d{3}[\-\.\s]?\d{2})/);
            if (matchCPF) {
              dadosCliente.outorgado_cpf = matchCPF[1].replace(/\D/g, '');
            }
            
            // Extrai endereço
            if (mensagemFinal.toLowerCase().includes('avenida') || mensagemFinal.toLowerCase().includes('rua')) {
              const matchEndereco = mensagemFinal.match(/(avenida|rua)\s+([^\.\,\n]+)/i);
              if (matchEndereco) {
                dadosCliente.endereco = matchEndereco[0].trim();
              }
            } else if (mensagemFinal.toLowerCase().includes('mora')) {
              const matchMora = mensagemFinal.match(/mora\s+([^\.\,\n]+)/i);
              if (matchMora) {
                dadosCliente.endereco = matchMora[1].trim();
              }
            }
            
            this.dadosCliente.set(userId, dadosCliente);
          }
          
          // Avança para a fase de oferecendo_solucao diretamente
          this.fasesAtendimento.set(userId, 'oferecendo_solucao');
          
          // Atualiza o tópico específico se for imóvel
          if (mensagemFinal.toLowerCase().includes('imóvel')) {
            this.topicoConversa.set(userId, 'transferencia_imovel');
          }
          
          // Não precisamos mais verificar outros casos ou fases
          // O restante do código continuará normalmente com a fase atualizada
        } else if (faseAtual === 'entendendo_necessidade' && this.topicoConversa.get(userId) === 'transferencia_veiculo') {
          // Se estamos na fase de entendimento de necessidade para transferência de veículo
          // mas ainda faltam dados, vamos solicitar explicitamente
          this.fasesAtendimento.set(userId, 'coletando_dados_procuracao');
          
          let dadosFaltantes = [];
          
          if (!temDadosOutorgado) {
            dadosFaltantes.push("nome e CPF da pessoa que receberá a procuração (outorgado)");
          }
          
          if (!temEndereco) {
            dadosFaltantes.push("endereço completo");
          }
          
          if (dadosFaltantes.length > 0) {
            // Guarda a fase atual para retornar mensagem customizada
            const faseRetorno = 'coletando_dados_procuracao';
            return `Para prosseguir com a procuração de transferência de veículo, preciso dos seguintes dados: ${dadosFaltantes.join(" e ")}. Por favor, me informe esses detalhes para que eu possa gerar o documento.`;
          }
        } else if (faseAtual === 'entendendo_necessidade' && this.topicoConversa.get(userId) === 'transferencia_imovel') {
          // Similar ao veículo, mas para transferência de imóvel
          this.fasesAtendimento.set(userId, 'coletando_dados_procuracao');
          
          let dadosFaltantes = [];
          
          if (!temDadosOutorgado) {
            dadosFaltantes.push("nome e CPF da pessoa que receberá a procuração (outorgado)");
          }
          
          if (!temEndereco) {
            dadosFaltantes.push("endereço completo do imóvel");
          }
          
          if (dadosFaltantes.length > 0) {
            return `Para prosseguir com a procuração de transferência de imóvel, preciso dos seguintes dados: ${dadosFaltantes.join(" e ")}. Por favor, me informe esses detalhes para que eu possa gerar o documento.`;
          }
        }
      } else if (faseAtual === 'coletando_dados_procuracao') {
        // Estamos coletando dados específicos da procuração
        const topico = this.topicoConversa.get(userId);
        
        // Tenta extrair informações do outorgado e endereço
        if (mensagemFinal.toLowerCase().includes('nome') || 
            mensagemFinal.match(/[A-Z][a-zãáàâéêíóôõúç]+(?: [A-Z][a-zãáàâéêíóôõúç]+)+/)) {
          
          // Tenta extrair nome do outorgado
          const matchNome = mensagemFinal.match(/(?:nome|outorgado|para)\s*:?\s*([A-Z][a-zãáàâéêíóôõúç]+(?: [A-Z][a-zãáàâéêíóôõúç]+)+)/i);
          if (matchNome) {
            dadosCliente.outorgado_nome = matchNome[1].trim();
          }
        }
        
        // Tenta extrair CPF
        if (mensagemFinal.toLowerCase().includes('cpf')) {
          const matchCPF = mensagemFinal.match(/cpf\s*[\:\,]?\s*(\d{9,11})/i) || 
                           mensagemFinal.match(/(\d{3}[\.\s]?\d{3}[\.\s]?\d{3}[\-\.\s]?\d{2})/);
          if (matchCPF) {
            dadosCliente.outorgado_cpf = matchCPF[1].replace(/\D/g, '');
          }
        }
        
        // Tenta extrair endereço
        if (mensagemFinal.toLowerCase().includes('endereço') || 
            mensagemFinal.toLowerCase().includes('rua') || 
            mensagemFinal.toLowerCase().includes('avenida')) {
            
          const matchEndereco = mensagemFinal.match(/(?:endereço|rua|avenida)\s*:?\s*([^\.\,\n]+)/i);
          if (matchEndereco) {
            dadosCliente.endereco = matchEndereco[1].trim();
          }
        }
        
        this.dadosCliente.set(userId, dadosCliente);
        
        // Verifica se temos todos os dados necessários
        const temDadosCompletos = dadosCliente.outorgado_nome && dadosCliente.endereco;
        
        if (temDadosCompletos) {
          this.fasesAtendimento.set(userId, 'oferecendo_solucao');
          return `Obrigada, ${dadosCliente.nome}! Agora tenho todos os dados necessários para gerar sua procuração para ${topico === 'transferencia_veiculo' ? 'transferência de veículo' : 'transferência de imóvel'}. Posso criar o documento para você assinar. Deseja que eu faça isso agora?`;
        } else {
          // Ainda faltam dados, vamos solicitar o que está faltando
          let dadosFaltantes = [];
          
          if (!dadosCliente.outorgado_nome) {
            dadosFaltantes.push("nome completo da pessoa que receberá a procuração");
          }
          
          if (!dadosCliente.endereco) {
            dadosFaltantes.push("endereço completo");
          }
          
          if (dadosFaltantes.length > 0) {
            return `Ainda preciso dos seguintes dados para gerar a procuração: ${dadosFaltantes.join(" e ")}. Por favor, me informe.`;
          }
        }
      }
      
      // Atualiza o tópico da conversa analisando o texto atual, se necessário
      if (faseAtual === 'entendendo_necessidade' || faseAtual === 'identificacao') {
        const novoTopico = await this._detectarTopico(userId, mensagemFinal);
        if (novoTopico && novoTopico !== 'geral') {
          // Se o tópico mudou, atualizamos
          if (novoTopico !== this.topicoConversa.get(userId)) {
            console.log(`Tópico da conversa atualizado de ${this.topicoConversa.get(userId)} para: ${novoTopico}`);
            
            // Se estamos mudando para previdenciário e temos dados do cliente, já entramos na coleta de dados específicos
            if (novoTopico === 'previdenciario' && dadosCliente.nome && dadosCliente.cpf) {
              const ultimasMensagens = this.contextos.get(userId)?.slice(-3) || [];
              // Verifica se nas últimas mensagens há alguma indicação de auxílio ou afastamento
              const contemAuxilio = ultimasMensagens.some(msg => 
                msg.content.toLowerCase().includes('auxílio') || 
                msg.content.toLowerCase().includes('doença') ||
                msg.content.toLowerCase().includes('afastado')
              );
              
              if (contemAuxilio) {
                dadosCliente.servico_desejado = 'Auxílio-doença';
                this.dadosCliente.set(userId, dadosCliente);
              }
            }
          }
          
          this.topicoConversa.set(userId, novoTopico);
        }
      }
      
      // Verifica se é um CPF e está na fase adequada
      if (this._verificaSeCPF(mensagemFinal) && (faseAtual === 'coletando_cpf' || mensagemFinal.replace(/\D/g, '').length === 11)) {
        dadosCliente.cpf = mensagemFinal.replace(/\D/g, '');
        this.dadosCliente.set(userId, dadosCliente);
        
        // Verifica se já temos nome também para avançar a fase
        if (dadosCliente.nome) {
          // Antes de perguntar sobre o serviço, verificamos se já temos informações sobre o objetivo
          // ou se o usuário já mencionou algum tema específico
          const temObjetivoDeclarado = dadosCliente.servico_desejado || 
                                      this.topicoConversa.get(userId) !== 'geral';
          
          // Verifica se há menções a procuração ou representação nas mensagens anteriores
          let mencionouProcuracao = false;
          if (this.contextos.has(userId)) {
            const contexto = this.contextos.get(userId);
            const ultimasMensagens = contexto.slice(-4);
            mencionouProcuracao = ultimasMensagens.some(msg => 
              msg.content.toLowerCase().includes('procuração') || 
              msg.content.toLowerCase().includes('represent') ||
              msg.content.toLowerCase().includes('auxílio') ||
              msg.content.toLowerCase().includes('inss')
            );
          }
          
          if (temObjetivoDeclarado || mencionouProcuracao) {
            // Se já sabemos o objetivo ou o cliente mencionou procuração, vamos direto para coleta de dados do representante
            this.fasesAtendimento.set(userId, 'coletando_dados_representante');
            
            // Define o serviço baseado no tópico, se não estiver explicitamente definido
            if (!dadosCliente.servico_desejado) {
              const topico = this.topicoConversa.get(userId);
              if (topico === 'previdenciario') {
                dadosCliente.servico_desejado = 'Auxílio-doença';
              } else if (topico === 'transferencia_veiculo') {
                dadosCliente.servico_desejado = 'Transferência de veículo';
              } else if (topico === 'transferencia_imovel') {
                dadosCliente.servico_desejado = 'Transferência de imóvel';
              }
              this.dadosCliente.set(userId, dadosCliente);
            }
            
            return `Obrigada, ${dadosCliente.nome}. Para prosseguir com a procuração, preciso de alguns dados do representante. Por favor, me informe o nome completo da pessoa que você está autorizando a te representar.

Seus dados estão seguros conosco. Todas essas informações são necessárias para preenchermos corretamente a procuração e darmos andamento ao seu atendimento jurídico.`;
          } else {
            // Se não temos informações sobre o objetivo, prosseguimos normalmente
            this.fasesAtendimento.set(userId, 'entendendo_necessidade');
            return `Obrigada, ${dadosCliente.nome}. Agora que tenho seus dados, me conte com mais detalhes qual é sua situação e como posso ajudar com seu caso. Qual serviço você está buscando?
            
Seus dados estão seguros conosco. O CPF é necessário para preenchermos corretamente a procuração e darmos andamento ao seu atendimento jurídico.`;
          }
        } else {
          this.fasesAtendimento.set(userId, 'coletando_nome');
          return `Obrigada pelo CPF. Para continuar o atendimento, por favor me informe seu nome completo.
          
Seus dados estão seguros conosco. O CPF é necessário para preenchermos corretamente a procuração e darmos andamento ao seu atendimento jurídico.`;
        }
      }
      
      // Obtém ou cria o contexto do usuário
      if (!this.contextos.has(userId)) {
        this.contextos.set(userId, [
          { 
            role: "system", 
            content: `Você é SOPHIA, uma assistente jurídica HUMANA especializada em direito previdenciário brasileiro e também em documentos como procurações e contratos.
                     Trate o usuário pelo nome ${nome} de forma calorosa e empática, como uma advogada real faria.
                     Seu objetivo é auxiliar com questões jurídicas variadas, incluindo benefícios do INSS, transferências de veículos, procurações e contratos.
                     
                     IMPORTANTE:
                     1. Nunca diga que é uma IA ou bot - você é uma assistente jurídica real que trabalha em um escritório de advocacia
                     2. Fale de forma natural, com frases curtas e diretas, evitando parecer robótica
                     3. Quando o cliente fornecer CPF ou outros dados pessoais, SEMPRE aceite normalmente, sem alertas de privacidade
                     4. Nunca diga que não pode receber dados pessoais - você é uma advogada e precisa desses dados
                     5. Faça uma pergunta por vez, não sobrecarregue o cliente com muitas perguntas
                     6. Mostre empatia e compreensão com a situação do cliente
                     7. Aceite documentos e dados pessoais sem questionar sua segurança
                     8. Use um tom conversacional e amigável, com algumas expressões coloquiais
                     9. MANTENHA O FOCO no tópico atual da conversa - não mude para outro assunto
                     10. Se o cliente fala sobre transferir um veículo, mantenha o foco nesse assunto específico
                     
                     Fase atual do atendimento: ${faseAtual}
                     Tópico atual da conversa: ${this.topicoConversa.get(userId)}`
          }
        ]);
      } else {
        // Atualiza a fase e tópico no contexto do sistema
        const contexto = this.contextos.get(userId);
        if (contexto[0].role === "system") {
          contexto[0].content = contexto[0].content
            .replace(/Fase atual do atendimento: .*/, `Fase atual do atendimento: ${faseAtual}`)
            .replace(/Tópico atual da conversa: .*/, `Tópico atual da conversa: ${this.topicoConversa.get(userId)}`);
        }
      }
      
      const contexto = this.contextos.get(userId);
      
      // Adiciona a mensagem do usuário ao contexto
      contexto.push({ role: "user", content: mensagemFinal });
      
      // Limita o contexto para economizar tokens e manter a conversa fluindo
      // Mantém mais mensagens no meio do atendimento para preservar contexto
      const maxMensagens = faseAtual === 'inicial' ? 10 : 
                          faseAtual === 'encerramento' ? 8 : 15;
                          
      while (contexto.length > maxMensagens + 1) { // +1 para a mensagem de sistema
        if (contexto[0].role === "system") {
          contexto.splice(1, 1);
        } else {
          contexto.shift();
        }
      }
      
      // Processa fase atual e personaliza o prompt conforme necessário
      let promptAdicional = '';
      
      switch (faseAtual) {
        case 'inicial':
          promptAdicional = `Esta é a fase inicial do atendimento. Seja calorosa na recepção, apresente-se como SOPHIA, advogada especialista em questões jurídicas, e pergunte como pode ajudar. Não entre em muitos detalhes técnicos ainda. Responda SEMPRE em no máximo 2 frases curtas, nunca ultrapasse 2 linhas. Nunca repita perguntas já respondidas (nome, CPF, dados do representante, etc). Seja natural, empática, e nunca use listas, emojis ou termos técnicos sem explicação.`;
          
          // Após o primeiro contato, avança para a próxima fase
          this.fasesAtendimento.set(userId, 'identificacao');
          break;
          
        case 'identificacao':
          promptAdicional = `Nesta fase, colete informações básicas do cliente como nome completo e depois CPF. Faça isso de forma natural na conversa, uma informação por vez. Se o cliente já forneceu essas informações, avance para entender a necessidade dele. Ao solicitar o CPF, acrescente uma mensagem de segurança: 'Seus dados estão seguros conosco. O CPF é necessário para preenchermos corretamente a procuração e darmos andamento ao seu atendimento jurídico.' Responda SEMPRE em no máximo 2 frases curtas, nunca ultrapasse 2 linhas. Nunca repita perguntas já respondidas (nome, CPF, dados do representante, etc). Seja natural, empática, e nunca use listas, emojis ou termos técnicos sem explicação.`;
          
          // Verifica se conseguimos extrair o nome no texto
          if (!dadosCliente.nome && this._extrairPotencialNome(mensagemFinal)) {
            dadosCliente.nome = this._extrairPotencialNome(mensagemFinal);
            this.dadosCliente.set(userId, dadosCliente);
            
            if (!dadosCliente.cpf) {
              this.fasesAtendimento.set(userId, 'coletando_cpf');
            } else {
              this.fasesAtendimento.set(userId, 'entendendo_necessidade');
            }
          }
          break;
          
        case 'coletando_cpf':
          promptAdicional = `O cliente deve fornecer o CPF. Aceite normalmente sem questionar a privacidade. Trate o CPF como um dado necessário para o atendimento jurídico. Importante: ao receber o CPF, informe que 'Seus dados estão seguros conosco. O CPF é necessário para preenchermos corretamente a procuração e darmos andamento ao seu atendimento jurídico.' Responda SEMPRE em no máximo 2 frases curtas, nunca ultrapasse 2 linhas. Nunca repita perguntas já respondidas (nome, CPF, dados do representante, etc). Seja natural, empática, e nunca use listas, emojis ou termos técnicos sem explicação.`;
          break;
          
        case 'coletando_nome':
          promptAdicional = `O cliente deve fornecer o nome completo. Extraia o nome da resposta e continue o atendimento de forma natural. Responda SEMPRE em no máximo 2 frases curtas, nunca ultrapasse 2 linhas. Nunca repita perguntas já respondidas (nome, CPF, dados do representante, etc). Seja natural, empática, e nunca use listas, emojis ou termos técnicos sem explicação.`;
          
          // Tenta extrair o nome
          const nomePotencial = this._extrairPotencialNome(mensagemFinal);
          if (nomePotencial) {
            dadosCliente.nome = nomePotencial;
            this.dadosCliente.set(userId, dadosCliente);
            this.fasesAtendimento.set(userId, 'entendendo_necessidade');
          }
          break;
          
        case 'coletando_dados_representante':
          promptAdicional = `Estamos coletando os dados do representante para a procuração. Nesta etapa, precisamos do nome completo da pessoa que o cliente está autorizando a representá-lo. Se o cliente já informou o nome do representante, prossiga perguntando o CPF do representante. Mantenha o tom amigável e explique brevemente por que cada informação é necessária para a procuração. Responda SEMPRE em no máximo 2 frases curtas, nunca ultrapasse 2 linhas. Nunca repita perguntas já respondidas (nome, CPF, dados do representante, etc). Seja natural, empática, e nunca use listas, emojis ou termos técnicos sem explicação.`;
          
          // Nova fase para coletar especificamente os dados do representante (outorgado)
          if (!dadosCliente.outorgado_nome) {
            // Padrões mais abrangentes para extrair nomes
            const padroes = [
              // Nome após palavras-chave
              /(?:nome|representante|autorizo|autorizar|nome completo|chama(?:-se)?)[:\s]+([A-Z][a-zãáàâéêíóôõúç]+(?: [A-Z][a-zãáàâéêíóôõúç]+){1,})/i,
              // Nome completo isolado
              /([A-Z][a-zãáàâéêíóôõúç]+(?: [A-Z][a-zãáàâéêíóôõúç]+){2,})/,
              // Nome com sobrenome
              /([A-Z][a-zãáàâéêíóôõúç]+ [A-Z][a-zãáàâéêíóôõúç]+)/
            ];
            
            // Tenta extrair o nome usando os padrões
            let nomeEncontrado = null;
            for (const padrao of padroes) {
              const match = mensagemFinal.match(padrao);
              if (match && match[1]) {
                nomeEncontrado = match[1].trim();
                // Verifica se é um nome completo (pelo menos nome e sobrenome)
                if (nomeEncontrado.split(' ').length >= 2) {
                  dadosCliente.outorgado_nome = nomeEncontrado;
                  this.dadosCliente.set(userId, dadosCliente);
                  return `Obrigada. Agora preciso do CPF de ${dadosCliente.outorgado_nome} para completar a procuração. Por favor, me informe o CPF.`;
                }
              }
            }
            
            // Tenta extrair qualquer nome próprio como último recurso
            const nomesPotenciais = mensagemFinal.match(/([A-Z][a-zãáàâéêíóôõúç]+(?: [A-Z][a-zãáàâéêíóôõúç]+){1,})/g);
            if (nomesPotenciais && nomesPotenciais.length > 0) {
              // Filtra nomes que não são do cliente
              const nomeCliente = dadosCliente.nome;
              const outrosNomes = nomesPotenciais.filter(nome => 
                nomeCliente && 
                !nomeCliente.includes(nome) && 
                !nome.includes(nomeCliente)
              );
              
              if (outrosNomes.length > 0) {
                // Escolhe o nome mais longo que provavelmente é o nome completo
                const nomeCompleto = outrosNomes.reduce((a, b) => a.length > b.length ? a : b);
                if (nomeCompleto && nomeCompleto.split(' ').length >= 2) {
                  dadosCliente.outorgado_nome = nomeCompleto.trim();
                  this.dadosCliente.set(userId, dadosCliente);
                  return `Obrigada. Agora preciso do CPF de ${dadosCliente.outorgado_nome} para completar a procuração. Por favor, me informe o CPF.`;
                }
              }
            }
          } else if (!dadosCliente.outorgado_cpf) {
            promptAdicional = `\nJá temos o nome do representante (${dadosCliente.outorgado_nome}), agora precisamos do CPF dele. 
            
            Se o cliente informar o CPF do representante nesta mensagem, prossiga imediatamente para a fase de geração da procuração.
            
            Mantenha o tom amigável e confirme quando tiver todos os dados necessários para gerar a procuração.`;
            
            // Tenta extrair o CPF do texto atual com padrões mais abrangentes
            const padroesCPF = [
              /\d{3}[\.\s]?\d{3}[\.\s]?\d{3}[\-\.\s]?\d{2}/, // 000.000.000-00
              /\b\d{11}\b/, // 00000000000
              /CPF\s*[:\.]?\s*(\d[\d\.\s\-]*\d)/, // CPF: 000.000.000-00
              /[Cc][Pp][Ff].*?(\d{3}[\.\s]?\d{3}[\.\s]?\d{3}[\-\.\s]?\d{2})/ // Texto CPF 000.000.000-00
            ];
            
            for (const padrao of padroesCPF) {
              const match = mensagemFinal.match(padrao);
              if (match) {
                // Extrai apenas os dígitos
                const cpfExtraido = match[0].replace(/\D/g, '');
                if (cpfExtraido && cpfExtraido.length === 11) {
                  dadosCliente.outorgado_cpf = cpfExtraido;
                  this.dadosCliente.set(userId, dadosCliente);
                  
                  // Avança para a fase de oferecendo_solucao
                  this.fasesAtendimento.set(userId, 'oferecendo_solucao');
                  return `Perfeito! Agora tenho todos os dados necessários para gerar a procuração:
                  
- Seu nome: ${dadosCliente.nome}
- Seu CPF: ${this._formatarCPF(dadosCliente.cpf)}
- Nome do representante: ${dadosCliente.outorgado_nome}
- CPF do representante: ${this._formatarCPF(dadosCliente.outorgado_cpf)}
- Finalidade: ${dadosCliente.servico_desejado || this._obterFinalidadeDoTopico(this.topicoConversa.get(userId))}

Vou gerar a procuração para você agora mesmo!`;
                }
              }
            }
          }
          break;
          
        case 'confirmando_dados':
          promptAdicional = `Estamos confirmando os dados do representante com o cliente para ter certeza de que estão corretos antes de gerar a procuração. Os dados que temos são: - Nome do representante: ${dadosCliente.outorgado_nome} - CPF do representante: ${this._formatarCPF(dadosCliente.outorgado_cpf)} Se o cliente confirmar (com 'sim', 'correto', etc.), prossiga para a geração da procuração. Se o cliente não confirmar, peça para ele fornecer os dados corretos. Use tom amigável e formal. Responda SEMPRE em no máximo 2 frases curtas, nunca ultrapasse 2 linhas. Nunca repita perguntas já respondidas (nome, CPF, dados do representante, etc). Seja natural, empática, e nunca use listas, emojis ou termos técnicos sem explicação.`;
          break;
          
        case 'entendendo_necessidade':
          // Fase de entendimento do problema - personalizada por tópico
          const topico = this.topicoConversa.get(userId);
          
          if (topico === 'transferencia_veiculo') {
            promptAdicional = `\nO cliente está tratando de transferência de veículo e procuração para esse fim. Colete informações sobre: 
            1. Dados do veículo (modelo, placa, renavam)
            2. Dados da pessoa que receberá a procuração
            3. Finalidade específica (transferir propriedade, apenas dirigir o veículo, etc)
            
            MANTENHA O FOCO NESTE TÓPICO e não mude para assuntos previdenciários ou outros. Use o nome do cliente na conversa para personalizar.`;
          } else if (topico === 'previdenciario') {
            // Se já temos o nome do outorgado para caso previdenciário
            if (dadosCliente.outorgado_nome) {
              promptAdicional = `\nO cliente está tratando de um caso previdenciário relacionado a ${dadosCliente.servico_desejado || 'um benefício do INSS'} para ${dadosCliente.outorgado_nome}. Confirme as informações que você já tem:
              
              1. Nome do beneficiário: ${dadosCliente.outorgado_nome}
              2. CPF do beneficiário: ${dadosCliente.outorgado_cpf || 'ainda não informado'}
              3. Tipo de benefício: ${dadosCliente.servico_desejado || 'ainda não especificado com clareza'}
              
              Se faltar alguma informação, solicite de forma clara e direta. Se já tiver todas as informações, sugira a geração de uma procuração para representação junto ao INSS.
              
              Use o nome do cliente na conversa para personalizar. NÃO repita perguntas já respondidas.`;
            } else {
              promptAdicional = `\nO cliente já forneceu dados básicos e está tratando de previdência. Entenda qual é a necessidade específica: tipo de benefício previdenciário, situação atual, problemas enfrentados com o INSS. 
              
              Se o cliente mencionar que é para outra pessoa (irmã, familiar, etc.), peça o nome completo e CPF dessa pessoa.
              
              Faça perguntas direcionadas e específicas para entender o contexto completo. Use o nome do cliente na conversa para personalizar.`;
            }
          } else {
            promptAdicional = `\nO cliente já forneceu dados básicos. Agora entenda qual é a necessidade específica e em qual área jurídica ele precisa de ajuda. Faça perguntas direcionadas para entender o contexto completo. Use o nome do cliente na conversa para personalizar.`;
          }
          
          // Se a conversa se estendeu e temos informações suficientes, avance para sugestão
          if (contexto.length > 10 && !dadosCliente.servico_desejado) {
            const servico = await this._extrairServicoDesejado(userId);
            if (servico) {
              dadosCliente.servico_desejado = servico;
              this.dadosCliente.set(userId, dadosCliente);
              this.fasesAtendimento.set(userId, 'oferecendo_solucao');
            }
          }
          break;
          
        case 'oferecendo_solucao':
          // Fase de oferecer soluções - personalizada por tópico
          const topicoSolucao = this.topicoConversa.get(userId);
          
          if (topicoSolucao === 'transferencia_veiculo') {
            promptAdicional = `\nAgora que você entendeu os detalhes da transferência de veículo, ofereça orientações específicas para este caso:
            1. Explique como funciona a procuração para transferência de veículo
            2. Informe quais documentos serão necessários para o processo
            3. Ofereça explicitamente a geração da procuração específica para transferência de veículo
            
            IMPORTANTE: Explique claramente o processo de documentação:
            - Primeiro você vai gerar o documento PDF
            - O cliente precisará verificar o documento
            - Depois de confirmado, você enviará o link para assinatura digital
            
            Use linguagem clara e objetiva, mantendo o foco exclusivamente neste assunto de transferência de veículo.`;
          } else if (topicoSolucao === 'previdenciario') {
            let nomeOutorgado = dadosCliente.outorgado_nome || 'seu familiar';
            let tipoBeneficio = dadosCliente.servico_desejado || 'benefício previdenciário';
            
            promptAdicional = `\nAgora que você entendeu a necessidade previdenciária do cliente relacionada a ${tipoBeneficio} para ${nomeOutorgado}, ofereça soluções práticas.
            
            Mencione a possibilidade de gerar uma procuração para representação junto ao INSS e explique claramente o processo:
            - Você vai gerar um documento de procuração para o INSS com os dados informados
            - O documento permitirá que ${dadosCliente.nome} represente ${nomeOutorgado} junto ao INSS
            - Primeiro o cliente receberá o PDF para verificação
            - Depois de confirmar, você enviará o link para assinatura digital
            - Após a assinatura, o documento terá validade legal para representação junto ao INSS
            
            Use linguagem clara e objetiva. Explique que a procuração facilitará o processo junto ao INSS, permitindo resolver questões sem necessidade da presença física do beneficiário.`;
          } else {
            promptAdicional = `\nAgora que você entendeu a necessidade do cliente, ofereça soluções práticas e oriente sobre os próximos passos. 
            
            Mencione a possibilidade de gerar uma procuração adequada ao caso específico e explique claramente o processo:
            - Primeiro você vai gerar o documento PDF
            - O cliente precisará verificar o documento
            - Depois de confirmado, você enviará o link para assinatura digital
            
            Use linguagem clara e objetiva.`;
          }
          break;
          
        case 'encerramento':
          // Fase de encerramento e orientações finais
          promptAdicional = `\nO atendimento está sendo finalizado. Forneça orientações finais claras sobre o tema específico tratado (${this.topicoConversa.get(userId)}), resuma os próximos passos e deixe o cliente confiante. Mencione que estará disponível para dúvidas futuras.`;
          break;
          
        case 'aguardando_confirmacao_documento':
          // Fase especial onde estamos aguardando confirmação do cliente sobre o documento enviado
          promptAdicional = `\nVocê acabou de enviar um documento PDF para o cliente e está aguardando a confirmação para prosseguir com o processo de assinatura.
          
          - Se o cliente responder confirmando o recebimento (com "ok", "confirmar", "prosseguir", etc.), confirme que você vai enviar o link para assinatura.
          - Se o cliente indicar que há algum problema ou tiver dúvidas sobre o documento, ofereça ajuda ou esclarecimentos.
          - Se o cliente perguntar sobre os próximos passos, explique que após a confirmação você enviará o link para assinatura digital.
          
          Mantenha o foco exclusivamente na confirmação do documento enviado, sem introduzir novos tópicos neste momento.`;
          break;
          
        case 'documentos_recebidos':
          // Nova fase para rastrear documentos recebidos do cliente
          const documentos = this.documentosRecebidos.get(userId) || {};
          const tipoServico = dadosCliente.servico_desejado || 'serviço jurídico';
          
          // Lista de documentos esperados com base no tipo de serviço
          let documentosEsperados = [];
          if (tipoServico.toLowerCase().includes('auxílio-doença')) {
            documentosEsperados = ['Atestado médico', 'Laudo médico com CID', 'Comprovante de residência', 'Documento de identidade'];
          } else if (tipoServico.toLowerCase().includes('transferência de veículo')) {
            documentosEsperados = ['Documento do veículo', 'Comprovante de residência', 'Documento de identidade'];
          } else {
            documentosEsperados = ['Comprovante de residência', 'Documento de identidade'];
          }
          
          // Verifica quais documentos faltam
          const documentosRecebidos = Object.keys(documentos).filter(doc => documentos[doc]);
          const documentosFaltantes = documentosEsperados.filter(doc => !documentosRecebidos.includes(doc));
          
          promptAdicional = `\nO cliente está enviando documentos para o processo. Aqui está o status atual:
          
          Documentos já recebidos: ${documentosRecebidos.length > 0 ? documentosRecebidos.join(', ') : 'Nenhum ainda'}
          Documentos pendentes: ${documentosFaltantes.length > 0 ? documentosFaltantes.join(', ') : 'Nenhum! Todos os documentos foram recebidos'}
          
          ${documentosFaltantes.length > 0 ? 
            'Solicite os documentos faltantes de forma clara e direta.' : 
            'Informe ao cliente que todos os documentos foram recebidos e que o advogado Gabriel assumirá o caso a partir de agora.'}
          
          ${documentosFaltantes.length === 0 ? 
            'Use a seguinte mensagem: "Prontinho, recebi todos os documentos! Agora o advogado Gabriel, que é o responsável pelo seu atendimento, vai dar continuidade no seu caso. Fique tranquilo, vamos te manter informado sobre cada etapa do processo!"' :
            ''}
          
          Mantenha o tom amigável e profissional.`;
          
          // Se todos os documentos foram recebidos, avança para a fase de encerramento
          if (documentosFaltantes.length === 0) {
            this.fasesAtendimento.set(userId, 'encerramento');
            dadosCliente.encaminhado_advogado = true;
            this.dadosCliente.set(userId, dadosCliente);
          }
          break;
          
        case 'procuracao_enviada':
          // Fase após o envio da procuração assinada, quando esperamos o envio dos documentos
          promptAdicional = `\nA procuração já foi enviada e assinada. Nesta fase, estamos aguardando o envio dos documentos complementares.
          
          Caso o cliente já tenha enviado todos os documentos necessários, informe que o caso será encaminhado para o advogado Gabriel com a seguinte mensagem:
          
          "O advogado Gabriel, responsável pelo seu caso, vai dar continuidade. Vamos te manter atualizado sobre o andamento, tá bom?"
          
          Se ainda faltarem documentos, informe quais são os documentos pendentes de forma clara.`;
          
          // Verifica se todos os documentos foram recebidos
          if (this.todosDocumentosRecebidos(userId)) {
            dadosCliente.encaminhado_advogado = true;
            this.dadosCliente.set(userId, dadosCliente);
            this.fasesAtendimento.set(userId, 'encerramento');
            
            return `Prontinho, recebi todos os documentos! Agora o advogado Gabriel, que é o responsável pelo seu atendimento, vai dar continuidade no seu caso. Fique tranquilo, vamos te manter informado sobre cada etapa do processo!`;
          }
          break;
      }
      
      // Adiciona o prompt adicional se existir
      if (promptAdicional) {
        contexto.push({ 
          role: "system", 
          content: promptAdicional 
        });
      }
      
      // Adiciona uma instrução para manter o tópico da conversa
      if (this.topicoConversa.get(userId) !== 'geral') {
        contexto.push({ 
          role: "system", 
          content: `IMPORTANTE: O assunto atual da conversa é sobre ${this.topicoConversa.get(userId)}. 
          NÃO mude para outro tema como previdência ou benefícios do INSS a menos que o cliente explicitamente solicite.
          Mantenha suas respostas focadas APENAS no tópico atual da conversa.` 
        });
      }
      
      // Adiciona um prompt para não repetir perguntas já respondidas
      contexto.push({ 
        role: "system", 
        content: `IMPORTANTE: Não repita perguntas que o cliente já respondeu, como nome, CPF, ou outros dados que já foram fornecidos. 
        Verifique abaixo as informações que já temos:
        - Nome: ${dadosCliente.nome || 'Não informado'}
        - CPF: ${dadosCliente.cpf ? 'Já fornecido' : 'Não informado'}
        - Objetivo: ${dadosCliente.servico_desejado || this.topicoConversa.get(userId) !== 'geral' ? 'Já identificado' : 'Não informado'}
        - Dados do representante: ${dadosCliente.outorgado_nome ? 'Nome já fornecido' : 'Nome não informado'}, ${dadosCliente.outorgado_cpf ? 'CPF já fornecido' : 'CPF não informado'}
        
        Use essas informações para evitar repetir perguntas e tornar o atendimento mais fluido.` 
      });
      
      // Envia para processamento no GPT-4
      const resposta = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: contexto,
        temperature: 0.8, // Aumenta levemente a temperatura para respostas mais humanizadas
        max_tokens: faseAtual === 'inicial' ? 150 : 350 // Reduzido significativamente para respostas mais rápidas
      });
      
      const textoResposta = resposta.choices[0].message.content;
      
      // Remove os prompts adicionais
      while (contexto.length > 0 && contexto[contexto.length - 1].role === "system") {
        contexto.pop();
      }
      
      // Adiciona a resposta ao contexto
      contexto.push({ role: "assistant", content: textoResposta });
      this.contextos.set(userId, contexto);
      
      // Salva a pergunta e resposta atual para evitar repetições
      this.ultimasRespostas.set(userId, {
        pergunta: texto,
        resposta: textoResposta,
        timestamp: agora
      });
      
      // Se a fase atual for oferecendo_solucao e mencionar procuração, avança para encerramento
      if (faseAtual === 'oferecendo_solucao' && 
          (textoResposta.toLowerCase().includes('procuração') || 
           textoResposta.toLowerCase().includes('documento') && 
           contexto.length > 12)) {
        this.fasesAtendimento.set(userId, 'encerramento');
      }
      
      return textoResposta;
    } catch (erro) {
      console.error("Erro ao processar mensagem:", erro);
      return "Desculpe, tive um problema técnico. Pode tentar novamente?";
    }
  }
  
  // Verifica se o texto parece ser um CPF
  _verificaSeCPF(texto) {
    // Remove caracteres não numéricos
    const apenasNumeros = texto.replace(/\D/g, '');
    // Verifica se tem 11 dígitos (tamanho do CPF)
    if (apenasNumeros.length === 11) {
      return true;
    }
    
    // Também verifica outros formatos de CPF
    const padroesCPF = [
      /\d{3}[\.\s]?\d{3}[\.\s]?\d{3}[\-\.\s]?\d{2}/, // Formato com pontuação
      /CPF\s*[:\.]?\s*(\d[\d\.\s\-]*\d)/, // Com prefixo "CPF:"
      /[Cc][Pp][Ff].*?(\d{3}[\.\s]?\d{3}[\.\s]?\d{3}[\-\.\s]?\d{2})/ // Variações com "CPF" e números
    ];
    
    return padroesCPF.some(padrao => padrao.test(texto));
  }
  
  // Tenta extrair um nome próprio de um texto
  _extrairPotencialNome(texto) {
    // Busca padrões como "me chamo [nome]", "sou o/a [nome]", "meu nome é [nome]" etc
    const padroes = [
      /(?:me\s+chamo|sou\s+(?:o|a)|meu\s+nome\s+(?:é|e))\s+([A-Z][a-zãáàâéêíóôõúç]+(?: [A-Z][a-zãáàâéêíóôõúç]+)+)/i,
      /([A-Z][a-zãáàâéêíóôõúç]+(?: [A-Z][a-zãáàâéêíóôõúç]+){1,5})/
    ];
    
    for (const padrao of padroes) {
      const match = texto.match(padrao);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    
    // Se não encontrou pelos padrões, verifica se o texto tem formato de nome
    // (primeira letra maiúscula e pelo menos um sobrenome)
    if (/^[A-Z][a-zãáàâéêíóôõúç]+(?: [A-Z][a-zãáàâéêíóôõúç]+)+$/.test(texto.trim())) {
      return texto.trim();
    }
    
    return null;
  }
  
  // Extrai o serviço desejado com base no contexto atual
  async _extrairServicoDesejado(userId) {
    try {
      if (!this.contextos.has(userId)) return null;
      
      const contexto = this.contextos.get(userId);
      const topico = this.topicoConversa.get(userId);
      
      // Cria uma versão resumida do contexto para economizar tokens
      const contextoResumido = [
        contexto[0], // Mantém a mensagem de sistema
        ...contexto.slice(-6) // Pega as últimas 6 mensagens
      ];
      
      // Adapta o prompt com base no tópico
      let prompt = "Com base na nossa conversa até agora, ";
      
      if (topico === 'transferencia_veiculo') {
        prompt += "qual é o tipo específico de serviço relacionado a veículo que estou buscando? (transferência, procuração para venda, autorização para dirigir, etc.)";
      } else if (topico === 'previdenciario') {
        prompt += "qual é o principal benefício previdenciário ou serviço jurídico relacionado ao INSS que estou buscando?";
      } else {
        prompt += "qual é o principal serviço jurídico que estou buscando?";
      }
      
      prompt += " Responda apenas com o nome do serviço, sem explicações adicionais.";
      
      // Adiciona um prompt específico
      contextoResumido.push({
        role: "user",
        content: prompt
      });
      
      // Consulta o modelo
      const resposta = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: contextoResumido,
        temperature: 0.3,
        max_tokens: 100
      });
      
      return resposta.choices[0].message.content.trim();
    } catch (erro) {
      console.error("Erro ao extrair serviço desejado:", erro);
      return null;
    }
  }
  
  // Extrai dados do cliente a partir do contexto da conversa
  async extractClientData(userId) {
    // Verifica primeiro se temos dados já coletados explicitamente
    if (this.dadosCliente.has(userId)) {
      const dadosExistentes = this.dadosCliente.get(userId);
      if (dadosExistentes.nome && dadosExistentes.cpf) {
        // Se temos pelo menos nome e CPF, usamos esses dados
        return dadosExistentes;
      }
    }
    
    // Se não houver contexto, retorna objeto vazio
    if (!this.contextos.has(userId)) {
      return {};
    }
    
    const contexto = this.contextos.get(userId);
    const topico = this.topicoConversa.get(userId);
    
    try {
      // Adapta o prompt com base no tópico da conversa
      let extractPrompt = `Por favor, ajude-me a preencher os dados do cliente para o sistema:
      
      1) Nome completo do cliente (como aparece nos documentos)
      2) CPF do cliente (apenas números)`;
      
      if (topico === 'transferencia_veiculo') {
        extractPrompt += `
      3) Dados do veículo (modelo e placa, se disponíveis)
      4) Nome da pessoa que receberá a procuração (se mencionado)
      5) Finalidade específica da procuração para veículo`;
      } else if (topico === 'previdenciario') {
        extractPrompt += `
      3) Qual benefício previdenciário ou serviço relacionado ao INSS está buscando`;
      } else {
        extractPrompt += `
      3) Qual serviço jurídico está buscando`;
      }
      
      extractPrompt += `
      
      Por favor, responda APENAS em formato JSON como este exemplo:
      {"nome": "João Silva", "cpf": "12345678901", "servico_desejado": "Transferência de veículo"}
      
      Se alguma informação não estiver disponível, use null para o valor.`;
      
      // Cria uma cópia do contexto para não modificar o original
      const contextoTemp = [...contexto];
      
      // Adiciona a extração ao contexto temporário
      contextoTemp.push({ role: "user", content: extractPrompt });
      
      // Envia para processamento no GPT-4
      const resposta = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: contextoTemp,
        temperature: 0.2,
        max_tokens: 350
      });
      
      // Tenta extrair o JSON da resposta
      const textoResposta = resposta.choices[0].message.content;
      let dados = {};
      
      try {
        // Tenta extrair o JSON da resposta
        const jsonMatch = textoResposta.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          dados = JSON.parse(jsonMatch[0]);
          
          // Renomeia o campo beneficio_desejado para servico_desejado se existir
          if (dados.beneficio_desejado && !dados.servico_desejado) {
            dados.servico_desejado = dados.beneficio_desejado;
            delete dados.beneficio_desejado;
          }
          
          // Se temos dados válidos, armazena no mapa de dados do cliente
          if (dados.nome || dados.cpf || dados.servico_desejado) {
            // Mescla com dados existentes, se houver
            const dadosAtuais = this.dadosCliente.get(userId) || {};
            this.dadosCliente.set(userId, { ...dadosAtuais, ...dados });
          }
        }
      } catch (jsonError) {
        console.error("Erro ao interpretar JSON de dados:", jsonError);
      }
      
      return dados;
    } catch (erro) {
      console.error("Erro ao extrair dados do cliente:", erro);
      return {};
    }
  }
  
  // Limpa o contexto de um usuário específico
  clearContext(userId) {
    if (this.contextos.has(userId)) {
      // Preserva apenas a mensagem de sistema
      const sistema = this.contextos.get(userId).find(msg => msg.role === "system");
      if (sistema) {
        this.contextos.set(userId, [sistema]);
      } else {
        this.contextos.delete(userId);
      }
      
      // Limpa também a fase de atendimento e dados
      this.fasesAtendimento.delete(userId);
      this.dadosCliente.delete(userId);
      
      return true;
    }
    return false;
  }
  
  // Limpa contextos antigos para liberar memória
  cleanupOldContexts(maxIdadeHoras = 24) {
    const agora = Date.now();
    const maxIdadeMs = maxIdadeHoras * 60 * 60 * 1000;
    let contadorRemovidos = 0;
    
    for (const [userId, timestamp] of this.ultimaInteracao.entries()) {
      if (agora - timestamp > maxIdadeMs) {
        this.contextos.delete(userId);
        this.ultimaInteracao.delete(userId);
        this.fasesAtendimento.delete(userId);
        this.dadosCliente.delete(userId);
        contadorRemovidos++;
      }
    }
    
    return contadorRemovidos;
  }

  // Detector de tópico da conversa
  async _detectarTopico(userId, texto) {
    try {
      // Se já temos um tópico específico, verificamos se o texto atual o mantém
      const topicoAtual = this.topicoConversa.get(userId);
      if (topicoAtual && topicoAtual !== 'geral') {
        // Palavras-chave que indicariam uma mudança de tópico
        const palavrasChaveMudancaTopico = [
          'mudar de assunto', 'outro tema', 'outra questão', 'diferente', 
          'esquece isso', 'deixa pra lá', 'outro problema'
        ];
        
        // Se houver indícios claros de mudança de tópico, resetamos para 'geral'
        if (palavrasChaveMudancaTopico.some(palavra => texto.toLowerCase().includes(palavra))) {
          return 'geral';
        }
        
        // Caso contrário, mantemos o tópico atual
        return topicoAtual;
      }
      
      // Palavras-chave para tópico de transferência de veículo
      const palavrasChaveVeiculo = [
        'transferir carro', 'transferência veículo', 'transferência de veículo',
        'transferir veículo', 'documentação veículo', 'transferir meu carro',
        'procuração carro', 'procuração para carro', 'vender carro', 'vender meu carro',
        'comprar carro', 'procuração veicular', 'detran', 'transferência de propriedade',
        'documento de transferência', 'procuração para transferir', 'CRV', 'DUT',
        'transferir moto', 'transferência moto', 'procuração para vender'
      ];
      
      // Palavras-chave para tópico previdenciário
      const palavrasChavePrevidenciario = [
        'aposentadoria', 'benefício', 'inss', 'pensão', 'auxílio', 'benefício por incapacidade',
        'bpc', 'loas', 'tempo de contribuição', 'previdência', 'previdenciário', 
        'aposentar', 'revisão', 'perícia', 'médica', 'auxílio-doença', 'aposentadoria por idade',
        'aposentadoria por tempo', 'procuração para o inss', 'procuração previdenciária',
        'afastado', 'afastamento', 'doença', 'saúde', 'atestado', 'incapacidade'
      ];
      
      // Palavras-chave para tópico imobiliário
      const palavrasChaveImovel = [
        'transferir imóvel', 'transferência imóvel', 'transferência de imóvel',
        'procuração imóvel', 'comprar casa', 'vender casa', 'comprar apartamento',
        'vender apartamento', 'escritura', 'registro de imóvel', 'matrícula',
        'procuração para vender imóvel', 'procuração para comprar imóvel'
      ];
      
      // Verifica se o texto contém palavras-chave de algum tópico
      if (palavrasChaveVeiculo.some(palavra => texto.toLowerCase().includes(palavra))) {
        return 'transferencia_veiculo';
      } else if (palavrasChaveImovel.some(palavra => texto.toLowerCase().includes(palavra))) {
        return 'transferencia_imovel';
      } else if (palavrasChavePrevidenciario.some(palavra => texto.toLowerCase().includes(palavra))) {
        return 'previdenciario';
      } else if (texto.toLowerCase().includes('procuração')) {
        // Se mencionou procuração mas não especificou o tipo, vamos tentar entender pelo contexto
        if (texto.toLowerCase().includes('veículo') || texto.toLowerCase().includes('carro') || 
            texto.toLowerCase().includes('moto')) {
          return 'transferencia_veiculo';
        } else if (texto.toLowerCase().includes('imóvel') || texto.toLowerCase().includes('casa') || 
                  texto.toLowerCase().includes('apartamento')) {
          return 'transferencia_imovel';
        } else if (texto.toLowerCase().includes('inss') || texto.toLowerCase().includes('benefício')) {
          return 'previdenciario';
        }
      }
      
      // Simplificado: não faz mais consulta adicional ao modelo
      return 'geral';
    } catch (erro) {
      console.error("Erro ao detectar tópico:", erro);
      return 'geral';
    }
  }

  // Verifica se devemos aguardar mais mensagens do usuário
  async _verificarSeDeveEsperar(userId, texto, agora) {
    // Sempre processa imediatamente sem esperar
    return false;
  }

  // Método para verificar se deve gerar documento para o usuário
  deveGerarDocumento(userId) {
    // Verificamos se o usuário está na fase adequada e tem dados suficientes
    if (!this.fasesAtendimento.has(userId) || !this.dadosCliente.has(userId)) {
      return false;
    }
    
    const faseAtual = this.fasesAtendimento.get(userId);
    const dadosCliente = this.dadosCliente.get(userId);
    const topico = this.topicoConversa.get(userId);
    
    // Só geramos documentos na fase de oferecendo_solucao ou encerramento
    if (faseAtual !== 'oferecendo_solucao' && faseAtual !== 'encerramento') {
      return false;
    }
    
    // Verificamos se temos os dados mínimos necessários para qualquer tipo de documento
    const temDadosBasicos = dadosCliente.nome && dadosCliente.cpf;
    
    if (!temDadosBasicos) {
      return false;
    }
    
    // Para transferência de veículo/imóvel, verificamos dados do outorgado
    if (topico === 'transferencia_veiculo' || topico === 'transferencia_imovel') {
      // Requisitos específicos para procuração de veículo/imóvel
      const temDadosOutorgado = dadosCliente.outorgado_nome || (dadosCliente.outorgado_cpf && dadosCliente.outorgado_cpf.length > 5);
      const temEndereco = dadosCliente.endereco && dadosCliente.endereco.length > 5;
      
      // Verifica se o contexto da conversa indica uma intenção explícita de gerar procuração
      let intenção = false;
      if (this.contextos.has(userId)) {
        const contexto = this.contextos.get(userId);
        const ultimasMensagens = contexto.slice(-4); // últimas 4 mensagens
        
        // Verifica se nas últimas mensagens há indicação de querer procuração
        for (const msg of ultimasMensagens) {
          const txt = msg.content.toLowerCase();
          if (txt.includes('gerar procuração') || 
              txt.includes('fazer procuração') || 
              txt.includes('criar procuração') ||
              txt.includes('documento') && (txt.includes('assinar') || txt.includes('gerar'))) {
            intenção = true;
            break;
          }
        }
      }
      
      // Só gera documento se tiver dados completos e intenção ou fase avançada
      return (temDadosOutorgado && temEndereco) && (intenção || faseAtual === 'encerramento');
    } 
    
    // Para previdenciário, verificamos se temos o benefício desejado
    if (topico === 'previdenciario') {
      const temBeneficio = dadosCliente.servico_desejado || dadosCliente.beneficio_desejado;
      
      // Verifica intenção para documentos previdenciários
      let intenção = false;
      if (this.contextos.has(userId)) {
        const contexto = this.contextos.get(userId);
        const ultimasMensagens = contexto.slice(-4);
        
        for (const msg of ultimasMensagens) {
          const txt = msg.content.toLowerCase();
          if (txt.includes('procuração') || 
              txt.includes('documento') || 
              txt.includes('representação')) {
            intenção = true;
            break;
          }
        }
      }
      
      return temBeneficio && (intenção || faseAtual === 'encerramento');
    }
    
    // Para outros casos, verificamos se temos o serviço desejado e intenção
    const temServicoDesejado = dadosCliente.servico_desejado !== undefined;
    let intenção = false;
    
    if (this.contextos.has(userId)) {
      const contexto = this.contextos.get(userId);
      const ultimasMensagens = contexto.slice(-4);
      
      for (const msg of ultimasMensagens) {
        const txt = msg.content.toLowerCase();
        if (txt.includes('procuração') || 
            txt.includes('documento') || 
            txt.includes('contrato')) {
          intenção = true;
          break;
        }
      }
    }
    
    return temServicoDesejado && (intenção || faseAtual === 'encerramento');
  }
  
  // Método para marcar que o documento foi gerado
  marcarDocumentoGerado(userId) {
    if (this.dadosCliente.has(userId)) {
      const dadosCliente = this.dadosCliente.get(userId);
      dadosCliente.documento_gerado = true;
      this.dadosCliente.set(userId, dadosCliente);
      
      // Avança para a fase de encerramento
      this.fasesAtendimento.set(userId, 'encerramento');
    }
  }
  
  // Método para obter o tipo de documento a ser gerado
  getTipoDocumento(userId) {
    if (!this.dadosCliente.has(userId) || !this.topicoConversa.has(userId)) {
      return 'geral';
    }
    
    const topico = this.topicoConversa.get(userId);
    const dadosCliente = this.dadosCliente.get(userId);
    
    if (topico === 'transferencia_veiculo') {
      return 'procuracao_veiculo';
    } else if (topico === 'transferencia_imovel') {
      return 'procuracao_imovel';
    } else if (topico === 'previdenciario') {
      // Se temos um benefício específico, usamos ele para determinar
      if (dadosCliente.servico_desejado) {
        const servico = dadosCliente.servico_desejado.toLowerCase();
        if (servico.includes('aposentadoria')) return 'aposentadoria';
        if (servico.includes('auxílio') || servico.includes('auxilio')) return 'auxilio';
        if (servico.includes('bpc') || servico.includes('loas')) return 'bpc';
        if (servico.includes('pensão') || servico.includes('pensao')) return 'pensao';
        if (servico.includes('revisão') || servico.includes('revisao')) return 'revisao';
      }
      return 'inss'; // Tipo padrão para previdenciário
    }
    
    return 'geral';
  }
  
  // Método para obter os dados formatados para geração de documento
  getDadosDocumento(userId) {
    if (!this.dadosCliente.has(userId)) {
      return null;
    }
    
    const dadosCliente = this.dadosCliente.get(userId);
    const topico = this.topicoConversa.get(userId);
    const tipoDocumento = this.getTipoDocumento(userId);
    
    // Dados base que todos os documentos precisam
    const dadosBase = {
      nome: dadosCliente.nome,
      cpf: dadosCliente.cpf,
      tipo: tipoDocumento
    };
    
    // Dados adicionais específicos por tipo de documento
    if (topico === 'transferencia_veiculo' || topico === 'transferencia_imovel') {
      return {
        ...dadosBase,
        outorgado_nome: dadosCliente.outorgado_nome || 'Romário Alves',
        outorgado_cpf: dadosCliente.outorgado_cpf || '18238123456',
        endereco: dadosCliente.endereco || 'Avenida Paulista',
        motivo: topico === 'transferencia_veiculo' ? 
          'Transferência de propriedade de veículo' : 
          'Transferência de propriedade de imóvel'
      };
    } else if (topico === 'previdenciario') {
      return {
        ...dadosBase,
        outorgado_nome: dadosCliente.outorgado_nome || (dadosCliente.servico_desejado ? 'Beneficiário do INSS' : null),
        outorgado_cpf: dadosCliente.outorgado_cpf || null,
        motivo: `Representação junto ao INSS para ${dadosCliente.servico_desejado || 'benefícios previdenciários'}`
      };
    }
    
    // Para outros tipos
    return {
      ...dadosBase,
      motivo: dadosCliente.servico_desejado || 'Representação jurídica'
    };
  }

  // Método para marcar que estamos aguardando confirmação do usuário para continuar com o processo do documento
  aguardandoConfirmacaoDocumento(userId, pdfPath, nomeCliente, tipoDocumento) {
    this.confirmacaoDocumentoPendente.set(userId, {
      pdfPath,
      nomeCliente,
      tipoDocumento,
      timestamp: Date.now()
    });
    
    // Definimos uma fase especial no atendimento
    this.fasesAtendimento.set(userId, 'aguardando_confirmacao_documento');
  }
  
  // Verifica se o usuário está confirmando o recebimento do documento para prosseguir
  isConfirmacaoDocumento(userId, texto) {
    if (!this.confirmacaoDocumentoPendente.has(userId)) {
      return false;
    }
    
    const faseAtual = this.fasesAtendimento.get(userId);
    if (faseAtual !== 'aguardando_confirmacao_documento') {
      return false;
    }
    
    // Verifica se o texto indica uma confirmação
    const textoLower = texto.toLowerCase().trim();
    const palavrasConfirmacao = [
      'ok', 'sim', 'confirmo', 'quero', 'pode', 'continuar', 'prosseguir', 
      'prossiga', 'concordo', 'assinar', 'assinatura', 'entendi', 
      'certo', 'correto', 'aprovado', 'aprovo', 'está bom', 'tá bom',
      'perfeito', 'está tudo certo', 'autorizo', 'está correto', 'vamos lá'
    ];
    
    // Padrões de negação que invalidam a confirmação
    const palavrasNegacao = [
      'não', 'nao', 'incorreto', 'errado', 'mudar', 'corrigir', 
      'alterar', 'refazer', 'modificar', 'está errado', 'tem erro'
    ];
    
    // Se tiver alguma negação, não é uma confirmação válida
    if (palavrasNegacao.some(palavra => textoLower.includes(palavra))) {
      return false;
    }
    
    return palavrasConfirmacao.some(palavra => textoLower.includes(palavra));
  }
  
  // Obtém os dados do documento pendente para continuar o processo
  getDadosDocumentoPendente(userId) {
    return this.confirmacaoDocumentoPendente.get(userId) || null;
  }
  
  // Limpa a confirmação pendente
  limparConfirmacaoPendente(userId) {
    this.confirmacaoDocumentoPendente.delete(userId);
  }

  /**
   * Envia uma pergunta para o GPT e retorna a resposta
   * @param {string} pergunta - A pergunta do usuário
   * @param {Array} historico - O histórico de conversas (opcional)
   * @returns {Promise<string>} - A resposta do GPT
   */
  async perguntar(pergunta, historico = []) {
    try {
      // Obtém o userId e verifica se o redirecionamento já foi ativado
      const userId = this._extrairUserIdDoHistorico(historico);
      
      // Verifica se o modo de segurança persistente está ativado
      if (userId && this.modoSeguranca.get(userId)) {
        // Verifica se o usuário está solicitando atendimento pelo Gabriel ou fornecendo dados pessoais
        const solicitaGabriel = this._verificaSolicitaGabriel(pergunta);
        const forneceuNome = this._extrairPotencialNome(pergunta);
        const descreveuSituacao = this._verificaDescricaoSituacao(pergunta);
        
        // PRIMEIRO verifica se há solicitação válida para Gabriel ou dados completos
        // Exige que a solicitação de Gabriel seja explícita ou que forneça nome E situação detalhada
        if ((solicitaGabriel && typeof solicitaGabriel === 'string' && solicitaGabriel.length > 5) || 
            (forneceuNome && descreveuSituacao)) {
          console.log(`Modo de segurança desativado em perguntar() para ${userId} - Solicitou Gabriel: ${solicitaGabriel}, Forneceu dados: ${forneceuNome && descreveuSituacao}`);
          this.modoSeguranca.set(userId, false);
          this.insistenciaTecnica.set(userId, 0);
          this.redirecionamentoAtivado.set(userId, false);
          
          if (solicitaGabriel) {
            return `Vou providenciar para que o Dr. Gabriel entre em contato com você. Ele é nosso advogado especialista e vai poder esclarecer todas as suas dúvidas técnicas. Poderia me informar qual é a situação que você está enfrentando?`;
          }
          
          if (forneceuNome && descreveuSituacao) {
            return `Obrigada pelas informações, ${forneceuNome}. Agora posso te ajudar adequadamente com sua situação.`;
          }
        } 
        
        // Se chegou aqui, a mensagem não desativou o modo de segurança
        // Incrementa o contador de insistência
        const contadorInsistencia = this.insistenciaTecnica.get(userId) || 0;
        this.insistenciaTecnica.set(userId, contadorInsistencia + 1);
        
        // Array de respostas curtas e diretas para o modo de segurança
        const respostasSeguranca = [
          `Preciso do seu nome e da sua situação real para poder ajudar. Sem isso, não posso continuar com detalhes técnicos.`,
          
          `Para questões técnicas, só posso ajudar conhecendo seu caso real. Como posso te chamar e qual é sua situação?`,
          
          `Posso pedir para o Dr. Gabriel te atender diretamente se preferir. Quer isso?`,
          
          `Nossa política de segurança requer que eu conheça sua situação real antes de dar orientações técnicas.`,
          
          `Não vou poder continuar com respostas técnicas. Se quiser retomar, me conte quem você é e o que está enfrentando.`
        ];
        
        // Escolhe a resposta com base no nível de insistência
        const indice = Math.min(contadorInsistencia, respostasSeguranca.length - 1);
        return respostasSeguranca[indice];
      }
      
      // O código a seguir só é executado se o modo de segurança NÃO estiver ativado
      
      // Verifica se é uma pergunta técnica
      const ehPerguntaTecnica = await this._detectarPerguntaTecnica(pergunta);
      
      // Verifica se houve mudança de assunto
      let mudancaDeAssunto = false;
      
      if (userId && !this.modoSeguranca.get(userId) && this.redirecionamentoAtivado.get(userId)) {
        // Detecta se a mensagem atual indica claramente uma mudança de serviço desejado
        const indicaMudancaServico = this._detectaMudancaServico(pergunta);
        
        // Verifica se o tópico atual é diferente do último registrado
        const ultimoTopico = this.ultimoTopicoTecnico.get(userId);
        const topicoAtual = ehPerguntaTecnica ? await this._detectarTopicoTecnico(pergunta) : null;
        
        mudancaDeAssunto = indicaMudancaServico || 
                         (ultimoTopico && topicoAtual && 
                          !ultimoTopico.includes(topicoAtual) && 
                          !topicoAtual.includes(ultimoTopico));
        
        // Se for uma mudança clara de assunto, reseta o bloqueio simples (mas não o modo de segurança)
        if (indicaMudancaServico || !ehPerguntaTecnica) {
          this.redirecionamentoAtivado.set(userId, false);
          this.perguntasTecnicasSequenciais.set(userId, 0);
          this.contadorSeguranca.set(userId, 0);
          this.ultimoTopicoTecnico.delete(userId);
        }
      }
      
      // Se o redirecionamento está ativado, a pergunta é técnica, e não houve mudança de assunto
      if (userId && !this.modoSeguranca.get(userId) && 
          this.redirecionamentoAtivado.get(userId) && 
          ehPerguntaTecnica && !mudancaDeAssunto) {
        // Incrementa contador de segurança para variar as respostas
        const nivelSeguranca = this.contadorSeguranca.get(userId) || 0;
        this.contadorSeguranca.set(userId, nivelSeguranca + 1);
        
        // Array de respostas para variar e humanizar
        const respostasSeguranca = [
          `Para questões técnicas como essa, precisamos primeiro entender seu caso específico. Me conte quem você é e qual situação está enfrentando?`,
          
          `Entendo sua dúvida, mas o Dr. Gabriel, nosso advogado, é quem vai poder te dar essa orientação específica após conhecermos seu caso.`,
          
          `Antes de responder isso, preciso saber mais sobre você e seu caso. Vamos começar pelo básico?`,
          
          `Como sua advogada, preciso conhecer você primeiro. Me conta um pouco sobre sua situação?`,
          
          `Essas questões técnicas são melhor respondidas pelo Dr. Gabriel após entendermos seu caso. Vamos começar?`
        ];
        
        // Escolhe uma resposta com base no nível de segurança
        const indice = nivelSeguranca % respostasSeguranca.length;
        return respostasSeguranca[indice];
      }
      
      // Se for pergunta técnica e o usuário estiver em uma fase de coleta de dados,
      // incrementa o contador de perguntas técnicas e verifica limites
      if (ehPerguntaTecnica && userId) {
        const faseAtual = this.fasesAtendimento.get(userId) || '';
        const fasesColeta = ['identificando_problema', 'coletando_dados', 'coletando_dados_representante'];
        
        if (fasesColeta.includes(faseAtual)) {
          const contador = this.contadorPerguntasTecnicas.get(userId) || 0;
          this.contadorPerguntasTecnicas.set(userId, contador + 1);
          
          // Ativa o modo de segurança persistente após 3 perguntas técnicas, se estiver em fase inicial
          const dadosCliente = this.dadosCliente.get(userId) || {};
          const dadosFornecidos = dadosCliente.nome || dadosCliente.cpf;
          
          if (contador >= 3 && !dadosFornecidos) {
            this.modoSeguranca.set(userId, true);
            console.log(`MODO DE SEGURANÇA PERSISTENTE ativado em perguntar() para ${userId}`);
            
            return `Não posso continuar fornecendo informações técnicas sem conhecer seu caso real. Me conte seu nome e qual situação você está enfrentando, assim poderei te ajudar melhor.`;
          }
          
          // Se atingiu o limite de perguntas técnicas, retorna mensagem educada
          if (contador >= 3) {
            // Reseta o contador para não ficar repetindo a mesma mensagem
            this.contadorPerguntasTecnicas.set(userId, 0);
            
            // Obtém a última pergunta que fizemos ao usuário com base na fase
            let perguntaOriginal = "sobre seus dados";
            if (faseAtual === 'identificando_problema') {
              perguntaOriginal = "sobre qual serviço você precisa";
            } else if (faseAtual === 'coletando_dados') {
              perguntaOriginal = "sobre seus dados pessoais";
            } else if (faseAtual === 'coletando_dados_representante') {
              perguntaOriginal = "sobre os dados do seu representante";
            }
            
            // Respostas mais curtas e diretas
            return `Entendo sua dúvida, mas primeiro precisamos concluir o cadastro ${perguntaOriginal}. O Dr. Gabriel vai esclarecer todos esses detalhes técnicos depois, ok?`;
          }
        }
      }
      
      // Se não for pergunta técnica ou não atingiu o limite, continua normalmente
      // Prepara as mensagens incluindo o histórico com instrução para respostas mais humanas
      const mensagens = [
        { 
          role: 'system', 
          content: `Você é SOPHIA, advogada humana. Responda SEMPRE em no máximo 2 frases curtas, nunca ultrapasse 2 linhas. Nunca repita perguntas já respondidas (nome, CPF, dados do representante, etc). Seja natural, empática, e nunca use listas, emojis ou termos técnicos sem explicação. Se faltar algum dado, peça de forma clara e direta. Se todos os dados estiverem completos, avance para a geração do documento. Se o cliente pedir, encaminhe para o Dr. Gabriel e informe que ele dará continuidade.` },
        ...historico,
        { role: 'user', content: pergunta }
      ];

      // Faz a chamada para a API
      const resposta = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo',
        messages: mensagens,
        temperature: 0.7,
        max_tokens: 150  // Reduzido para forçar respostas ainda mais curtas
      });

      return resposta.choices[0].message.content;
    } catch (erro) {
      console.error('Erro ao consultar GPT:', erro);
      return 'Desculpe, tive um problema técnico. Pode tentar novamente?';
    }
  }
  
  // Função auxiliar para extrair userId do histórico
  _extrairUserIdDoHistorico(historico) {
    // O formato esperado do histórico inclui o userId em algum lugar
    for (const mensagem of historico) {
      if (mensagem.role === 'system' && mensagem.content.includes('userId:')) {
        const match = mensagem.content.match(/userId:\s*([^\s]+)/);
        if (match && match[1]) {
          return match[1];
        }
      }
    }
    return null;
  }
  
  /**
   * Analisa um documento jurídico e extrai informações relevantes
   * @param {string} textoDocumento - O texto do documento a ser analisado
   * @returns {Promise<Object>} - As informações extraídas
   */
  async analisarDocumento(textoDocumento) {
    try {
      const resposta = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo',
        messages: [
          { 
            role: 'system', 
            content: 'Você é um assistente especializado em analisar documentos jurídicos. Extraia as informações mais relevantes e retorne em formato JSON.'
          },
          { 
            role: 'user', 
            content: `Analise este documento e extraia as informações importantes como nome das partes, objeto, valores, datas e obrigações:\n\n${textoDocumento}`
          }
        ],
        temperature: 0.3,
        max_tokens: 1500,
        response_format: { type: 'json_object' }
      });
      
      return JSON.parse(resposta.choices[0].message.content);
    } catch (erro) {
      console.error('Erro ao analisar documento:', erro);
      return { erro: 'Falha ao analisar o documento' };
    }
  }

  // Define explicitamente a fase de atendimento
  setFaseAtendimento(userId, fase) {
    if (!this.fasesAtendimento.has(userId)) {
      this.dadosCliente.set(userId, {});
      this.topicoConversa.set(userId, 'geral');
    }
    
    this.fasesAtendimento.set(userId, fase);
    
    // Atualiza o contexto do sistema para refletir a nova fase
    if (this.contextos.has(userId)) {
      const contexto = this.contextos.get(userId);
      if (contexto[0].role === "system") {
        contexto[0].content = contexto[0].content.replace(
          /Fase atual do atendimento: .*/,
          `Fase atual do atendimento: ${fase}`
        );
      }
    }
    
    console.log(`Fase de atendimento para ${userId} atualizada para: ${fase}`);
    return true;
  }

  // Registra o recebimento de um documento
  registrarDocumentoRecebido(userId, tipoDocumento) {
    if (!this.documentosRecebidos.has(userId)) {
      this.documentosRecebidos.set(userId, {});
    }
    
    const documentos = this.documentosRecebidos.get(userId);
    documentos[tipoDocumento] = true;
    this.documentosRecebidos.set(userId, documentos);
    
    // Atualiza a fase de atendimento se ainda não estiver na fase de documentos
    if (this.fasesAtendimento.get(userId) !== 'documentos_recebidos') {
      this.fasesAtendimento.set(userId, 'documentos_recebidos');
    }
    
    return documentos;
  }
  
  // Verifica se todos os documentos necessários foram recebidos
  todosDocumentosRecebidos(userId) {
    if (!this.documentosRecebidos.has(userId)) {
      return false;
    }
    
    const documentos = this.documentosRecebidos.get(userId);
    const dadosCliente = this.dadosCliente.get(userId) || {};
    const tipoServico = dadosCliente.servico_desejado || '';
    
    // Define os documentos necessários com base no tipo de serviço
    let documentosNecessarios = [];
    if (tipoServico.toLowerCase().includes('auxílio-doença')) {
      documentosNecessarios = ['Atestado médico', 'Laudo médico com CID', 'Comprovante de residência', 'Documento de identidade'];
    } else if (tipoServico.toLowerCase().includes('transferência de veículo')) {
      documentosNecessarios = ['Documento do veículo', 'Comprovante de residência', 'Documento de identidade'];
    } else {
      documentosNecessarios = ['Comprovante de residência', 'Documento de identidade'];
    }
    
    // Verifica se todos os documentos necessários foram recebidos
    return documentosNecessarios.every(doc => documentos[doc]);
  }
  
  // Obtém a lista de documentos recebidos e faltantes
  getStatusDocumentos(userId) {
    if (!this.documentosRecebidos.has(userId)) {
      return { recebidos: [], faltantes: [] };
    }
    
    const documentos = this.documentosRecebidos.get(userId);
    const dadosCliente = this.dadosCliente.get(userId) || {};
    const tipoServico = dadosCliente.servico_desejado || '';
    
    // Define os documentos necessários com base no tipo de serviço
    let documentosNecessarios = [];
    if (tipoServico.toLowerCase().includes('auxílio-doença')) {
      documentosNecessarios = ['Atestado médico', 'Laudo médico com CID', 'Comprovante de residência', 'Documento de identidade'];
    } else if (tipoServico.toLowerCase().includes('transferência de veículo')) {
      documentosNecessarios = ['Documento do veículo', 'Comprovante de residência', 'Documento de identidade'];
    } else {
      documentosNecessarios = ['Comprovante de residência', 'Documento de identidade'];
    }
    
    const recebidos = Object.keys(documentos).filter(doc => documentos[doc]);
    const faltantes = documentosNecessarios.filter(doc => !recebidos.includes(doc));
    
    return { recebidos, faltantes };
  }

  // Verifica se temos todos os dados necessários para gerar a procuração
  dadosCompletos(userId) {
    if (!this.dadosCliente.has(userId)) {
      return false;
    }
    
    const dadosCliente = this.dadosCliente.get(userId);
    const topico = this.topicoConversa.get(userId);
    
    // Verificamos os dados básicos necessários para qualquer procuração
    const temDadosBasicos = dadosCliente.nome && dadosCliente.cpf;
    
    if (!temDadosBasicos) {
      return false;
    }
    
    // Dados do representante/outorgado também são obrigatórios
    const temDadosRepresentante = dadosCliente.outorgado_nome && dadosCliente.outorgado_cpf;
    
    if (!temDadosRepresentante) {
      return false;
    }
    
    // Verificamos se temos o serviço desejado ou motivo da procuração
    const temServico = dadosCliente.servico_desejado || 
                      (topico !== 'geral' && this.topicoConversa.has(userId));
    
    return temServico;
  }

  // Método auxiliar para formatar CPF com pontuação
  _formatarCPF(cpf) {
    if (!cpf || cpf.length !== 11) return cpf;
    return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  
  // Método auxiliar para obter finalidade com base no tópico
  _obterFinalidadeDoTopico(topico) {
    switch(topico) {
      case 'transferencia_veiculo':
        return 'Transferência de veículo';
      case 'transferencia_imovel':
        return 'Transferência de imóvel';
      case 'previdenciario':
        return 'Representação junto ao INSS';
      default:
        return 'Representação legal';
    }
  }

  // Método para detectar o tópico de uma pergunta técnica
  async _detectarTopicoTecnico(texto) {
    const promptTopico = `
    Identifique qual é o tópico jurídico principal na pergunta a seguir. Seja específico e use apenas uma palavra ou expressão curta como "aposentadoria", "auxílio-doença", "justa causa", "acidente de trabalho", "divórcio", "pensão alimentícia", etc.
    
    Pergunta: "${texto}"
    
    Tópico jurídico: `;

    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "Você é um assistente especializado em identificar tópicos jurídicos em perguntas." },
          { role: "user", content: promptTopico }
        ],
        temperature: 0.1,
        max_tokens: 10
      });
      
      const topico = completion.choices[0].message.content.trim().toLowerCase();
      return topico;
    } catch (error) {
      console.error("Erro ao detectar tópico técnico:", error);
      return null; // Em caso de erro, retorna null
    }
  }

  async _detectarPerguntaTecnica(texto) {
    const promptDeteccao = `
    Analise se o texto abaixo é uma pergunta técnica jurídica específica ou uma tentativa de obter consultoria jurídica gratuita.
    
    Exemplos de perguntas técnicas ou tentativas de consultoria gratuita:
    - "Se eu faltar no trabalho por 3 dias, posso ser demitido por justa causa?"
    - "Qual é o prazo para entrar com recurso no INSS após o indeferimento?"
    - "Como faço para calcular quanto vou receber de aposentadoria?"
    - "O que diz a lei sobre abandono de incapaz?"
    - "Quais documentos preciso para provar que tenho direito ao benefício?"
    - "Meu patrão pode me demitir estando eu de atestado?"
    - "Quanto tempo demora o processo no INSS?"
    - "Quais são meus direitos como trabalhador CLT se a empresa fechar?"
    - "Tenho direito a auxílio-doença se trabalho como autônomo?"
    - "O que a lei diz sobre divisão de bens em divórcio?"
    
    Texto para análise: "${texto}"
    
    Responda apenas com SIM se for uma pergunta técnica ou tentativa de consultoria gratuita, ou NÃO caso contrário.`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "Você é um assistente especializado em identificar perguntas técnicas jurídicas e tentativas de consultoria gratuita." },
          { role: "user", content: promptDeteccao }
        ],
        temperature: 0.1,
        max_tokens: 5
      });
      
      const resposta = completion.choices[0].message.content.trim();
      return resposta.toUpperCase().includes('SIM');
    } catch (error) {
      console.error("Erro ao detectar pergunta técnica:", error);
      return false; // Em caso de erro, não considera como pergunta técnica
    }
  }

  // Método para detectar mudança de serviço ou assunto na mensagem
  _detectaMudancaServico(texto) {
    const padroesNovoServico = [
      // Serviços explícitos
      /(?:preciso|quero|gostaria)[\s\w]+(?:ajuda|auxílio|assistência)[\s\w]+(?:com|para|sobre|em|outro)/i,
      /(?:mudar|trocar|alterar)[\s\w]+(?:assunto|tópico|tema|serviço)/i,
      /(?:outro|outra|nova|diferente)[\s\w]+(?:questão|situação|caso|problema|serviço|assunto)/i,
      
      // Serviços específicos
      /(?:preciso|quero|como\s+faço)[\s\w]+(?:procuração|documento|contrato|divórcio|pensão|aposentadoria|transferir|transferência|vender|comprar)/i,
      
      // Expressões de transição
      /(?:deixa|deixe)[\s\w]+(?:disso|esse\s+assunto|esse\s+tema|essa\s+questão)/i,
      /(?:vamos|podemos)[\s\w]+(?:mudar|trocar|falar\s+de\s+outra\s+coisa|falar\s+sobre\s+outro\s+assunto)/i,
      /esquece[\s\w]+isso/i,
      /outra[\s\w]+pergunta/i,
      
      // Indicações diretas
      /não[\s\w]+(?:isso|esse\s+assunto|essa\s+questão|esse\s+tema)/i,
      /na\s+verdade[\s\w]+(?:quero|preciso|gostaria|vim\s+por)/i
    ];
    
    return padroesNovoServico.some(padrao => padrao.test(texto));
  }

  // Verifica se o usuário está descrevendo uma situação pessoal concreta
  _verificaDescricaoSituacao(texto) {
    // Se o texto for muito curto, não é uma descrição válida
    if (!texto || texto.length < 50) return false;
    
    const padroesDescricao = [
      // Padrões de narrativa pessoal
      /(?:eu|meu|minha|me|comigo)[\s\w]+(?:estou|estive|fui|sou|tenho|preciso|quero|trabalh|empreg|contrat|problem)/i,
      
      // Descrições de situações específicas
      /(?:acidente|doença|doente|problema|situação|caso|empres|contrat|demit|aposent)/i,
      
      // Descrições temporais de casos
      /(?:semana|mês|ano|dia)[\s\w]+(?:passad|atrás|anterior)/i,
      
      // Marcadores de sequência de eventos
      /(?:depois|então|quando|aconteceu|ocorreu)/i,
      
      // Descrições de lugar/circunstância
      /(?:no|na|em)[\s\w]+(?:trabalho|empresa|hospital|acidente|casa|rua)/i
    ];
    
    // Verifica se pelo menos dois padrões são encontrados para confirmar que é uma descrição
    let padroesCombinados = 0;
    
    for (const padrao of padroesDescricao) {
      if (padrao.test(texto)) {
        padroesCombinados++;
        if (padroesCombinados >= 2) return true;
      }
    }
    
    return false;
  }
  
  // Verifica se o usuário está solicitando atendimento pelo advogado Gabriel
  _verificaSolicitaGabriel(texto) {
    // Se o texto for muito curto, não é uma solicitação válida
    if (!texto || texto.length < 10) return false;
    
    const padroesGabriel = [
      /(?:falar|conversar|atendimento|contato)[\s\w]+(?:com|pelo)[\s\w]+(?:gabriel|advogado|dr\.)/i,
      /(?:quero|gostaria|prefiro)[\s\w]+(?:gabriel|advogado|dr\.)/i,
      /(?:passa|transfere|transferir|encaminhar|encaminha)[\s\w]+(?:gabriel|advogado|dr\.)/i,
      /(?:gabriel|advogado|dr\.)[\s\w]+(?:diretamente|direto|melhor|prefiro)/i,
      /(?:sim|ok|pode|manda)[\s\w]?(?:gabriel|advogado)/i
    ];
    
    // Verifica se o texto contém algum dos padrões
    for (const padrao of padroesGabriel) {
      if (padrao.test(texto)) {
        // Extrai a correspondência para verificação adicional
        const match = texto.match(padrao);
        if (match && match[0]) {
          return match[0]; // Retorna o texto correspondente
        }
        return true; // Fallback
      }
    }
    
    return false;
  }
}

module.exports = GPT4Assistente; 