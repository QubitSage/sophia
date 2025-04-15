const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// Garante que a pasta documentos existe
const pastaDocumentos = path.join(__dirname, '..', 'documentos');
if (!fs.existsSync(pastaDocumentos)) {
  fs.mkdirSync(pastaDocumentos);
}

const textosPorTipo = {
  inss: `...representá-lo(a) junto ao INSS, para requerer, acompanhar e revisar benefícios previdenciários, inclusive realizar perícias, interpor recursos administrativos, fornecer documentos, e praticar todos os atos necessários à representação completa perante o INSS.`,
  
  aposentadoria: `...representá-lo(a) junto ao INSS para fins de requerimento e acompanhamento de pedido de aposentadoria por idade, tempo de contribuição ou especial, incluindo recursos e revisões posteriores.`,

  bpc: `...representá-lo(a) na solicitação do Benefício de Prestação Continuada (BPC/LOAS), incluindo comprovação de vulnerabilidade, laudos médicos, perícias e demais exigências.`,

  revisao: `...representá-lo(a) na revisão de benefício já concedido, com poderes para análise de cálculos, correção de tempo de contribuição e apresentação de recursos administrativos.`,

  auxilio: `...representá-lo(a) na solicitação de auxílio-doença, auxílio por incapacidade temporária ou permanente, com poderes para apresentar laudos, perícias e acompanhar o processo.`,

  pensao: `...representá-lo(a) na solicitação de pensão por morte, inclusive para comprovação de dependência, união estável e acompanhamento do pedido junto ao INSS.`,

  planejamento: `...realizar planejamento previdenciário, com simulação de benefícios, identificação de oportunidades e estruturação do melhor caminho para futura aposentadoria.`,

  default: `...representá-lo(a) junto ao INSS para tratar de assuntos relacionados a benefícios previdenciários e administrativos.`
};

function gerarProcuracaoPDF({ nome, cpf, motivo, tipo }, nomeArquivo) {
  const doc = new PDFDocument();
  const caminho = path.join(__dirname, '..', 'documentos', `${nomeArquivo}.pdf`);
  const stream = fs.createWriteStream(caminho);
  doc.pipe(stream);

  const textoFinal = textosPorTipo[tipo] || textosPorTipo.default;

  doc.fontSize(16).text('PROCURAÇÃO', { align: 'center' });
  doc.moveDown();

  doc.fontSize(12).text(`OUTORGANTE: ${nome}`);
  doc.text(`CPF: ${cpf}`);
  doc.text(`Finalidade: ${motivo || 'Representação jurídica previdenciária'}`);
  doc.moveDown();

  doc.text(`Pelo presente instrumento particular de procuração, o(a) outorgante nomeia e constitui como seu bastante procurador o escritório Caster Group Advocacia, conferindo poderes para:`);
  doc.moveDown();
  doc.text(textoFinal);
  doc.moveDown(2);

  const dataHoje = new Date().toLocaleDateString('pt-BR');
  doc.text(`Goiânia, ${dataHoje}`, { align: 'right' });

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on('finish', () => resolve(caminho));
    stream.on('error', reject);
  });
}

module.exports = { gerarProcuracaoPDF };
