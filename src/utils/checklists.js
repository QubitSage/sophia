const checklists = {
    aposentadoria: [
      'RG e CPF',
      'Carteira de trabalho ou carnês de contribuição',
      'Comprovante de residência dos últimos 5 anos',
      'Se rural: notas fiscais, bloco de produtor ou declaração do sindicato'
    ],
    bpc: [
      'RG e CPF da pessoa com deficiência ou idosa',
      'Laudo médico atualizado (modelo INSS)',
      'Comprovante de renda familiar',
      'Declaração de pobreza, se não tiver comprovantes formais'
    ],
    revisao: [
      'Documento de identificação',
      'Cópia do benefício atual',
      'Laudos, extratos e comprovantes de tempo de contribuição'
    ],
    auxilio: [
      'Atestado médico com CID e período de afastamento',
      'Exames e laudos',
      'Comprovante de afastamento do trabalho'
    ],
    pensao: [
      'Certidão de óbito',
      'Documentos dos dependentes (RG, certidão de nascimento)',
      'Comprovante de união estável ou casamento',
      'Comprovante de dependência financeira (extrato, IR)'
    ],
    inss: [
      'RG e CPF',
      'Carteira de trabalho ou carnês de contribuição',
      'Extrato do CNIS',
      'Comprovante de residência recente'
    ],
    planejamento: [
      'RG e CPF',
      'CNIS atualizado',
      'Simulação feita no Meu INSS (se tiver)',
      'Comprovante de vínculos anteriores (carteira ou contrato)'
    ]
  };
  
  function getChecklist(tipo) {
    return checklists[tipo] || [];
  }
  
  module.exports = { getChecklist };
  