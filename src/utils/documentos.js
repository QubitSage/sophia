const axios = require('axios');
require('dotenv').config();

/**
 * Envia um documento para a plataforma de assinatura digital
 * @param {string} pdfPath - Caminho do arquivo PDF a ser assinado
 * @param {string} nomeCliente - Nome do cliente que vai assinar
 * @returns {Promise<string>} - Link para assinatura digital
 */
async function enviarDocumentoAutentique(pdfPath, nomeCliente) {
    try {
        // Em um ambiente de produção, aqui seria feita a integração real com a API do Autentique
        // Por enquanto, simularemos o envio e retornaremos um link fictício
        
        console.log(`Enviando documento ${pdfPath} para assinatura de ${nomeCliente}`);
        
        // Simulação de tempo de processamento
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Em produção, esta seria uma chamada real à API
        // const response = await axios.post('https://api.autentique.com.br/v2/documents', {
        //     document: {
        //         name: `Documento para ${nomeCliente}`,
        //         file: pdfPath,
        //         signers: [{ name: nomeCliente, email: 'cliente@exemplo.com' }]
        //     }
        // }, {
        //     headers: {
        //         'Authorization': `Bearer ${process.env.AUTENTIQUE_API_KEY}`
        //     }
        // });
        
        // return response.data.link;
        
        // Retorna um link fictício para o ambiente de desenvolvimento
        return `https://assinatura.exemplo.com.br/doc-${Date.now().toString(36)}`;
    } catch (error) {
        console.error('Erro ao enviar documento para assinatura:', error);
        throw new Error('Falha ao enviar documento para assinatura digital');
    }
}

/**
 * Retorna a mensagem de checklist para o tipo de documento
 * @param {string} tipoDocumento - Tipo de documento (ex: procuracao, planejamento)
 * @returns {string} - Mensagem com o checklist de documentos
 */
function getChecklist(tipoDocumento) {
    if (tipoDocumento === 'procuracao') {
        return `CHECKLIST DE DOCUMENTOS NECESSÁRIOS

Para darmos seguimento ao seu processo, precisamos dos seguintes documentos:
- RG e CPF (frente e verso)
- Comprovante de residência (últimos 3 meses)
- Carteira de trabalho (se aplicável)
- Holerites (se aplicável)
- Comprovantes médicos ou do caso

Envie por aqui mesmo ou pelo e-mail documentos@escritorio.com.br`;
    } else if (tipoDocumento === 'planejamento') {
        return `CHECKLIST PARA PLANEJAMENTO SUCESSÓRIO

Para prosseguirmos com seu planejamento sucessório, precisamos dos seguintes documentos:
- RG e CPF (frente e verso) de todos os envolvidos
- Certidão de nascimento/casamento atualizada
- Documentos de propriedade dos bens (imóveis, veículos, etc.)
- Extratos bancários e investimentos
- Contratos sociais de empresas (se aplicável)

Envie por aqui mesmo ou pelo e-mail documentos@escritorio.com.br`;
    } else {
        return `DOCUMENTOS NECESSÁRIOS

Para prosseguirmos com seu caso, precisamos que você envie os documentos pessoais básicos:
- RG e CPF (frente e verso)
- Comprovante de residência
- Quaisquer outros documentos relacionados ao seu caso

Envie por aqui mesmo ou pelo e-mail documentos@escritorio.com.br`;
    }
}

/**
 * Função de atraso (delay) para ser usada em operações assíncronas
 * @param {number} ms - Tempo em milissegundos para aguardar
 * @returns {Promise} - Promise que resolve após o tempo especificado
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
    enviarDocumentoAutentique,
    getChecklist,
    delay
}; 