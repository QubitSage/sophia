/**
 * Utilitário para adicionar atrasos
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { delay };
