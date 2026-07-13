#!/usr/bin/env node
// tools/gerar-paginas-manifest.mjs
//
// Varre os *.html da raiz, extrai <meta name="pagina-slug"> e as abas
// declaradas via <button class="aba-btn" data-aba="X">label</button>,
// e gera ../paginas-abas.generated.js consumido por usuarios.js.
//
// Convencoes do HTML:
//   <meta name="pagina-slug"  content="ministerios_som">
//   <meta name="pagina-label" content="🔊 Ministério — Som">
//   <meta name="pagina-sem-default" content="true">   (opcional — pula _default)
//   <button class="aba-btn" data-aba="voluntarios">👥 Voluntários</button>
//   <button class="aba-btn" data-aba="x" data-aba-label="Override">…</button>
//
// Regras de _default:
//   - sem <meta pagina-sem-default>: injeta _default
//   - se houver outras abas:    label "— Geral (acesso)"
//   - se for a unica:           label "— Geral"
//
// Uso: node tools/gerar-paginas-manifest.mjs
//   - exit 0: ok
//   - exit 1: HTML quebrado / slug duplicado
//   - flag --check: nao escreve, so valida (CI/pre-commit)

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const OUT  = join(ROOT, 'paginas-abas.generated.js')
const CHECK_ONLY = process.argv.includes('--check')

function listarHtmls() {
  // Apenas raiz; plataforma/ esta fora do escopo de permissoes granulares.
  return readdirSync(ROOT)
    .filter(f => f.endsWith('.html'))
    .map(f => join(ROOT, f))
}

function lerMeta(html, name) {
  const re = new RegExp(
    `<meta\\s+name=["']${name}["']\\s+content=["']([^"']*)["']\\s*/?>`,
    'i'
  )
  const m = html.match(re)
  return m ? m[1] : null
}

function extrairAbasReais(html) {
  // Captura cada <button ... class=...aba-btn... ...>conteudo</button>
  const re = /<button\b([^>]*\bclass=["'][^"']*\baba-btn\b[^"']*["'][^>]*)>([\s\S]*?)<\/button>/gi
  const abas = []
  const vistas = new Set()
  for (const m of html.matchAll(re)) {
    const attrs = m[1]
    const inner = m[2]
    const slugMatch  = attrs.match(/\bdata-aba=["']([\w-]+)["']/i)
    if (!slugMatch) continue
    const slug = slugMatch[1]
    if (vistas.has(slug)) continue   // botao duplicado/repetido
    vistas.add(slug)
    const labelOverride = attrs.match(/\bdata-aba-label=["']([^"']+)["']/i)
    const label = labelOverride
      ? labelOverride[1]
      : inner.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    abas.push({ slug, label })
  }
  return abas
}

function processar(arquivo) {
  const html = readFileSync(arquivo, 'utf8')
  const slug = lerMeta(html, 'pagina-slug')
  if (!slug) return null
  const label = lerMeta(html, 'pagina-label')
  if (!label) {
    throw new Error(`${arquivo}: <meta name="pagina-slug"> sem <meta name="pagina-label"> correspondente`)
  }
  const semDefault = lerMeta(html, 'pagina-sem-default') === 'true'
  const abasReais = extrairAbasReais(html)

  let abas
  if (semDefault) {
    if (abasReais.length === 0) {
      throw new Error(`${arquivo}: pagina-sem-default=true mas nenhuma aba real encontrada`)
    }
    abas = abasReais
  } else if (abasReais.length === 0) {
    abas = [{ slug: '_default', label: '— Geral' }]
  } else {
    abas = [{ slug: '_default', label: '— Geral (acesso)' }, ...abasReais]
  }
  return { slug, label, abas, arquivo }
}

function gerarSaida(paginas) {
  const ordenadas = [...paginas].sort((a, b) => a.slug.localeCompare(b.slug))
  const linhas = ordenadas.map(p => {
    const abas = p.abas
      .map(a => `    { slug: ${JSON.stringify(a.slug)}, label: ${JSON.stringify(a.label)} },`)
      .join('\n')
    return `  ${JSON.stringify(p.slug)}: {\n    label: ${JSON.stringify(p.label)},\n    abas: [\n${abas}\n    ],\n  },`
  }).join('\n')

  return `// AUTO-GERADO por tools/gerar-paginas-manifest.mjs — NAO EDITAR.
// Fonte: <meta name="pagina-slug"> + <button class="aba-btn" data-aba=...> nos *.html.
// Para alterar paginas/abas, edite o HTML e rode: node tools/gerar-paginas-manifest.mjs
window.PAGINAS_ABAS_GRANULAR = {
${linhas}
}
`
}

function main() {
  const paginas = []
  const slugs = new Map()
  for (const arq of listarHtmls()) {
    const p = processar(arq)
    if (!p) continue
    if (slugs.has(p.slug)) {
      throw new Error(`Slug "${p.slug}" duplicado: ${slugs.get(p.slug)} e ${arq}`)
    }
    slugs.set(p.slug, arq)
    paginas.push(p)
  }
  const novo = gerarSaida(paginas)

  if (CHECK_ONLY) {
    let atual = ''
    try { atual = readFileSync(OUT, 'utf8') } catch {}
    if (atual !== novo) {
      console.error('paginas-abas.generated.js esta desatualizado. Rode: node tools/gerar-paginas-manifest.mjs')
      process.exit(1)
    }
    console.log(`OK (${paginas.length} paginas)`)
    return
  }

  writeFileSync(OUT, novo)
  console.log(`Gerado: paginas-abas.generated.js (${paginas.length} paginas)`)
}

try { main() } catch (e) { console.error(e.message); process.exit(1) }
