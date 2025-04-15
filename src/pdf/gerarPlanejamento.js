const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// Garante que a pasta documentos existe
const pastaDocumentos = path.join(__dirname, '..', 'documentos');
if (!fs.existsSync(pastaDocumentos)) {
  fs.mkdirSync(pastaDocumentos);
}

function gerarPlanejamentoPDF({ nome, cpf, idade, contribuicao, tipoAtividade }, nomeArquivo) {
  const doc = new PDFDocument();
  const caminho = path.join(__dirname, '..', 'documentos', `${nomeArquivo}.pdf`);
  const stream = fs.createWriteStream(caminho);
  doc.pipe(stream);

  doc.fontSize(16).text('PLANEJAMENTO PREVIDENCIÁRIO PERSONALIZADO', { align: 'center' });
  doc.moveDown();

  doc.fontSize(12).text(`Nome: ${nome}`);
  doc.text(`CPF: ${cpf}`);
  doc.text(`Idade: ${idade}`);
  doc.text(`Tempo de contribuição informado: ${contribuicao}`);
  doc.text(`Tipo de atividade: ${tipoAtividade}`);
  doc.moveDown();

  doc.text('Resumo:');
  doc.text(`Este planejamento foi elaborado com base nas informações fornecidas pelo cliente. Será utilizado para simular cenários de aposentadoria e identificar o melhor momento e estratégia para requerer o benefício, considerando regras de transição, carência e oportunidades de complementação.`);

  doc.moveDown(2);
  const dataHoje = new Date().toLocaleDateString('pt-BR');
  doc.text(`Emitido em: ${dataHoje}`, { align: 'right' });

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on('finish', () => resolve(caminho));
    stream.on('error', reject);
  });
}

module.exports = { gerarPlanejamentoPDF };
