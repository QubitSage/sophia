require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Variáveis para armazenar dinamicamente
let GraphQLClient, gql;

// Inicialização assíncrona
(async () => {
  try {
    const graphqlRequest = await import('graphql-request');
    GraphQLClient = graphqlRequest.GraphQLClient;
    gql = graphqlRequest.gql;
    console.log('GraphQL Request carregado com sucesso');
  } catch (error) {
    console.error('Erro ao carregar GraphQL Request:', error);
  }
})();

const clientHolder = {
  client: null
};

async function getClient() {
  // Espera até que GraphQLClient esteja disponível
  while (!GraphQLClient) {
    console.log('Aguardando carregamento do GraphQLClient...');
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  if (!clientHolder.client) {
    clientHolder.client = new GraphQLClient('https://api.autentique.com.br/v2/graphql', {
      headers: {
        Authorization: `Bearer ${process.env.AUTENTIQUE_API_KEY}`,
      },
    });
  }

  return clientHolder.client;
}

async function enviarDocumentoAutentique(caminhoArquivo, nomeCliente) {
  const fileBuffer = fs.readFileSync(path.resolve(caminhoArquivo));
  const fileBase64 = fileBuffer.toString('base64');
  const email = `${nomeCliente.replace(/\s+/g, '').toLowerCase()}@exemplo.com`;

  // Espera até que gql esteja disponível
  while (!gql) {
    console.log('Aguardando carregamento do gql...');
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  const mutation = gql`
    mutation CriarDocumento($document: DocumentInput!) {
      createDocument(document: $document) {
        document {
          id
          name
          link
        }
      }
    }
  `;

  const variables = {
    document: {
      name: `Procuração - ${nomeCliente}`,
      base64_file: fileBase64,
      signers: [
        {
          email,
          name: nomeCliente,
          action: 'SIGN',
        },
      ],
    },
  };

  try {
    const client = await getClient();
    const response = await client.request(mutation, variables);
    return response?.createDocument?.document?.link || null;
  } catch (err) {
    console.error('Erro ao enviar para Autentique:', err.response?.errors || err.message);
    return null;
  }
}

module.exports = { enviarDocumentoAutentique };
