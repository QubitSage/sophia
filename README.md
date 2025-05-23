# SOPHIA - Assistente Jurídico Inteligente

SOPHIA é um assistente jurídico automatizado desenvolvido para fornecer suporte no atendimento de clientes, processamento de documentos e geração de procurações. Projetado para interagir com clientes por WhatsApp, o assistente coleta dados, identifica necessidades jurídicas e facilita o encaminhamento para advogados.

## Funcionalidades

- **Atendimento humanizado:** Conversação natural em linguagem simples
- **Coleta segura de dados:** Nome, CPF e detalhes do caso
- **Identificação de tópicos jurídicos:** Previdenciário, transferência de veículos, etc.
- **Geração automática de procurações:** Baseada no tipo de atendimento
- **Gestão de documentos:** Recebimento e categorização de arquivos
- **Segurança de informações:** Proteção contra consultas gratuitas
- **Encaminhamento para advogados:** Quando necessário análise especializada

## Pré-requisitos

- Node.js (versão 14 ou superior)
- NPM ou Yarn
- Um número de WhatsApp para o bot
- Chave de API da OpenAI

## Instalação

1. Clone o repositório:
```bash
git clone https://github.com/seu-usuario/bot-sophia.git
cd bot-sophia
```

2. Instale as dependências:
```bash
npm install
```

3. Configure as variáveis de ambiente criando um arquivo `.env`:
```
OPENAI_API_KEY=sua_chave_openai
AUTENTIQUE_API_KEY=sua_chave_autentique
```

4. Crie as pastas necessárias:
```bash
mkdir -p documentos uploads tokens
```

## Uso

Para iniciar o bot:

```bash
npm start
```

Na primeira execução, será necessário escanear um QR code com o WhatsApp para autenticar o número. Após a autenticação, o bot estará pronto para receber mensagens.

## Estrutura do Projeto

- `src/` - Código fonte principal
  - `bot.js` - Inicialização e configuração do venom-bot
  - `GPT4Assistente.js` - Lógica central do assistente
  - `pdf/` - Geração de documentos PDF
  - `utils/` - Utilidades e funções auxiliares
  - `arquivos/` - Armazenamento temporário de arquivos
  - `documentos/` - Armazenamento de procurações geradas

## Configuração do Modo de Segurança

O modo de segurança ativa automaticamente após 3 perguntas técnicas sem fornecimento de dados pessoais. Para desativar:
- O cliente deve fornecer nome completo E descrição detalhada do caso (mínimo 50 caracteres)
- OU solicitar explicitamente para falar com o advogado Gabriel

## Manutenção

### Limpeza de Dados
Os contextos das conversas são automaticamente limpos após 24 horas de inatividade para economizar recursos.

### Backup
Recomenda-se fazer backup regular dos diretórios:
- `/documentos`
- `/tokens`

## Licença

Este projeto está sob licença proprietária. Todos os direitos reservados.

## Suporte

Para questões técnicas ou suporte, entre em contato com [seu-email@exemplo.com].
