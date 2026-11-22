// Clean, robust, lightweight CommonMark & GFM Markdown Parser
// Supports: Headings, Tables, Nested Lists (ordered/unordered), Code Blocks with Copy,
// Blockquotes, Links, Bold, Italic, Strikethrough, Horizontal Rules, and Paragraphs.

function escapeHtml (str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function parseInline (text, inlineCodeStore = []) {
  if (!text) return ''

  // Temporarily preserve stored inline code
  let s = text

  // Links: [text](url)
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g, (match, txt, url) => {
    return `<a href="${escapeHtml(url)}" data-url="${escapeHtml(url)}" class="ai-chat-link">${txt}</a>`
  })

  // Bold & Italic
  s = s.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>')
  s = s.replace(/___([^_]+)___/g, '<strong><em>$1</em></strong>')
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>')
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  s = s.replace(/(^|\s)_([^_]+)_(\s|$)/g, '$1<em>$2</em>$3')

  // Strikethrough
  s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>')

  // Restore inline code
  s = s.replace(/__INLINE_CODE_(\d+)__/g, (m, idx) => {
    const code = inlineCodeStore[parseInt(idx, 10)] || ''
    return `<code>${escapeHtml(code)}</code>`
  })

  return s
}

function parseMarkdown (markdown) {
  if (!markdown) return ''

  const codeBlocks = []
  const inlineCodes = []

  // 1. Extract Fenced Code Blocks (```lang\n...```)
  let text = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  text = text.replace(/```([a-zA-Z0-9_\-#+.]*)\n([\s\S]*?)```/g, (match, lang, code) => {
    const idx = codeBlocks.length
    const cleanLang = (lang || 'code').trim()
    const cleanCode = code.trimEnd()
    codeBlocks.push({ lang: cleanLang, code: cleanCode })
    return `\n__CODE_BLOCK_${idx}__\n`
  })

  // 2. Extract Inline Code (`...`)
  text = text.replace(/`([^`\n]+)`/g, (match, code) => {
    const idx = inlineCodes.length
    inlineCodes.push(code)
    return `__INLINE_CODE_${idx}__`
  })

  const lines = text.split('\n')
  const out = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Code block placeholder
    const cbMatch = line.trim().match(/^__CODE_BLOCK_(\d+)__$/)
    if (cbMatch) {
      const cb = codeBlocks[parseInt(cbMatch[1], 10)]
      if (cb) {
        const lang = escapeHtml(cb.lang || 'code')
        const escapedCode = escapeHtml(cb.code)
        const encoded = encodeURIComponent(cb.code)
        out.push(`
          <div class="code-block">
            <div class="code-head">
              <span class="code-lang">${lang}</span>
              <button type="button" class="copy-code-btn" data-code="${encoded}" aria-label="Copy code">
                <svg class="i"><use href="#i-copy"/></svg><span>Copy</span>
              </button>
            </div>
            <pre><code>${escapedCode}</code></pre>
          </div>
        `.trim())
      }
      i++
      continue
    }

    // Blank line
    if (!line.trim()) {
      i++
      continue
    }

    // Horizontal Rule
    if (/^\s*([*\-_]\s*){3,}\s*$/.test(line)) {
      out.push('<hr class="ai-divider" />')
      i++
      continue
    }

    // Headings: #, ##, ###, ####, #####, ######
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      const level = Math.min(headingMatch[1].length + 1, 5) // Map #->h2, ##->h3, etc. for sidebar scale
      const content = parseInline(escapeHtml(headingMatch[2].trim()), inlineCodes)
      out.push(`<h${level}>${content}</h${level}>`)
      i++
      continue
    }

    // Blockquotes (> text)
    if (/^\s*>\s?/.test(line)) {
      const quoteLines = []
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ''))
        i++
      }
      const quoteContent = parseMarkdown(quoteLines.join('\n'))
      out.push(`<blockquote>${quoteContent}</blockquote>`)
      continue
    }

    // GFM Table Detection:
    // Line has pipes (| a | b |) and next line is a separator line (| --- | --- |)
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?\s*:?-+:?\s*(\|?\s*:?-+:?\s*)+\|?\s*$/.test(lines[i + 1])) {
      const tableLines = []
      while (i < lines.length && lines[i].includes('|')) {
        tableLines.push(lines[i].trim())
        i++
      }
      if (tableLines.length >= 2) {
        const headerRow = tableLines[0].replace(/^\||\|$/g, '').split('|').map(c => c.trim())
        const sepRow = tableLines[1].replace(/^\||\|$/g, '').split('|').map(c => c.trim())
        const aligns = sepRow.map(s => {
          const l = s.startsWith(':')
          const r = s.endsWith(':')
          if (l && r) return 'center'
          if (r) return 'right'
          return 'left'
        })

        const thead = `<thead><tr>${headerRow.map((cell, cIdx) => {
          const align = aligns[cIdx] ? ` style="text-align:${aligns[cIdx]}"` : ''
          return `<th${align}>${parseInline(escapeHtml(cell), inlineCodes)}</th>`
        }).join('')}</tr></thead>`

        const tbodyRows = []
        for (let r = 2; r < tableLines.length; r++) {
          const cells = tableLines[r].replace(/^\||\|$/g, '').split('|').map(c => c.trim())
          const rowHtml = `<tr>${cells.map((cell, cIdx) => {
            const align = aligns[cIdx] ? ` style="text-align:${aligns[cIdx]}"` : ''
            return `<td${align}>${parseInline(escapeHtml(cell), inlineCodes)}</td>`
          }).join('')}</tr>`
          tbodyRows.push(rowHtml)
        }
        const tbody = `<tbody>${tbodyRows.join('')}</tbody>`
        out.push(`<div class="table-wrapper"><table>${thead}${tbody}</table></div>`)
        continue
      }
    }

    // Lists (Ordered & Unordered, including Nested)
    const listMatch = line.match(/^(\s*)([-*+•]|\d+\.)\s+(.+)$/)
    if (listMatch) {
      const listItems = []
      while (i < lines.length) {
        const itemMatch = lines[i].match(/^(\s*)([-*+•]|\d+\.)\s+(.+)$/)
        if (!itemMatch) {
          // If continuation line indented with spaces, append to previous item
          if (lines[i].trim() && /^\s{2,}/.test(lines[i]) && listItems.length > 0) {
            listItems[listItems.length - 1].content += ' ' + lines[i].trim()
            i++
            continue
          }
          break
        }
        const indent = itemMatch[1].replace(/\t/g, '  ').length
        const isOrdered = /^\d+\./.test(itemMatch[2])
        const content = itemMatch[3].trim()
        listItems.push({ indent, isOrdered, content })
        i++
      }

      // Render hierarchical list
      function renderListTree (items, startIndex = 0, currentIndent = 0) {
        let idx = startIndex
        if (idx >= items.length) return { html: '', nextIndex: idx }

        const isOrdered = items[idx].isOrdered
        const tag = isOrdered ? 'ol' : 'ul'
        let html = `<${tag}>`

        while (idx < items.length) {
          const it = items[idx]
          if (it.indent < currentIndent) {
            break
          }
          if (it.indent > currentIndent) {
            const sub = renderListTree(items, idx, it.indent)
            html += sub.html
            idx = sub.nextIndex
            continue
          }

          const parsedContent = parseInline(escapeHtml(it.content), inlineCodes)
          html += `<li>${parsedContent}`

          // Look ahead to check if next item is indented child
          if (idx + 1 < items.length && items[idx + 1].indent > currentIndent) {
            const sub = renderListTree(items, idx + 1, items[idx + 1].indent)
            html += sub.html
            idx = sub.nextIndex
          } else {
            idx++
          }
          html += `</li>`
        }

        html += `</${tag}>`
        return { html, nextIndex: idx }
      }

      const listResult = renderListTree(listItems, 0, listItems[0].indent)
      out.push(listResult.html)
      continue
    }

    // Regular Paragraph
    const paraLines = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].match(/^(#{1,6})\s+/) &&
      !lines[i].match(/^\s*([*\-_]\s*){3,}\s*$/) &&
      !lines[i].match(/^\s*>\s?/) &&
      !lines[i].match(/^(\s*)([-*+•]|\d+\.)\s+/) &&
      !lines[i].trim().startsWith('__CODE_BLOCK_') &&
      !(lines[i].includes('|') && i + 1 < lines.length && /^\s*\|?\s*:?-+:?\s*(\|?\s*:?-+:?\s*)+\|?\s*$/.test(lines[i + 1]))
    ) {
      paraLines.push(lines[i].trim())
      i++
    }

    if (paraLines.length > 0) {
      const pContent = parseInline(escapeHtml(paraLines.join(' ')), inlineCodes)
      out.push(`<p>${pContent}</p>`)
    }
  }

  return out.join('')
}

module.exports = {
  parseMarkdown,
  escapeHtml
}
