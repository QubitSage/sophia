const venom = require('venom-bot');
// Remover a função delay definida localmente já que agora a importamos do módulo documentos
const { salvarArquivo } = require('./utils/salvarArquivo');
const { enviarDocumentoAutentique, getChecklist, delay } = require('./utils/documentos');
const { gerarProcuracaoPDF } = require('./pdf/gerarProcuracao');
const { gerarPlanejamentoPDF } = require('./pdf/gerarPlanejamento');
const GPT4Assistente = require('./GPT4Assistente');

// Inicializa o assistente GPT-4
const assistente = new GPT4Assistente();

// Mantém registro dos IDs de usuários que estão gerando documentos
const usuariosGerandoDocumentos = new Set();
// Armazena a última mensagem recebida por usuário (para evitar duplicações)
const ultimasMensagensRecebidas = new Map();

function startBot() {
  venom
    .create({
      session: 'sophia-bot',
      headless: true,
      useChrome: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-infobars',
        '--window-position=0,0',
        '--ignore-certifcate-errors',
        '--ignore-certifcate-errors-spki-list',
        '--headless=new',
      ],
    })
    .then((client) => {
      console.log('🟢 SOPHIA CONECTADA. Aguardando mensagens...');

      // Limpa contextos antigos periodicamente (a cada hora)
      setInterval(() => {
        assistente.cleanupOldContexts();
      }, 3600000);

      client.onMessage(async (message) => {
        try {
          console.log(`[📩 RECEBIDO] Tipo: ${message.type} | Texto: ${message.body || '[SEM TEXTO]'}`);
          
          // Ignora grupos
          if (message.isGroupMsg) return;

          const userId = message.from;
          const nome = message.notifyName?.split(' ')[0] || 'amigo(a)';
          const texto = (message.body || '').trim();
          
          // Prevenção de mensagens duplicadas - verifica se a mensagem é idêntica à última
          // recebida do mesmo usuário nos últimos 3 segundos
          const ultimaMensagem = ultimasMensagensRecebidas.get(userId);
          if (ultimaMensagem && 
              ultimaMensagem.texto === texto && 
              Date.now() - ultimaMensagem.timestamp < 3000) {
            console.log('⚠️ Mensagem duplicada detectada, ignorando...');
            return;
          }
          
          // Atualiza registro da última mensagem
          ultimasMensagensRecebidas.set(userId, {
            texto,
            timestamp: Date.now()
          });
          
          // Processamento direto e simplificado
          try {
            // Verifica se é um arquivo (imagem/pdf/doc)
            if (message.mimetype && message.type !== 'sticker') {
              const nomeCliente = message.notifyName || 'cliente';
              const buffer = await client.decryptFile(message);
              const nomeArquivo = message.filename || `documento_${Date.now()}`;
              const caminho = await salvarArquivo(nomeCliente, buffer, nomeArquivo);

              // Detecta o tipo de documento baseado no contexto e no nome do arquivo
              let tipoDocumento = 'Documento';
              
              if (nomeArquivo.toLowerCase().includes('atestado') || 
                  message.caption?.toLowerCase().includes('atestado')) {
                tipoDocumento = 'Atestado médico';
              } else if (nomeArquivo.toLowerCase().includes('laudo') || 
                          message.caption?.toLowerCase().includes('laudo')) {
                tipoDocumento = 'Laudo médico com CID';
              } else if (nomeArquivo.toLowerCase().includes('comprovante') || 
                          nomeArquivo.toLowerCase().includes('residencia') || 
                          message.caption?.toLowerCase().includes('comprovante') ||
                          message.caption?.toLowerCase().includes('residência')) {
                tipoDocumento = 'Comprovante de residência';
              } else if (nomeArquivo.toLowerCase().includes('rg') || 
                          nomeArquivo.toLowerCase().includes('cnh') || 
                          nomeArquivo.toLowerCase().includes('identidade') ||
                          message.caption?.toLowerCase().includes('identidade')) {
                tipoDocumento = 'Documento de identidade';
              } else if (nomeArquivo.toLowerCase().includes('crlv') || 
                          nomeArquivo.toLowerCase().includes('veiculo') || 
                          nomeArquivo.toLowerCase().includes('veículo') ||
                          message.caption?.toLowerCase().includes('veículo')) {
                tipoDocumento = 'Documento do veículo';
              }
              
              // Registra o documento recebido
              assistente.registrarDocumentoRecebido(userId, tipoDocumento);
              
              // Obtém o status atual dos documentos
              const { recebidos, faltantes } = assistente.getStatusDocumentos(userId);
              
              // Notifica recebimento com base no status dos documentos
              let mensagemConfirmacao = `📥 ${tipoDocumento} recebido com sucesso!`;
              
              if (faltantes.length > 0) {
                mensagemConfirmacao += `\n\nDocumentos já recebidos: ${recebidos.join(', ')}\nAinda falta: ${faltantes.join(', ')}`;
              } else {
                mensagemConfirmacao += `\n\nRecebi todos os documentos necessários! Vamos prosseguir com seu caso.`;
              }
              
              await client.sendText(userId, mensagemConfirmacao);
              console.log(`✅ Documento salvo: ${caminho}`);
              
              const reply = await assistente.processMessage(
                userId, 
                `Acabei de enviar um documento chamado ${nomeArquivo} que é um ${tipoDocumento}.`
              );
              
              if (reply) {
                await client.sendText(userId, reply);
              }
              return;
            }
            
            // Comando de reset
            if (texto.startsWith('!reset') && texto.includes(process.env.ADMIN_KEY || '12345')) {
              assistente.clearContext(userId);
              await client.sendText(userId, `🔄 Contexto reiniciado com sucesso!`);
              return;
            }
            
            // Processamento normal de mensagem
            const reply = await assistente.processMessage(userId, texto, nome);
            
            // Se temos uma resposta, envia para o usuário
            if (reply) {
              await client.sendText(userId, reply);
              
              // Verifica se estamos aguardando confirmação do documento
              const confirmacaoDocumento = assistente.getDadosDocumentoPendente(userId);
              if (confirmacaoDocumento && assistente.isConfirmacaoDocumento(userId, texto)) {
                try {
                  // Usuário confirmou que quer prosseguir com o processo de assinatura
                  console.log('✅ Usuário confirmou recebimento do documento, prosseguindo com assinatura');
                  
                  // O caminho do PDF já foi armazenado
                  const { pdfPath, nomeCliente, tipoDocumento } = confirmacaoDocumento;
                  
                  await client.sendText(userId, `✍️ Enviando documento para assinatura digital...`);
                  
                  // Simulação de tempo de envio para assinatura
                  await delay(1500);
                  
                  // Enviando link para assinatura
                  const linkAssinatura = await enviarDocumentoAutentique(pdfPath, nomeCliente);
                  await client.sendText(userId, `🔗 Aqui está o link para assinatura digital: ${linkAssinatura}`);
                  
                  await delay(1500);
                  
                  // Enviar checklist de documentos complementares
                  const checklistMensagem = getChecklist(tipoDocumento);
                  await client.sendText(userId, checklistMensagem);
                  
                  // Após concluir, limpamos a pendência de confirmação
                  assistente.limparConfirmacaoPendente(userId);
                  
                  // Atualiza a fase para o próximo passo após a assinatura
                  if (tipoDocumento === 'planejamento') {
                    assistente.setFaseAtendimento(userId, 'planejamento_enviado');
                  } else {
                    assistente.setFaseAtendimento(userId, 'procuracao_enviada');
                    await client.sendText(userId, `Aqui está sua procuração. Agora é só assinar e enviar pra gente dar andamento, combinado?`);
                    
                    await delay(1500);
                    
                    // Verifica se todos os documentos já foram recebidos
                    if (assistente.todosDocumentosRecebidos(userId)) {
                      await client.sendText(userId, `O advogado Gabriel, responsável pelo seu caso, vai dar continuidade após recebermos a procuração assinada. Vamos te manter atualizado sobre o andamento, tá bom?`);
                    }
                  }
                  
                  return; // Encerra o processamento para este turno
                } catch (err) {
                  console.error('❌ Erro ao processar assinatura:', err);
                  await client.sendText(userId, `Desculpe, ocorreu um erro ao processar a assinatura. Podemos tentar novamente?`);
                  assistente.limparConfirmacaoPendente(userId);
                }
              }
              
              // Verifica se deve gerar documento após responder
              if (assistente.deveGerarDocumento(userId) && !usuariosGerandoDocumentos.has(userId)) {
                usuariosGerandoDocumentos.add(userId);
                
                try {
                  // Obtém os dados formatados para o documento
                  const dados = assistente.getDadosDocumento(userId);
                  if (!dados) {
                    console.log('⚠️ Dados insuficientes para gerar documento');
                    usuariosGerandoDocumentos.delete(userId);
                    return;
                  }
                  
                  // Obtém o tipo específico de documento
                  const tipoDocumento = assistente.getTipoDocumento(userId);
                  
                  await client.sendText(userId, `✅ Gerando sua procuração, aguarde um momento...`);
                  
                  // Gera um nome de arquivo baseado nos dados
                  const nomeArquivo = `procuracao_${dados.nome.replace(/\s+/g, '_')}_${Date.now()}`;
                  
                  // Decide qual tipo de documento gerar
                  let pdfPath;
                  if (tipoDocumento === 'planejamento') {
                    pdfPath = await gerarPlanejamentoPDF(dados, nomeArquivo);
                  } else {
                    pdfPath = await gerarProcuracaoPDF(dados, nomeArquivo);
                  }
                  
                  // Pausa mais longa para simular tempo de processamento real
                  await delay(2000);
                  await client.sendText(userId, `📄 Documento gerado com sucesso!`);
                  
                  // Enviando apenas o documento primeiro e aguardando feedback do usuário
                  await client.sendFile(userId, pdfPath, 'procuracao.pdf', 'Segue sua procuração para análise e assinatura.');
                  
                  // Pausa antes de solicitar a confirmação do usuário
                  await delay(2000);
                  
                  // Mensagem mais amigável e humana
                  const mensagemProcuracao = tipoDocumento.includes('previdenciario') || dados.motivo.includes('INSS') ? 
                    `Aqui está sua procuração para representação junto ao INSS. Agora é só revisar, assinar e entregar para ${dados.outorgado_nome}. Qualquer dúvida, estou aqui para ajudar!` :
                    `Aqui está sua procuração. Agora é só revisar, assinar e entregar para a pessoa de confiança. Qualquer dúvida, estou aqui!`;
                  
                  await client.sendText(userId, mensagemProcuracao + `\n\nPor favor, verifique se está tudo correto. Quando estiver tudo certo, me avise respondendo "OK" ou "Confirmo".`);
                  
                  // Marca flag temporária para aguardar confirmação, mas não seguimos com os próximos passos
                  assistente.aguardandoConfirmacaoDocumento(userId, pdfPath, dados.nome, tipoDocumento);
                  
                  // NÃO enviamos o link de assinatura nem a checklist ainda
                  // Isso será feito quando o usuário responder "OK" ou similar
                  
                } catch (err) {
                  console.error('❌ Erro ao gerar documento:', err);
                  await client.sendText(userId, `Desculpe, ocorreu um erro ao gerar seu documento. Podemos tentar novamente?`);
                } finally {
                  usuariosGerandoDocumentos.delete(userId);
                }
              }
            } else {
              // Se não temos resposta, envia mensagem genérica
              console.log("❓ Sem resposta gerada para o usuário:", userId);
              await client.sendText(userId, `Olá! Recebi sua mensagem. Como posso ajudar?`);
            }
          } catch (err) {
            console.error('❌ Erro ao processar mensagem:', err.message);
            try {
              await client.sendText(message.from, `⚠️ Desculpe, tive um problema técnico. Pode tentar de novo?`);
            } catch (sendError) {
              console.error('Erro ao enviar mensagem de erro:', sendError);
            }
          }
        } catch (err) {
          console.error('❌ Erro ao processar mensagem:', err.message);
          try {
            await client.sendText(message.from, `⚠️ Desculpe, tive um problema técnico. Pode tentar de novo?`);
          } catch (sendError) {
            console.error('Erro ao enviar mensagem de erro:', sendError);
          }
        }
      });
    })
    .catch((error) => console.error('❌ Erro ao iniciar o bot:', error));
}

module.exports = startBot; 