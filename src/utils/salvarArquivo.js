const fs = require('fs');
const path = require('path');

async function salvarArquivo(nomeCliente, buffer, nomeOriginal) {
  const nomeFormatado = nomeCliente.replace(/\s+/g, '_').toLowerCase();
  const dir = path.join(__dirname, '..', 'uploads', nomeFormatado);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const nomeSanitizado = nomeOriginal.replace(/[^\w\d.-]/g, '_');
  const caminho = path.join(dir, `${Date.now()}_${nomeSanitizado}`);

  await fs.promises.writeFile(caminho, buffer);

  return caminho;
}

module.exports = { salvarArquivo };
