// Autenticação do painel admin com múltiplos usuários.
// ADMIN_USUARIOS: "nome:senha,nome2:senha2" — cada sócio tem a sua.
// ADMIN_PASSWORD (legado): continua aceita como fallback.

export function usuarioAutorizado(senha: string | null): string | null {
  if (!senha) return null

  const legado = process.env.ADMIN_PASSWORD || ''
  if (legado && senha === legado) return 'admin'

  const lista = process.env.ADMIN_USUARIOS || ''
  for (const par of lista.split(',')) {
    const idx = par.indexOf(':')
    if (idx <= 0) continue
    const nome = par.slice(0, idx).trim()
    const chave = par.slice(idx + 1).trim()
    if (chave && senha === chave) return nome
  }
  return null
}
